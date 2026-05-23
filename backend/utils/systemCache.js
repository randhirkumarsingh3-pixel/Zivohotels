/**
 * systemCache.js
 * In-memory singleton for real-time stats, security monitoring, and configuration.
 * Note: In a multi-instance production environment, this should be replaced by Redis.
 */

class SystemCache {
  constructor() {
    this.stats = {
      activeSessions: 0,
      failedLogins: 0,
      forbiddenAccess: 0,
      refundsToday: 0,
      errors4xx: 0,
      errors5xx: 0,
      lastReset: new Date()
    };
    
    this.blacklist = new Set();
    this.integrityResult = {
      lastRun: null,
      issues: [],
      status: 'IDLE'
    };
    
    this.config = null; // Will be populated from DB on startup
  }

  // --- STATS ---
  increment(key, amount = 1) {
    if (this.stats.hasOwnProperty(key)) {
      this.stats[key] += amount;
    }
  }

  getStats() {
    return { ...this.stats };
  }

  resetStats() {
    Object.keys(this.stats).forEach(k => {
      if (k !== 'lastReset') this.stats[k] = 0;
    });
    this.stats.lastReset = new Date();
  }

  // --- BLACKLIST ---
  blockIp(ip) {
    this.blacklist.add(ip);
  }

  unblockIp(ip) {
    this.blacklist.delete(ip);
  }

  isIpBlocked(ip) {
    return this.blacklist.has(ip);
  }

  // --- INTEGRITY ---
  setIntegrityResult(result) {
    this.integrityResult = {
      lastRun: new Date(),
      issues: result.issues || [],
      status: 'COMPLETED'
    };
  }

  getIntegrityResult() {
    return this.integrityResult;
  }
}

// Export singleton
const systemCache = new SystemCache();
export default systemCache;
