/**
 * DecisionPriorityService
 * Resolves conflicts between multiple system layers.
 */

const PRIORITY_STACK = {
  SAFE_MODE: 100,
  FRAUD_BLOCK: 90,
  FINANCIAL_PROTECTION: 80,
  MANUAL_OVERRIDE: 70,
  EXPERIMENT_VARIANT: 50,
  AI_PRICING: 30,
  BASE_LOGIC: 10
};

export const resolveDecision = (decisions) => {
  if (!decisions || decisions.length === 0) return null;

  // Filter and sort by priority
  const sorted = decisions
    .filter(d => d.type in PRIORITY_STACK)
    .sort((a, b) => PRIORITY_STACK[b.type] - PRIORITY_STACK[a.type]);

  if (sorted.length === 0) return decisions[0]; // Fallback to first

  const winningDecision = sorted[0];
  const conflicts = sorted.slice(1);

  return {
    ...winningDecision,
    resolvedAt: new Date(),
    conflictCount: conflicts.length,
    overriddenDecisions: conflicts.map(c => c.type)
  };
};

/**
 * Cooldown Layer
 * Prevents too-frequent changes to critical values.
 */
const cooldownCache = new Map();

export const checkCooldown = (entityId, type, minutes = 120) => {
  const key = `${entityId}:${type}`;
  const lastUpdate = cooldownCache.get(key);
  
  if (lastUpdate && (Date.now() - lastUpdate) < (minutes * 60 * 1000)) {
    return false; // Still in cooldown
  }

  cooldownCache.set(key, Date.now());
  return true;
};
