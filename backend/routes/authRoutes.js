import express from 'express';
import { signup, login, sendOtp, verifyOtp, logout, adoptSession } from '../controllers/authController.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';
import { changePassword, forgotPassword, resetPassword } from '../controllers/passwordController.js';

const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
// Session cookie: log out on this device; move an older Bearer session into the cookie
router.post('/logout', logout);
router.post('/session', protect, adoptSession);

// Passwords: change while signed in; "forgot password" emails a 1-hour link to reset it
router.put('/password', protect, changePassword);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Example of a protected route using RBAC
// The signed-in user's own profile (checkout uses it to fill in "I'm the guest"). Only profile
// fields: it used to return internal ones too (invite token, token version...).
router.get('/me', protect, (req, res) => {
  const { id, name, email, phone, role } = req.user;
  res.status(200).json({ success: true, data: { user: { id, name, email, phone: phone || '', role } } });
});

// Example of an Admin/Owner only route
router.get('/admin-dashboard', protect, authorizeRoles('ADMIN', 'OWNER'), (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Welcome to the protected admin dashboard'
  });
});

export default router;
