/**
 * Request metrics for Admin → System health: requests, errors and response times per minute,
 * and the slowest API routes. Each server process counts in memory and adds its counts to Redis
 * every 10 seconds, so the page shows all processes together (without Redis: this process only).
 * Kept for 2 hours.
 */
import os from 'os';
import cluster from 'cluster';
import { monitorEventLoopDelay } from 'perf_hooks';
import redis from '../../config/redis.js';

const KEEP_MINUTES = 120;
const BUCKETS = [100, 300, 1000, 3000]; // ms: <100, <300, <1s, <3s, 3s+
const minuteOf = (t = Date.now()) => Math.floor(t / 60000);

// In-process store (also the only store without Redis)
const local = new Map(); // minute -> { n, e5, e4, ms, b0..b4 }
const routes = new Map(); // "GET /api/v1/x/:id" -> { n, ms, max, e5 }
let pending = { minutes: new Map(), routes: new Map() };

const bucketOf = (ms) => { const i = BUCKETS.findIndex((b) => ms < b); return i === -1 ? BUCKETS.length : i; };
const add = (map, key, fields) => {
  const cur = map.get(key) || {};
  for (const [k, v] of Object.entries(fields)) cur[k] = k === 'max' ? Math.max(cur[k] || 0, v) : (cur[k] || 0) + v;
  map.set(key, cur);
};

/** "/api/v1/hotels/3f2a…/rooms?x=1" -> "/api/v1/hotels/:id/rooms" */
export const routeOf = (url) => (url || '').split('?')[0]
  .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
  .replace(/\/[a-z0-9-]+-[0-9a-f]{8}(?=\/|$)/gi, '/:slug')
  .replace(/\/\d+(?=\/|$)/g, '/:n')
  .replace(/\/[A-Z0-9]{8,}(?=\/|$)/g, '/:ref');

export const record = (method, url, status, ms) => {
  if (!url || !url.startsWith('/api/')) return;
  const m = minuteOf();
  const f = { n: 1, ms, [`b${bucketOf(ms)}`]: 1, ...(status >= 500 ? { e5: 1 } : status >= 400 ? { e4: 1 } : {}) };
  add(local, m, f);
  add(pending.minutes, m, f);
  const r = `${method} ${routeOf(url)}`;
  const rf = { n: 1, ms, max: ms, ...(status >= 500 ? { e5: 1 } : {}) };
  if (routes.size < 500 || routes.has(r)) add(routes, r, rf);
  add(pending.routes, r, rf);
  // forget old minutes
  if (local.size > KEEP_MINUTES + 5) for (const k of local.keys()) if (k < m - KEEP_MINUTES) local.delete(k);
};

const flush = async () => {
  if (!redis?.isReady) { pending = { minutes: new Map(), routes: new Map() }; return; }
  const { minutes, routes: rts } = pending;
  pending = { minutes: new Map(), routes: new Map() };
  if (!minutes.size && !rts.size) return;
  const multi = redis.multi();
  for (const [m, f] of minutes) {
    const key = `metrics:m:${m}`;
    for (const [k, v] of Object.entries(f)) multi.hIncrBy(key, k, Math.round(v));
    multi.expire(key, KEEP_MINUTES * 60);
  }
  const hour = Math.floor(Date.now() / 3600000);
  for (const [r, f] of rts) {
    const key = `metrics:r:${hour}`;
    multi.hIncrBy(key, `${r}|n`, f.n); multi.hIncrBy(key, `${r}|ms`, Math.round(f.ms));
    if (f.e5) multi.hIncrBy(key, `${r}|e5`, f.e5);
    multi.expire(key, 3 * 3600);
  }
  await multi.exec().catch(() => {});
};

