import { rankingService } from '../services/rankingService.js';

async function testTrustLayer() {
  console.log('--- Testing Phase 9.1 Trust & Guardrails ---');

  const mockHotels = [
    { id: 'H1', name: 'High Margin / Low Rating', price: 10000, rating: 3.2, commission: 25, availableRooms: 5, ctr: 0.05 },
    { id: 'H2', name: 'High Margin / Low CTR', price: 10000, rating: 4.2, commission: 25, availableRooms: 5, ctr: 0.01 },
    { id: 'H3', name: 'Trustworthy / Good CTR', price: 8000, rating: 4.5, commission: 15, availableRooms: 5, ctr: 0.08 }
  ];

  const ranked = rankingService.rankResults(mockHotels, 'RECOMMENDED');
  
  console.log('✅ Ranked Results (Guarded):');
  ranked.forEach((h, i) => {
    console.log(`   ${i+1}. ${h.name} | Rating: ${h.rating} | CTR: ${h.ctr} | Score: ${h.score.toFixed(2)} | ERS: ${h.ers.toFixed(2)}`);
  });

  // Expectations:
  // H1: ERS should be 0 because rating < 3.5
  // H2: Score should be penalized because CTR < 0.02
  // H3: Should likely be #1 due to good balance

  console.log('--- Test Complete ---');
  process.exit(0);
}

testTrustLayer().catch(err => {
  console.error(err);
  process.exit(1);
});
