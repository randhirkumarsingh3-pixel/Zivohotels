import fetch from 'node-fetch';

const API_URL = 'http://localhost:5001/api/v1'; // Assuming backend runs on 5001 or 5000. Let's adjust later if needed.

// We will use an existing hotelId, roomTypeId, ratePlanId to test.
// We can fetch one first.

async function runStressTest() {
  console.log('--- STARTING PHASE 5 PARALLEL BOOKING STRESS TEST ---');
  
  // 1. Fetch available properties
  console.log('Fetching properties...');
  const propRes = await fetch(`${API_URL}/hotels`);
  const propData = await propRes.json();
  if (!propData.success || propData.data.length === 0) {
    console.error('No properties found. Please ensure DB is seeded.');
    return;
  }
  const hotelId = propData.data[0].id;

  // 2. Fetch room types for this property
  const roomRes = await fetch(`${API_URL}/admin/rooms?propertyId=${hotelId}`);
  const roomData = await roomRes.json();
  if (!roomData.success || roomData.data.length === 0) {
    console.error('No room types found for this property.');
    return;
  }
  const roomType = roomData.data[0];
  const roomTypeId = roomType.id;
  const ratePlanId = roomType.ratePlans?.[0]?.id;

  if (!ratePlanId) {
    console.error('No active rate plan found for this room type.');
    return;
  }

  const checkIn = new Date();
  checkIn.setDate(checkIn.getDate() + 5);
  const checkOut = new Date(checkIn);
  checkOut.setDate(checkOut.getDate() + 2);

  const payload = {
    hotelId,
    roomTypeId,
    ratePlanId,
    guestName: "Stress Tester",
    guestEmail: "stress@tester.com",
    guestPhone: "9999999999",
    checkIn: checkIn.toISOString().split('T')[0],
    checkOut: checkOut.toISOString().split('T')[0],
    rooms: roomType.totalInventory, // Attempt to book ALL remaining rooms
    adults: 2,
    children: 0,
    extraBeds: 0,
    paymentType: "PAY_AT_HOTEL"
  };

  console.log(`Attempting parallel bookings for ${payload.rooms} rooms...`);

  // Fire 3 requests simultaneously
  const requests = [
    fetch(`${API_URL}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }),
    fetch(`${API_URL}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }),
    fetch(`${API_URL}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  ];

  const results = await Promise.all(requests.map(p => p.catch(e => e)));

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < results.length; i++) {
    const res = results[i];
    if (res instanceof Error) {
      console.log(`Req ${i+1}: Network Error -> ${res.message}`);
      failCount++;
      continue;
    }
    const json = await res.json();
    if (res.ok && json.success) {
      console.log(`Req ${i+1}: SUCCESS (Booking ID: ${json.data.id})`);
      successCount++;
    } else {
      console.log(`Req ${i+1}: FAILED -> ${json.message}`);
      failCount++;
    }
  }

  console.log('--- TEST SUMMARY ---');
  console.log(`Total Success: ${successCount}`);
  console.log(`Total Failed: ${failCount}`);
  
  if (successCount === 1 && failCount === 2) {
    console.log('✅ TEST PASSED: Only 1 transaction succeeded, confirming row-level lock worked!');
  } else if (successCount > 1) {
    console.log('❌ TEST FAILED: Multiple transactions succeeded. Race condition exists!');
  } else {
    console.log('⚠️ TEST INCONCLUSIVE: 0 succeeded. Check payload or existing inventory.');
  }
}

runStressTest();
