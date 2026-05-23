import { eventBus, EVENTS } from '../services/eventBus.js';

async function testEventBroadcast() {
  console.log('--- Testing Live Event Broadcast ---');
  
  const payload = {
    settlementId: 'test-settlement-123',
    bookingId: 'test-booking-456',
    hotelId: 'test-hotel-789',
    netPayable: 15000,
    bookingRef: 'ZIVO-TEST-99'
  };

  await eventBus.emitEvent(EVENTS.SETTLEMENT_CREATED, payload, { 
    traceId: 'test-trace-socket',
    source: 'TEST_SCRIPT'
  });

  console.log('✅ Event emitted to EventBus.');
  console.log('Note: If the server is running, the SocketService will broadcast this to hotel_test-hotel-789');
}

testEventBroadcast();
