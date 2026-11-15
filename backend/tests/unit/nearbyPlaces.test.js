import assert from 'assert';
import { classify, distanceKm, normalizeList, publicList, isGenericName } from '../../services/nearbyPlacesService.js';

describe('nearby places', () => {
  it('measures straight-line distance in km to one decimal', () => {
    assert.strictEqual(distanceKm(19.0725, 72.8778, 19.0725, 72.8778), 0);
    // about 1.1 km per 0.01 degree of latitude
    assert.strictEqual(distanceKm(19.0, 72.8, 19.01, 72.8), 1.1);
  });

  it('sorts OpenStreetMap tags into the four groups', () => {
    assert.deepStrictEqual(classify({ aeroway: 'aerodrome' }), { category: 'TRANSIT', type: 'Airport' });
    assert.deepStrictEqual(classify({ railway: 'station' }), { category: 'TRANSIT', type: 'Railway Station' });
    assert.deepStrictEqual(classify({ shop: 'mall' }), { category: 'ATTRACTION', type: 'Shopping' });
    assert.deepStrictEqual(classify({ office: 'diplomatic' }), { category: 'LANDMARK', type: 'Embassy' });
    assert.deepStrictEqual(classify({ amenity: 'cafe' }), { category: 'RESTAURANT', type: 'Cafe' });
    assert.strictEqual(classify({ amenity: 'bench' }), null);
  });

  it('skips map entries named only by their kind', () => {
    for (const n of ['park 2', 'Bus Stop', 'temple', 'Park No. 3', 'ab']) assert.ok(isGenericName(n), n);
    for (const n of ['Shivaji Park', 'Kurla West', 'Cafe Madras', 'Phoenix Marketcity']) assert.ok(!isGenericName(n), n);
  });

  it('cleans a saved list: distance from the pin when the place has coordinates, typed distance otherwise', () => {
    const list = normalizeList([
      { name: ' Station ', category: 'TRANSIT', type: 'Railway Station', lat: 19.01, lng: 72.8, distanceKm: 99, source: 'OSM' },
      { name: 'Corner Cafe', category: 'RESTAURANT', type: 'Cafe', distanceKm: '0.35' },
      { name: 'Bad', category: 'SPACE' },
      { name: '', category: 'TRANSIT' },
    ], 19.0, 72.8);
    assert.strictEqual(list.length, 2);
    assert.strictEqual(list[0].name, 'Station');
    assert.strictEqual(list[0].distanceKm, 1.1);
    assert.strictEqual(list[0].source, 'OSM');
    assert.strictEqual(list[1].distanceKm, 0.4);
    assert.strictEqual(list[1].source, 'MANUAL');
    assert.strictEqual(list[1].lat, null);
    assert.ok(list[1].id);
  });

  it('shows guests visible places only, nearest first, without coordinates or ids', () => {
    const out = publicList([
      { id: 'a', name: 'Far', category: 'TRANSIT', type: 'Airport', distanceKm: 12, lat: 1, lng: 1, visible: true },
      { id: 'b', name: 'Hidden', category: 'TRANSIT', type: 'Bus Stop', distanceKm: 0.1, visible: false },
      { id: 'c', name: 'Near', category: 'RESTAURANT', type: 'Cafe', distanceKm: 0.2 },
    ]);
    assert.deepStrictEqual(out, [
      { name: 'Near', category: 'RESTAURANT', type: 'Cafe', distanceKm: 0.2 },
      { name: 'Far', category: 'TRANSIT', type: 'Airport', distanceKm: 12 },
    ]);
  });
});
