/**
 * Checks used while a property is onboarded (Finance step), mounted at /api/v1/verification.
 * Signed-in owners (for their own property) and ZivoPlus staff.
 *
 *  POST /pan                      { pan, incorporationType }           format + holder type
 *  POST /gstin                    { gstin, pan, state }                format, check digit, PAN, state
 *  GET  /ifsc/:code                                                     bank and branch
 *  POST /bank-account             { hotelId, accountName, accountNumber, ifscCode, bankName?, branchName? }
 *                                 saves the payout account and starts the ₹1 test deposit (or marks
 *                                 it for checking against the cancelled cheque)
 *  GET  /bank-account/:hotelId    the account's check status (asks the bank again while pending)
 *  POST /bank-account/:hotelId/decision  { status: VERIFIED|FAILED, note }  staff, after checking
 *                                 the cancelled cheque
 */
import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';
import prisma from '../config/db.js';
import { managesHotel } from '../utils/hotelAccess.js';
import { checkPan, checkGstin, lookupIfsc, startAccountCheck, pollAccountCheck, pennyDropConfigured } from '../services/verification/kyc.js';

const router = express.Router();
router.use(protect, authorizeRoles('ADMIN', 'OWNER'));

const isStaff = (u) => u.role === 'ADMIN';
const editable = (h) => ['DRAFT', 'INFORMATION_REQUESTED'].includes(h.status);
const maskAcc = (n) => (n ? `••••${String(n).slice(-4)}` : '');
const view = (b) => b && ({
  accountName: b.accountName, bankName: b.bankName, branchName: b.branchName, ifscCode: b.ifscCode, accountEnding: maskAcc(b.accountNumber),
  status: b.verificationStatus, method: b.verificationMethod, note: b.verificationNote, bankHolderName: b.bankHolderName, verifiedAt: b.verifiedAt,
});

const loadHotel = async (req, res, hotelId, { forEdit = false } = {}) => {
  const hotel = hotelId ? await prisma.hotel.findUnique({ where: { id: hotelId }, select: { id: true, ownerId: true, status: true, name: true, legalName: true, owner: { select: { email: true } } } }) : null;
  if (!hotel) { res.status(404).json({ success: false, message: 'Property not found. Save the property first.' }); return null; }
  if (!isStaff(req.user)) {
    if (!managesHotel(req.user, hotel, forEdit ? 'property.edit' : 'finance.view')) { res.status(403).json({ success: false, message: 'Not your property.' }); return null; }
    if (forEdit && !editable(hotel)) { res.status(409).json({ success: false, message: 'The payout account is locked after the property is submitted. Contact ZivoPlus support to change it.' }); return null; }
  }
  return hotel;
};

router.post('/pan', asyncHandler(async (req, res) => res.json({ success: true, data: checkPan(req.body?.pan, req.body?.incorporationType) })));
router.post('/gstin', asyncHandler(async (req, res) => res.json({ success: true, data: checkGstin(req.body?.gstin, { pan: req.body?.pan, state: req.body?.state }) })));
router.get('/ifsc/:code', asyncHandler(async (req, res) => res.json({ success: true, data: await lookupIfsc(req.params.code) })));

