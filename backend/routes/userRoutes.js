import express from 'express';
import {
  getUsers,
  updateUserStatus,
  addUser,
  inviteUser,
  resendInvite,
  acceptInvite,
} from '../controllers/userController.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

// ─── Public routes (no auth) ─────────────────────────────────────────────────
// Accept invite is public — the invite token IS the authentication
router.post('/accept-invite', acceptInvite);

// ─── Admin-only routes ────────────────────────────────────────────────────────
router.use(protect);
router.use(authorizeRoles('ADMIN'));

router.route('/')
  .get(getUsers)
  .post(addUser);            // POST /api/v1/users — direct user creation

router.post('/invite',        inviteUser);        // POST /api/v1/users/invite
router.post('/resend-invite', resendInvite);      // POST /api/v1/users/resend-invite

router.patch('/:id/status',   updateUserStatus);  // PATCH /api/v1/users/:id/status

export default router;
