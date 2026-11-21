import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { listForUser, markUserRead } from '../services/notifyService.js';

/** The bell for guests and admins: my notifications, newest first, and mark them read. */
const router = express.Router();
router.use(protect);

router.get('/', async (req, res, next) => {
  try { res.json({ success: true, data: await listForUser(req.user.id, { limit: req.query.limit }) }); } catch (e) { next(e); }
});

router.put('/read', async (req, res, next) => {
  try {
    const r = await markUserRead(req.user.id, req.body?.ids);
    res.json({ success: true, data: { updated: r.count } });
  } catch (e) { next(e); }
});

export default router;