// Process heartbeat: what each server process is doing (memory, uptime, event-loop delay)
const loop = monitorEventLoopDelay({ resolution: 20 });
loop.enable();
const procKey = `metrics:proc:${os.hostname()}:${process.pid}`;
export const processInfo = () => {
  const mem = process.memoryUsage();
  return {
    id: `${os.hostname()}:${process.pid}`,
    worker: cluster.isWorker ? cluster.worker.id : 0,
    runsJobs: process.env.RUN_JOBS !== 'false',
    uptimeSec: Math.round(process.uptime()),
    rssMb: Math.round(mem.rss / 1048576),
    heapMb: Math.round(mem.heapUsed / 1048576),
    loopDelayMs: Math.round(loop.mean / 1e6),
    at: Date.now(),
  };
};
const beat = async () => {
  if (!redis?.isReady) return;
  await redis.set(procKey, JSON.stringify(processInfo()), { EX: 45 }).catch(() => {});
  loop.reset();
};

let started = false;
export const startMetrics = () => {
  if (started || process.env.NODE_ENV === 'test') return;
  started = true;
  const t1 = setInterval(() => { flush().catch(() => {}); }, 10000); t1.unref?.();
  const t2 = setInterval(() => { beat().catch(() => {}); }, 15000); t2.unref?.();
  beat().catch(() => {});
};

/** Per-minute totals for the last `minutes` minutes (all processes when Redis is there). */
export const readMinutes = async (minutes = 60) => {
  const now = minuteOf();
  const keys = Array.from({ length: minutes }, (_, i) => now - minutes + 1 + i);
  let rows;
  if (redis?.isReady) {
    await flush();
    const multi = redis.multi();
    keys.forEach((m) => multi.hGetAll(`metrics:m:${m}`));
    const res = await multi.exec().catch(() => null);
    rows = res ? res.map((h) => Object.fromEntries(Object.entries(h || {}).map(([k, v]) => [k, Number(v)]))) : keys.map((m) => local.get(m) || {});
  } else {
    rows = keys.map((m) => local.get(m) || {});
  }
  return keys.map((m, i) => ({ minute: new Date(m * 60000).toISOString(), ...{ n: 0, e5: 0, e4: 0, ms: 0, b0: 0, b1: 0, b2: 0, b3: 0, b4: 0 }, ...rows[i] }));
};

/** Slowest and busiest routes over the last ~2 hours. */
export const readRoutes = async () => {
  const merged = new Map();
  if (redis?.isReady) {
    const hour = Math.floor(Date.now() / 3600000);
    for (const h of [hour - 1, hour]) {
      const data = await redis.hGetAll(`metrics:r:${h}`).catch(() => ({}));
      for (const [field, v] of Object.entries(data || {})) {
        const i = field.lastIndexOf('|');
        add(merged, field.slice(0, i), { [field.slice(i + 1)]: Number(v) });
      }
    }
  }
  if (!merged.size) for (const [r, f] of routes) merged.set(r, { ...f });
  return [...merged.entries()].filter(([, f]) => f.n > 0)
    .map(([route, f]) => ({ route, requests: f.n, avgMs: Math.round(f.ms / f.n), errors: f.e5 || 0 }));
};

/** All live server processes (heartbeats in the last 45 s), or just this one without Redis. */
export const readProcesses = async () => {
  if (!redis?.isReady) return [processInfo()];
  const keys = [];
  for await (const k of redis.scanIterator({ MATCH: 'metrics:proc:*', COUNT: 100 })) keys.push(...(Array.isArray(k) ? k : [k]));
  if (!keys.length) return [processInfo()];
  const vals = await redis.mGet(keys);
  return vals.filter(Boolean).map((v) => JSON.parse(v)).sort((a, b) => a.worker - b.worker);
};

/** p50 / p95 from the bucket counts (upper bound of the bucket the percentile falls in). */
export const percentile = (row, p) => {
  const counts = [row.b0, row.b1, row.b2, row.b3, row.b4].map((x) => x || 0);
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return null;
  let acc = 0;
  for (let i = 0; i < counts.length; i += 1) { acc += counts[i]; if (acc / total >= p) return i < BUCKETS.length ? BUCKETS[i] : 5000; }
  return 5000;
};

export default { record, startMetrics, readMinutes, readRoutes, readProcesses, percentile, routeOf, processInfo };
