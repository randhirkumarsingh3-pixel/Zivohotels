/**
 * Manual trigger for the pricing worker — generates DemandSignal entries from existing AnalyticsEvents
 * Run with: node scripts/runPricingWorkerOnce.js
 */
import prisma from '../config/db.js';

const MAX_EXPECTED_SCORE = 50.0;

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

async function run() {
  console.log('⚡ Running pricing worker manually...\n');

  const events = await prisma.analyticsEvent.findMany({
    where: { hotelId: { not: null } }
  });

  console.log(`Found ${events.length} analytics events to aggregate.`);
  if (events.length === 0) {
    console.log('No events yet. Generate some by browsing the app, then re-run this script.');
    return;
  }

  const activityMap = {};
  for (const event of events) {
    const dates = getTargetDates(event.metadata);
    const roomTypeId = event.metadata?.roomTypeId || '_all';
    for (const d of dates) {
      const key = `${event.hotelId}_${roomTypeId}_${d}`;
      if (!activityMap[key]) {
        activityMap[key] = { hotelId: event.hotelId, roomTypeId, date: new Date(d), searches: 0, views: 0, bookings: 0 };
      }
      if (event.eventType === 'SEARCH_STARTED') activityMap[key].searches += 1;
      if (event.eventType === 'HOTEL_VIEWED') activityMap[key].views += 1;
      if (event.eventType === 'BOOKING_COMPLETED') activityMap[key].bookings += 1;
    }
  }

  let written = 0;
  for (const key in activityMap) {
    const a = activityMap[key];
    const existing = await prisma.demandSignal.findUnique({
      where: { hotelId_roomTypeId_date: { hotelId: a.hotelId, roomTypeId: a.roomTypeId, date: a.date } }
    });
    const currentScore = existing?.demandScore ?? 0.5;
    const rawScore = (a.searches * 0.2) + (a.views * 0.3) + (a.bookings * 0.5);
    const normalizedTarget = Math.min(rawScore / MAX_EXPECTED_SCORE, 1.0);
    const smoothed = (normalizedTarget * 0.6) + (currentScore * 0.4);

    await prisma.demandSignal.upsert({
      where: { hotelId_roomTypeId_date: { hotelId: a.hotelId, roomTypeId: a.roomTypeId, date: a.date } },
      update: { searches: a.searches, views: a.views, bookings: a.bookings, demandScore: smoothed },
      create: { hotelId: a.hotelId, roomTypeId: a.roomTypeId, date: a.date, searches: a.searches, views: a.views, bookings: a.bookings, demandScore: smoothed }
    });
    written++;
  }

  console.log(`\n✅ Wrote ${written} DemandSignal records.`);
  console.log('\nRun validation now: node scripts/validatePhase7.js\n');
}

run()
  .catch(err => { console.error('Error:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
