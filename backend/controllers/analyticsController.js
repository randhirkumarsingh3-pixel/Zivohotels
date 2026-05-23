import prisma from '../config/db.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { z } from 'zod';

// --- ZOD SCHEMAS ---

const analyticsQuerySchema = z.object({
  days: z.string().transform(Number).pipe(z.number().int().min(1).max(365)).optional().default('7'),
  hotelId: z.string().uuid().optional()
});

/** Build a date N days ago, set to midnight */
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
};

/** Helper to get scope filter based on user role */
const getScopeFilter = (req) => {
  if (req.user.role === 'ADMIN') return {};
  return { hotel: { ownerId: req.user.id } };
};

const getHotelScopeFilter = (req) => {
  if (req.user.role === 'ADMIN') return { isDeleted: false };
  return { isDeleted: false, ownerId: req.user.id };
};

// ─── GET /api/v1/analytics/kpis ───────────────────────────────────────────────
export const getKpis = asyncHandler(async (req, res) => {
    const scope = getScopeFilter(req);
    const hotelScope = getHotelScopeFilter(req);
    
    console.log(`[Analytics] KPI request by ${req.user.id} (${req.user.role})`);

    const now        = new Date();
    const thisMonth  = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth  = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    // 1. Total revenue (all time) - ONLY for CONFIRMED/COMPLETED bookings
    const [revAll, revThis, revLast] = await Promise.all([
      prisma.booking.aggregate({ where: { ...scope, status: { in: ['CONFIRMED', 'COMPLETED'] } }, _sum: { totalAmount: true } }),
      prisma.booking.aggregate({ where: { ...scope, status: { in: ['CONFIRMED', 'COMPLETED'] }, createdAt: { gte: thisMonth } }, _sum: { totalAmount: true } }),
      prisma.booking.aggregate({ where: { ...scope, status: { in: ['CONFIRMED', 'COMPLETED'] }, createdAt: { gte: lastMonth, lte: lastMonthEnd } }, _sum: { totalAmount: true } }),
    ]);

    // 2. Booking counts
    const [bookingsAll, bookingsThis, bookingsLast, bookingsCancelled] = await Promise.all([
      prisma.booking.count({ where: { ...scope, status: { in: ['CONFIRMED', 'COMPLETED'] } } }),
      prisma.booking.count({ where: { ...scope, status: { in: ['CONFIRMED', 'COMPLETED'] }, createdAt: { gte: thisMonth } } }),
      prisma.booking.count({ where: { ...scope, status: { in: ['CONFIRMED', 'COMPLETED'] }, createdAt: { gte: lastMonth, lte: lastMonthEnd } } }),
      prisma.booking.count({ where: { ...scope, status: 'CANCELLED', createdAt: { gte: thisMonth } } }),
    ]);

    // 3. Live properties
    const [propertiesTotal, propertiesLive] = await Promise.all([
      prisma.hotel.count({ where: hotelScope }),
      prisma.hotel.count({ where: { ...hotelScope, status: 'ACTIVE' } }),
    ]);

    // 4. Cancellation rate this month
    const totalThisMonth  = bookingsThis + bookingsCancelled;
    const cancelRate = totalThisMonth > 0
      ? Math.round((bookingsCancelled / totalThisMonth) * 100)
      : 0;

    // 5. Compute MoM deltas
    const revThisVal  = revThis._sum.totalAmount  || 0;
    const revLastVal  = revLast._sum.totalAmount  || 0;
    const revDelta    = revLastVal > 0 ? ((revThisVal - revLastVal) / revLastVal * 100).toFixed(1) : null;
    
    const bkDelta     = bookingsLast > 0 ? ((bookingsThis - bookingsLast) / bookingsLast * 100).toFixed(1) : null;

    res.status(200).json({
      success: true,
      data: {
        revenue: {
          total:    revAll._sum.totalAmount || 0,
          thisMonth: revThisVal,
          delta:    revDelta,
          trend:    revDelta !== null ? (parseFloat(revDelta) >= 0 ? 'up' : 'down') : 'neutral',
        },
        bookings: {
          total:    bookingsAll,
          thisMonth: bookingsThis,
          active:   bookingsThis, // Explicitly aligned with Dashboard.jsx
          delta:    bkDelta,
          trend:    bkDelta !== null ? (parseFloat(bkDelta) >= 0 ? 'up' : 'down') : 'neutral',
        },
        properties: {
          total: propertiesTotal,
          live:  propertiesLive,
        },
        cancellation: {
          rate: cancelRate,
          count: bookingsCancelled,
          trend: cancelRate > 15 ? 'down' : 'up' // High cancellation is 'down' (bad)
        }
      },
      requestId: req.id
    });
});

