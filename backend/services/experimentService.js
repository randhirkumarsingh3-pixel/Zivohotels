import prisma from '../config/db.js';
import cacheUtils from '../utils/cacheUtils.js';

function stableHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
  }
  return Math.abs(hash);
}

export const experimentService = {
  
  getActiveExperiments: async () => {
    const cacheKey = 'active_experiments';
    const cachedData = cacheUtils.getCache(cacheKey);
    if (cachedData) return cachedData;

    const config = await prisma.appState.findUnique({ where: { id: 'singleton' } });
    if (config) {
      if (config.globalExperimentToggle === false) {
        console.warn('[ExperimentService] Global kill switch is ON. All experiments disabled.');
        return [];
      }
      if (config.systemMode === 'SAFE_MODE') {
        console.warn('[ExperimentService] SAFE_MODE is active. Experiment allocation frozen.');
        return [];
      }
    }

    const now = new Date();
    let experiments = await prisma.experiment.findMany({
      where: { 
        status: 'ACTIVE',
        OR: [ { startAt: null }, { startAt: { lte: now } } ],
        AND: [ { OR: [{ endAt: null }, { endAt: { gte: now } }] } ]
      }
    });

    // Sort by priority (HIGH > MEDIUM > LOW) so HIGH gets picked first
    const priorityWeight = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    experiments.sort((a, b) => (priorityWeight[b.priority || 'LOW'] || 1) - (priorityWeight[a.priority || 'LOW'] || 1));

    // Collision check: Group by category and only allow the first one per category
    const categoryMap = {};
    const filteredExperiments = [];
    for (const exp of experiments) {
      if (exp.category && categoryMap[exp.category]) {
        console.warn(`[ExperimentService] Collision detected for category ${exp.category}. Skipping experiment ${exp.name}.`);
        continue;
      }
      if (exp.category) categoryMap[exp.category] = true;
      filteredExperiments.push(exp);
    }

    cacheUtils.setCache(cacheKey, filteredExperiments, 60000); // 60s TTL
    return filteredExperiments;
  },

  getVariant: (identifier, experiment) => {
    const hash = stableHash(identifier + experiment.id);
    const bucket = hash % 100;

    // Traffic gating
    if (bucket >= (experiment.traffic || 100)) {
      return 'control';
    }

    let cumulative = 0;

    for (const variant of experiment.variants) {
      cumulative += variant.weight;

      if (bucket < cumulative) {
        return variant.name;
      }
    }
    
    // Fallback just in case
    return experiment.variants[0]?.name || 'control';
  },

  getUserVariants: async (userId, sessionId) => {
    const identifier = userId || sessionId;
    if (!identifier) return {};

    const experiments = await experimentService.getActiveExperiments();
    const assignedVariants = {};

    for (const exp of experiments) {
      assignedVariants[exp.name] = experimentService.getVariant(identifier, exp);
    }

    return assignedVariants;
  }
};

export default experimentService;
