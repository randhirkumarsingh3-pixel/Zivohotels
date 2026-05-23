import cron from 'node-cron';
import prisma from '../config/db.js';
import { eventBus } from '../services/eventBus.js';

/**
 * ZivoHotels Marketplace Balancer
 * Adjusts global/city-level exploration and bidding based on macro signals.
 */
async function rebalanceMarketplace() {
  console.log('[Marketplace Balancer] Starting rebalance run...');
  const now = new Date();

  try {
    // 1. Fetch City-Level Demand Signals
    const citySignals = await prisma.demandSignal.findMany({
      where: {
        roomTypeId: '_city',
        date: { gte: now }
      },
      orderBy: { demandScore: 'desc' }
    });

    for (const signal of citySignals) {
      const city = signal.hotelId.replace('_city_', '');
      
      // 2. Detect Saturation (Demand > 0.9 and many properties active)
      if (signal.demandScore > 0.9) {
        console.log(`[Marketplace Balancer] High Saturation detected in ${city}. Protecting conversion.`);
        
        // Broadcast Balancer Action
        eventBus.emitEvent('MARKETPLACE_REBALANCED', {
          city,
          demandScore: signal.demandScore,
          action: 'REDUCE_EXPLORATION',
          reason: 'High city-wide saturation — prioritizing conversion over exploration.'
        }, { severity: 'INFO', source: 'MARKETPLACE_BALANCER' });

        // In a real system, we would update global model parameters or individual hotel visibilities
      }

      // 3. Detect Opportunity (Demand < 0.4 and low supply)
      if (signal.demandScore < 0.4) {
        console.log(`[Marketplace Balancer] Low Demand in ${city}. Stimulating volume.`);
        
        eventBus.emitEvent('MARKETPLACE_REBALANCED', {
          city,
          demandScore: signal.demandScore,
          action: 'STIMULATE_DEMAND',
          reason: 'Low market pressure — increasing exploration to find optimal price floor.'
        }, { severity: 'INFO', source: 'MARKETPLACE_BALANCER' });
      }
    }

  } catch (error) {
    console.error('[Marketplace Balancer] Error:', error);
  }
}

export const startMarketplaceBalancer = () => {
  // Run every hour
  cron.schedule('0 * * * *', () => {
    rebalanceMarketplace().catch(err => console.error('[Marketplace Balancer] Error:', err));
  });
  console.log('[Marketplace Balancer] Scheduled every hour.');
};
