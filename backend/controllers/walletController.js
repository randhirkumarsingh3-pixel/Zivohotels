import prisma from '../config/db.js';
import wallets from '../services/finance/walletService.js';

/**
 * Wallets API.
 *  Guest:  GET /wallet (Zivo Cash balance and history)
 *  Hotel:  GET /extranet/wallet (balance from settlements and payouts, statement)
 *  Admin:  /admin/wallets: GET /overview, GET /guests, GET /guests/:id, POST /guests/:id/adjust,
 *          GET /hotels/:hotelId
 */
const send = (res, req, fn, status = 200) => fn().then(
  (data) => res.status(status).json({ success: true, data, requestId: req.id }),
  (err) => {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message, requestId: req.id });
    console.error('[Wallet]', err);
    return res.status(500).json({ success: false, message: 'Something went wrong with the wallet. Please try again.', requestId: req.id });
  }
);
const adminOnly = (req, res) => {
  if (req.user.role === 'ADMIN') return true;
  res.status(403).json({ success: false, message: 'Only Zivo admins manage wallets', requestId: req.id });
  return false;
};

export const getMyWallet = (req, res) => send(res, req, () => wallets.guestWallet(req.user.id, req.query));
export const getHotelWallet = (req, res) => send(res, req, () => wallets.hotelWallet(req.scopedHotelId, req.query));

export const adminOverview = (req, res) => adminOnly(req, res) && send(res, req, () => wallets.adminOverview());
export const adminGuests = (req, res) => adminOnly(req, res) && send(res, req, () => wallets.listGuestWallets(req.query));
export const adminGuest = (req, res) => adminOnly(req, res) && send(res, req, async () => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, name: true, email: true, role: true } });
  if (!user) throw Object.assign(new Error('Guest not found'), { status: 404 });
  return { user, ...(await wallets.guestWallet(user.id, { limit: 200 })) };
});
export const adminAdjust = (req, res) => adminOnly(req, res) && send(res, req, () => wallets.adminAdjust({ userId: req.params.id, amount: req.body?.amount, reason: req.body?.reason, direction: req.body?.direction }, req.user.id), 201);
export const adminHotel = (req, res) => adminOnly(req, res) && send(res, req, () => wallets.hotelWallet(req.params.hotelId, req.query));
