/**
 * systemCache.js
 * In-memory singleton for real-time stats, security monitoring, and configuration.
 * Counters are per process. Blocked IP addresses are shared through Redis when it's set up
 * (REDIS_URL): a block made in one server process applies in all of them, and survives restarts.
 */
import { redis, redisSubscriber } from '../config/redis.js';

const BLOCKED_KEY = 'zivo:blocked-ips';

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
