/**
 * Phase 7.1 Pre-Launch Validation Script
 * 
 * Validates:
 *   1. DemandSignal rows are correctly normalized (0-1)
 *   2. Booking signal outweighs search/view signals
 *   3. PricingState is correctly written per hotel+roomType
 *   4. Holiday Calendar is populated with expected entries
 *   5. dynamic_pricing_enabled experiment exists and is ACTIVE
 * 
 * Run with:
 *   node scripts/validatePhase7.js
 */
import prisma from '../config/db.js';

async function validate() {
  let passed = 0;
  let failed = 0;

  function pass(msg) {
    console.log(`  ✅ PASS: ${msg}`);
    passed++;
  }

  function fail(msg) {
    console.error(`  ❌ FAIL: ${msg}`);
    failed++;
  }

  console.log('\n🔍 Phase 7.1 Validation Report\n' + '─'.repeat(50));

  // ─── 1. DemandSignal Rows ─────────────────────────────────────────────────────
  console.log('\n[1] DemandSignal Checks');
  const signals = await prisma.demandSignal.findMany({ take: 20, orderBy: { updatedAt: 'desc' } });

  if (signals.length === 0) {
    fail('No DemandSignal rows found — run the pricingWorker at least once first.');
  } else {
    pass(`Found ${signals.length} DemandSignal rows.`);

    const outOfRange = signals.filter(s => s.demandScore < 0 || s.demandScore > 1);
    if (outOfRange.length > 0) {
      fail(`${outOfRange.length} signals have demandScore outside [0, 1].`);
    } else {
      pass('All demandScore values are within [0, 1].');
    }

    const nullRoomType = signals.filter(s => !s.roomTypeId);
    if (nullRoomType.length > 0) {
      fail(`${nullRoomType.length} signals have null roomTypeId.`);
    } else {
      pass('No null roomTypeId leaks detected.');
    }

    // Verify bookings weight: for any signal with bookings > 0, score should be meaningfully high
    const withBookings = signals.filter(s => s.bookings > 0);
    const withSearchesOnly = signals.filter(s => s.bookings === 0 && s.searches > 5);

    if (withBookings.length > 0 && withSearchesOnly.length > 0) {
      const avgBookingScore = withBookings.reduce((a, s) => a + s.demandScore, 0) / withBookings.length;
      const avgSearchScore = withSearchesOnly.reduce((a, s) => a + s.demandScore, 0) / withSearchesOnly.length;
      if (avgBookingScore > avgSearchScore) {
        pass(`Booking signals produce higher scores (${avgBookingScore.toFixed(3)}) than search-only signals (${avgSearchScore.toFixed(3)}).`);
      } else {
        fail(`Booking signals are NOT producing higher scores than search-only signals. Check weights.`);
      }
    } else {
      console.log('  ⚠️  SKIP: Not enough data to compare booking vs search score bias.');
    }
  }

  // ─── 2. PricingState Rows ─────────────────────────────────────────────────────
  console.log('\n[2] PricingState Checks');
  const pricingStates = await prisma.pricingState.findMany({ take: 10 });

  if (pricingStates.length === 0) {
    console.log('  ⚠️  SKIP: No PricingState rows yet — make a booking with dynamic pricing to populate.');
  } else {
    pass(`Found ${pricingStates.length} PricingState entries.`);
    const invalid = pricingStates.filter(ps => !ps.lastAppliedPrice || ps.lastAppliedPrice <= 0);
    if (invalid.length > 0) {
      fail(`${invalid.length} PricingState rows have invalid lastAppliedPrice.`);
    } else {
      pass('All PricingState.lastAppliedPrice values are positive.');
    }
  }

  // ─── 3. Holiday Calendar ──────────────────────────────────────────────────────
  console.log('\n[3] Holiday Calendar Checks');
  const holidays = await prisma.holidayCalendar.findMany({ where: { isActive: true } });

  if (holidays.length < 5) {
    fail(`Only ${holidays.length} active holidays found. Run the seed script: node scripts/seedPricingExperiment.js`);
  } else {
    pass(`${holidays.length} active HolidayCalendar entries found.`);
  }

  const overCapped = holidays.filter(h => h.multiplier > 0.5);
  if (overCapped.length > 0) {
    fail(`${overCapped.length} holidays have multiplier > 0.5 (50%+) — verify these are intentional.`);
  } else {
    pass('All holiday multipliers are within reasonable bounds (≤ 50%).');
  }

  // ─── 4. A/B Experiment ────────────────────────────────────────────────────────
  console.log('\n[4] A/B Experiment Check');
  const experiment = await prisma.experiment.findUnique({ where: { name: 'dynamic_pricing_enabled' } });

  if (!experiment) {
    fail('Experiment "dynamic_pricing_enabled" not found. Run: node scripts/seedPricingExperiment.js');
  } else if (experiment.status !== 'ACTIVE') {
    fail(`Experiment exists but status is "${experiment.status}", expected "ACTIVE".`);
  } else {
    pass(`Experiment found: status=${experiment.status}, traffic=${experiment.traffic}%.`);
    const variants = Array.isArray(experiment.variants) ? experiment.variants : [];
    const totalWeight = variants.reduce((a, v) => a + v.weight, 0);
    if (totalWeight !== 100) {
      fail(`Variant weights sum to ${totalWeight}, expected 100.`);
    } else {
      pass(`Variant weights sum to 100 (${variants.map(v => `${v.name}:${v.weight}%`).join(', ')}).`);
    }
  }

  // ─── 5. AppState Singleton ────────────────────────────────────────────────────
  console.log('\n[5] System State Check');
  const appState = await prisma.appState.findUnique({ where: { id: 'singleton' } });

  if (!appState) {
    console.log('  ⚠️  SKIP: AppState singleton not yet created (will be created on first worker run).');
  } else {
    if (appState.systemMode === 'SAFE_MODE') {
      fail('System is currently in SAFE_MODE — dynamic pricing is globally disabled.');
    } else {
      pass(`System is in ${appState.systemMode} mode — dynamic pricing can be applied.`);
    }
  }

  // ─── Summary ──────────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(50));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    console.error('🚫 Validation FAILED — resolve the issues above before go-live.\n');
    process.exit(1);
  } else {
    console.log('🚀 Validation PASSED — system is ready for controlled rollout.\n');
  }
}

validate()
  .catch(err => {
    console.error('❌ Validation script error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
