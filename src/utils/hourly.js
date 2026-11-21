/** Hourly stays on the website: search values, defaults and links. Times are India time. */
export const HOURLY_DURATIONS = [3, 6, 9, 12];
export const HOURLY_STARTS = Array.from({ length: 31 }, (_, i) => 6 * 60 + i * 30).map((m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${m % 60 ? '30' : '00'}`);

export const todayIst = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
export const timeLabel = (hhmm) => new Date(`2000-01-01T${hhmm}:00`).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

/** Next half hour at least 1 hour from now (India time), within 06:00–21:00; else tomorrow 10:00. */
export const defaultHourly = () => {
  const now = new Date(Date.now() + 330 * 60000);
  let m = Math.ceil((now.getUTCHours() * 60 + now.getUTCMinutes() + 60) / 30) * 30;
  let date = todayIst();
  if (m > 21 * 60) { m = 10 * 60; date = new Date(Date.now() + 330 * 60000 + 86400000).toISOString().slice(0, 10); }
  m = Math.max(m, 6 * 60);
  return { date, start: `${String(Math.floor(m / 60)).padStart(2, '0')}:${m % 60 ? '30' : '00'}`, hours: 3, guests: 2 };
};

/** Hourly search values from a link (?stay=hourly&date=&start=&hours=&guests=), or null. */
export const hourlyFromQuery = (search) => {
  const q = new URLSearchParams(search);
  if (q.get('stay') !== 'hourly') return null;
  const d = defaultHourly();
  return {
    date: /^\d{4}-\d{2}-\d{2}$/.test(q.get('date') || '') ? q.get('date') : d.date,
    start: /^\d{2}:\d{2}$/.test(q.get('start') || '') ? q.get('start') : d.start,
    hours: HOURLY_DURATIONS.includes(Number(q.get('hours'))) ? Number(q.get('hours')) : 3,
    guests: Math.min(4, Math.max(1, Number(q.get('guests')) || 2)),
    city: q.get('city') || '',
  };
};

export const hourlyQuery = (h, extra = {}) => new URLSearchParams({ stay: 'hourly', date: h.date, start: h.start, hours: String(h.hours), guests: String(h.guests), ...extra }).toString();
