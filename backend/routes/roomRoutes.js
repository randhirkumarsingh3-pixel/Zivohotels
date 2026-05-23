import express from 'express';
import { createRoomType, updateRoomType, deleteRoomType, getRoomTypes } from '../controllers/roomController.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

router.route('/')
  .get(protect, authorizeRoles('ADMIN', 'OWNER'), getRoomTypes)
  .post(protect, authorizeRoles('ADMIN', 'OWNER'), createRoomType);

router.route('/:id')
  .patch(protect, authorizeRoles('ADMIN', 'OWNER'), updateRoomType)
  .delete(protect, authorizeRoles('ADMIN', 'OWNER'), deleteRoomType);

export default router;