router.post('/bank-account', asyncHandler(async (req, res) => {
  const { hotelId, accountName, accountNumber, ifscCode, bankName, branchName } = req.body || {};
  const hotel = await loadHotel(req, res, hotelId, { forEdit: true });
  if (!hotel) return;
  const acc = String(accountNumber || '').replace(/\s/g, '');
  if (!/^\d{9,18}$/.test(acc)) return res.status(400).json({ success: false, message: 'An Indian bank account number has 9 to 18 digits.' });
  const name = String(accountName || '').trim();
  if (name.length < 3) return res.status(400).json({ success: false, message: 'Enter the account holder name (the business\'s legal name).' });
  const ifsc = await lookupIfsc(ifscCode);
  if (!ifsc.ok) return res.status(400).json({ success: false, message: ifsc.message });

  const base = { accountName: name, accountNumber: acc, ifscCode: ifsc.ifsc, bankName: String(bankName || ifsc.bank || 'Other').slice(0, 80), branchName: String(branchName || ifsc.branch || '').slice(0, 120) || null };
  // Too many attempts guard: at most 5 test deposits per property per day
  const existing = await prisma.bankDetail.findUnique({ where: { hotelId } });
  const day = new Date(Date.now() - 86400000);
  const tries = await prisma.auditLog.count({ where: { action: 'BANK_ACCOUNT_CHECK', entityId: hotelId, createdAt: { gte: day } } });
  if (tries >= 5 && pennyDropConfigured()) return res.status(429).json({ success: false, message: 'Too many account checks today. Try again tomorrow, or contact ZivoPlus support.' });

  const result = await startAccountCheck({ accountNumber: acc, ifsc: ifsc.ifsc, holderName: name, contactName: hotel.name, email: hotel.owner?.email || req.user.email });
  const data = {
    ...base, verificationStatus: result.status, verificationMethod: result.method, verificationRef: result.ref || null, verificationNote: result.message,
    bankHolderName: result.bankHolderName || null, verifiedAt: result.status === 'VERIFIED' ? new Date() : null, verifiedBy: result.status === 'VERIFIED' ? 'PENNY_DROP' : null,
  };
  const saved = existing ? await prisma.bankDetail.update({ where: { hotelId }, data }) : await prisma.bankDetail.create({ data: { ...data, hotelId } });
  await prisma.auditLog.create({ data: { action: 'BANK_ACCOUNT_CHECK', entityType: 'HOTEL', entityId: hotelId, userId: req.user.id, details: { status: result.status, method: result.method, ifsc: ifsc.ifsc, accountEnding: acc.slice(-4) } } }).catch(() => {});
  res.json({ success: true, data: { ...view(saved), ifsc, pennyDrop: pennyDropConfigured() } });
}));

router.get('/bank-account/:hotelId', asyncHandler(async (req, res) => {
  const hotel = await loadHotel(req, res, req.params.hotelId);
  if (!hotel) return;
  let bank = await prisma.bankDetail.findUnique({ where: { hotelId: hotel.id } });
  if (bank?.verificationStatus === 'PENDING' && bank.verificationRef) {
    const r = await pollAccountCheck(bank.verificationRef, bank.accountName).catch(() => null);
    if (r && r.status !== 'PENDING') {
      bank = await prisma.bankDetail.update({ where: { hotelId: hotel.id }, data: { verificationStatus: r.status, verificationNote: r.message, bankHolderName: r.bankHolderName || null, verifiedAt: r.status === 'VERIFIED' ? new Date() : null, verifiedBy: r.status === 'VERIFIED' ? 'PENNY_DROP' : null } });
    }
  }
  res.json({ success: true, data: { ...(view(bank) || { status: 'NONE' }), pennyDrop: pennyDropConfigured() } });
}));

router.post('/bank-account/:hotelId/decision', asyncHandler(async (req, res) => {
  if (!isStaff(req.user)) return res.status(403).json({ success: false, message: 'Only ZivoPlus staff can confirm an account.' });
  const { status, note } = req.body || {};
  if (!['VERIFIED', 'FAILED'].includes(status)) return res.status(400).json({ success: false, message: 'Choose verified or not verified.' });
  if (String(note || '').trim().length < 3) return res.status(400).json({ success: false, message: 'Add a note, e.g. "Matches the cancelled cheque".' });
  const bank = await prisma.bankDetail.findUnique({ where: { hotelId: req.params.hotelId } });
  if (!bank) return res.status(404).json({ success: false, message: 'No payout account saved for this property yet.' });
  const saved = await prisma.bankDetail.update({ where: { hotelId: req.params.hotelId }, data: { verificationStatus: status, verificationMethod: 'MANUAL', verificationNote: String(note).trim().slice(0, 300), verifiedAt: status === 'VERIFIED' ? new Date() : null, verifiedBy: req.user.email || req.user.id } });
  await prisma.auditLog.create({ data: { action: `BANK_ACCOUNT_${status}`, entityType: 'HOTEL', entityId: req.params.hotelId, userId: req.user.id, details: { note } } }).catch(() => {});
  res.json({ success: true, data: view(saved) });
}));

export default router;
