import axios from 'axios';
import { expect } from 'chai';
import minimist from 'minimist';

const argv = minimist(process.argv.slice(2));
const TARGET_URL = argv.url || process.env.SMOKE_URL || 'http://localhost:5000';

describe('Production Smoke Tests', function () {
  this.timeout(10000); // 10s timeout for network requests

  it('should pass the health check', async () => {
    const res = await axios.get(`${TARGET_URL}/health`);
    expect(res.status).to.equal(200);
    expect(res.data.status).to.equal('OK');
  });

  it('should pass the readiness check (DB connected)', async () => {
    const res = await axios.get(`${TARGET_URL}/ready`);
    expect(res.status).to.equal(200);
    expect(res.data.status).to.equal('READY');
  });

  it('should load system configuration publicly', async () => {
    const res = await axios.get(`${TARGET_URL}/api/v1/system/config`);
    expect(res.status).to.equal(200);
    expect(res.data.success).to.be.true;
    expect(res.data.data).to.have.property('partialPaymentPercent');
  });

  it('should respond to public hotel search', async () => {
    // Testing the public search API which does not require auth
    const res = await axios.get(`${TARGET_URL}/api/v1/public/search`, {
      params: { q: 'a' }
    });
    expect(res.status).to.equal(200);
    expect(res.data.success).to.be.true;
    expect(res.data.data).to.be.an('array');
  });
});
