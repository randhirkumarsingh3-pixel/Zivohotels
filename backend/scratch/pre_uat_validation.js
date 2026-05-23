/**
 * pre_uat_validation.js
 * MANDATORY Pre-UAT Validation Gate
 */

import prisma from '../config/db.js';
import { cancelBooking } from '../controllers/bookingController.js';

// MOCKING REQUEST/RESPONSE for Controller Testing
const mockRes = () => {
  const res = {};
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.body = data; return res; };
  return res;
};

async function runValidation() {
  console.log('🚀 STARTING PRE-UAT VALIDATION GATE...');

  try {
    // 1. Setup Test Data
    const hotel = await prisma.hotel.findFirst();
    const roomType = await prisma.roomType.findFirst({ where: { hotelId: hotel.id } });
    
    const testBooking = await prisma.booking.create({
      data: {
        hotelId: hotel.id,
        roomTypeId: roomType.id,
        guestName: 'TEST VALIDATION',
        guestEmail: 'test@validation.com',
        guestPhone: '1234567890',
        checkIn: new Date(Date.now() + 86400000 * 2), // 2 days later (Full Refund)
        checkOut: new Date(Date.now() + 86400000 * 3),
        guests: 2,
        rooms: 1,
        totalAmount: 5000,
        paidAmount: 5000,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        razorpayPaymentId: 'pay_test_123',
        razorpayOrderId: 'order_test_123'
      }
    });

    console.log(`✅ Test Booking Created: ${testBooking.id}`);

    // --- TEST 1: RACE CONDITION (Simultaneous Cancel) ---
    console.log('🧪 TEST 1: Simulating Simultaneous Cancellation Race Condition...');
    
    const req1 = { params: { id: testBooking.id }, id: 'req_race_1', user: { id: 'admin-1', role: 'ADMIN' } };
    const req2 = { params: { id: testBooking.id }, id: 'req_race_2', user: { id: 'admin-1', role: 'ADMIN' } };
    
    const res1 = mockRes();
    const res2 = mockRes();

    // Trigger both at once
    const p1 = cancelBooking(req1, res1, (e) => console.error('E1:', e));
    const p2 = cancelBooking(req2, res2, (e) => console.error('E2:', e));

    await Promise.all([p1, p2]);

    console.log(`Req 1 Result: ${res1.statusCode} - ${res1.body?.message}`);
    console.log(`Req 2 Result: ${res2.statusCode} - ${res2.body?.message}`);

    const raceSuccess = (res1.statusCode === 200 && res2.statusCode === 400) || 
                        (res1.statusCode === 400 && res2.statusCode === 200);
    
    console.log(raceSuccess ? '✅ RACE CONDITION HANDLED: Only one request succeeded.' : '❌ RACE CONDITION FAILED: Both requests might have processed!');

    // --- TEST 2: INVENTORY RESTORATION ---
    console.log('🧪 TEST 2: Verifying Inventory Integrity...');
    const inventory = await prisma.inventory.findFirst({
      where: { roomTypeId: roomType.id, date: testBooking.checkIn }
    });
    console.log(`Inventory Check: Booked=${inventory.bookedRooms}, Available=${inventory.availableRooms}`);
    // Since we started with a confirmed booking, we need to know the baseline.
    // But logically, if it's cancelled, booked should be 0 (if this was the only booking).

    // --- TEST 3: AUDIT LOGS ---
    console.log('🧪 TEST 3: Verifying Audit Logs...');
    const logs = await prisma.auditLog.findMany({
      where: { entityId: testBooking.id },
      orderBy: { createdAt: 'asc' }
    });
    logs.forEach(l => console.log(`  - ${l.action}: ${JSON.stringify(l.details)}`));

    // Cleanup
    // await prisma.booking.delete({ where: { id: testBooking.id } });
    
  } catch (err) {
    console.error('❌ VALIDATION ERROR:', err);
  }

  console.log('🔚 PRE-UAT VALIDATION COMPLETE.');
}

runValidation();