// ─── GET /api/v1/analytics/revenue ────────────────────────────────────────────
export const getRevenueTrend = asyncHandler(async (req, res) => {
  const validation = analyticsQuerySchema.safeParse(req.query);
  if (!validation.success) {
    return res.status(422).json({ success: false, message: 'Validation failed', errors: validation.error.format(), requestId: req.id });
  }
  
  const { days, hotelId } = validation.data;
  const scope = getScopeFilter(req);
  const from = daysAgo(days);

    const where = {
      ...scope,
      status: { in: ['CONFIRMED', 'COMPLETED'] },
      createdAt: { gte: from },
      ...(hotelId ? { hotelId } : {}),
    };

    const bookings = await prisma.booking.findMany({
      where,
      select: { createdAt: true, totalAmount: true },
      orderBy: { createdAt: 'asc' },
    });

    // Aggregate by date
    const map = {};
    for (const b of bookings) {
      const date = b.createdAt.toISOString().split('T')[0];
      map[date] = (map[date] || 0) + b.totalAmount;
    }

    const series = Object.entries(map).map(([date, revenue]) => ({ date, revenue }));

    res.status(200).json({ success: true, data: series, requestId: req.id });
});

// ─── GET /api/v1/analytics/bookings ───────────────────────────────────────────
export const getBookingStats = asyncHandler(async (req, res) => {
  const validation = analyticsQuerySchema.safeParse(req.query);
  if (!validation.success) {
    return res.status(422).json({ success: false, message: 'Validation failed', errors: validation.error.format(), requestId: req.id });
  }

  const { days } = validation.data;
  const scope = getScopeFilter(req);
  const from = daysAgo(days);

    const where = { ...scope, createdAt: { gte: from } };

    const [byStatus, byPaymentType] = await Promise.all([
      prisma.booking.groupBy({ by: ['status'],      where, _count: { id: true } }),
      prisma.booking.groupBy({ by: ['paymentType'], where, _count: { id: true } }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        byStatus:      byStatus.map(r => ({ label: r.status, count: r._count.id })),
        byPaymentType: byPaymentType.map(r => ({ label: r.paymentType, count: r._count.id })),
      },
      requestId: req.id
    });
});

// ─── GET /api/v1/analytics/top-properties ─────────────────────────────────────
export const getTopProperties = asyncHandler(async (req, res) => {
    const validation = analyticsQuerySchema.safeParse(req.query);
    const { days } = validation.success ? validation.data : { days: 30 };
    
    const scope = getScopeFilter(req);
    const from = daysAgo(days);

    // Group by hotelId and sum totalAmount
    const results = await prisma.booking.groupBy({
      by:      ['hotelId'],
      where:   { 
        ...scope, 
        status: { in: ['CONFIRMED', 'COMPLETED'] },
        createdAt: { gte: from }
      },
      _sum:    { totalAmount: true },
      _count:  { id: true },
      orderBy: { _sum: { totalAmount: 'desc' } },
      take:    5,
    });

    const hotelIds = results.map(r => r.hotelId);
    const hotels   = await prisma.hotel.findMany({
      where:  { id: { in: hotelIds } },
      select: { id: true, name: true, city: true },
    });

    const data = results.map(r => {
      const h = hotels.find(h => h.id === r.hotelId);
      return {
        id:      r.hotelId,
        name:    h?.name || 'Unknown',
        city:    h?.city || 'N/A',
        revenue: r._sum.totalAmount,
        bookings: r._count.id,
      };
    });

    res.status(200).json({ success: true, data, requestId: req.id });
});

// ─── GET /api/v1/analytics/funnel ─────────────────────────────────────────────
export const getFunnelAnalytics = asyncHandler(async (req, res) => {
    const validation = analyticsQuerySchema.safeParse(req.query);
    const { days } = validation.success ? validation.data : { days: 30 };
    
    const scope = getScopeFilter(req); // Need to apply this effectively for funnel if required, for now mostly global Admin
    const from = daysAgo(days);

    // 1. Total Searches
    const searches = await prisma.analyticsEvent.count({
      where: { eventType: { in: ['SEARCH_STARTED', 'DESTINATION_SELECTED'] }, createdAt: { gte: from } }
    });

    // 2. Hotel Views
    const hotelViews = await prisma.analyticsEvent.count({
      where: { eventType: 'HOTEL_VIEWED', createdAt: { gte: from } }
    });

    // 3. Total Bookings
    const bookings = await prisma.booking.count({
      where: { status: { in: ['CONFIRMED', 'COMPLETED'] }, createdAt: { gte: from } }
    });

    // Assuming a 30% sampling rate for searches, we adjust the reported search volume back up
    const estimatedSearches = Math.round(searches / 0.3);

    const ctr = estimatedSearches > 0 ? ((hotelViews / estimatedSearches) * 100).toFixed(1) : 0;
    const conversionRate = hotelViews > 0 ? ((bookings / hotelViews) * 100).toFixed(1) : 0;

    res.status(200).json({
      success: true,
      data: {
        searches: estimatedSearches,
        hotelViews,
        bookings,
        conversionRate: parseFloat(conversionRate),
        ctr: parseFloat(ctr)
      },
      requestId: req.id
    });
});
