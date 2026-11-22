/**
 * Redis: memory shared by every server process (REDIS_URL, e.g. redis://redis:6379).
 *
 * With Redis the API can run as several processes (one per CPU core, see cluster.js) and still
 * behave as one: rate limits are counted once across all of them, live updates reach a person
 * whichever process they're connected to, and blocked IP addresses apply everywhere.
 *
 * Without REDIS_URL (local development, tests) everything stays in the process's own memory,
 * as before. If Redis goes down while running, requests carry on: rate limits let requests
 * through rather than block them, and the client keeps retrying the connection.
 */
import { createClient } from 'redis';

export const REDIS_URL = process.env.REDIS_URL || '';

const make = (name) => {
  const c = createClient({
    url: REDIS_URL,
    socket: { reconnectStrategy: (attempt) => Math.min(attempt * 200, 5000) },
  });
  let lastError = 0;
  c.on('error', (err) => {
    // One line per 30 s at most while Redis is unreachable
    if (Date.now() - lastError > 30000) { lastError = Date.now(); console.error(`[redis:${name}] ${err.message}`); }
  });
  return c;
};

/** The shared client (null without REDIS_URL). Commands sent before it connects wait in a queue. */
export const redis = REDIS_URL ? make('main') : null;
if (redis) redis.connect().catch(() => { /* logged by the error handler; retries on its own */ });

/** A separate connection for subscribing (a subscribed connection can't send other commands). */
export const redisSubscriber = async (name) => {
  if (!REDIS_URL) return null;
  const c = make(name);
  await c.connect();
  return c;
};

export default redis;
