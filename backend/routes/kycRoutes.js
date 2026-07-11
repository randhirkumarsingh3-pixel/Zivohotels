import express from 'express';
import { uploadDocument, verifyDocument, getPropertyDocuments } from '../controllers/kycController.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/:hotelId', protect, authorizeRoles('ADMIN', 'OWNER'), getPropertyDocuments);
router.post('/:hotelId/upload', protect, authorizeRoles('ADMIN', 'OWNER'), uploadDocument);
router.patch('/:id/verify', protect, authorizeRoles('ADMIN'), verifyDocument);

export default router;
