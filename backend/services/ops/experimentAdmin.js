/**
 * Admin → Experiments: set up A/B tests, start, pause and end them, and read their results.
 *
 * How a test reaches guests: the website asks /api/v1/experiments for this visitor's version of
 * every running test (services/experimentService.js: same visitor, same version), then sends that
 * list with its tracking events (hotel page viewed, checkout started, booking completed). A test
 * only changes what guests see where the website's code looks it up by name — the known ones are
 * listed in WEBSITE_EXPERIMENTS.
 */
import prisma from '../../config/db.js';
import cacheUtils from '../../utils/cacheUtils.js';

/** Tests the website's code checks, with what each version shows. */
export const WEBSITE_EXPERIMENTS = {
  badge_urgency: {
    where: 'Hotel page',
    what: 'An urgency line under the hotel name ("Booked N times today" / "N people viewed today") when the hotel has 10+ views or 3+ bookings today.',
    variants: { control: 'No urgency line', variantA: 'Shows the urgency line' },
  },
};

export const STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'CONCLUDED'];
const NAME = /^[a-z][a-z0-9_]{2,40}$/;
const bad = (m) => Object.assign(new Error(m), { statusCode: 400 });

const cleanVariants = (input) => {
  const list = Array.isArray(input) ? input : [];
  const v = list.map((x) => ({ name: String(x?.name || '').trim(), weight: Math.round(Number(x?.weight)) }))
    .filter((x) => x.name);
  if (v.length < 2) throw bad('Add at least two versions (one of them "control").');
  if (!v.some((x) => x.name === 'control')) throw bad('One version must be called "control" (what guests see today).');
  if (new Set(v.map((x) => x.name)).size !== v.length) throw bad('Version names must be different.');
  if (v.some((x) => !/^[A-Za-z][A-Za-z0-9_]{0,30}$/.test(x.name))) throw bad('Version names: letters, numbers and _ only.');
  if (v.some((x) => !(x.weight >= 0 && x.weight <= 100))) throw bad('Each version\'s share is 0 to 100.');
  if (v.reduce((s, x) => s + x.weight, 0) !== 100) throw bad('The versions\' shares must add up to 100.');
  return v;
};

const shape = (e) => ({
  id: e.id, name: e.name, status: e.status, category: e.category, owner: e.owner, traffic: e.traffic,
  variants: e.variants, startAt: e.startAt, endAt: e.endAt, concludedAt: e.concludedAt, winner: e.winner,
  createdAt: e.createdAt, updatedAt: e.updatedAt, notes: e.guardrailMetrics?.notes || '',
  website: WEBSITE_EXPERIMENTS[e.name] || null,
});

const refresh = () => cacheUtils.clearCache(); // running tests are cached for a minute per process

export const listExperiments = async () => {
  const [rows, app] = await Promise.all([
    prisma.experiment.findMany({ orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }] }),
    prisma.appState.findUnique({ where: { id: 'singleton' } }),
  ]);
  return {
    experimentsOn: app ? app.globalExperimentToggle !== false : true,
    experiments: rows.map(shape),
    website: Object.entries(WEBSITE_EXPERIMENTS).map(([name, d]) => ({ name, ...d, setUp: rows.some((r) => r.name === name) })),
  };
};

export const createExperiment = async (body, user) => {
  const name = String(body?.name || '').trim();
  if (!NAME.test(name)) throw bad('Name: 3–40 lower-case letters, numbers or _ (for example badge_urgency).');
  if (await prisma.experiment.findUnique({ where: { name } })) throw bad('A test with this name already exists.');
  const variants = cleanVariants(body.variants);
  const traffic = Math.round(Number(body.traffic ?? 100));
  if (!(traffic >= 1 && traffic <= 100)) throw bad('Share of visitors in the test is 1 to 100%.');
  const e = await prisma.experiment.create({
    data: {
      name, variants, traffic, status: 'DRAFT', category: String(body.category || WEBSITE_EXPERIMENTS[name]?.where || 'General').slice(0, 40),
      owner: user?.email || user?.name || null, priority: 'MEDIUM',
      guardrailMetrics: { notes: String(body.notes || '').slice(0, 500) },
    },
  });
  return shape(e);
};

export const updateExperiment = async (id, body, user) => {
  const e = await prisma.experiment.findUnique({ where: { id } });
  if (!e) throw Object.assign(new Error('Test not found'), { statusCode: 404 });
  const data = {};
  if (body.variants !== undefined) {
    if (e.status === 'ACTIVE') throw bad('Pause the test before changing its versions (changing them mid-test mixes up the results).');
    data.variants = cleanVariants(body.variants);
  }
  if (body.traffic !== undefined) {
    const t = Math.round(Number(body.traffic));
    if (!(t >= 1 && t <= 100)) throw bad('Share of visitors in the test is 1 to 100%.');
    data.traffic = t;
  }
  if (body.notes !== undefined) data.guardrailMetrics = { ...(e.guardrailMetrics || {}), notes: String(body.notes).slice(0, 500) };
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) throw bad('Unknown status');
    if (e.status === 'CONCLUDED') throw bad('This test has ended. Create a new one to test again.');
    data.status = body.status;
    if (body.status === 'ACTIVE' && !e.startAt) data.startAt = new Date();
    if (body.status === 'CONCLUDED') {
      data.concludedAt = new Date(); data.endAt = new Date();
      const names = (data.variants || e.variants).map((v) => v.name);
      if (body.winner && !names.includes(body.winner)) throw bad('Pick the winning version from this test.');
      data.winner = body.winner || null;
    }
  }
  const updated = await prisma.experiment.update({ where: { id }, data });
  await prisma.auditLog.create({ data: { action: 'EXPERIMENT_UPDATED', entityType: 'EXPERIMENT', entityId: id, userId: user?.id || 'SYSTEM', details: { name: e.name, changes: body } } }).catch(() => {});
  refresh();
  return shape(updated);
};

