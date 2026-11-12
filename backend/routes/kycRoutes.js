import express from 'express';
import { uploadDocument, verifyDocument, getPropertyDocuments, downloadDocument } from '../controllers/kycController.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/documents/:id/file', protect, authorizeRoles('ADMIN', 'OWNER'), downloadDocument);
router.get('/:hotelId', protect, authorizeRoles('ADMIN', 'OWNER'), getPropertyDocuments);
router.post('/:hotelId/upload', protect, authorizeRoles('ADMIN', 'OWNER'), uploadDocument);
router.patch('/:id/verify', protect, authorizeRoles('ADMIN'), verifyDocument);

export default router;
