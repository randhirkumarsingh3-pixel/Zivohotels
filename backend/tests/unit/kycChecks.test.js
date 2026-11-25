import { expect } from 'chai';
import { checkPan, checkGstin, gstCheckDigit, nameMatch } from '../../services/verification/kyc.js';
import { parseCoordinates, isShortMapsLink } from '../../../src/components/onboarding/utils/coordinates.js';

describe('onboarding checks', () => {
  it('PAN format and holder type', () => {
    expect(checkPan('AAPFU0939F', 'PARTNERSHIP').ok).to.equal(true);
    expect(checkPan('ABCPE1234F', 'INDIVIDUAL').ok).to.equal(true);
    expect(checkPan('ABCPE1234F', 'PVT_LTD').ok).to.equal(false);
    expect(checkPan('ABCXE1234F').ok).to.equal(false); // X isn't a holder type
    expect(checkPan('ABCDE12345').ok).to.equal(false);
  });

  it('GSTIN check digit (GSTN algorithm), PAN and state', () => {
    expect(gstCheckDigit('27AAPFU0939F1Z')).to.equal('V');
    expect(checkGstin('27AAPFU0939F1ZV', { pan: 'AAPFU0939F', state: 'Maharashtra' }).ok).to.equal(true);
    expect(checkGstin('27AAPFU0939F1ZW').ok).to.equal(false);
    expect(checkGstin('27AAPFU0939F1ZV', { pan: 'AAAAA0000A' }).ok).to.equal(false);
    expect(checkGstin('27AAPFU0939F1ZV', { state: 'Karnataka' }).ok).to.equal(false);
    expect(checkGstin('').ok).to.equal(true); // optional
  });

  it('account holder name match ignores Pvt Ltd / Private Limited and case', () => {
    expect(nameMatch('SUNRISE HOTELS PVT LTD', 'Sunrise Hotels Private Limited')).to.equal(1);
    expect(nameMatch('Asha Rao', 'Sunrise Hotels')).to.equal(0);
  });

  it('reads coordinates and Google Maps links', () => {
    expect(parseCoordinates('12.9716, 77.5946')).to.deep.equal({ lat: 12.9716, lng: 77.5946 });
    expect(parseCoordinates('12.97° N, 77.59° E')).to.deep.equal({ lat: 12.97, lng: 77.59 });
    expect(parseCoordinates('https://www.google.com/maps/place/X/@12.9,77.6,17z/data=!3m1!4b1!3d12.9757!4d77.6094')).to.deep.equal({ lat: 12.9757, lng: 77.6094 });
    expect(parseCoordinates('https://maps.google.com/?q=12.97,77.59')).to.deep.equal({ lat: 12.97, lng: 77.59 });
    expect(parseCoordinates('0, 0')).to.equal(null);
    expect(parseCoordinates('MG Road')).to.equal(null);
    expect(isShortMapsLink('https://maps.app.goo.gl/abc')).to.equal(true);
  });
});
