import http from 'http';

const API_BASE = 'http://localhost:5000/api/v1';

async function request(endpoint) {
  return new Promise((resolve, reject) => {
    http.get(`${API_BASE}${endpoint}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    }).on('error', reject);
  });
}

async function runTests() {
  const report = [];
  
  console.log('--- Starting API Functional Tests ---');

  // 1. System Config
  try {
    const res = await request('/system/config');
    report.push(`[System Config] -> Status: ${res.status}`);
  } catch(e) { report.push(`[System Config] -> Error: ${e.message}`); }

  // 2. Public Search
  try {
    const res = await request('/public/search?city=Goa');
    report.push(`[Public Search] -> Status: ${res.status}, Hotels Found: ${res.data.data?.hotels?.length || 0}`);
  } catch(e) { report.push(`[Public Search] -> Error: ${e.message}`); }

  // 3. Get Hotels
  let hotelId = null;
  try {
    const res = await request('/hotels');
    report.push(`[Get Hotels] -> Status: ${res.status}, Count: ${res.data.data?.length || 0}`);
    if (res.data.data?.length > 0) hotelId = res.data.data[0].id;
  } catch(e) { report.push(`[Get Hotels] -> Error: ${e.message}`); }

  // 4. Get Single Hotel
  if (hotelId) {
    try {
      const res = await request(`/hotels/${hotelId}`);
      report.push(`[Single Hotel] -> Status: ${res.status}, Name: ${res.data.data?.name}`);
    } catch(e) { report.push(`[Single Hotel] -> Error: ${e.message}`); }
  }

  console.log('\n--- Test Report ---');
  report.forEach(l => console.log(l));
}

runTests();
