import express from 'express';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

// Master Admin routes are restricted to ADMIN only
router.use(protect);
router.use(authorizeRoles('ADMIN'));

/**
 * Master Admin Intelligence Endpoints
 */

// Executive Dashboard Stats
router.get('/executive-stats', async (req, res) => {
  // Global aggregation logic
  res.json({ success: true, message: "Global platform intelligence" });
});

// System Health & Anomaly Detection
router.get('/system-health', async (req, res) => {
  res.json({ success: true, status: "NORMAL" });
});

// Financial Ledger (Full)
router.get('/finance/ledger', async (req, res) => {
  res.json({ success: true, entries: [] });
});

export default router;
