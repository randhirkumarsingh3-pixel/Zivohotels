import { asyncHandler } from '../middleware/asyncHandler.js';
import prisma from '../config/db.js';

// Get Global Pricing Config (SAFE_MODE, limits, etc.)
export const getPricingConfig = asyncHandler(async (req, res) => {
  const appState = await prisma.appState.findUnique({ where: { id: 'singleton' } });
  
  res.status(200).json({
    success: true,
    data: {
      systemMode: appState?.systemMode || 'NORMAL',
    }
  });
});

// Update Global Pricing Config
export const updatePricingConfig = asyncHandler(async (req, res) => {
  const { systemMode } = req.body;
  
  const appState = await prisma.appState.upsert({
    where: { id: 'singleton' },
    update: { 
      ...(systemMode !== undefined && { systemMode })
    },
    create: { 
      id: 'singleton',
      systemMode: systemMode || 'NORMAL'
    }
  });

  res.status(200).json({
    success: true,
    data: {
      systemMode: appState.systemMode
    }
  });
});

// Get Pricing Rules
export const getPricingRules = asyncHandler(async (req, res) => {
  const rules = await prisma.pricingRule.findMany({
    orderBy: { createdAt: 'desc' }
  });

  res.status(200).json({
    success: true,
    count: rules.length,
    data: rules
  });
});

// Create Pricing Rule
export const createPricingRule = asyncHandler(async (req, res) => {
  const { hotelId, roomTypeId, type, condition, adjustment } = req.body;

  const rule = await prisma.pricingRule.create({
    data: {
      hotelId,
      roomTypeId,
      type,
      condition: condition || {},
      adjustment
    }
  });

  res.status(201).json({
    success: true,
    data: rule
  });
});

// Get Pricing Snapshots (Audit)
export const getPricingSnapshots = asyncHandler(async (req, res) => {
  const { limit = 20, bookingId } = req.query;

  const query = {};
  if (bookingId) query.bookingId = bookingId;

  const snapshots = await prisma.pricingSnapshot.findMany({
    where: query,
    orderBy: { createdAt: 'desc' },
    take: parseInt(limit)
  });

  res.status(200).json({
    success: true,
    count: snapshots.length,
    data: snapshots
  });
});

// Get Holiday Calendar
export const getHolidays = asyncHandler(async (req, res) => {
  const holidays = await prisma.holidayCalendar.findMany({
    where: { isActive: true },
    orderBy: { date: 'asc' }
  });

  res.status(200).json({ success: true, count: holidays.length, data: holidays });
});

// Create/Add Holiday
export const createHoliday = asyncHandler(async (req, res) => {
  const { date, city, name, multiplier } = req.body;

  const holiday = await prisma.holidayCalendar.create({
    data: {
      date: new Date(date),
      city: city || null,
      name,
      multiplier: multiplier ?? 0.15
    }
  });

  res.status(201).json({ success: true, data: holiday });
});

// Delete/Disable Holiday
export const deleteHoliday = asyncHandler(async (req, res) => {
  await prisma.holidayCalendar.update({
    where: { id: req.params.id },
    data: { isActive: false }
  });

  res.status(200).json({ success: true, message: 'Holiday deactivated.' });
});
