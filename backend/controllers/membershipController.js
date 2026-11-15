import prisma from '../config/db.js';
import membership from '../services/membershipService.js';

/**
 * Membership API.
 *  Public: GET /membership/plans
 *  Guest:  GET /membership/me, POST /membership/buy { planId, method: WALLET | ONLINE }, POST /membership/verify
 *  Hotel:  GET/PUT /extranet/membership (member price % for the active property, member bookings)
 *  Admin:  /admin/membership: GET /overview, PUT /plans/:id, GET /members, POST /grant,
 *          POST /members/:id/cancel, PUT /hotels/:hotelId
 */
const send = (res, req, fn, status = 200) => fn().then(
  (data) => res.status(status).json({ success: true, data, requestId: req.id }),
  (err) => {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message, requestId: req.id });
    console.error('[Membership]', err);
    return res.status(500).json({ success: false, message: 'Something went wrong with membership. Please try again.', requestId: req.id });
  }
);
const adminOnly = (req, res) => {
  if (req.user.role === 'ADMIN') return true;
  res.status(403).json({ success: false, message: 'Only Zivo admins manage membership', requestId: req.id });
  return false;
};

export const getPlans = (req, res) => send(res, req, () => membership.listPlans());
export const getMine = (req, res) => send(res, req, () => membership.myMembership(req.user.id));
export const buy = (req, res) => send(res, req, () => (req.body?.method === 'WALLET'
  ? membership.buyWithWallet(req.user.id, req.body?.planId)
  : membership.startOnlinePayment(req.user.id, req.body?.planId)), 201);
export const verify = (req, res) => send(res, req, () => membership.verifyOnline(req.user.id, req.body || {}));

const setHotelPercent = async (hotelId, value) => {
  const pct = Number(value);
  if (!Number.isFinite(pct) || pct < 0 || pct > 50) throw Object.assign(new Error('Member discount must be 0% to 50%'), { status: 400 });
  return prisma.hotel.update({ where: { id: hotelId }, data: { memberDiscountPercent: Math.round(pct * 10) / 10 }, select: { id: true, memberDiscountPercent: true } });
};

export const getHotelMembership = (req, res) => send(res, req, async () => {
  const hotel = await prisma.hotel.findUnique({ where: { id: req.scopedHotelId }, select: { memberDiscountPercent: true } });
  const rows = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) AS bookings, COALESCE(SUM("totalAmount"),0) AS revenue,
           COALESCE(SUM((metadata->'membership'->>'hotelDiscount')::numeric),0) AS "hotelDiscount",
           COUNT(*) FILTER (WHERE (metadata->'membership'->>'isPaid')::boolean) AS "paidMemberBookings"
    FROM "Booking" WHERE "hotelId" = $1 AND status <> 'CANCELLED' AND metadata->'membership' IS NOT NULL AND metadata->>'membership' <> 'null'`, req.scopedHotelId);
  const r = rows[0] || {};
  return { memberDiscountPercent: hotel?.memberDiscountPercent || 0, stats: { bookings: Number(r.bookings || 0), revenue: Number(r.revenue || 0), discountGiven: Number(r.hotelDiscount || 0), paidMemberBookings: Number(r.paidMemberBookings || 0) } };
});
export const putHotelMembership = (req, res) => send(res, req, () => setHotelPercent(req.scopedHotelId, req.body?.memberDiscountPercent));

export const adminOverview = (req, res) => adminOnly(req, res) && send(res, req, () => membership.adminOverview());
export const adminUpdatePlan = (req, res) => adminOnly(req, res) && send(res, req, () => membership.updatePlan(req.params.id, req.body || {}));
export const adminMembers = (req, res) => adminOnly(req, res) && send(res, req, () => membership.listMembers(req.query));
export const adminGrant = (req, res) => adminOnly(req, res) && send(res, req, () => membership.grant(req.body || {}, req.user.id), 201);
export const adminCancel = (req, res) => adminOnly(req, res) && send(res, req, () => membership.cancelMembership(req.params.id, req.body?.note, req.user.id));
export const adminHotelPercent = (req, res) => adminOnly(req, res) && send(res, req, () => setHotelPercent(req.params.hotelId, req.body?.memberDiscountPercent));
