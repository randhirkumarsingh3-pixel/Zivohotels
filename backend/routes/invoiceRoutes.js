import express from 'express';
import { regenerateInvoice } from '../controllers/invoiceController.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes here should be protected by the admin middleware in server.js
router.post('/regenerate', protect, authorizeRoles('ADMIN', 'OWNER'), regenerateInvoice);

export default router;
