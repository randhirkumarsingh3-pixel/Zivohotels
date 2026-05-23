import express from 'express';
import { signup, login } from '../controllers/authController.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);

// Example of a protected route using RBAC
router.get('/me', protect, (req, res) => {
  res.status(200).json({
    status: 'success',
    data: {
      user: req.user
    }
  });
});

// Example of an Admin/Owner only route
router.get('/admin-dashboard', protect, authorizeRoles('ADMIN', 'OWNER'), (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Welcome to the protected admin dashboard'
  });
});

export default router;
