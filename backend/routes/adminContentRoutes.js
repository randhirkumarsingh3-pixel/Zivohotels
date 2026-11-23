/**
 * Admin → Content Scores: every property's listing completeness, and one property's full detail.
 * Mounted at /api/v1/admin/content-scores (needs properties.view).
 */
import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import prisma from '../config/db.js';
import { portfolioScores, propertyOverview } from '../services/contentScore.js';

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const { search, status, band } = req.query;
  res.json({ success: true, data: await portfolioScores({ search, status, band }) });
}));

router.get('/:hotelId', asyncHandler(async (req, res) => {
  const data = await propertyOverview(String(req.params.hotelId));
  if (!data) return res.status(404).json({ success: false, message: 'Property not found' });
  const owner = await prisma.hotel.findUnique({ where: { id: data.hotel.id }, select: { owner: { select: { name: true, email: true, phone: true } } } });
  res.json({ success: true, data: { ...data, owner: owner?.owner || null } });
}));

export default router;
