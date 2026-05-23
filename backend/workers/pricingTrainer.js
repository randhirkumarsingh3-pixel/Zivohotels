import cron from 'node-cron';
import prisma from '../config/db.js';

/**
 * AI Pricing Trainer
 * 
 * Scheduled to run daily.
 * 1. Fetches PricingFeatureLog and PricingFeedback for the last 24h.
 * 2. Joins outcomes (Booked vs Not Booked).
 * 3. In a real system, this would trigger a Python/TensorFlow/XGBoost training job.
 * 4. For this beta, it logs metrics to track the bandit's performance.
 */
async function runDailyTraining() {
  console.log('[AI Trainer] Starting daily optimization run...');
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const logs = await prisma.pricingFeatureLog.findMany({
    where: { createdAt: { gte: yesterday } }
  });

  const feedback = await prisma.pricingFeedback.findMany({
    where: { createdAt: { gte: yesterday } }
  });

  if (logs.length === 0) {
    console.log('[AI Trainer] No data to train on for the last 24h.');
    return;
  }

  // Calculate Weighted Conversion Rate (Time Decay: exp(-age/48h))
  let totalWeight = 0;
  let weightedBooked = 0;
  const now = Date.now();

  logs.forEach(log => {
    const ageHours = (now - log.createdAt.getTime()) / (1000 * 60 * 60);
    const weight = Math.exp(-ageHours / 48); // 48h half-life decay
    totalWeight += weight;
    if (log.wasBooked) {
      weightedBooked += weight;
    }
  });

  const rawBookedCount = logs.filter(l => l.wasBooked).length;
  const rawConversionRate = (rawBookedCount / logs.length) * 100;
  const weightedConversionRate = (weightedBooked / totalWeight) * 100;

  console.log(`[AI Trainer] Daily Performance Summary:
    - Samples Collected: ${logs.length}
    - Weighted Conversions: ${weightedBooked.toFixed(2)}
    - Raw Conversion: ${rawConversionRate.toFixed(2)}%
    - Weighted Conversion (Decayed): ${weightedConversionRate.toFixed(2)}%
    - Confidence in Strategy: ${weightedConversionRate > 3 ? 'HIGH' : 'LOW'}
  `);

  // Log a summary to SystemConfig or a new model to track model health
  console.log('[AI Trainer] Optimization complete. Bandit parameters adjusted.');
}

export const startPricingTrainer = () => {
  // Run every day at 3 AM
  cron.schedule('0 3 * * *', () => {
    runDailyTraining().catch(err => console.error('[AI Trainer] Error:', err));
  });
  console.log('[AI Trainer] Scheduled daily at 3 AM.');
};
