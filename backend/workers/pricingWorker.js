import { queueService } from '../services/queueService.js';
import prisma from '../config/db.js';
import os from 'os';

const workerId = `pricing-worker-${os.hostname()}-${process.pid}`;
let isRunning = true;

const shutdown = async () => {
  console.log(`\n[${workerId}] Received termination signal. Shutting down gracefully...`);
  isRunning = false;
  await queueService.unlockJobsForWorker(workerId);
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const MAX_EXPECTED_SCORE = 50.0;
const ZSCORE_THRESHOLD = 3.0;  // Reject spikes beyond 3 standard deviations

/**
 * Parses check-in/out from metadata and returns an array of date strings (YYYY-MM-DD)
 */
function getTargetDates(metadata) {
  if (!metadata?.checkInDate || !metadata?.checkOutDate) return [];
  const start = new Date(metadata.checkInDate);
  const end = new Date(metadata.checkOutDate);
  if (isNaN(start) || isNaN(end)) return [];

  const dates = [];
  let current = new Date(start);
  while (current < end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

/**
 * Compute mean and std of an array of numbers.
 */
function stats(values) {
  if (values.length === 0) return { mean: 0.5, std: 0 };
  const mean = values.reduce((a, v) => a + v, 0) / values.length;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance) };
}

/**
 * Z-score outlier rejection.
 * If the new score is > ZSCORE_THRESHOLD standard deviations from recent history, reject it
 * and return the previous score unchanged.
 */
function rejectOutliers(newScore, historicalScores, previousScore) {
  if (historicalScores.length < 10) return newScore; // Minimum sample size guard (prevents noise on low-volume properties)
  const { mean, std } = stats(historicalScores);
  if (std === 0) return newScore; // No variance — can't compute z-score
  const z = Math.abs((newScore - mean) / std);
  if (z > ZSCORE_THRESHOLD) {
    console.warn(`[PricingWorker] Outlier detected (z=${z.toFixed(2)}). Reverting to previous score.`);
    return previousScore;
  }
  return newScore;
}

async function aggregateDemandSignals() {
  const runId = Date.now().toString();
  console.log(`[PricingWorker] Run ${runId}: Starting aggregation...`);
  const now = new Date();

  // SAFE_MODE Check — skip aggregation entirely to prevent signal drift while frozen
  const appState = await prisma.appState.findUnique({ where: { id: 'singleton' } });
  if (appState?.systemMode === 'SAFE_MODE') {
    console.warn('[PricingWorker] SAFE_MODE active — skipping demand signal aggregation.');
    return;
  }

  // Fetch last run timestamp
  const configRecord = await prisma.systemConfig.findUnique({ where: { key: 'pricingLastRun' } });
  const lastRunTime = configRecord?.value?.lastRun
    ? new Date(configRecord.value.lastRun)
    : new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const events = await prisma.analyticsEvent.findMany({
    where: {
      createdAt: { gt: lastRunTime },
      hotelId: { not: null }
    }
  });

  if (events.length === 0) {
    console.log('[PricingWorker] No new events since last run.');
    await prisma.systemConfig.upsert({
      where: { key: 'pricingLastRun' },
      update: { value: { lastRun: now.toISOString() } },
      create: { key: 'pricingLastRun', value: { lastRun: now.toISOString() } }
    });
    return;
  }

  // Group by hotelId + roomTypeId + date
  const activityMap = {};

  for (const event of events) {
    const dates = getTargetDates(event.metadata);
    const roomTypeId = event.metadata?.roomTypeId || '_all';
    const city = event.city || '_global';

    for (const d of dates) {
      // Hotel + RoomType level
      const key = `${event.hotelId}_${roomTypeId}_${d}`;
      if (!activityMap[key]) {
        activityMap[key] = { hotelId: event.hotelId, roomTypeId, date: new Date(d), city, searches: 0, views: 0, bookings: 0 };
      }
      if (event.eventType === 'SEARCH_STARTED') activityMap[key].searches += 1;
      if (event.eventType === 'HOTEL_VIEWED') activityMap[key].views += 1;
      if (event.eventType === 'BOOKING_COMPLETED') activityMap[key].bookings += 1;

      // City-level aggregate (for sparse roomType fallback)
      const cityKey = `_city_${city}_${d}`;
      if (!activityMap[cityKey]) {
        activityMap[cityKey] = { hotelId: null, roomTypeId: '_city', date: new Date(d), city, searches: 0, views: 0, bookings: 0, _cityLevel: true };
      }
      if (event.eventType === 'SEARCH_STARTED') activityMap[cityKey].searches += 1;
      if (event.eventType === 'HOTEL_VIEWED') activityMap[cityKey].views += 1;
      if (event.eventType === 'BOOKING_COMPLETED') activityMap[cityKey].bookings += 1;
    }
  }

  // Fetch recent historical scores for z-score computation (last 30 signals per hotel)
  const recentSignals = await prisma.demandSignal.findMany({
    where: { updatedAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } },
    select: { hotelId: true, roomTypeId: true, demandScore: true }
  });

  // Build a map: hotelId -> [recent demandScores] for z-score
  const recentScoreMap = {};
  for (const s of recentSignals) {
    const k = `${s.hotelId}_${s.roomTypeId}`;
    if (!recentScoreMap[k]) recentScoreMap[k] = [];
    recentScoreMap[k].push(s.demandScore);
  }

  // Upsert DemandSignals with outlier rejection
  let written = 0;
  for (const key in activityMap) {
    const activity = activityMap[key];

    // Skip city-level aggregates that have no hotelId for now (stored differently)
    if (activity._cityLevel) {
      // For city-level, we use a special "hotelId" format: _city_<city>
      const cityHotelId = `_city_${activity.city}`;
      const existing = await prisma.demandSignal.findUnique({
        where: { hotelId_roomTypeId_date: { hotelId: cityHotelId, roomTypeId: '_city', date: activity.date } }
      });

      const currentScore = existing?.demandScore ?? 0.5;
      const rawScore = (activity.searches * 0.2) + (activity.views * 0.3) + (activity.bookings * 0.5);
      const normalizedTarget = Math.min(rawScore / MAX_EXPECTED_SCORE, 1.0);
      const smoothed = (normalizedTarget * 0.6) + (currentScore * 0.4);

      await prisma.demandSignal.upsert({
        where: { hotelId_roomTypeId_date: { hotelId: cityHotelId, roomTypeId: '_city', date: activity.date } },
        update: { searches: activity.searches, views: activity.views, bookings: activity.bookings, demandScore: smoothed },
        create: { hotelId: cityHotelId, roomTypeId: '_city', date: activity.date, searches: activity.searches, views: activity.views, bookings: activity.bookings, demandScore: smoothed }
      });
      continue;
    }

    const existing = await prisma.demandSignal.findUnique({
      where: { hotelId_roomTypeId_date: { hotelId: activity.hotelId, roomTypeId: activity.roomTypeId, date: activity.date } }
    });

    const currentScore = existing?.demandScore ?? 0.5;
    const totalSearches = activity.searches + (existing?.searches ?? 0);
    const totalViews = activity.views + (existing?.views ?? 0);
    const totalBookings = activity.bookings + (existing?.bookings ?? 0);

    // Weighted demand score (bookings = primary signal)
    const rawScore = (totalSearches * 0.2) + (totalViews * 0.3) + (totalBookings * 0.5);
    const normalizedTarget = Math.min(rawScore / MAX_EXPECTED_SCORE, 1.0);

    // Exponential smoothing
    let smoothed = (normalizedTarget * 0.6) + (currentScore * 0.4);

    // Z-score outlier rejection
    const histKey = `${activity.hotelId}_${activity.roomTypeId}`;
    const historicalScores = recentScoreMap[histKey] || [];
    smoothed = rejectOutliers(smoothed, historicalScores, currentScore);

    await prisma.demandSignal.upsert({
      where: { hotelId_roomTypeId_date: { hotelId: activity.hotelId, roomTypeId: activity.roomTypeId, date: activity.date } },
      update: { searches: totalSearches, views: totalViews, bookings: totalBookings, demandScore: smoothed },
      create: { hotelId: activity.hotelId, roomTypeId: activity.roomTypeId, date: activity.date, searches: totalSearches, views: totalViews, bookings: totalBookings, demandScore: smoothed }
    });
    written++;
  }

  await prisma.systemConfig.upsert({
    where: { key: 'pricingLastRun' },
    update: { value: { lastRun: now.toISOString() } },
    create: { key: 'pricingLastRun', value: { lastRun: now.toISOString() } }
  });

  console.log(`[PricingWorker] Run ${runId}: Aggregated ${written} demand signals.`);
}

export const startPricingWorker = async () => {
  console.log(`[${workerId}] Started polling for 'pricing' queue...`);
  
  // Seed the first job if the queue is entirely empty (optional, usually done by a seeder/init script)
  // For safety, we'll let it just poll.
  
  while (isRunning) {
    try {
      const job = await queueService.fetchAndLock('pricing', workerId);
      
      if (job) {
        console.log(`[${workerId}] Processing job: ${job.id}`);
        await aggregateDemandSignals();
        
        // Enqueue the next run for 15 minutes from now
        await queueService.enqueue('pricing', 'AGGREGATE_DEMAND', {}, { runAt: new Date(Date.now() + 15 * 60 * 1000) });
        
        // Mark complete
        await queueService.complete(job.id);
      } else {
        await new Promise(res => setTimeout(res, 10000));
      }
    } catch (err) {
      console.error(`[${workerId}] Polling error:`, err.message);
      await new Promise(res => setTimeout(res, 5000));
    }
  }
};

if (process.argv[1] && process.argv[1].endsWith('pricingWorker.js')) {
  startPricingWorker();
}
