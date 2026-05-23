import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const API_URL = 'http://localhost:5001/api/v1';
const LOGIN_CREDENTIALS = {
  email: 'admin@zivohotels.com', // Use a valid admin/test user
  password: 'password123'
};

async function runConcurrencyTest() {
  try {
    // 1. Login to get token
    console.log('Logging in...');
    const loginRes = await axios.post(`${API_URL}/auth/login`, LOGIN_CREDENTIALS);
    const token = loginRes.data.token;
    const headers = { Authorization: `Bearer ${token}` };

    // 2. Setup Test Data (Use a known RoomType)
    // IMPORTANT: Ensure this RoomType has only 1 room available for the test dates
    const payload = {
      roomTypeId: 'd3b8f1e0-0000-0000-0000-000000000000', // Update with a real ID
      checkIn: '2026-05-01',
      checkOut: '2026-05-02',
      rooms: 1,
      guests: 2,
      paymentType: 'PAY_AT_HOTEL',
      guestName: 'Concurrency Test',
      guestEmail: 'test@example.com',
      guestPhone: '9999999999'
    };

    console.log('Starting concurrent booking requests...');
    const requests = [
      axios.post(`${API_URL}/bookings`, payload, { headers }),
      axios.post(`${API_URL}/bookings`, payload, { headers })
    ];

    const results = await Promise.allSettled(requests);

    results.forEach((res, i) => {
      if (res.status === 'fulfilled') {
        console.log(`Request ${i + 1}: SUCCESS (Booking ID: ${res.value.data.data.id})`);
      } else {
        console.log(`Request ${i + 1}: FAILED (${res.reason.response?.data?.message || res.reason.message})`);
      }
    });

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    if (successCount === 1) {
      console.log('✅ TEST PASSED: Only one booking succeeded.');
    } else {
      console.log('❌ TEST FAILED: Concurrency issue detected.');
    }

  } catch (error) {
    console.error('Test error:', error.message);
  }
}

runConcurrencyTest();
