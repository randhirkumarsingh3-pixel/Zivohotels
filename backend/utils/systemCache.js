/**
 * systemCache.js
 * In-memory singleton for real-time stats, security monitoring, and configuration.
 * With Redis (REDIS_URL), the counters and the blocked IP addresses are shared by every server
 * process: the admin dashboard shows the totals, and a block applies everywhere and survives
 * restarts. Without Redis they live in this process's memory, as before.
 */
import { redis, redisSubscriber } from '../config/redis.js';

const BLOCKED_KEY = 'zivo:blocked-ips';
const STATS_KEY = 'zivo:stats';

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
    if (Object.prototype.hasOwnProperty.call(this.stats, key)) {
      this.stats[key] += amount;
      if (redis?.isReady) redis.hIncrBy(STATS_KEY, key, amount).catch(() => {});
    }
  }

  /** This process's counters (see getSharedStats for the totals across processes). */
  getStats() {
    return { ...this.stats };
  }

  /** Totals across all server processes (Redis), or this process's counters without it. */
  async getSharedStats() {
    if (!redis?.isReady) return this.getStats();
    try {
      const shared = await redis.hGetAll(STATS_KEY);
      const out = { ...this.stats };
      Object.keys(out).forEach((k) => { if (k !== 'lastReset') out[k] = Number(shared[k]) || 0; });
      if (shared.lastReset) out.lastReset = new Date(shared.lastReset);
      return out;
    } catch {
      return this.getStats();
    }
  }

  resetStats() {
    Object.keys(this.stats).forEach(k => {
      if (k !== 'lastReset') this.stats[k] = 0;
    });
    this.stats.lastReset = new Date();
    if (redis?.isReady) redis.del(STATS_KEY).then(() => redis.hSet(STATS_KEY, 'lastReset', this.stats.lastReset.toISOString())).catch(() => {});
  }

  // --- BLACKLIST ---
  blockIp(ip) {
    this.blacklist.add(ip);
    if (redis) redis.sAdd(BLOCKED_KEY, ip).then(() => redis.publish(BLOCKED_KEY, `+${ip}`)).catch(() => {});
  }

  unblockIp(ip) {
    this.blacklist.delete(ip);
    if (redis) redis.sRem(BLOCKED_KEY, ip).then(() => redis.publish(BLOCKED_KEY, `-${ip}`)).catch(() => {});
  }

  /** Loads the shared block list and follows changes made by other processes (needs Redis). */
  async syncBlockedIps() {
    if (!redis) return;
    try {
      (await redis.sMembers(BLOCKED_KEY)).forEach((ip) => this.blacklist.add(ip));
      const sub = await redisSubscriber('blocked-ips');
      await sub.subscribe(BLOCKED_KEY, (msg) => {
        const ip = msg.slice(1);
        if (msg[0] === '+') this.blacklist.add(ip); else this.blacklist.delete(ip);
      });
    } catch (err) {
      console.error('[systemCache] Shared IP block list not loaded:', err.message);
    }
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
