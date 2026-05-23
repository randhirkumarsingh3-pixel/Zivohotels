import prisma from '../config/db.js';
import ledgerService from '../services/finance/ledgerService.js';
import settlementService from '../services/finance/settlementService.js';
import paymentService from '../services/finance/paymentService.js';

async function testFinanceFlow() {
  console.log('--- Testing Phase 8.5 Financial Flow ---');

  const hotelId = 'test-hotel-id'; // Use a real ID from your DB if possible
  const roomTypeId = 'test-room-id';
  const bookingId = 'test-booking-id-' + Date.now();

  // 1. Payment Order
  const order = await paymentService.createOrder(bookingId, 5000);
  console.log('✅ Payment Order Created:', order.orderId);

  // 2. Payment Verification
  const tx = await paymentService.verifyPayment(order.transactionId, 'RP_123456');
  console.log('✅ Payment Verified:', tx.status);

  // 3. Settlement & Ledger (Simulating Booking Flow)
  await prisma.$transaction(async (prismaTx) => {
    const settlement = await settlementService.createSettlement({
      bookingId,
      hotelId,
      grossAmount: 5000,
      commissionPercent: 15,
      taxPercent: 12
    }, prismaTx);
    console.log('✅ Settlement Created:', settlement.id);

    await ledgerService.record([
      { referenceId: bookingId, account: 'USER', type: 'DEBIT', amount: 5000, description: 'Test Payment' },
      { referenceId: bookingId, account: 'HOTEL', type: 'CREDIT', amount: settlement.netPayable, description: 'Test Payout' },
      { referenceId: bookingId, account: 'ZIVO', type: 'CREDIT', amount: settlement.commissionAmount, description: 'Test Commission' }
    ], prismaTx);
    console.log('✅ Ledger Balanced & Recorded');
  });

  console.log('--- Test Complete ---');
  process.exit(0);
}

testFinanceFlow().catch(err => {
  console.error(err);
  process.exit(1);
});
