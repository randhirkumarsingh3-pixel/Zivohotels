/**
 * Security checks that need no running API: the password rules, upload cleaning (no SVG or other
 * active files; photos re-encoded with location data removed) and the browser report reader.
 */
import { expect } from 'chai';
import sharp from 'sharp';
import { weakPasswordReason, minLength } from '../../utils/passwordPolicy.js';
import { sanitizeImage } from '../../services/imageVariants.js';
import { normaliseReports } from '../../routes/securityRoutes.js';

describe('Password rules', () => {
  it('needs 10 characters for staff and hotel accounts, 8 for guests', () => {
    expect(minLength('ADMIN')).to.equal(10);
    expect(minLength('OWNER')).to.equal(10);
    expect(minLength('CUSTOMER')).to.equal(8);
    expect(weakPasswordReason('Tr7#kqLm', { role: 'ADMIN' })).to.match(/10 characters/);
    expect(weakPasswordReason('Tr7#kqLm', { role: 'CUSTOMER' })).to.equal(null);
  });

  it('refuses common passwords, repeats and key runs', () => {
    for (const pw of ['password123', 'Password123!', '12345678', 'aaaaaaaaaa', 'qwertyuiop', 'abcdefgh1', 'qwerty2026']) {
      expect(weakPasswordReason(pw), pw).to.be.a('string');
    }
  });

  it('refuses passwords built from the email, mobile number or name', () => {
    expect(weakPasswordReason('rahulsharma#2026', { email: 'rahulsharma@example.com' })).to.match(/email/);
    expect(weakPasswordReason('Zx!76543210q', { phone: '+91 98765 43210' })).to.match(/mobile/);
    expect(weakPasswordReason('Priya@2026x', { name: 'Priya Singh' })).to.match(/name/);
  });

  it('accepts a strong password', () => {
    expect(weakPasswordReason('Monsoon-Kettle-42', { email: 'a@b.co', role: 'ADMIN', name: 'Asha Rao' })).to.equal(null);
  });
});

describe('Upload cleaning', () => {
  it('refuses SVG (it can carry scripts), HTML and junk, whatever the declared type', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="10" height="10"/></svg>');
    for (const bad of [svg, Buffer.from('<html><script>alert(1)</script></html>'), Buffer.from('not an image')]) {
      let err;
      try { await sanitizeImage(bad); } catch (e) { err = e; }
      expect(err, bad.toString().slice(0, 20)).to.exist;
      expect(err.status).to.equal(400);
    }
  });

  it('re-encodes photos and removes their location (EXIF GPS) and other metadata', async () => {
    const withGps = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#c33' } })
      .jpeg().withExif({ IFD0: { Make: 'PhoneCo' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '25/1 36/1 0/1' } }).toBuffer();
    expect((await sharp(withGps).metadata()).exif).to.exist;
    const out = await sanitizeImage(withGps);
    expect(out.mimeType).to.equal('image/jpeg');
    const meta = await sharp(out.buffer).metadata();
    expect(meta.exif).to.equal(undefined);
    expect(meta.width).to.equal(40);
  });

  it('turns other formats into WebP and refuses files over the size limit', async () => {
    const gif = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#09f' } }).gif().toBuffer();
    expect((await sanitizeImage(gif)).mimeType).to.equal('image/webp');
    let err;
    try { await sanitizeImage(gif, { maxBytes: 10 }); } catch (e) { err = e; }
    expect(err?.status).to.equal(400);
  });
});

describe('Browser reports of blocked content', () => {
  it('reads both report formats and keeps only short, known fields', () => {
    const old = normaliseReports({ 'csp-report': { 'document-uri': 'https://zivoplus.com/x', 'blocked-uri': 'https://evil.test/a.js', 'effective-directive': 'script-src-elem', 'script-sample': 'x'.repeat(500) } });
    expect(old).to.have.length(1);
    expect(old[0]).to.include({ blocked: 'https://evil.test/a.js', directive: 'script-src-elem' });
    expect(old[0].sample.length).to.equal(120);
    const modern = normaliseReports([{ type: 'csp-violation', body: { documentURL: 'https://zivoplus.com/', blockedURL: 'inline', effectiveDirective: 'script-src-elem' } }]);
    expect(modern[0]).to.include({ blocked: 'inline', directive: 'script-src-elem' });
    expect(normaliseReports({ nonsense: true })).to.deep.equal([]);
    expect(normaliseReports(Array(50).fill({ body: { effectiveDirective: 'img-src' } }))).to.have.length(10);
  });
});
