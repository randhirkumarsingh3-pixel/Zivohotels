/**
 * Partner Hub incentives: monthly slabs on completed room nights (Admin → Business settings).
 *
 *  slabs   e.g. Silver from 50 room nights: +1%, Gold from 150: +2%, Platinum from 400: +3%
 *  bonus   the highest slab an agency reaches in a month, as a % of the room charges (before GST)
 *          of its stays that checked out that month, credited to its account early the next
 *          month, less TDS (194H); its tier becomes that slab's name
 * Each agency is credited once per month (reference INC-YYYY-MM). Cancelled and no-show stays
 * don't count.
 */
import prisma from '../../config/db.js';
import { getBusinessSettings } from './businessSettings.js';
import { postEntry } from './orgLedger.js';
import { membershipFor } from './organisationService.js';
import { notifyUser } from '../notifyService.js';

const fail = (m, code = 400) => Object.assign(new Error(m), { statusCode: code });
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const DEFAULT_SLABS = [
  { name: 'Silver', minRoomNights: 50, bonusPct: 1 },
  { name: 'Gold', minRoomNights: 150, bonusPct: 2 },
  { name: 'Platinum', minRoomNights: 400, bonusPct: 3 },
];

/** Settings shape: agency.incentives = { enabled, slabs } (validated by businessSettings). */
export const cleanIncentives = (input = {}, cur = {}) => {
  const v = { ...{ enabled: false, slabs: DEFAULT_SLABS }, ...cur, ...input };
  const slabs = (Array.isArray(v.slabs) ? v.slabs : []).slice(0, 8).map((s) => ({
    name: String(s.name || '').trim().slice(0, 30), minRoomNights: Math.round(Number(s.minRoomNights)), bonusPct: Math.round(Number(s.bonusPct) * 100) / 100,
  }));
  for (const s of slabs) {
    if (!s.name) throw fail('Every incentive slab needs a name.');
    if (!(s.minRoomNights >= 1 && s.minRoomNights <= 100000)) throw fail(`${s.name}: room nights must be at least 1.`);
    if (!(s.bonusPct > 0 && s.bonusPct <= 20)) throw fail(`${s.name}: bonus must be between 0 and 20%.`);
  }
  slabs.sort((a, b) => a.minRoomNights - b.minRoomNights);
  if (new Set(slabs.map((s) => s.minRoomNights)).size !== slabs.length) throw fail('Two slabs start at the same number of room nights.');
  if (v.enabled && !slabs.length) throw fail('Add at least one slab, or turn incentives off.');
  return { enabled: Boolean(v.enabled), slabs };
};

const monthRange = (month) => {
  const m = String(month || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) throw fail('Month as YYYY-MM.');
  const start = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1) - 330 * 60000); // from 00:00 IST
  const end = new Date(Date.UTC(Number(m[1]), Number(m[2]), 1) - 330 * 60000);
  return { start, end, key: `${m[1]}-${m[2]}` };
};
const roomNights = (b) => Math.max(1, Math.round((new Date(b.checkOut) - new Date(b.checkIn)) / 86400000)) * (b.rooms || 1);

/** An agency's completed stays in a month: room nights and room charges (before GST). */
export const monthStats = async (organisationId, month, { includeUpcoming = false } = {}) => {
  const { start, end } = monthRange(month);
  const statuses = includeUpcoming ? ['COMPLETED', 'CHECKED_IN', 'CONFIRMED'] : ['COMPLETED'];
  const rows = await prisma.booking.findMany({ where: { organisationId, channel: 'AGENCY', status: { in: statuses }, checkOut: { gte: start, lt: end } }, select: { checkIn: true, checkOut: true, rooms: true, baseAmount: true, status: true } });
  const done = rows.filter((b) => b.status === 'COMPLETED');
  return {
    roomNights: done.reduce((t, b) => t + roomNights(b), 0), roomCharges: round2(done.reduce((t, b) => t + Number(b.baseAmount || 0), 0)), stays: done.length,
    upcomingRoomNights: rows.filter((b) => b.status !== 'COMPLETED').reduce((t, b) => t + roomNights(b), 0),
  };
};

const slabFor = (slabs, nights) => [...slabs].reverse().find((s) => nights >= s.minRoomNights) || null;

