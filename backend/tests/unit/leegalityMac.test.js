/** Leegality webhook check: mac = HMAC-SHA1(documentId) with the Private Salt, hex. */
import { expect } from 'chai';
import crypto from 'crypto';
import { macValid, expectedMac } from '../../services/agreements/leegality.js';

describe('Leegality webhook mac', () => {
  const saved = {};
  const keys = ['LEEGALITY_BASE_URL', 'LEEGALITY_AUTH_TOKEN', 'LEEGALITY_PRIVATE_SALT'];
  before(() => { keys.forEach((k) => { saved[k] = process.env[k]; }); Object.assign(process.env, { LEEGALITY_BASE_URL: 'https://sandbox.leegality.com', LEEGALITY_AUTH_TOKEN: 't', LEEGALITY_PRIVATE_SALT: 'salt-1' }); });
  after(() => { keys.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }); });

  it('matches HMAC-SHA1 of the document id with the salt', () => {
    const want = crypto.createHmac('sha1', 'salt-1').update('doc123').digest('hex');
    expect(expectedMac('doc123')).to.equal(want);
    expect(macValid('doc123', want)).to.equal(true);
    expect(macValid('doc123', want.toUpperCase())).to.equal(true);
  });

  it('refuses a wrong, missing or other-document mac', () => {
    expect(macValid('doc123', 'f'.repeat(40))).to.equal(false);
    expect(macValid('doc123', undefined)).to.equal(false);
    expect(macValid('doc124', expectedMac('doc123'))).to.equal(false);
    expect(macValid('', expectedMac(''))).to.equal(false);
  });

  it('refuses everything when Leegality is not set up', () => {
    const m = expectedMac('doc123');
    delete process.env.LEEGALITY_PRIVATE_SALT;
    expect(macValid('doc123', m)).to.equal(false);
    process.env.LEEGALITY_PRIVATE_SALT = 'salt-1';
  });
});
