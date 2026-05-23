import express from 'express';
import {
  getAgreements,
  createAgreement,
  sendAgreement,
  signAgreement,
  cancelAgreement,
} from '../controllers/agreementController.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes: ADMIN only
router.use(protect);
router.use(authorizeRoles('ADMIN'));

router.route('/')
  .get(getAgreements)
  .post(createAgreement);

router.patch('/:id/send',   sendAgreement);
router.patch('/:id/sign',   signAgreement);
router.delete('/:id',       cancelAgreement);

export default router;
