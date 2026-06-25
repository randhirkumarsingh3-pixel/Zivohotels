import { rankingService } from '../services/rankingService.js';
import { analyticsService } from '../services/rms/analyticsService.js';

async function testRMS() {
  console.log('--- Testing Phase 9 Revenue Management System (RMS) ---');

  // 1. Test Session & RPS
  const session = await analyticsService.startSession('test-user', 'WEB', 'Mumbai');
  console.log('✅ Session Started:', session.sessionId);
  
  const rpsData = await analyticsService.calculateRPS(30);
  console.log('✅ RPS Metric Calculated:', rpsData.rps || 0);

  // 2. Test Smart Ranking (ERS)
  const mockHotels = [
    { id: 'H1', name: 'Luxury Hotel', price: 10000, rating: 4.8, commission: 15, availableRooms: 5 },
    { id: 'H2', name: 'Value Stay', price: 2000, rating: 4.2, commission: 25, availableRooms: 10 },
    { id: 'H3', name: 'Mid Hotel', price: 5000, rating: 3.5, commission: 15, availableRooms: 2 }
  ];

  const ranked = rankingService.rankResults(mockHotels, 'RECOMMENDED');
  console.log('✅ Smart Ranking (Top 2):');
  ranked.slice(0, 2).forEach((h, i) => {
    console.log(`   ${i+1}. ${h.name} | Price: ${h.price} | Comm: ${h.commission}% | ERS: ${h.ers.toFixed(2)}`);
  });

  console.log('--- Test Complete ---');
  process.exit(0);
}

testRMS().catch(err => {
  console.error(err);
  process.exit(1);
});
