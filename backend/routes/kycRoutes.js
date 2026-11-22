import express from 'express';
import { uploadDocument, verifyDocument, getPropertyDocuments, downloadDocument } from '../controllers/kycController.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';
import { permissionGate } from '../middleware/permissionGate.js';

const router = express.Router();

router.get('/documents/:id/file', protect, authorizeRoles('ADMIN', 'OWNER'), permissionGate, downloadDocument);
router.get('/:hotelId', protect, authorizeRoles('ADMIN', 'OWNER'), permissionGate, getPropertyDocuments);
router.post('/:hotelId/upload', protect, authorizeRoles('ADMIN', 'OWNER'), permissionGate, uploadDocument);
router.patch('/:id/verify', protect, authorizeRoles('ADMIN'), permissionGate, verifyDocument);

export default router;
