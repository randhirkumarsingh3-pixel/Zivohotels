/**
 * Starts the API on several CPU cores.
 *
 * WEB_CONCURRENCY = how many server processes to run (default 1: just server.js, as before).
 * With more than one, every process answers requests on the same port (Node's cluster module
 * shares it), and they share rate limits, live updates and blocked IPs through Redis, so
 * REDIS_URL is required. The first process also runs the timed jobs (emails, releasing unpaid
 * bookings…); the others only answer requests. A process that stops is restarted in its role.
 */
import cluster from 'node:cluster';

const wanted = Math.max(1, Number.parseInt(process.env.WEB_CONCURRENCY || '1', 10) || 1);
const count = wanted > 1 && !process.env.REDIS_URL ? 1 : wanted;

if (cluster.isPrimary && wanted > 1 && count === 1) {
  console.warn(`⚠️  WEB_CONCURRENCY=${wanted} needs REDIS_URL (shared rate limits and live updates); running one process.`);
}

if (count === 1 || !cluster.isPrimary) {
  await import('./server.js');
} else {
  console.log(`🧩 Starting ${count} server processes`);
  const roles = new Map(); // worker id -> runs the timed jobs?
  let stopping = false;

  const start = (runsJobs) => {
    const worker = cluster.fork({ RUN_JOBS: runsJobs ? 'true' : 'false' });
    roles.set(worker.id, runsJobs);
  };

  start(true);
  for (let i = 1; i < count; i += 1) start(false);

  cluster.on('exit', (worker, code, signal) => {
    const runsJobs = roles.get(worker.id);
    roles.delete(worker.id);
    if (stopping) return;
    console.error(`💥 Server process ${worker.process.pid} stopped (${signal || code}); starting a new one`);
    setTimeout(() => start(runsJobs), 1000);
  });

  // Docker stop / restart: let each process finish, then exit
  const stop = (sig) => {
    stopping = true;
    for (const w of Object.values(cluster.workers)) w?.process.kill(sig);
    setTimeout(() => process.exit(0), 10000).unref();
    cluster.on('exit', () => { if (Object.keys(cluster.workers).length === 0) process.exit(0); });
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
}
