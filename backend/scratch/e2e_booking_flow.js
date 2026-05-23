import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();
const prisma = new PrismaClient();

const API_URL = process.env.API_URL || 'http://localhost:5001/api/v1';

async function runE2EBookingTest() {
  console.log('🚀 Starting End-to-End Booking Flow Test...');

  try {
    // 1. Authenticate
    console.log('Step 1: Authenticating...');
    const loginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user@zivohotels.com',
        password: 'customer123'
      })
    });
    const loginData = await loginRes.json();
    if (!loginRes.ok) throw new Error(`Login failed: ${loginData.message}`);
    
    const token = loginData.token;
    const headers = { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    console.log('✅ Authenticated.');

    // 2. Fetch a valid RoomType
    console.log('Step 2: Fetching valid RoomType from DB...');
    const roomType = await prisma.roomType.findFirst({
      where: { hotel: { status: 'ACTIVE' } },
      include: { ratePlans: true }
    });

    if (!roomType || !roomType.ratePlans.length) {
      throw new Error('No active RoomType or RatePlan found in DB. Please run seed first.');
    }
    console.log(`✅ Using RoomType: ${roomType.name} (ID: ${roomType.id})`);

    // 3. Preview Booking
    console.log('Step 3: Previewing Booking...');
    const checkIn = new Date();
    checkIn.setDate(checkIn.getDate() + 2); // 2 days from now
    const checkOut = new Date();
    checkOut.setDate(checkOut.getDate() + 3); // 3 days from now

    const bookingPayload = {
      hotelId: roomType.hotelId,
      roomTypeId: roomType.id,
      ratePlanId: roomType.ratePlans[0].id,
      checkIn: checkIn.toISOString().split('T')[0],
      checkOut: checkOut.toISOString().split('T')[0],
      rooms: 1,
      guests: 2,
      paymentType: 'PAY_AT_HOTEL',
      guestName: 'Test Guest',
      guestEmail: 'test@example.com',
      guestPhone: '9876543210'
    };

    const previewRes = await fetch(`${API_URL}/bookings/preview`, {
      method: 'POST',
      headers,
      body: JSON.stringify(bookingPayload)
    });
    const previewData = await previewRes.json();
    if (!previewRes.ok) throw new Error(`Preview failed: ${previewData.message}`);
    
    console.log(`✅ Preview Success. Total Amount: ₹${previewData.data.totalAmount}`);

    // 4. Create Booking
    console.log('Step 4: Creating Booking...');
    const bookingRes = await fetch(`${API_URL}/bookings`, {
      method: 'POST',
      headers,
      body: JSON.stringify(bookingPayload)
    });
    const bookingData = await bookingRes.json();
    if (!bookingRes.ok) throw new Error(`Booking creation failed: ${bookingData.message}`);
    
    const bookingId = bookingData.data.id;
    console.log(`✅ Booking Created. ID: ${bookingId}, Ref: ${bookingData.data.bookingRef}`);

    // 5. Verify in DB
    console.log('Step 5: Verifying Booking in Database...');
    const savedBooking = await prisma.booking.findUnique({
      where: { id: bookingId }
    });

    if (savedBooking && savedBooking.status === 'PENDING') {
      console.log('✅ Database Verification SUCCESS.');
    } else {
      throw new Error('Booking verification failed in database.');
    }

    console.log('\n✨ E2E Booking Flow Test PASSED successfully!');

  } catch (error) {
    console.error('\n❌ E2E Test FAILED:');
    console.error(error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runE2EBookingTest();
