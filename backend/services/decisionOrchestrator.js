import prisma from '../config/db.js';


/**
 * DecisionOrchestrator
 * Resolves conflicts and enforces the Priority Stack for all system outputs.
 */

const PRIORITY_STACK = {
  SAFE_MODE: 1000,
  SYSTEM_BLOCK: 900,
  FINANCIAL_GUARD: 800,
  MANUAL_OVERRIDE: 700,
  EXPERIMENT_VARIANT: 500,
  AI_OPTIMIZER: 300,
  BASE_LOGIC: 100
};

export const resolveDecision = async ({
  entityId,
  type, // PRICING | RANKING | RISK
  potentialDecisions // Array of { type, value, explanation, version }
}) => {
  if (!potentialDecisions || potentialDecisions.length === 0) {
    throw new Error(`[Orchestrator] No decisions provided for ${entityId}`);
  }

  // 1. Sort by Priority (Highest wins)
  const sorted = potentialDecisions
    .filter(d => d.type in PRIORITY_STACK)
    .sort((a, b) => PRIORITY_STACK[b.type] - PRIORITY_STACK[a.type]);

  const winner = sorted[0];
  const conflicts = sorted.slice(1);

  // 2. Structured Explainability Object
  const finalDecision = {
    entityId,
    type,
    output: winner.value,
    explanation: {
      summary: winner.explanation?.summary || "Automated system decision",
      factors: winner.explanation?.factors || {},
      confidence: winner.explanation?.confidence || "MEDIUM",
      winningLayer: winner.type,
      priority: PRIORITY_STACK[winner.type],
      version: winner.version || "stable_v1"
    },
    meta: {
      conflictsResolved: conflicts.length,
      overriddenLayers: conflicts.map(c => c.type)
    }
  };

  // 3. Log to DecisionLog (Traceability)
  await prisma.decisionLog.create({
    data: {
      entityId,
      type,
      inputs: { potentialDecisions },
      output: finalDecision,
      reason: finalDecision.explanation.summary,
      timestamp: new Date()
    }
  }).catch(err => console.error('[Orchestrator] Logging failed:', err));

  return finalDecision;
};
