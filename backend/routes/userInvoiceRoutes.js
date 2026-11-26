import express from 'express';
import { downloadInvoice, downloadNote, downloadHotelInvoice } from '../controllers/invoiceController.js';

const router = express.Router();

router.get('/notes/:id/download', downloadNote);
router.get('/hotel/:bookingId/download', downloadHotelInvoice);
router.get('/:id/download', downloadInvoice);

export default router;
