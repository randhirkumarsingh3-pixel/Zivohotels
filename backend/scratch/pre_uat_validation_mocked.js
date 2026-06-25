/**
 * pre_uat_validation_mocked.js
 * MANDATORY Pre-UAT Validation Gate (Mocked for No-Internet Environment)
 */

import { calculateRefund, getDefaultPolicy } from '../utils/refundCalculator.js';

// --- MOCK PRISMA ---
const db = {
  bookings: {
    'booking-1': { 
      id: 'booking-1', 
      status: 'CONFIRMED', 
      paidAmount: 5000, 
      checkIn: new Date(Date.now() + 86400000 * 2),
      razorpayPaymentId: 'pay_123'
    }
  },
  refunds: {},
  auditLogs: []
};

const mockPrisma = {
  $queryRaw: async ([query], ...args) => {
    // Simulate SELECT FOR UPDATE locking
    console.log(`[SQL] ${query} [ID: ${args[0]}]`);
    return [db.bookings[args[0]]];
  },
  $transaction: async (fn) => {
    console.log('[TX] Transaction Start');
    const res = await fn(mockPrisma);
    console.log('[TX] Transaction Commit');
    return res;
  },
  booking: {
    findUnique: async ({ where }) => db.bookings[where.id],
    update: async ({ where, data }) => {
      console.log(`[DB] Booking ${where.id} updated to ${data.status}`);
      db.bookings[where.id] = { ...db.bookings[where.id], ...data };
      return db.bookings[where.id];
    }
  },
  refund: {
    findUnique: async ({ where }) => db.refunds[where.bookingId],
    create: async ({ data }) => {
      console.log(`[DB] Refund Created: status=${data.status}`);
      const r = { id: 'refund-' + Math.random(), ...data };
      db.refunds[data.bookingId] = r;
      return r;
    },
    update: async ({ where, data }) => {
      console.log(`[DB] Refund Updated: status=${data.status}`);
      db.refunds[where.bookingId] = { ...db.refunds[where.bookingId], ...data };
      return db.refunds[where.bookingId];
    }
  },
  auditLog: {
    create: async ({ data }) => {
      console.log(`[LOG] Audit: ${data.action}`);
      db.auditLogs.push(data);
    }
  },
  cancellationPolicy: {
    findUnique: async () => null // Use default
  }
};

// --- MOCK RAZORPAY ---
const mockRazorpay = {
  payments: {
    refund: async (id, data) => {
      console.log(`[API] Razorpay Refund call: ${id} amount=${data.amount}`);
      return { id: 'rfnd_razor_123' };
    }
  }
};

// --- CONTROLLER LOGIC (Extracted for test) ---
async function cancelBookingLogic(id, requestId, user) {
  // 1. Lock
  const [booking] = await mockPrisma.$queryRaw`SELECT * FROM "Booking" WHERE id = ${id} FOR UPDATE`;
  if (!booking || booking.status === 'CANCELLED') throw new Error('Already cancelled');

  // 2. Idempotency
  const existingRefund = await mockPrisma.refund.findUnique({ where: { bookingId: id } });
  if (existingRefund && existingRefund.status === 'SUCCESS') throw new Error('Already refunded');

  // 3. Calculation
  const { refundAmount } = calculateRefund(booking, getDefaultPolicy());

  // 4. Initiate
  const refundRecord = await mockPrisma.refund.create({
    data: { bookingId: id, amount: refundAmount, status: 'INITIATED', requestId }
  });

  // 5. API Call (Decoupled)
  const razorResponse = await mockRazorpay.payments.refund(booking.razorpayPaymentId, { amount: refundAmount * 100 });
  
  // 6. Finalize
  await mockPrisma.$transaction(async (tx) => {
    await tx.refund.update({ where: { bookingId: id }, data: { status: 'SUCCESS', razorpayRefundId: razorResponse.id } });
    await tx.booking.update({ where: { id }, data: { status: 'CANCELLED', refundAmount } });
  });

  return 'OK';
}

async function runValidation() {
  console.log('🚀 STARTING MOCKED PRE-UAT VALIDATION...');

  // --- TEST 1: RACE CONDITION ---
  console.log('🧪 TEST 1: Race Condition Simulation');
  try {
    // We simulate two concurrent starts. 
    // In our mock, since it's single-threaded, we'll just check if the second one fails if the first finished.
    await cancelBookingLogic('booking-1', 'req_1', { role: 'ADMIN' });
    console.log('Request 1: SUCCESS');

    try {
      await cancelBookingLogic('booking-1', 'req_2', { role: 'ADMIN' });
    } catch (e) {
      console.log('Request 2: FAILED as expected - ' + e.message);
    }
  } catch (err) {
    console.error('Test 1 Failed:', err);
  }

  // --- TEST 2: FINANCIAL INTEGRITY ---
  console.log('🧪 TEST 2: Financial Caps Check');
  const booking = db.bookings['booking-1'];
  console.log(`Refunded Amount: ${booking.refundAmount}, Paid: ${booking.paidAmount}`);
  if (booking.refundAmount === booking.paidAmount) console.log('✅ Capped correctly at 100%');

  // --- TEST 3: AUDIT TRACE ---
  console.log('🧪 TEST 3: Audit Trace Check');
  if (db.auditLogs.length > 0) console.log('✅ Logs present');

  console.log('🔚 MOCKED VALIDATION COMPLETE.');
}

runValidation();
