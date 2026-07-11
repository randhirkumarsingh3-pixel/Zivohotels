import express from 'express';
import {
  getReviewQueue,
  submitForReview,
  startReview,
  approveProperty,
  requestInformation,
  markAgreementSigned,
  goLive,
  unlistProperty
} from '../controllers/propertyReviewController.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

// Owner & Admin actions
router.patch('/:id/submit', protect, authorizeRoles('ADMIN', 'OWNER'), submitForReview);

// Admin-only actions
router.use(protect);
router.use(authorizeRoles('ADMIN'));

router.get('/queue', getReviewQueue);
router.patch('/:id/review', startReview);
router.patch('/:id/approve', approveProperty);
router.patch('/:id/request-info', requestInformation);
router.patch('/:id/agreement-signed', markAgreementSigned);
router.patch('/:id/go-live', goLive);
router.patch('/:id/unlist', unlistProperty);

export default router;
