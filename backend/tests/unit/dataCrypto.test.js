import { expect } from 'chai';
import { encryptText, decryptText, encryptFile, decryptFile, isEncrypted, isEncryptedFile, resetKeyCache } from '../../utils/dataCrypto.js';

describe('Encryption at rest', () => {
  before(() => { process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64'); resetKeyCache(); });
  after(() => { delete process.env.DATA_ENCRYPTION_KEY; resetKeyCache(); });

  it('encrypts text so the stored value reveals nothing, and reads it back', () => {
    const enc = encryptText('50100123456789');
    expect(isEncrypted(enc)).to.equal(true);
    expect(enc).to.not.include('50100123456789');
    expect(encryptText('50100123456789')).to.not.equal(enc); // a new random IV each time
    expect(decryptText(enc)).to.equal('50100123456789');
  });

  it('leaves empty values alone and reads values stored before encryption as they are', () => {
    expect(encryptText('')).to.equal('');
    expect(encryptText(null)).to.equal(null);
    expect(decryptText('1234567890')).to.equal('1234567890');
    expect(encryptText(encryptText('x')).startsWith('enc:v1:')).to.equal(true); // never double-encrypted
  });

  it('refuses a value that was changed after encryption', () => {
    const enc = encryptText('50100123456789');
    const parts = enc.split(':');
    parts[4] = Buffer.from('tampered-value').toString('base64');
    expect(() => decryptText(parts.join(':'))).to.throw();
  });

  it('refuses to decrypt with another key', () => {
    const enc = encryptText('secret');
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64'); resetKeyCache();
    expect(() => decryptText(enc)).to.throw();
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64'); resetKeyCache();
  });

  it('encrypts files and reads both encrypted and older plain files', () => {
    const pdf = Buffer.from('%PDF-1.4 cancelled cheque');
    const enc = encryptFile(pdf);
    expect(isEncryptedFile(enc)).to.equal(true);
    expect(enc.includes(Buffer.from('cancelled cheque'))).to.equal(false);
    expect(decryptFile(enc).equals(pdf)).to.equal(true);
    expect(decryptFile(pdf).equals(pdf)).to.equal(true);
  });

  it('requires a real key in production', () => {
    const saved = process.env.NODE_ENV;
    delete process.env.DATA_ENCRYPTION_KEY; process.env.NODE_ENV = 'production'; resetKeyCache();
    try { expect(() => encryptText('x')).to.throw(/DATA_ENCRYPTION_KEY/); } finally {
      process.env.NODE_ENV = saved; process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64'); resetKeyCache();
    }
  });
});
