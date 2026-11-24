/**
 * Admin → Content Scores: every property's listing completeness, and one property's full detail.
 * Mounted at /api/v1/admin/content-scores (needs properties.view).
 */
import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import prisma from '../config/db.js';
import { getShared, setShared } from '../utils/sharedCache.js';
import { portfolioScores, propertyOverview } from '../services/contentScore.js';

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const { search, status, band } = req.query;
  // Scoring every property is heavy: the list is worked out at most once every 2 minutes per
  // filter (one property's own page, below, is always current)
  const key = `content-scores:${JSON.stringify([search || '', status || '', band || ''])}`;
  let data = await getShared(key);
  if (!data) {
    data = { ...await portfolioScores({ search, status, band }), computedAt: new Date().toISOString() };
    setShared(key, data, 2 * 60 * 1000);
  }
  res.json({ success: true, data });
}));

router.get('/:hotelId', asyncHandler(async (req, res) => {
  const data = await propertyOverview(String(req.params.hotelId));
  if (!data) return res.status(404).json({ success: false, message: 'Property not found' });
  const owner = await prisma.hotel.findUnique({ where: { id: data.hotel.id }, select: { owner: { select: { name: true, email: true, phone: true } } } });
  res.json({ success: true, data: { ...data, owner: owner?.owner || null } });
}));

export default router;
