import express from 'express';
import gstInvoices from '../services/hotelGstInvoices.js';
import { getServiceFeeSettings, saveServiceFeeSettings } from '../services/serviceFee.js';
import { ledger, payouts, getSettings, putSettings, listDocuments, getDocument, previewMonth, issueMonth, creditNote, statement, emailMonth, propertyYear, documentsZip } from '../controllers/adminFinanceController.js';

/** Admin → Finance (mounted at /admin/finance; reading needs finance.view, changes finance.manage) */
const router = express.Router();
// Business (GSTIN) bookings whose GST invoice the property issues and uploads
const answer = (fn) => async (req, res, next) => {
  try { res.json({ success: true, data: await fn(req) }); } catch (e) {
    if (e.statusCode && e.statusCode < 500) return res.status(e.statusCode).json({ success: false, message: e.message });
    next(e);
  }
};
router.get('/hotel-invoices', answer((req) => gstInvoices.adminList(req.query)));
// ZivoPlus's service fee on guests' bookings (off by default)
router.get('/service-fee', answer(() => getServiceFeeSettings()));
router.put('/service-fee', answer((req) => saveServiceFeeSettings(req.body || {}, req.user?.id)));
router.post('/hotel-invoices/:bookingId/remind', answer((req) => gstInvoices.adminRemind(req.params.bookingId, req.user)));
router.get('/ledger', ledger);
router.get('/payouts', payouts);
router.get('/settings', getSettings);
router.put('/settings', putSettings);
router.get('/documents', listDocuments);
router.get('/documents/zip', documentsZip);
router.get('/documents/:id', getDocument);
router.post('/documents/:id/credit-note', creditNote);
router.get('/months/:period', previewMonth);
router.post('/months/:period/issue', issueMonth);
router.post('/months/:period/email', emailMonth);
router.get('/statement', statement);
router.get('/properties/:hotelId', propertyYear);
export default router;
