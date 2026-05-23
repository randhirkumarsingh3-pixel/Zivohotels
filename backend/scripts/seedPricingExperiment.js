/**
 * Phase 7 Seed Script
 * 
 * Seeds:
 *   1. dynamic_pricing_enabled A/B experiment (10% traffic, control vs variantA)
 *   2. HolidayCalendar entries for major Indian holidays and events (2025-2026)
 * 
 * Run with:
 *   node scripts/seedPricingExperiment.js
 */
import prisma from '../config/db.js';

async function seed() {
  console.log('🌱 Seeding Phase 7 data...\n');

  // ─── 1. Create the dynamic_pricing_enabled experiment ────────────────────────
  const existingExp = await prisma.experiment.findUnique({
    where: { name: 'dynamic_pricing_enabled' }
  });

  if (existingExp) {
    // Update guardrail metadata on existing experiment
    await prisma.experiment.update({
      where: { name: 'dynamic_pricing_enabled' },
      data: {
        stratification: {
          dimensions: ['city', 'device', 'dayType'],
          note: 'Ensures balanced buckets across city, mobile/desktop, weekday/weekend'
        },
        guardrailMetrics: {
          maxConversionDrop: 0.08,       // 8% max — experiment stops if exceeded
          maxCancellationRise: 0.05,     // 5% max cancellation rate rise
          minSearchToDetailCTR: 0.10,    // min 10% search → detail CTR
          minDetailToBookingStart: 0.05, // min 5% detail → booking start
          primaryMetric: 'RPU',
          secondaryMetrics: ['RevPAR', 'AvgBookingValue', 'ConversionRate']
        }
      }
    });
    console.log('✅ Updated existing experiment with stratification + guardrails.');
  } else {
    const experiment = await prisma.experiment.create({
      data: {
        name: 'dynamic_pricing_enabled',
        status: 'ACTIVE',
        category: 'PRICING',
        priority: 'HIGH',
        traffic: 10,
        variants: [
          { name: 'control', weight: 50 },
          { name: 'variantA', weight: 50 }
        ],
        owner: 'pricing-team',
        startAt: new Date(),
        stratification: {
          dimensions: ['city', 'device', 'dayType'],
          note: 'Ensures balanced buckets across city, mobile/desktop, weekday/weekend'
        },
        guardrailMetrics: {
          maxConversionDrop: 0.08,
          maxCancellationRise: 0.05,
          minSearchToDetailCTR: 0.10,
          minDetailToBookingStart: 0.05,
          primaryMetric: 'RPU',
          secondaryMetrics: ['RevPAR', 'AvgBookingValue', 'ConversionRate']
        }
      }
    });
    console.log(`✅ Created experiment: ${experiment.name} (id: ${experiment.id})`);
    console.log(`   Traffic: ${experiment.traffic}% | Variants: control (50%) vs variantA (50%)\n`);
  }

  // ─── 2. Seed Indian Holiday Calendar ─────────────────────────────────────────
  const holidays = [
    // National Holidays
    { date: '2025-08-15', city: null, name: 'Independence Day', multiplier: 0.20 },
    { date: '2025-10-02', city: null, name: 'Gandhi Jayanti', multiplier: 0.10 },
    { date: '2025-11-01', city: null, name: 'Diwali Eve', multiplier: 0.25 },
    { date: '2025-11-02', city: null, name: 'Diwali', multiplier: 0.30 },
    { date: '2025-11-03', city: null, name: 'Diwali (Day 2)', multiplier: 0.25 },
    { date: '2025-12-25', city: null, name: 'Christmas', multiplier: 0.20 },
    { date: '2025-12-31', city: null, name: 'New Year Eve', multiplier: 0.35 },
    { date: '2026-01-01', city: null, name: 'New Year Day', multiplier: 0.30 },
    { date: '2026-01-26', city: null, name: 'Republic Day', multiplier: 0.15 },
    { date: '2026-03-07', city: null, name: 'Holi Eve', multiplier: 0.15 },
    { date: '2026-03-08', city: null, name: 'Holi', multiplier: 0.20 },

    // Long Weekends (national)
    { date: '2025-08-14', city: null, name: 'Independence Day Long Weekend', multiplier: 0.15 },
    { date: '2025-10-03', city: null, name: 'Gandhi Jayanti Long Weekend', multiplier: 0.10 },

    // City-specific events
    { date: '2025-12-27', city: 'Goa', name: 'Goa Year-End Peak', multiplier: 0.40 },
    { date: '2025-12-28', city: 'Goa', name: 'Goa Year-End Peak', multiplier: 0.40 },
    { date: '2025-12-29', city: 'Goa', name: 'Goa Year-End Peak', multiplier: 0.40 },
    { date: '2025-12-30', city: 'Goa', name: 'Goa Year-End Peak', multiplier: 0.35 },
    { date: '2026-02-14', city: 'Mumbai', name: "Valentine's Day", multiplier: 0.20 },
    { date: '2026-02-14', city: 'Delhi', name: "Valentine's Day", multiplier: 0.18 },
    { date: '2026-01-15', city: 'Chennai', name: 'Pongal', multiplier: 0.15 },
    { date: '2025-09-19', city: 'Mumbai', name: 'Ganesh Chaturthi Peak', multiplier: 0.20 },
  ];

  let created = 0;
  let skipped = 0;

  for (const holiday of holidays) {
    const existing = await prisma.holidayCalendar.findFirst({
      where: {
        date: new Date(holiday.date),
        city: holiday.city || null,
        name: holiday.name
      }
    });

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.holidayCalendar.create({
      data: {
        date: new Date(holiday.date),
        city: holiday.city,
        name: holiday.name,
        multiplier: holiday.multiplier,
        isActive: true
      }
    });
    created++;
  }

  console.log(`✅ Holiday Calendar: ${created} entries created, ${skipped} already existed.\n`);
  console.log('🚀 Seed complete. System is ready for controlled rollout.');
}

seed()
  .catch(err => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
