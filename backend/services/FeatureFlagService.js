import prisma from '../config/db.js';

class FeatureFlagService {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes cache
    this.lastFetched = 0;
  }

  async _refreshCache() {
    const now = Date.now();
    if (now - this.lastFetched < this.cacheTTL && this.cache.size > 0) {
      return; // Cache is still fresh
    }

    try {
      // In a real implementation, you'd fetch this from the DB or a centralized config service
      // For now, we mock the DB fetch with default values
      const flags = [
        { key: 'DYNAMIC_PRICING', enabled: false },
        { key: 'AI_SEARCH', enabled: false },
        { key: 'LOYALTY_PROGRAM', enabled: true },
        { key: 'OTA_INTEGRATIONS', enabled: false }
      ];

      this.cache.clear();
      for (const flag of flags) {
        this.cache.set(flag.key, flag.enabled);
      }
      this.lastFetched = now;
    } catch (error) {
      console.error('Failed to fetch feature flags:', error);
      // Fallback to existing cache if refresh fails
    }
  }

  async isEnabled(flagKey) {
    await this._refreshCache();
    return this.cache.get(flagKey) === true;
  }
}

export const featureFlagService = new FeatureFlagService();
