/**
 * A short-lived cache shared by every server process through Redis (with REDIS_URL), so a search
 * or the home page is worked out once, not once per process. Each process also keeps its own copy
 * for the same time, so most requests don't even ask Redis. Without Redis: the process's own
 * memory only. A Redis error never fails a request: it's treated as "not cached".
 */
import { redis } from '../config/redis.js';
import cacheUtils from './cacheUtils.js';

const PREFIX = 'zivo:cache:';

export const getShared = async (key) => {
  const local = cacheUtils.getCache(key);
  if (local) return local;
  if (!redis?.isReady) return null;
  try {
    const raw = await redis.get(PREFIX + key);
    if (!raw) return null;
    const ttl = await redis.pTTL(PREFIX + key);
    const data = JSON.parse(raw);
    if (ttl > 0) cacheUtils.setCache(key, data, ttl);
    return data;
  } catch {
    return null;
  }
};

export const setShared = (key, data, ttlMs) => {
  cacheUtils.setCache(key, data, ttlMs);
  if (redis?.isReady) redis.set(PREFIX + key, JSON.stringify(data), { PX: ttlMs }).catch(() => {});
};

export default { getShared, setShared };
