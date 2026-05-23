import cron from 'node-cron';
import prisma from '../config/db.js';

const MIN_USERS = 500;
const MIN_BOOKINGS = 50;
const MIN_UPLIFT = 0.05;
const COOLDOWN_HOURS = 24;

async function evaluateAndRollout() {
  console.log('[ExperimentWorker] Running autonomous evaluation...');
  
  const now = new Date();
  
  // Acquire Lock with 5 minute failure recovery
  try {
    const fiveMinsAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const lockResult = await prisma.appState.updateMany({
      where: { 
        id: 'singleton', 
        OR: [
          { experimentWorkerRunning: false },
          { updatedAt: { lt: fiveMinsAgo } }
        ]
      },
      data: { experimentWorkerRunning: true }
    });

    if (lockResult.count === 0) {
      console.warn('[ExperimentWorker] Lock is currently held and active. Skipping run.');
      return;
    }
  } catch (err) {
    console.error('[ExperimentWorker] Database error acquiring lock:', err);
    return;
  }

  // Check SAFE_MODE
  const config = await prisma.appState.findUnique({ where: { id: 'singleton' } });
  if (config && config.systemMode === 'SAFE_MODE') {
    console.warn('[ExperimentWorker] SAFE_MODE is active. Auto-rollouts aborted.');
    // Release Lock
    await prisma.appState.update({ where: { id: 'singleton' }, data: { experimentWorkerRunning: false } });
    return;
  }
  
  // Fetch active experiments
  const activeExperiments = await prisma.experiment.findMany({
    where: { 
      status: 'ACTIVE',
      OR: [ { startAt: null }, { startAt: { lte: now } } ],
      AND: [ { OR: [{ endAt: null }, { endAt: { gte: now } }] } ]
    }
  });

  for (const experiment of activeExperiments) {
    // Check Cooldown
    const hoursSinceStart = (now - experiment.createdAt) / (1000 * 60 * 60);
    if (hoursSinceStart < COOLDOWN_HOURS) {
      continue; // Skip, too early to call
    }

    // Gather analytics
    const rawEvents = await prisma.analyticsEvent.findMany({
      where: {
        experiments: { path: [experiment.name], not: null }
      },
      select: { sessionId: true, eventType: true, experiments: true, metadata: true }
    });

    const metrics = {};
    for (const v of experiment.variants) {
      metrics[v.name] = { users: new Set(), views: 0, bookings: 0, revenue: 0 };
    }
    if (!metrics['control']) metrics['control'] = { users: new Set(), views: 0, bookings: 0, revenue: 0 };

    for (const event of rawEvents) {
      const variantAssigned = event.experiments[experiment.name];
      if (!metrics[variantAssigned]) continue;

      metrics[variantAssigned].users.add(event.sessionId);
      if (event.eventType === 'HOTEL_VIEWED') {
        metrics[variantAssigned].views++;
      } else if (event.eventType === 'BOOKING_COMPLETED') {
        metrics[variantAssigned].bookings++;
        if (event.metadata && event.metadata.totalAmount) {
          metrics[variantAssigned].revenue += Number(event.metadata.totalAmount);
        }
      }
    }

    const control = metrics['control'];
    const controlUsers = control.users.size;
    const controlRpu = controlUsers > 0 ? (control.revenue / controlUsers) : 0;

    let winnerName = null;
    let loserName = null;
    let maxRpu = controlRpu;
    let minRpu = controlRpu;
    let winningUplift = 0;
    let winningAbsoluteUplift = 0;
    let losingUplift = 0;
    let losingAbsoluteUplift = 0;
    let confidence = 'LOW';
    let loserConfidence = 'LOW';

    for (const [vName, data] of Object.entries(metrics)) {
      if (vName === 'control') continue;
      
      const users = data.users.size;
      const rpu = users > 0 ? (data.revenue / users) : 0;
      
      if (users >= MIN_USERS && data.bookings >= MIN_BOOKINGS && controlRpu > 0) {
        const absoluteUplift = rpu - controlRpu;
        const relativeUplift = absoluteUplift / controlRpu;
        
        // 0.5% absolute difference guard to prevent noise
        if (relativeUplift >= MIN_UPLIFT && rpu > maxRpu) {
          winnerName = vName;
          maxRpu = rpu;
          winningUplift = relativeUplift;
          winningAbsoluteUplift = absoluteUplift;

          if (users > 1000 && data.bookings > 100) confidence = 'HIGH';
          else confidence = 'MEDIUM';
        } else if (relativeUplift <= -MIN_UPLIFT && rpu < minRpu) {
          loserName = vName;
          minRpu = rpu;
          losingUplift = relativeUplift;
          losingAbsoluteUplift = absoluteUplift;

          if (users > 1000 && data.bookings > 100) loserConfidence = 'HIGH';
          else loserConfidence = 'MEDIUM';
        }
      }
    }

    if (winnerName && confidence === 'HIGH') {
      // Double Evaluation Safeguard
      if (!experiment.lastUplift || !experiment.lastEvaluationAt) {
        // First time seeing a winner, log and wait for next cycle
        console.log(`[ExperimentWorker] Potential WINNER detected: ${experiment.name} -> ${winnerName}. Waiting for next cycle to confirm.`);
        await prisma.experiment.update({
          where: { id: experiment.id },
          data: {
            lastEvaluationAt: now,
            lastUplift: winningUplift
          }
        });
        continue;
      }

      // Check if uplift is sustained
      if (winningUplift >= MIN_UPLIFT) {
        console.log(`[ExperimentWorker] WINNER CONFIRMED: ${experiment.name} -> ${winnerName} (Uplift: ${(winningUplift*100).toFixed(1)}%)`);

        // 1. Create Insight
        await prisma.experimentInsight.create({
          data: {
            experimentId: experiment.id,
            experimentName: experiment.name,
            category: experiment.category,
            winner: winnerName,
            resultType: 'WINNER',
            relativeUplift: winningUplift,
            absoluteUplift: winningAbsoluteUplift,
            confidence
          }
        });

        // 2. Rollout
        await prisma.experiment.update({
          where: { id: experiment.id },
          data: {
            status: 'CONCLUDED',
            winner: winnerName,
            concludedAt: new Date(),
            traffic: 100,
            variants: [ { name: winnerName, weight: 100 }, { name: 'control', weight: 0 } ]
          }
        });
      }
    } else if (loserName && loserConfidence === 'HIGH') {
      // Double Evaluation for Loser
      if (!experiment.lastUplift || !experiment.lastEvaluationAt) {
        console.log(`[ExperimentWorker] Potential LOSER detected: ${experiment.name} -> ${loserName}. Waiting for next cycle to confirm.`);
        await prisma.experiment.update({
          where: { id: experiment.id },
          data: {
            lastEvaluationAt: now,
            lastUplift: losingUplift
          }
        });
        continue;
      }

      if (losingUplift <= -MIN_UPLIFT) {
        console.log(`[ExperimentWorker] LOSER CONFIRMED: ${experiment.name} -> ${loserName} (Uplift: ${(losingUplift*100).toFixed(1)}%)`);
        
        await prisma.experimentInsight.create({
          data: {
            experimentId: experiment.id,
            experimentName: experiment.name,
            category: experiment.category,
            winner: loserName, // It's the variant name
            resultType: 'LOSER',
            relativeUplift: losingUplift,
            absoluteUplift: losingAbsoluteUplift,
            confidence: loserConfidence
          }
        });

        await prisma.experiment.update({
          where: { id: experiment.id },
          data: {
            status: 'CONCLUDED',
            winner: 'control', // Rollback to control
            concludedAt: new Date(),
            traffic: 100,
            variants: [ { name: 'control', weight: 100 }, { name: loserName, weight: 0 } ]
          }
        });
      }
    } else {
      // Update last evaluation to null if it's no longer meeting thresholds
      if (experiment.lastEvaluationAt) {
        await prisma.experiment.update({
          where: { id: experiment.id },
          data: { lastEvaluationAt: null, lastUplift: null }
        });
      }
    }
  }

  // Release Lock
  try {
    await prisma.appState.update({
      where: { id: 'singleton' },
      data: { experimentWorkerRunning: false }
    });
  } catch (err) {
    console.error('[ExperimentWorker] Error releasing lock:', err);
  }
}

export function startExperimentWorker() {
  // Run hourly
  cron.schedule('0 * * * *', async () => {
    try {
      await evaluateAndRollout();
    } catch (err) {
      console.error('[ExperimentWorker] Error:', err);
    }
  });
  console.log('[ExperimentWorker] Scheduled to run hourly.');
}