export const deleteExperiment = async (id) => {
  const e = await prisma.experiment.findUnique({ where: { id } });
  if (!e) throw Object.assign(new Error('Test not found'), { statusCode: 404 });
  if (e.status !== 'DRAFT') throw bad('Only a draft that never ran can be deleted. End the test instead.');
  await prisma.experiment.delete({ where: { id } });
  refresh();
};

// Standard normal CDF (Abramowitz–Stegun)
const phi = (z) => {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
};

/** Two-sided p-value for the difference between two conversion rates. */
export const twoProportionP = (x1, n1, x2, n2) => {
  if (!n1 || !n2) return null;
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (!se) return null;
  const z = (x1 / n1 - x2 / n2) / se;
  return 2 * (1 - phi(Math.abs(z)));
};

const MIN_VISITORS = 200; // per version, before reading anything into the result

export const experimentResults = async (id) => {
  const e = await prisma.experiment.findUnique({ where: { id } });
  if (!e) throw Object.assign(new Error('Test not found'), { statusCode: 404 });
  const since = e.startAt || e.createdAt;
  const until = e.concludedAt || new Date();
  const rows = await prisma.$queryRaw`
    SELECT experiments->>${e.name} AS variant,
           count(DISTINCT "sessionId")::int AS visitors,
           count(DISTINCT "sessionId") FILTER (WHERE "eventType" = 'HOTEL_VIEWED')::int AS viewers,
           count(DISTINCT "sessionId") FILTER (WHERE "eventType" = 'BOOKING_STARTED')::int AS checkouts,
           count(DISTINCT "sessionId") FILTER (WHERE "eventType" = 'BOOKING_COMPLETED')::int AS bookers,
           array_remove(array_agg(DISTINCT metadata->>'bookingId') FILTER (WHERE "eventType" = 'BOOKING_COMPLETED'), NULL) AS booking_ids
    FROM "AnalyticsEvent"
    WHERE "createdAt" >= ${since} AND "createdAt" <= ${until} AND experiments ? ${e.name} AND "sessionId" <> 'anonymous'
    GROUP BY 1`;
  const allIds = rows.flatMap((r) => r.booking_ids || []);
  const paid = allIds.length ? await prisma.booking.findMany({ where: { id: { in: allIds }, status: { in: ['CONFIRMED', 'CHECKED_IN', 'COMPLETED'] } }, select: { id: true, totalAmount: true } }) : [];
  const value = new Map(paid.map((b) => [b.id, Number(b.totalAmount)]));
  const byName = new Map(rows.map((r) => [r.variant, r]));
  const control = byName.get('control');
  const variants = e.variants.map((v) => {
    const r = byName.get(v.name) || { visitors: 0, viewers: 0, checkouts: 0, bookers: 0, booking_ids: [] };
    const revenue = (r.booking_ids || []).reduce((s, bid) => s + (value.get(bid) || 0), 0);
    const conv = r.visitors ? r.bookers / r.visitors : null;
    const cConv = control?.visitors ? control.bookers / control.visitors : null;
    const p = v.name === 'control' || !control ? null : twoProportionP(r.bookers, r.visitors, control.bookers, control.visitors);
    return {
      name: v.name, weight: v.weight, visitors: r.visitors, viewers: r.viewers, checkouts: r.checkouts, bookings: r.bookers,
      revenue: Math.round(revenue), conversionPct: conv === null ? null : Math.round(conv * 10000) / 100,
      revenuePerVisitor: r.visitors ? Math.round((revenue / r.visitors) * 100) / 100 : null,
      upliftPct: v.name === 'control' || !cConv || conv === null ? null : Math.round(((conv - cConv) / cConv) * 1000) / 10,
      pValue: p === null ? null : Math.round(p * 10000) / 10000,
    };
  });
  const enough = variants.every((v) => v.visitors >= MIN_VISITORS);
  const best = variants.filter((v) => v.name !== 'control' && v.pValue !== null && v.pValue < 0.05 && enough).sort((a, b) => (b.upliftPct || 0) - (a.upliftPct || 0))[0];
  let verdict;
  if (!variants.some((v) => v.visitors)) verdict = { tone: 'info', text: 'No visitors in this test yet. Results appear once the test is running and guests visit the pages it changes.' };
  else if (!enough) verdict = { tone: 'info', text: `Too early to tell: wait until every version has at least ${MIN_VISITORS} visitors.` };
  else if (best && best.upliftPct > 0) verdict = { tone: 'good', text: `${best.name} converts ${best.upliftPct}% better than control, and the difference is unlikely to be chance (p = ${best.pValue}).` };
  else if (best) verdict = { tone: 'bad', text: `${best.name} converts ${Math.abs(best.upliftPct)}% worse than control (p = ${best.pValue}). Consider ending it.` };
  else verdict = { tone: 'info', text: 'No clear difference between the versions yet.' };
  return { experiment: shape(e), period: { from: since, to: until }, variants, verdict, minVisitors: MIN_VISITORS,
    notes: ['Visitors are counted by visit (browser), from the website\'s tracking events. Bookings and revenue come from confirmed bookings.', 'p is the chance the difference in booking rate is luck; under 0.05 is usually treated as a real difference.'] };
};

export default { WEBSITE_EXPERIMENTS, listExperiments, createExperiment, updateExperiment, deleteExperiment, experimentResults, twoProportionP };
