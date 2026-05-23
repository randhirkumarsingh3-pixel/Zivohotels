/**
 * Lightweight In-Memory Cache Utility
 * with TTL and Eviction limits
 */

const cache = new Map();
const MAX_CACHE_SIZE = 500;

export const cacheUtils = {

  setCache: (key, data, ttlMs = 60000) => {
    // Eviction: if cache size exceeds limit, remove the oldest entry
    if (cache.size >= MAX_CACHE_SIZE) {
      // Map keys preserve insertion order, so the first key is the oldest
      const oldestKey = cache.keys().next().value;
      cache.delete(oldestKey);
    }

    cache.set(key, {
      data,
      expiry: Date.now() + ttlMs
    });
  },

  getCache: (key) => {
    const entry = cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiry) {
      cache.delete(key);
      return null;
    }

    return entry.data;
  },
  
  clearCache: () => {
    cache.clear();
  }

};

export default cacheUtils;
