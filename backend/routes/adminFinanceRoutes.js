import express from 'express';
import { ledger, payouts, getSettings, putSettings, listDocuments, getDocument, previewMonth, issueMonth, creditNote, statement, emailMonth, propertyYear, documentsZip } from '../controllers/adminFinanceController.js';

/** Admin → Finance (mounted at /admin/finance; reading needs finance.view, changes finance.manage) */
const router = express.Router();
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
