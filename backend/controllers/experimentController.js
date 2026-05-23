import { asyncHandler } from '../middleware/asyncHandler.js';
import experimentService from '../services/experimentService.js';
import prisma from '../config/db.js';

export const getExperiments = asyncHandler(async (req, res) => {
  const userId = req.user?.id || null;
  const sessionId = req.headers['x-session-id'] || 'anonymous';

  const variants = await experimentService.getUserVariants(userId, sessionId);

  res.status(200).json({
    success: true,
    data: variants
  });
});

const MIN_USERS = 500;
const MIN_BOOKINGS = 50;
const MIN_UPLIFT = 0.05;

export const getExperimentResults = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const experiment = await prisma.experiment.findUnique({ where: { name: id } }); // Assuming ID passed is the name

  if (!experiment) {
    return res.status(404).json({ success: false, message: 'Experiment not found' });
  }

  // Fetch all analytics events that have this experiment tracked
  // Note: For PostgreSQL, we can use JSON queries, but for simplicity/universality, we fetch and group in memory if scale permits,
  // or use raw queries. Since we added experimentId and variantId to schema, we can rely on that if populated!
  // Wait, the client is sending `experiments: { "badge_urgency": "variantA" }` so it's in the JSON field. 
  // We can query using Prisma's JSON filtering if we are on Postgres.

  const rawEvents = await prisma.analyticsEvent.findMany({
    where: {
      experiments: {
        path: [experiment.name],
        not: null
      }
    },
    select: {
      sessionId: true,
      eventType: true,
      experiments: true,
      metadata: true
    }
  });

  const variantMetrics = {};
  
  // Initialize metrics
  for (const variant of experiment.variants) {
    variantMetrics[variant.name] = {
      users: new Set(),
      searches: 0,
      views: 0,
      bookings: 0,
      revenue: 0
    };
  }
  // Make sure control is initialized even if not in variants array explicitly
  if (!variantMetrics['control']) {
    variantMetrics['control'] = { users: new Set(), searches: 0, views: 0, bookings: 0, revenue: 0 };
  }

  for (const event of rawEvents) {
    const variantAssigned = event.experiments[experiment.name];
    if (!variantMetrics[variantAssigned]) continue;

    variantMetrics[variantAssigned].users.add(event.sessionId);

    if (event.eventType === 'SEARCH_STARTED' || event.eventType === 'DESTINATION_SELECTED') {
      variantMetrics[variantAssigned].searches++;
    } else if (event.eventType === 'HOTEL_VIEWED') {
      variantMetrics[variantAssigned].views++;
    } else if (event.eventType === 'BOOKING_COMPLETED') {
      variantMetrics[variantAssigned].bookings++;
      if (event.metadata && event.metadata.totalAmount) {
        variantMetrics[variantAssigned].revenue += Number(event.metadata.totalAmount);
      }
    }
  }

  const control = variantMetrics['control'];
  const controlUsers = control.users.size;
  // Apply 30% sampling rate normalization for searches
  const controlSearches = Math.round(control.searches / 0.3);
  const controlCtr = controlSearches > 0 ? (control.views / controlSearches) : 0;
  const controlConv = control.views > 0 ? (control.bookings / control.views) : 0;
  const controlRpu = controlUsers > 0 ? (control.revenue / controlUsers) : 0;

  const results = [];
  let status = 'INCONCLUSIVE';

  for (const [vName, metrics] of Object.entries(variantMetrics)) {
    const users = metrics.users.size;
    const searches = Math.round(metrics.searches / 0.3);
    const ctr = searches > 0 ? (metrics.views / searches) : 0;
    const conv = metrics.views > 0 ? (metrics.bookings / metrics.views) : 0;

    const rpu = users > 0 ? (metrics.revenue / users) : 0;

    let absoluteUplift = 0;
    let relativeUplift = 0;

    if (vName !== 'control' && controlRpu > 0) {
      absoluteUplift = rpu - controlRpu;
      relativeUplift = absoluteUplift / controlRpu;

      // Decision Logic
      if (Math.abs(absoluteUplift) >= 0.005) { // 0.5% noise guard
        if (users >= MIN_USERS && metrics.bookings >= MIN_BOOKINGS) {
          if (relativeUplift >= MIN_UPLIFT && rpu > controlRpu) {
            status = 'WINNER';
          } else if (relativeUplift <= -MIN_UPLIFT) {
            status = 'LOSER';
          }
        }
      }
    }

    let confidence = 'LOW';
    if (users > 1000 && metrics.bookings > 100) confidence = 'HIGH';
    else if (users > 500) confidence = 'MEDIUM';

    results.push({
      variant: vName,
      users,
      views: metrics.views,
      bookings: metrics.bookings,
      revenue: metrics.revenue,
      rpu: Math.round(rpu),
      ctr: (ctr * 100).toFixed(1) + '%',
      conversion: (conv * 100).toFixed(1) + '%',
      absoluteUplift: vName === 'control' ? '-' : (absoluteUplift * 100).toFixed(1) + '%',
      relativeUplift: vName === 'control' ? '-' : (relativeUplift * 100).toFixed(1) + '%',
      confidence
    });
  }

  res.status(200).json({
    success: true,
    data: {
      experiment: experiment.name,
      status: experiment.status === 'CONCLUDED' ? 'CONCLUDED' : status,
      results
    }
  });
});

