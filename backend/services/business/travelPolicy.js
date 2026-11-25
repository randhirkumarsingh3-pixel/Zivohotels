/**
 * ZivoPlus for Business → Policy: a company's travel policy (kept on Organisation.settings.policy).
 *
 *  grades     each with a nightly cap (room price per night before GST, after the company rate)
 *             for metro cities and for other cities; every member has a grade (default grade
 *             when none is set)
 *  approval   NEVER (out-of-policy stays only need a reason) | OUT_OF_POLICY (they need an
 *             approver's OK) | ALWAYS (every stay needs approval)
 *  metroCities the cities the metro cap applies to
 * A stay waiting for approval is held (rooms kept until the hold deadline) and paid from the
 * company account when approved; rejected or not approved in time, the hold is released.
 */
import prisma from '../../config/db.js';
import { membershipFor } from './organisationService.js';

const fail = (m, code = 400) => Object.assign(new Error(m), { statusCode: code });
export const APPROVAL_MODES = ['NEVER', 'OUT_OF_POLICY', 'ALWAYS'];
export const DEFAULT_METROS = ['Mumbai', 'Delhi', 'New Delhi', 'Bengaluru', 'Bangalore', 'Chennai', 'Hyderabad', 'Kolkata', 'Pune', 'Ahmedabad', 'Gurugram', 'Gurgaon', 'Noida'];
export const DEFAULT_POLICY = {
  enabled: false, approval: 'OUT_OF_POLICY', requireReason: true, metroCities: DEFAULT_METROS, defaultGrade: 'STANDARD',
  grades: [
    { key: 'STANDARD', name: 'Standard', capMetro: 6000, capOther: 4000 },
    { key: 'SENIOR', name: 'Senior', capMetro: 9000, capOther: 6000 },
  ],
};

export const policyOf = (org) => {
  const p = { ...DEFAULT_POLICY, ...(org?.settings?.policy || {}) };
  if (!Array.isArray(p.grades) || !p.grades.length) p.grades = DEFAULT_POLICY.grades;
  if (!p.grades.some((g) => g.key === p.defaultGrade)) p.defaultGrade = p.grades[0].key;
  return p;
};

const cleanKey = (s) => String(s || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30);

export const savePolicy = async (orgId, user, input = {}) => {
  const { org } = await membershipFor(orgId, user, 'org.edit');
  if (org.kind !== 'CORPORATE') throw fail('Travel policies are for company accounts.');
  const grades = (Array.isArray(input.grades) ? input.grades : []).slice(0, 12).map((g) => {
    const name = String(g.name || '').trim().slice(0, 40);
    const key = cleanKey(g.key || name);
    const capMetro = Math.round(Number(g.capMetro)); const capOther = Math.round(Number(g.capOther));
    if (!name || !key) throw fail('Every grade needs a name.');
    if (!(capMetro >= 500 && capMetro <= 200000) || !(capOther >= 500 && capOther <= 200000)) throw fail(`Nightly caps for ${name} must be between ₹500 and ₹2,00,000.`);
    return { key, name, capMetro, capOther };
  });
  if (!grades.length) throw fail('Add at least one grade.');
  if (new Set(grades.map((g) => g.key)).size !== grades.length) throw fail('Two grades have the same name.');
  if (!APPROVAL_MODES.includes(input.approval)) throw fail('Choose when trips need approval.');
  const metroCities = [...new Set((Array.isArray(input.metroCities) ? input.metroCities : String(input.metroCities || '').split(/[,\n]/)).map((c) => String(c).trim()).filter(Boolean))].slice(0, 60);
  const policy = {
    enabled: Boolean(input.enabled), approval: input.approval, requireReason: input.requireReason !== false,
    metroCities: metroCities.length ? metroCities : DEFAULT_METROS,
    grades, defaultGrade: grades.some((g) => g.key === input.defaultGrade) ? input.defaultGrade : grades[0].key,
    updatedAt: new Date().toISOString(), updatedBy: user.email,
  };
  const fresh = await prisma.organisation.findUnique({ where: { id: org.id }, select: { settings: true } });
  await prisma.organisation.update({ where: { id: org.id }, data: { settings: { ...(fresh.settings || {}), policy } } });
  await prisma.auditLog.create({ data: { action: 'ORG_POLICY_UPDATED', entityType: 'ORGANISATION', entityId: org.id, userId: user.id, details: { enabled: policy.enabled, approval: policy.approval, grades } } }).catch(() => {});
  return policy;
};

const isMetro = (policy, city) => {
  const c = String(city || '').trim().toLowerCase();
  return policy.metroCities.some((m) => String(m).trim().toLowerCase() === c);
};

/**
 * Checks a stay against the policy for the traveller. perNight: room price per room per night,
 * before GST, after the company rate. Returns { enabled, grade, gradeName, metro, cap, perNight,
 * within, needsApproval, approval }.
 */
export const evaluate = (policy, traveller, city, perNight) => {
  if (!policy.enabled) return { enabled: false, within: true, needsApproval: false };
  const grade = policy.grades.find((g) => g.key === traveller?.grade) || policy.grades.find((g) => g.key === policy.defaultGrade);
  const metro = isMetro(policy, city);
  const cap = metro ? grade.capMetro : grade.capOther;
  const within = Math.round(perNight) <= cap;
  const needsApproval = policy.approval === 'ALWAYS' || (policy.approval === 'OUT_OF_POLICY' && !within);
  return { enabled: true, grade: grade.key, gradeName: grade.name, metro, cap, perNight: Math.round(perNight), within, needsApproval, approval: policy.approval, requireReason: policy.requireReason };
};

/** Who can approve a traveller's trip: their approver, else the company's admins and approvers (never themselves). */
export const approversFor = async (orgId, traveller, requesterUserId) => {
  const members = await prisma.orgMember.findMany({ where: { organisationId: orgId, status: 'ACTIVE' }, select: { id: true, userId: true, role: true } });
  const assigned = traveller?.approverMemberId && members.find((m) => m.id === traveller.approverMemberId && m.userId !== requesterUserId);
  if (assigned) return [assigned];
  return members.filter((m) => ['ADMIN', 'APPROVER'].includes(m.role) && m.userId !== requesterUserId);
};

export default { DEFAULT_POLICY, APPROVAL_MODES, policyOf, savePolicy, evaluate, approversFor };
