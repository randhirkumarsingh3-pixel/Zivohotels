import express from 'express';
import { downloadInvoice, downloadNote } from '../controllers/invoiceController.js';

const router = express.Router();

router.get('/notes/:id/download', downloadNote);
router.get('/:id/download', downloadInvoice);

export default router;
