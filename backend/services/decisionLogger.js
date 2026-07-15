import prisma from '../config/db.js';


/**
 * DecisionLogger
 * Permanently records AI/System decisions for traceability and performance tuning.
 */

export const logDecision = async ({
  entityId,
  type,
  inputs,
  output,
  reason = null
}) => {
  try {
    const entry = await prisma.decisionLog.create({
      data: {
        entityId,
        type,
        inputs: JSON.parse(JSON.stringify(inputs)),
        output: JSON.parse(JSON.stringify(output)),
        reason
      }
    });
    return entry;
  } catch (error) {
    console.error('[DecisionLogger] Error:', error);
    return null;
  }
};

export const getDecisionHistory = async (entityId, type = null) => {
  return await prisma.decisionLog.findMany({
    where: { 
      entityId, 
      ...(type && { type }) 
    },
    orderBy: { timestamp: 'desc' },
    take: 100
  });
};
