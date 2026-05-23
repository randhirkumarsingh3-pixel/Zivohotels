import { eventBus, EVENTS } from '../services/eventBus.js';
import orchestrationService from '../services/orchestrationService.js';

orchestrationService.init();

async function testAutonomousEscalation() {
  console.log('--- Testing Autonomous Escalation ---');
  
  const hotelId = 'test-hotel-999';

  // Emit 6 Payout Failures (Threshold is 5)
  for (let i = 0; i < 6; i++) {
    console.log(`[Test] Emitting Payout Failure ${i+1}...`);
    await eventBus.emitEvent(EVENTS.PAYOUT_FAILED, {
      payoutId: `test-payout-${i}`,
      hotelId,
      amount: 5000,
      reason: 'Network Timeout'
    }, { traceId: 'test-trace-autonomous' });
  }

  console.log('✅ 6 events emitted.');
  console.log('Check logs to see if OrchestrationService triggered SAFE_MODE.');
}

testAutonomousEscalation();
