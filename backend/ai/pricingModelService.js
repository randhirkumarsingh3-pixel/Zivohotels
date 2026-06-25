/**
 * AI Pricing Model Service
 * 
 * Implements the decision logic for the learning-based pricing engine.
 * Initial Strategy: Multi-Armed Bandit (Epsilon-Greedy) with Fallback.
 */
import prisma from '../config/db.js';
import featureBuilder from './featureBuilder.js';
import { eventBus } from '../services/eventBus.js';

// Configuration for the "Arms" (candidate multipliers)
const CANDIDATE_MULTIPLIERS = [0.90, 1.0, 1.05, 1.10, 1.20];
const EPSILON = 0.15; // 15% exploration
const _MIN_CONFIDENCE = 0.65;

export const pricingModelService = {
  /**
   * Predicts the optimal multiplier for a given context
   * 
   * @param {Object} context 
   * @returns {Object} prediction
   */
  getOptimalMultiplier: async (context) => {
    const { sessionId, userId } = context;
    const features = featureBuilder.buildFeatures(context);
    const contextHash = featureBuilder.generateContextHash(features);

    try {
      // 1. Session + Date Consistency: Lock multiplier per session/roomType/date for 15 mins
      const _dateKey = features.date.toISOString().split('T')[0];
      const _cachedPrediction = await prisma.pricingPrediction.findFirst({
        where: { 
          contextHash, 
          createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
          source: { in: ['AI_EXPLOITATION', 'AI_EXPLORATION'] },
          // Ensure same date gets same price to prevent user shock
          id: { in: (await prisma.pricingFeatureLog.findMany({
            where: { date: features.date },
            select: { id: true }
          })).map(l => l.id) } // This is a bit complex, let's simplify to contextHash + date logic
        },
        orderBy: { createdAt: 'desc' }
      });

      // Simpler Session+Date Lock
      const sessionLock = await prisma.pricingPrediction.findFirst({
        where: {
          contextHash,
          createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
          source: { in: ['AI_EXPLOITATION', 'AI_EXPLORATION'] }
        },
        orderBy: { createdAt: 'desc' }
      });

      if (sessionLock) {
        return {
          multiplier: sessionLock.multiplier,
          confidence: sessionLock.confidence,
          modelVersion: sessionLock.modelVersion,
          source: 'AI_SESSION_DATE_LOCKED',
          predictionId: sessionLock.id
        };
      }

      // 2. Cold-Start Guard: Fallback to rules if we have < 30 samples for this context
      const feedbackCount = await prisma.pricingFeedback.count({
        where: { prediction: { contextHash } }
      });

      if (feedbackCount < 30) {
        return { multiplier: 1.0, confidence: 0.1, modelVersion: 'cold_start', source: 'RULE_FALLBACK' };
      }

      // 3. Stratified Exploration & Arm Starvation Protection
      const bucketSeed = userId || sessionId || Math.random().toString();
      const bucket = Math.abs(featureBuilder.generateContextHash({ id: bucketSeed }).split('').reduce((a, b) => a + b.charCodeAt(0), 0)) % 100;
      
      let isExploring = bucket < EPSILON * 100;
      let selectedMultiplier;
      let confidence = 0.8;

      // Arm Starvation Protection: Check if any arm is severely under-sampled
      const armStats = await prisma.pricingPrediction.groupBy({
        by: ['multiplier'],
        _count: true,
        where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
      });

      const underSampledArm = CANDIDATE_MULTIPLIERS.find(m => {
        const stat = armStats.find(s => s.multiplier === m);
        return !stat || stat._count < 10; // minThreshold = 10
      });

      if (underSampledArm && isExploring) {
        selectedMultiplier = underSampledArm;
        confidence = 0.45; // Forced exploration
      } else if (isExploring) {
        selectedMultiplier = CANDIDATE_MULTIPLIERS[Math.floor(Math.random() * CANDIDATE_MULTIPLIERS.length)];
        confidence = 0.5;
      } else {
        // Exploit logic (simulate bandit arm selection)
        if (features.demandScore > 0.8) selectedMultiplier = 1.15;
        else if (features.demandScore < 0.3) selectedMultiplier = 0.95;
        else selectedMultiplier = 1.0;
        confidence = 0.9;
      }

      // 4. Price Elasticity Ceiling: Hard cap AI multiplier at 1.25 (Safety layer)
      selectedMultiplier = Math.min(selectedMultiplier, 1.25);

      // 4. Save Prediction and log initial NOT_BOOKED exposure
      const prediction = await prisma.pricingPrediction.create({
        data: {
          contextHash,
          multiplier: selectedMultiplier,
          confidence,
          modelVersion: 'bandit_v1_beta',
          source: isExploring ? 'AI_EXPLORATION' : 'AI_EXPLOITATION'
        }
      });

      // Log exposure immediately as NOT_BOOKED (Exposure event)
      // This will be updated to BOOKED if the user completes the transaction
      await prisma.pricingFeedback.create({
        data: {
          predictionId: prediction.id,
          outcome: 'NOT_BOOKED',
          revenue: 0
        }
      });

      // 5. Broadcast AI Transparency Event
      const reasoning = isExploring 
        ? `Exploration mode (Epsilon-Greedy): Testing ${selectedMultiplier}x to collect new signals.`
        : features.demandScore > 0.8 
          ? `High demand detected (${(features.demandScore * 100).toFixed(0)}%). Increasing rates to optimize RevPAR.`
          : features.demandScore < 0.3 
            ? `Low demand detected (${(features.demandScore * 100).toFixed(0)}%). Dropping rates to stimulate volume.`
            : `Market demand stable. Maintaining optimal rates.`;

      eventBus.emitEvent('AI_PRICING_ADJUSTMENT', {
        hotelId: features.hotelId,
        roomTypeId: features.roomTypeId,
        multiplier: selectedMultiplier,
        confidence,
        reasoning,
        signals: {
          demand: features.demandScore,
          occupancy: features.occupancyRate,
          daysToCheckIn: features.daysToCheckIn
        }
      }, { source: 'AI_BANDIT_MODEL', entityId: prediction.id });

      return {
        multiplier: selectedMultiplier,
        confidence,
        modelVersion: prediction.modelVersion,
        source: prediction.source,
        predictionId: prediction.id
      };

    } catch (error) {
      console.error('[AI Pricing] Inference Error:', error);
      return { multiplier: 1.0, confidence: 0, modelVersion: 'fallback', source: 'RULE' };
    }
  },

  /**
   * Logs a feature set and prediction outcome to the feedback loop
   */
  logOutcome: async (predictionId, features, finalPrice, outcome, revenue = 0) => {
    try {
      await prisma.pricingFeatureLog.create({
        data: {
          hotelId: features.hotelId,
          roomTypeId: features.roomTypeId,
          date: features.date,
          basePrice: features.basePrice,
          finalPrice: finalPrice,
          demandScore: features.demandScore,
          occupancy: features.occupancyRate,
          daysToCheckIn: features.daysToCheckIn,
          dayOfWeek: features.dayOfWeek,
          segment: features.userSegment,
          device: features.device,
          wasBooked: outcome === 'BOOKED',
          revenue: outcome === 'BOOKED' ? revenue : 0 // Reward definition: revenue only on conversion
        }
      });

      if (predictionId) {
        // Update the initial NOT_BOOKED exposure record to BOOKED
        await prisma.pricingFeedback.updateMany({
          where: { predictionId, outcome: 'NOT_BOOKED' },
          data: {
            outcome,
            revenue: outcome === 'BOOKED' ? revenue : 0
          }
        });
      }
    } catch (error) {
      console.error('[AI Pricing] Feedback Logging Error:', error);
    }
  }
};

export default pricingModelService;
