import { expect } from 'chai';
import { contentScore } from '../../services/contentScore.js';

const words = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
const complete = {
  hotel: {
    name: 'Lakeview', rating: 4, type: 'Hotel', description: words(160), latitude: 12.9, longitude: 77.6, landmark: 'Near the lake',
    checkInTime: '14:00', checkOutTime: '11:00', amenities: Array.from({ length: 14 }, (_, i) => `a${i}`),
    nearbyPlaces: [{}, {}, {}],
    integrationSettings: { contactInfo: { receptionPhone: '9876543210', receptionEmail: 'desk@lakeview.in' }, addressDetails: { area: 'HSR Layout' }, policyRules: { idProof: 'Aadhaar', couples: true, pets: false } },
  },
  rooms: [{ description: words(20), roomSize: '220', bedType: 'King', maxOccupancy: 2, priced: true, photoCount: 3 }],
  photos: [...Array.from({ length: 14 }, () => ({ category: 'ROOM' })), { category: 'EXTERIOR', isPrimary: true }, { category: 'FOOD' }],
  hasCancellationPolicy: true,
};

describe('Content score', () => {
  it('gives a complete listing 100 with nothing left to do', () => {
    const r = contentScore(complete);
    expect(r.score).to.equal(100);
    expect(r.label).to.equal('Excellent');
    expect(r.nextSteps).to.deep.equal([]);
    expect(r.sections.map((s) => s.max).reduce((a, b) => a + b, 0)).to.equal(100);
  });

  it('scores an empty listing low and lists the biggest fixes first', () => {
    const r = contentScore({ hotel: { name: 'New' } });
    expect(r.score).to.be.below(10);
    expect(r.label).to.equal('Needs work');
    expect(r.nextSteps[0].gain).to.be.at.least(r.nextSteps[r.nextSteps.length - 1].gain);
    expect(r.nextSteps.every((n) => n.tip && n.step >= 1)).to.equal(true);
  });

  it('gives part marks: a short description, some photos, some rooms without photos', () => {
    const r = contentScore({ ...complete, hotel: { ...complete.hotel, description: words(75) }, photos: complete.photos.slice(0, 10),
      rooms: [...complete.rooms, { ...complete.rooms[0], photoCount: 0 }] });
    const basics = r.sections.find((s) => s.key === 'basics');
    expect(basics.checks.find((c) => c.key === 'description').earned).to.equal(4);
    const photos = r.sections.find((s) => s.key === 'photos');
    expect(photos.checks.find((c) => c.key === 'roomPhotos').earned).to.equal(3);
    expect(photos.checks.find((c) => c.key === 'count15').earned).to.equal(2.5);
    expect(r.score).to.be.within(85, 95);
  });
});