/** Credits each agency's incentive for a month (once). Returns what was credited. */
export const runIncentives = async (month, actor = null) => {
  const settings = await getBusinessSettings();
  const inc = settings.agency.incentives;
  if (!inc?.enabled) return { month, credited: [], skipped: 'Incentives are off (Admin → Business settings).' };
  const { key } = monthRange(month);
  const orgs = await prisma.organisation.findMany({ where: { kind: 'AGENCY', status: { in: ['ACTIVE', 'SUSPENDED'] } }, select: { id: true, name: true, code: true, tier: true } });
  const credited = [];
  for (const org of orgs) {
    const st = await monthStats(org.id, key);
    const slab = slabFor(inc.slabs, st.roomNights);
    if (!slab || !(st.roomCharges > 0)) continue;
    const bonus = round2(st.roomCharges * slab.bonusPct / 100);
    const tds = round2(bonus * (settings.agency.tdsPct || 0) / 100);
    const { duplicate } = await postEntry({ organisationId: org.id, type: 'INCENTIVE', amount: bonus, reference: `INC-${key}`, note: `${slab.name} incentive for ${key}: ${slab.bonusPct}% on ${st.roomNights} room nights`, createdById: actor?.id || null, force: true });
    if (duplicate) continue;
    if (tds > 0) await postEntry({ organisationId: org.id, type: 'TDS', amount: -tds, reference: `TDS-INC-${key}`, note: `TDS ${settings.agency.tdsPct}% (194H) on the ${key} incentive`, createdById: actor?.id || null, force: true });
    await prisma.organisation.update({ where: { id: org.id }, data: { tier: slab.name.toUpperCase() } });
    await prisma.auditLog.create({ data: { action: 'ORG_INCENTIVE_CREDITED', entityType: 'ORGANISATION', entityId: org.id, userId: actor?.id || 'SYSTEM', details: { month: key, slab: slab.name, roomNights: st.roomNights, roomCharges: st.roomCharges, bonus, tds } } }).catch(() => {});
    const admins = await prisma.orgMember.findMany({ where: { organisationId: org.id, role: { in: ['ADMIN', 'FINANCE'] }, status: 'ACTIVE' }, select: { userId: true } });
    for (const a of admins) await notifyUser(a.userId, { type: 'ORG_INCENTIVE', title: `${slab.name} incentive credited`, message: `₹${bonus.toLocaleString('en-IN')} for ${st.roomNights} room nights in ${key} (less TDS ₹${tds.toLocaleString('en-IN')}).`, link: '/partners?tab=account' });
    credited.push({ organisationId: org.id, name: org.name, code: org.code, slab: slab.name, roomNights: st.roomNights, roomCharges: st.roomCharges, bonus, tds });
  }
  return { month: key, credited };
};

/** For the agent's dashboard: this month so far, the next slab and last month's result. */
export const incentiveProgress = async (orgId, user) => {
  const { org } = await membershipFor(orgId, user);
  if (org.kind !== 'AGENCY') throw fail('Incentives are for travel agents.');
  const settings = await getBusinessSettings();
  const inc = settings.agency.incentives;
  if (!inc?.enabled) return { enabled: false };
  const now = new Date(Date.now() + 330 * 60000);
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const st = await monthStats(org.id, month, { includeUpcoming: true });
  const current = slabFor(inc.slabs, st.roomNights);
  const next = inc.slabs.find((s) => s.minRoomNights > st.roomNights) || null;
  const last = await prisma.orgLedgerEntry.findFirst({ where: { organisationId: org.id, type: 'INCENTIVE' }, orderBy: { createdAt: 'desc' }, select: { amount: true, reference: true, note: true, createdAt: true } });
  return {
    enabled: true, month, slabs: inc.slabs, tier: org.tier, ...st, current, next, toNext: next ? next.minRoomNights - st.roomNights : 0,
    estimatedBonus: current ? round2(st.roomCharges * current.bonusPct / 100) : 0,
    last: last ? { amount: Number(last.amount), month: last.reference.replace('INC-', ''), note: last.note, creditedAt: last.createdAt } : null,
  };
};

/** Early each month: last month's incentives (idempotent; checks every 6 hours). */
export const startIncentiveJob = () => {
  const run = async () => {
    const now = new Date(Date.now() + 330 * 60000);
    if (now.getUTCDate() > 7) return;
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const key = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
    await runIncentives(key).catch((e) => console.error('[Incentives] run failed:', e.message));
  };
  const first = setTimeout(run, 90 * 1000); first.unref?.();
  const timer = setInterval(run, 6 * 3600 * 1000); timer.unref?.();
  return timer;
};

export default { DEFAULT_SLABS, cleanIncentives, monthStats, runIncentives, incentiveProgress, startIncentiveJob };
