/**
 * Records guest searches (SearchLog) without slowing the search down: rows are queued in memory
 * and written in one insert every few seconds. The same search in the same visit within 30
 * minutes (changing filters, sorting, the next page) counts once.
 */
import prisma from '../../config/db.js';
import redis from '../../config/redis.js';

const queue = [];
const seen = new Map(); // dedupe without Redis: key -> expiry
const WINDOW_SEC = 30 * 60;
let timer = null;

const flush = async () => {
  timer = null;
  if (!queue.length) return;
  const rows = queue.splice(0, queue.length);
  await prisma.searchLog.createMany({ data: rows }).catch((e) => console.error('[SearchLog] write failed:', e.message));
};

const firstTime = async (key) => {
  if (redis?.isReady) {
    const ok = await redis.set(`slog:${key}`, '1', { NX: true, EX: WINDOW_SEC }).catch(() => 'OK');
    return ok === 'OK';
  }
  const now = Date.now();
  if (seen.size > 20000) for (const [k, t] of seen) if (t < now) seen.delete(k);
  if ((seen.get(key) || 0) > now) return false;
  seen.set(key, now + WINDOW_SEC * 1000);
  return true;
};

/**
 * place: city/area typed, or 'Near me'; checkIn 'YYYY-MM-DD'; results: hotels that can be booked.
 */
export const logSearch = async ({ sessionId, userId, place, checkIn, nights, guests, rooms, results, hourly = false }) => {
  try {
    if (!place || !checkIn) return;
    const sid = sessionId && sessionId !== 'anonymous' ? String(sessionId).slice(0, 64) : null;
    const day = new Date(`${String(checkIn).slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(day.getTime())) return;
    const cleanPlace = String(place).trim().slice(0, 80);
    const key = `${sid || userId || 'x'}|${cleanPlace.toLowerCase()}|${day.toISOString().slice(0, 10)}|${nights}|${guests}|${rooms}|${hourly ? 1 : 0}`;
    if ((sid || userId) && !(await firstTime(key))) return;
    queue.push({
      sessionId: sid, userId: userId || null, place: cleanPlace, checkIn: day,
      nights: Math.max(0, Math.min(60, Number(nights) || 0)), guests: Math.max(1, Math.min(40, Number(guests) || 1)),
      rooms: Math.max(1, Math.min(8, Number(rooms) || 1)), results: Math.max(0, Number(results) || 0), hourly,
    });
    if (queue.length >= 200) await flush();
    else if (!timer) { timer = setTimeout(() => { flush().catch(() => {}); }, 3000); timer.unref?.(); }
  } catch (e) {
    console.error('[SearchLog]', e.message);
  }
};

/** Write anything still queued (tests, shutdown). */
export const flushSearchLog = flush;

export default { logSearch, flushSearchLog };