export const getOptimizationHealth = asyncHandler(async (req, res) => {
  const insights = await prisma.experimentInsight.findMany({
    where: { confidence: 'HIGH' },
    orderBy: { createdAt: 'desc' }
  });

  const config = await prisma.systemConfig.findUnique({ where: { key: 'manualOverrides' } });
  const manualOverrides = config?.value || {};

  const baseWeights = { affinity: 0.30, rating: 0.20, popularity: 0.25, price: 0.15, availability: 0.10 };
  
  const insightBoost = { affinity: 0, rating: 0, popularity: 0, price: 0, availability: 0 };
  const now = new Date();
  let activeInsightsCount = 0;
  let expiredInsightsCount = 0;

  for (const insight of insights) {
    const daysOld = (now - new Date(insight.createdAt)) / (1000 * 60 * 60 * 24);
    if (daysOld > 30) {
      expiredInsightsCount++;
      continue;
    }
    
    const decayFactor = Math.max(0, 1 - (daysOld / 7));
    if (decayFactor > 0) {
      activeInsightsCount++;
      if (insight.category === 'UI' || insight.category === 'RANKING') {
        const repetitionFactor = Math.min(insightBoost.popularity * 2, 0.5);
        insightBoost.popularity += (insight.relativeUplift * 0.1) * decayFactor * (1 - repetitionFactor);
      } else if (insight.category === 'PRICING') {
        const repetitionFactor = Math.min(insightBoost.price * 2, 0.5);
        insightBoost.price += (insight.relativeUplift * 0.1) * decayFactor * (1 - repetitionFactor);
      }
    }
  }

  const clamp = val => Math.min(Math.max(0, val), 0.15);
  const safeBoost = {
    affinity: clamp(insightBoost.affinity),
    rating: clamp(insightBoost.rating),
    popularity: clamp(insightBoost.popularity),
    price: clamp(insightBoost.price),
    availability: clamp(insightBoost.availability)
  };

  const sum = Object.values(baseWeights).reduce((a, b) => a + b, 0) + Object.values(safeBoost).reduce((a, b) => a + b, 0);
  let finalWeights = {
    affinity: (baseWeights.affinity + safeBoost.affinity) / sum,
    rating: (baseWeights.rating + safeBoost.rating) / sum,
    popularity: (baseWeights.popularity + safeBoost.popularity) / sum,
    price: (baseWeights.price + safeBoost.price) / sum,
    availability: (baseWeights.availability + safeBoost.availability) / sum,
  };

  const clampOverride = val => Math.min(Math.max(val, -0.10), 0.10);
  const expiry = manualOverrides.overrideExpiry ? new Date(manualOverrides.overrideExpiry).getTime() : 0;
  if (!expiry || now.getTime() < expiry) {
    if (manualOverrides.affinity) finalWeights.affinity += clampOverride(manualOverrides.affinity);
    if (manualOverrides.rating) finalWeights.rating += clampOverride(manualOverrides.rating);
    if (manualOverrides.popularity) finalWeights.popularity += clampOverride(manualOverrides.popularity);
    if (manualOverrides.price) finalWeights.price += clampOverride(manualOverrides.price);
    if (manualOverrides.availability) finalWeights.availability += clampOverride(manualOverrides.availability);
  }

  const overrideSum = Object.values(finalWeights).reduce((a, b) => a + b, 0);
  finalWeights = {
    affinity: finalWeights.affinity / overrideSum,
    rating: finalWeights.rating / overrideSum,
    popularity: finalWeights.popularity / overrideSum,
    price: finalWeights.price / overrideSum,
    availability: finalWeights.availability / overrideSum
  };

  res.status(200).json({
    success: true,
    data: {
      health: {
        activeInsights: activeInsightsCount,
        expiredInsights: expiredInsightsCount,
        avgBoost: (Object.values(safeBoost).reduce((a, b) => a + b, 0) / 5).toFixed(3)
      },
      weights: {
        base: baseWeights,
        boosts: safeBoost,
        overrides: manualOverrides,
        final: finalWeights
      }
    }
  });
});
