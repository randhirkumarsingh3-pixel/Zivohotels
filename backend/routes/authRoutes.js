import express from 'express';
import {
  authConfig, signupStart, signup, login, loginCodeSend, loginCodeVerify, googleSignIn,
  phoneCodeSend, phoneCodeVerify, me, sendOtp, verifyOtp, logout, logoutGlobal, adoptSession,
} from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';
import { changePassword, forgotPassword, resetPassword } from '../controllers/passwordController.js';

const router = express.Router();

// What the sign-in pages need: Google on/off, codes in test mode
router.get('/config', authConfig);

// Sign up: details -> a code to the email and to the phone -> account (signed in)
router.post('/signup/start', signupStart);
router.post('/signup', signup);

// Sign in: password, or a code to the email / phone, or Google
router.post('/login', login);
router.post('/login/code', loginCodeSend);
router.post('/login/code/verify', loginCodeVerify);
router.post('/google', googleSignIn);

// Add or change the mobile number (e.g. after Google sign-in)
router.post('/phone/code', protect, phoneCodeSend);
router.post('/phone/verify', protect, phoneCodeVerify);

// Hotel email check during property onboarding
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);

// Sessions: this device, every device; move an older Bearer session into the cookie
router.post('/logout', logout);
router.post('/logout-all', protect, logoutGlobal);
router.post('/session', protect, adoptSession);

// Passwords: change while signed in; "forgot password" emails a 1-hour link to reset it
router.put('/password', protect, changePassword);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// The signed-in person's own profile (profile fields only)
router.get('/me', protect, me);

export default router;
