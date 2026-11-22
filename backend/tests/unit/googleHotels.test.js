import { expect } from 'chai';
import { parseQuery, isIncluded, listingProblems } from '../../services/googleHotelsService.js';

describe('Google Hotels helpers', () => {
  describe('parseQuery', () => {
    it('reads a single stay with properties and a simple occupancy', () => {
      const q = parseQuery('<?xml version="1.0"?><Query><Checkin>2026-12-10</Checkin><Nights>2</Nights><PropertyList><Property>a1</Property><Property>b2</Property></PropertyList><Context><Occupancy>3</Occupancy></Context></Query>');
      expect(q.properties).to.deep.equal(['a1', 'b2']);
      expect(q.itineraries).to.deep.equal([{ checkin: '2026-12-10', nights: 2 }]);
      expect(q.adults).to.equal(3);
      expect(q.children).to.equal(0);
    });
    it('expands a date range into one stay per check-in day', () => {
      const q = parseQuery('<Query><FirstDate>2026-12-30</FirstDate><LastDate>2027-01-01</LastDate><Nights>1</Nights><PropertyList><Property>a1</Property></PropertyList></Query>');
      expect(q.itineraries.map((i) => i.checkin)).to.deep.equal(['2026-12-30', '2026-12-31', '2027-01-01']);
      expect(q.adults).to.equal(2);
    });
    it('counts adults and children from occupancy details', () => {
      const q = parseQuery('<Query><Checkin>2026-12-10</Checkin><Nights>1</Nights><PropertyList><Property>a1</Property></PropertyList><Context><OccupancyDetails><NumAdults>2</NumAdults><Children><Child age="4"/><Child age="9"/></Children></OccupancyDetails></Context></Query>');
      expect(q.adults).to.equal(2);
      expect(q.children).to.equal(2);
    });
    it('copes with an empty or broken request', () => {
      const q = parseQuery('not xml');
      expect(q.properties).to.deep.equal([]);
      expect(q.itineraries).to.deep.equal([]);
    });
  });

  describe('isIncluded', () => {
    const on = { includeNewHotels: true };
    const off = { includeNewHotels: false };
    const with_ = (g) => ({ integrationSettings: { googleHotels: g } });
    it('follows the default when nobody chose', () => {
      expect(isIncluded({}, on)).to.equal(true);
      expect(isIncluded({}, off)).to.equal(false);
    });
    it("uses the hotel's own choice over the default", () => {
      expect(isIncluded(with_({ optIn: false }), on)).to.equal(false);
      expect(isIncluded(with_({ optIn: true }), off)).to.equal(true);
    });
    it("lets ZivoPlus' exclusion win over the hotel's choice", () => {
      expect(isIncluded(with_({ optIn: true, adminExcluded: true }), on)).to.equal(false);
    });
  });

  describe('listingProblems', () => {
    const full = { location: '12 MG Road', city: 'Bengaluru', pincode: '560001', latitude: 12.9, longitude: 77.6, integrationSettings: { contactInfo: { receptionPhone: '080 1234 5678' } } };
    it('is empty for a complete listing', () => {
      expect(listingProblems(full)).to.deep.equal([]);
    });
    it('names each missing piece', () => {
      expect(listingProblems({ ...full, pincode: '', latitude: null, integrationSettings: {} })).to.deep.equal(['PIN code', 'map pin', 'reception phone']);
    });
    it('accepts the guest landline as the phone', () => {
      expect(listingProblems({ ...full, integrationSettings: { contactInfo: { guestLandline: '0801234567' } } })).to.deep.equal([]);
    });
  });
});
