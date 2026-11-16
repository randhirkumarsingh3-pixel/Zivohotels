import { expect } from 'chai';
import { cityNames, cityNamesForTyping, sameCity, distanceKm, parseLatLng } from '../../utils/places.js';

describe('places: city names and distances', () => {
  it('treats old and new city names as the same city', () => {
    expect(cityNames('bangalore')).to.include.members(['Bengaluru', 'Bangalore']);
    expect(cityNames(' Bombay ')).to.include('Mumbai');
    expect(sameCity('Bengaluru', 'BANGALORE')).to.equal(true);
    expect(sameCity('Pune', 'Mumbai')).to.equal(false);
  });

  it('keeps unknown places as typed', () => {
    expect(cityNames('Marathahalli')).to.deep.equal(['Marathahalli']);
    expect(cityNames('')).to.deep.equal([]);
  });

  it('suggests both names while typing', () => {
    expect(cityNamesForTyping('banga')).to.include('Bengaluru');
    expect(cityNamesForTyping('ba')).to.deep.equal(['ba']);
  });

  it('measures distance and reads map points', () => {
    expect(distanceKm(12.97, 77.75, 12.9569, 77.7011)).to.be.within(5, 6);
    expect(parseLatLng('12.9', '77.7')).to.deep.equal({ lat: 12.9, lng: 77.7 });
    expect(parseLatLng('abc', '1')).to.equal(null);
    expect(parseLatLng('100', '1')).to.equal(null);
    expect(parseLatLng(undefined, '1')).to.equal(null);
  });
});
