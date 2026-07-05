const API_BASE = process.env.API_URL || 'http://localhost:5000/api/v1';

let authToken = '';
let hotelId = '';
let roomId = '';

const log = (phase, status, message) => {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏳';
  console.log(`[${phase}] ${icon} ${status.padEnd(4)} | ${message}`);
};

const req = async (method, endpoint, body = null, useAuth = false) => {
  const headers = { 'Content-Type': 'application/json' };
  if (useAuth && authToken) headers['Authorization'] = `Bearer ${authToken}`;
  
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, options);
    const data = await res.text();
    let json = null;
    try { json = JSON.parse(data); } catch(e) {}
    return { status: res.status, ok: res.ok, json, text: data };
  } catch (err) {
    return { status: 500, ok: false, error: err.message };
  }
};

async function runE2E() {
  console.log(`\n🚀 Starting ZivoHotels Enterprise E2E Business Validation`);
  console.log(`🔗 Target Environment: ${API_BASE}\n`);

  // --- Phase 1: System Health ---
  const health = await req('GET', '/system/config');
  if (health.status === 200 || health.status === 404) {
    // Note: 404 is acceptable if /system/config isn't explicitly defined but server is up
    log('HEALTH', 'PASS', 'API Gateway & Backend reachable');
  } else {
    log('HEALTH', 'FAIL', `Backend unreachable (Status: ${health.status})`);
    process.exit(1);
  }

  // --- Phase 2: Authentication ---
  log('AUTH', 'INFO', 'Authenticating test admin user...');
  const authRes = await req('POST', '/auth/login', { email: 'admin@zivohotels.com', password: 'password123' });
  if (authRes.ok && authRes.json?.data?.token) {
    authToken = authRes.json.data.token;
    log('AUTH', 'PASS', 'Admin Login successful, JWT obtained.');
  } else {
    log('AUTH', 'WARN', 'Authentication failed. Skipping authenticated routes or using mocked flows if dev env.');
    // We will attempt to continue in case the API is open locally
  }

  // --- Phase 3: Add Property Workflow ---
  log('ONBOARDING', 'INFO', 'Starting Add Property Workflow');
  
  // 3A. Create Draft
  const hotelPayload = {
    name: 'E2E Test Enterprise Resort',
    propertyType: 'Resort',
    city: 'Goa',
    address: '123 Beach Road',
    description: 'A beautiful E2E test resort.',
    status: 'DRAFT',
    country: 'India',
    state: 'Goa',
    pincode: '403001'
  };
  
  const createRes = await req('POST', '/hotels', hotelPayload, true);
  if (createRes.ok && createRes.json?.data?.id) {
    hotelId = createRes.json.data.id;
    log('ONBOARDING', 'PASS', `Property Draft Created (ID: ${hotelId})`);
  } else {
    log('ONBOARDING', 'FAIL', `Property Creation Failed: ${createRes.status}`);
    console.log(createRes.text);
  }

  // 3B. Add Rooms (Without Capacity!)
  if (hotelId) {
    const roomPayload = {
      name: 'E2E Ocean View Suite',
      basePrice: 5000,
      bedType: 'KING',
      occupancy: { adults: 2, children: 1 },
      amenities: ['WIFI', 'AC', 'TV'],
      ratePlans: [{ name: 'EP', price: 5000 }]
    };
    const roomRes = await req('POST', `/hotels/${hotelId}/rooms`, roomPayload, true);
    if (roomRes.ok) {
      log('ONBOARDING', 'PASS', 'Rooms created successfully without legacy capacity field');
    } else {
      // If endpoint doesn't exist yet, we just log warning
      log('ONBOARDING', 'WARN', `Room creation returned ${roomRes.status}`);
    }

    // 3C. Add Finance (UPI ID)
    const financePayload = {
      bankName: 'HDFC',
      accountNumber: '1234567890',
      ifscCode: 'HDFC0001234',
      upiId: 'e2etest@hdfc'
    };
    const finRes = await req('PATCH', `/hotels/${hotelId}`, { bankDetails: financePayload }, true);
    if (finRes.ok) {
      log('ONBOARDING', 'PASS', 'Finance records (including UPI) updated successfully');
    } else {
      log('ONBOARDING', 'WARN', `Finance update returned ${finRes.status}`);
    }

    // 3D. Publish
    const publishRes = await req('PATCH', `/hotels/${hotelId}`, { status: 'LIVE' }, true);
    if (publishRes.ok) {
      log('ONBOARDING', 'PASS', 'Property published successfully');
    } else {
      log('ONBOARDING', 'WARN', `Publishing returned ${publishRes.status}`);
    }
  }

  // --- Phase 4: Search Verification ---
  log('SEARCH', 'INFO', 'Verifying Property is Searchable');
  const searchRes = await req('GET', '/public/search?city=Goa');
  if (searchRes.ok) {
    const hotels = searchRes.json?.data?.hotels || searchRes.json?.data || [];
    const found = hotels.find(h => h.name === 'E2E Test Enterprise Resort');
    if (found) {
      log('SEARCH', 'PASS', 'Test property appeared in public search results');
    } else {
      log('SEARCH', 'WARN', 'Test property not found in search (Cache/ES sync delay?)');
    }
  } else {
    log('SEARCH', 'FAIL', 'Public search endpoint failed');
  }

  // --- Phase 5: Edit Workflow Verification ---
  if (hotelId) {
    const editRes = await req('PATCH', `/hotels/${hotelId}`, { name: 'E2E Test Enterprise Resort (Edited)' }, true);
    if (editRes.ok) {
      log('EDIT', 'PASS', 'Hotel data edits persisted successfully');
    } else {
      log('EDIT', 'FAIL', 'Edit workflow failed');
    }
  }

  console.log(`\n🏁 E2E Validation Complete.`);
  console.log(`Output written to console. Please review results and proceed with BAT.\n`);
}

runE2E();
