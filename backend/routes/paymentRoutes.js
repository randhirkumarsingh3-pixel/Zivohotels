import express from 'express';
import { createOrder, verifyPayment, webhook } from '../controllers/paymentController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/create-order', protect, createOrder);
router.post('/verify', protect, verifyPayment);

// Webhook is public (Razorpay calls this directly)
// Note: Webhook signatures require raw body, ensure Express is parsing JSON correctly or use raw parsing middleware here if needed.
router.post('/webhook', express.json(), webhook);

export default router;
