import { expect } from 'chai';
import { hotelSlug, slugify, slugIdPrefix, isUuid } from '../../utils/hotelSlug.js';
import { fill } from '../../services/seoService.js';

describe('SEO helpers', () => {
  describe('hotelSlug', () => {
    const id = '5a320d64-8432-4345-996c-e9b61c9abe13';
    it('is the name and city in words, then the start of the id', () => {
      expect(hotelSlug({ id, name: 'Z Stays Marathahalli', city: 'Bengaluru' })).to.equal('z-stays-marathahalli-bengaluru-5a320d64');
    });
    it('leaves the city out when the name already has it', () => {
      expect(hotelSlug({ id, name: 'Hotel Bengaluru Inn', city: 'Bengaluru' })).to.equal('hotel-bengaluru-inn-5a320d64');
    });
    it('handles accents, "&" and names without Latin letters', () => {
      expect(hotelSlug({ id, name: 'Café & Spa', city: 'Goa' })).to.equal('cafe-and-spa-goa-5a320d64');
      expect(hotelSlug({ id, name: 'होटल', city: 'Patna' })).to.equal('patna-5a320d64');
    });
    it('finds the id start again from any address ending', () => {
      expect(slugIdPrefix('old-name-5A320D64')).to.equal('5a320d64');
      expect(slugIdPrefix('no-id-here')).to.equal(null);
      expect(isUuid(id)).to.equal(true);
      expect(slugify('  Hotels in Navi Mumbai!! ')).to.equal('hotels-in-navi-mumbai');
    });
  });

  describe('fill (title and description templates)', () => {
    it('fills placeholders and keeps spacing around "|"', () => {
      expect(fill('{name}, {place}[: rooms from {price}] | {site}', { name: 'Z Stays', place: 'Goa', price: '₹1,000', site: 'ZivoPlus' }))
        .to.equal('Z Stays, Goa: rooms from ₹1,000 | ZivoPlus');
    });
    it('leaves out a [part] when a placeholder inside it is empty', () => {
      expect(fill('{name}, {place}[: rooms from {price}] | {site}', { name: 'Z Stays', place: 'Goa', price: '', site: 'ZivoPlus' }))
        .to.equal('Z Stays, Goa | ZivoPlus');
    });
    it('tidies punctuation left by empty values', () => {
      expect(fill('{name} in {place}. {stars}{type} with {amenities}.[ Rooms from {price} a night.] {cancellation} Book on {site}.', { name: 'Z', place: 'Goa', stars: '', type: 'Hotel', amenities: 'wifi', price: '', cancellation: '', site: 'ZivoPlus' }))
        .to.equal('Z in Goa. Hotel with wifi. Book on ZivoPlus.');
    });
  });
});
