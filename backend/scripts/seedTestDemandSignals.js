/**
 * Seed realistic test DemandSignal rows from existing hotels + room types.
 * Run: node scripts/seedTestDemandSignals.js
 */
import prisma from '../config/db.js';

async function seed() {
  const hotels = await prisma.hotel.findMany({
    take: 5,
    include: { roomTypes: { take: 2 } }
  });

  if (hotels.length === 0) {
    console.log('⚠️  No hotels found. Seed hotels first.');
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let count = 0;

  for (const hotel of hotels) {
    if (hotel.roomTypes.length === 0) continue;

    for (const rt of hotel.roomTypes) {
      for (let i = 0; i < 14; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + i);

        // Simulate realistic demand: weekends naturally spike
        const dayOfWeek = d.getDay();
        const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;

        const searches = isWeekend
          ? 25 + Math.floor(Math.random() * 15)
          : 8  + Math.floor(Math.random() * 12);
        const views = isWeekend
          ? 12 + Math.floor(Math.random() * 8)
          : 4  + Math.floor(Math.random() * 6);
        const bookings = isWeekend
          ? 3  + Math.floor(Math.random() * 4)
          : 1  + Math.floor(Math.random() * 2);

        // Weighted score (mirrors worker logic)
        const rawScore = (searches * 0.2) + (views * 0.3) + (bookings * 0.5);
        const normalizedTarget = Math.min(rawScore / 50.0, 1.0);
        // Smooth against baseline of 0.5
        const demandScore = parseFloat(((normalizedTarget * 0.6) + (0.5 * 0.4)).toFixed(4));

        await prisma.demandSignal.upsert({
          where: {
            hotelId_roomTypeId_date: {
              hotelId: hotel.id,
              roomTypeId: rt.id,
              date: d
            }
          },
          update: { searches, views, bookings, demandScore },
          create: {
            hotelId: hotel.id,
            roomTypeId: rt.id,
            date: d,
            searches,
            views,
            bookings,
            demandScore
          }
        });
        count++;
      }
    }
  }

  console.log(`✅ Seeded ${count} test DemandSignal rows across ${hotels.length} hotels.`);
  console.log('\nRun validation now: node scripts/validatePhase7.js\n');
}

seed()
  .catch(err => { console.error('❌ Error:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
