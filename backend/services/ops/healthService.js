/**
 * Admin → System health: live checks, each with a plain status (ok / warn / down) and what to do.
 * Everything here is measured when the page asks; nothing is estimated.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import prisma from '../../config/db.js';
import redis, { REDIS_URL } from '../../config/redis.js';
import { readMinutes, readRoutes, readProcesses, percentile } from './metrics.js';
import { readSwitches, SWITCHES } from './controlService.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const timed = async (fn) => { const t = process.hrtime.bigint(); const value = await fn(); return { value, ms: Number(process.hrtime.bigint() - t) / 1e6 }; };
const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

const database = async () => {
  try {
    const ping = await timed(() => prisma.$queryRaw`SELECT 1`);
    const [[size], [conns]] = await Promise.all([
      prisma.$queryRaw`SELECT pg_database_size(current_database())::bigint AS bytes`,
      prisma.$queryRaw`SELECT count(*)::int AS total, count(*) FILTER (WHERE state = 'active')::int AS active FROM pg_stat_activity WHERE datname = current_database()`,
    ]);
    const ms = round(ping.ms);
    return {
      status: ms > 200 ? 'warn' : 'ok', latencyMs: ms,
      sizeMb: Math.round(Number(size.bytes) / 1048576), connections: conns.total, activeQueries: conns.active,
      note: ms > 200 ? 'The database is answering slowly. Check the server\'s CPU and disk.' : 'Answering normally.',
    };
  } catch (e) {
    return { status: 'down', note: `Can't reach the database: ${e.message.slice(0, 120)}` };
  }
};

const cache = async () => {
  if (!REDIS_URL) return { status: 'warn', configured: false, note: 'Redis isn\'t set up (REDIS_URL). Fine on one server process; needed with several.' };
  if (!redis?.isReady) return { status: 'down', configured: true, note: 'Redis is set up but not connected. Rate limits and live updates fall back to each process.' };
  try {
    const ping = await timed(() => redis.ping());
    const info = await redis.info('memory');
    const used = Number((info.match(/used_memory:(\d+)/) || [])[1] || 0);
    return { status: ping.ms > 50 ? 'warn' : 'ok', configured: true, latencyMs: round(ping.ms), memoryMb: round(used / 1048576), note: 'Connected.' };
  } catch (e) {
    return { status: 'down', configured: true, note: `Redis error: ${e.message.slice(0, 120)}` };
  }
};

const queue = async () => {
  const dayAgo = new Date(Date.now() - 86400000);
  const [byStatus, oldest, failed, lastDone] = await Promise.all([
    prisma.backgroundJob.groupBy({ by: ['queue', 'status'], _count: { _all: true }, where: { OR: [{ status: { in: ['PENDING', 'RETRY', 'PROCESSING'] } }, { updatedAt: { gte: dayAgo } }] } }),
    prisma.backgroundJob.findFirst({ where: { status: { in: ['PENDING', 'RETRY'] }, runAt: { lte: new Date() } }, orderBy: { runAt: 'asc' }, select: { runAt: true, queue: true, jobType: true } }),
    prisma.backgroundJob.findMany({ where: { status: 'FAILED', updatedAt: { gte: dayAgo } }, orderBy: { updatedAt: 'desc' }, take: 5, select: { id: true, queue: true, jobType: true, lastError: true, attempts: true, updatedAt: true } }),
    prisma.backgroundJob.findFirst({ where: { status: 'COMPLETED' }, orderBy: { completedAt: 'desc' }, select: { completedAt: true, queue: true } }),
  ]);
  const queues = {};
  byStatus.forEach((r) => { (queues[r.queue] ||= {})[r.status] = r._count._all; });
  const waitingMin = oldest ? Math.round((Date.now() - new Date(oldest.runAt).getTime()) / 60000) : 0;
  const failed24h = byStatus.filter((r) => r.status === 'FAILED').reduce((n, r) => n + r._count._all, 0);
  const status = waitingMin > 15 ? 'down' : waitingMin > 5 || failed24h > 0 ? 'warn' : 'ok';
  return {
    status, queues, waitingMin, failed24h, failed, lastCompletedAt: lastDone?.completedAt || null,
    note: waitingMin > 5 ? `Emails and other jobs have waited ${waitingMin} min. Check that the jobs process is running.` : failed24h ? `${failed24h} job${failed24h === 1 ? '' : 's'} failed in the last 24 hours (see below).` : 'Jobs are going out on time.',
  };
};

const invoices = async () => {
  const hourAgo = new Date(Date.now() - 3600000);
  const missing = await prisma.invoice.count({ where: { pdfUrl: null, createdAt: { lt: hourAgo } } });
  return { status: missing > 0 ? 'warn' : 'ok', missingPdf: missing, note: missing ? `${missing} invoice${missing === 1 ? ' has' : 's have'} no PDF after an hour. The 10-minute catch-up job retries them.` : 'Every invoice has its PDF.' };
};

const disk = async () => {
  try {
    const dir = path.join(here, '../../public/uploads');
    const target = fs.existsSync(dir) ? dir : '/';
    const s = await fs.promises.statfs(target);
    const totalGb = (s.blocks * s.bsize) / 1073741824;
    const freeGb = (s.bavail * s.bsize) / 1073741824;
    const usedPct = totalGb ? Math.round(((totalGb - freeGb) / totalGb) * 100) : 0;
    return { status: usedPct >= 90 ? 'down' : usedPct >= 80 ? 'warn' : 'ok', totalGb: round(totalGb), freeGb: round(freeGb), usedPct, note: usedPct >= 80 ? 'Disk is filling up. Remove old logs or backups, or add space.' : 'Plenty of space.' };
  } catch {
    return { status: 'warn', note: 'Disk space can\'t be read on this server.' };
  }
};

const traffic = async () => {
  const rows = await readMinutes(60);
  const last15 = rows.slice(-15);
  const sum = (arr, k) => arr.reduce((n, r) => n + (r[k] || 0), 0);
  const all = { n: sum(rows, 'n'), e5: sum(rows, 'e5'), e4: sum(rows, 'e4'), ms: sum(rows, 'ms') };
  const recent = { n: sum(last15, 'n'), e5: sum(last15, 'e5') };
  const buckets = ['b0', 'b1', 'b2', 'b3', 'b4'].reduce((o, k) => ({ ...o, [k]: sum(rows, k) }), {});
  const errorPct = recent.n ? round((recent.e5 / recent.n) * 100, 2) : 0;
  const p95 = percentile(buckets, 0.95);
  const status = errorPct >= 5 ? 'down' : errorPct >= 1 || (p95 && p95 >= 3000) ? 'warn' : 'ok';
  const routes = await readRoutes();
  return {
    status,
    requestsPerMin: round(all.n / 60), requests60m: all.n, errors5xx60m: all.e5, errors4xx60m: all.e4,
    errorPct15m: errorPct, avgMs: all.n ? Math.round(all.ms / all.n) : null, p50Ms: percentile(buckets, 0.5), p95Ms: p95,
    series: rows.map((r) => ({ minute: r.minute, requests: r.n, errors: r.e5, avgMs: r.n ? Math.round(r.ms / r.n) : null })),
    slowest: [...routes].filter((r) => r.requests >= 3).sort((a, b) => b.avgMs - a.avgMs).slice(0, 8),
    failing: [...routes].filter((r) => r.errors > 0).sort((a, b) => b.errors - a.errors).slice(0, 8),
    note: errorPct >= 1 ? `${errorPct}% of requests failed with a server error in the last 15 minutes. See the failing routes below and the server logs.` : p95 && p95 >= 3000 ? 'Some pages take over 3 seconds. See the slowest routes.' : 'Fast and error-free.',
  };
};

const processes = async () => {
  const list = await readProcesses();
  const jobs = list.filter((p) => p.runsJobs);
  const heavy = list.filter((p) => p.loopDelayMs > 100 || p.rssMb > 1500);
  return {
    status: !jobs.length ? 'warn' : heavy.length ? 'warn' : 'ok', list,
    note: !jobs.length ? 'No process is running the timed jobs (emails, invoice catch-up, unpaid-booking release). Restart the API.' : heavy.length ? 'A server process is busy or using a lot of memory.' : `${list.length} server process${list.length === 1 ? '' : 'es'} running; one runs the timed jobs.`,
  };
};

const switches = async () => {
  const { values } = await readSwitches();
  const active = Object.entries(values).filter(([k, v]) => (SWITCHES[k].default ? !v : v)).map(([k]) => SWITCHES[k].label);
  const blocking = values.maintenanceMode || values.isBookingDisabled || values.isPaymentDisabled;
  return { status: blocking ? 'warn' : 'ok', active, note: active.length ? `Switched in System control: ${active.join(', ')}.` : 'All switches are in their normal position.' };
};

export const healthReport = async () => {
  const [db, redisCheck, q, inv, dsk, trf, procs, sw] = await Promise.all([
    database(), cache(), queue(), invoices(), disk(), traffic(), processes(), switches(),
  ]);
  const checks = { database: db, redis: redisCheck, jobs: q, invoices: inv, disk: dsk, traffic: trf, processes: procs, switches: sw };
  const states = Object.values(checks).map((c) => c.status);
  const overall = states.includes('down') ? 'down' : states.includes('warn') ? 'warn' : 'ok';
  return { overall, checkedAt: new Date().toISOString(), version: process.env.APP_VERSION || process.env.GIT_SHA || null, nodeVersion: process.version, checks };
};

export default { healthReport };
