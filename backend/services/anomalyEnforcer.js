import prisma from '../config/db.js';

import systemCache from '../utils/systemCache.js';

/**
 * AnomalyEnforcer (Level 6 Upgrade)
 * Enforces safety via a gradient control system.
 */

const LEVELS = {
  LEVEL_1_ALERT: 0.10,   // 10% deviation
  LEVEL_2_THROTTLE: 0.20, // 20% deviation
  LEVEL_3_FREEZE: 0.35,   // 35% deviation
  LEVEL_4_SAFE_MODE: 0.50 // 50% deviation
};

export const checkAndEnforceSafety = async (signalType, value) => {
  try {
    const threshold = getThreshold(signalType);
    const deviation = value / threshold;

    if (deviation >= LEVELS.LEVEL_4_SAFE_MODE) {
      await enforceAction('SAFE_MODE', signalType, value);
    } else if (deviation >= LEVELS.LEVEL_3_FREEZE) {
      await enforceAction('FREEZE_PAYOUTS', signalType, value);
    } else if (deviation >= LEVELS.LEVEL_2_THROTTLE) {
      await enforceAction('THROTTLE_TRAFFIC', signalType, value);
    } else if (deviation >= LEVELS.LEVEL_1_ALERT) {
      await enforceAction('ALERT_ONLY', signalType, value);
    }
  } catch (error) {
    console.error('[AnomalyEnforcer] Monitoring error:', error);
  }
};

async function enforceAction(actionType, signal, value) {
  const currentAction = systemCache.get(`active_action_${actionType}`);
  if (currentAction) return;

  console.warn(`[AnomalyEnforcer] ESCALATING TO ${actionType}: Due to ${signal} at ${value}`);

  // 1. Record in SystemActionLog
  const actionLog = await prisma.systemActionLog.create({
    data: {
      actionType,
      reason: `Automated escalation due to abnormal ${signal} signal: ${value}`,
      triggeredBy: 'SYSTEM_ANOMALY_ENGINE',
      impact: { signal, value, timestamp: new Date() }
    }
  });

  // 2. Execute Operational Logic
  if (actionType === 'SAFE_MODE') {
    await prisma.systemConfig.update({
      where: { key: 'SYSTEM_STATUS' },
      data: { value: 'SAFE_MODE' }
    });
    systemCache.set('system_status', 'SAFE_MODE');
  } else if (actionType === 'THROTTLE_TRAFFIC') {
    systemCache.set('traffic_throttle_pct', 20); // 20% drop
  }

  // 3. Cache the active action to prevent duplicate triggers
  systemCache.set(`active_action_${actionType}`, actionLog.id, 3600); // Lock for 1h
}

function getThreshold(type) {
  const defaults = {
    REFUND_RATE: 0.05,
    FAILURE_RATE: 0.10,
    LATENCY: 500
  };
  return defaults[type] || 1;
}
