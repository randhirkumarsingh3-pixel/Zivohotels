/**
 * Extranet → Performance → Monthly report: a property's month, by room type, against the month
 * before. From bookings and inventory as they are:
 *
 *  sold        room nights of stays in the month (confirmed, checked in or completed; a room
 *              cancelled on its own is left out)
 *  supply      room nights on sale: the room type's rooms each night (the day's inventory row when
 *              there is one; stop-sell nights count as none)
 *  occupancy   sold / supply
 *  revenue     room revenue before GST, after discounts (the booking's base amount, shared between
 *              its rooms by their price and spread over the nights), for the nights in the month
 *  ADR, RevPAR revenue per room night sold, and per room night on sale
 *  cancelled   bookings for the month cancelled (and rooms cancelled on their own), with their
 *              room nights; rate = cancelled / (sold + cancelled) room nights
 *  pace        room nights on the books for the month today, against the month before at the same
 *              number of days before it started (how bookings are coming in)
 * Hourly stays are counted separately (no room nights).
 */
import prisma from '../config/db.js';

const DAY = 86400000;
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const KEPT = ['CONFIRMED', 'CHECKED_IN', 'COMPLETED'];
const dayOf = (d) => new Date(d).toISOString().slice(0, 10);

export const monthBounds = (month) => {
  const m = /^(\d{4})-(\d{2})$/.exec(String(month || ''));
  const now = new Date(Date.now() + 5.5 * 3600000);
  const y = m ? Number(m[1]) : now.getUTCFullYear();
  const mo = m ? Number(m[2]) - 1 : now.getUTCMonth();
  if (mo < 0 || mo > 11) throw Object.assign(new Error('Choose a month like 2026-11.'), { statusCode: 400 });
  const start = new Date(Date.UTC(y, mo, 1));
  const end = new Date(Date.UTC(y, mo + 1, 1));
  return { key: `${y}-${String(mo + 1).padStart(2, '0')}`, start, end, days: Math.round((end - start) / DAY) };
};
const previousMonth = (b) => monthBounds(dayOf(new Date(b.start.getTime() - DAY)).slice(0, 7));

/** Nights of a stay that fall in [start, end), as YYYY-MM-DD. */
const nightsIn = (checkIn, checkOut, start, end) => {
  const out = [];
  for (let t = Math.max(new Date(`${dayOf(checkIn)}T00:00:00Z`).getTime(), start.getTime()); t < Math.min(new Date(`${dayOf(checkOut)}T00:00:00Z`).getTime(), end.getTime()); t += DAY) out.push(dayOf(t));
  return out;
};

/** A booking's rooms with their share of its pre-GST revenue: [{ roomTypeId, share, cancelledAt }]. */
const unitsOf = (b) => {
  const base = Number(b.baseAmount || 0) || Number(b.totalAmount || 0) - Number(b.taxAmount || 0);
  if (b.bookingRooms?.length) {
    const sum = b.bookingRooms.reduce((s, r) => s + Number(r.subtotal || 0), 0);
    return b.bookingRooms.map((r) => ({ roomTypeId: r.roomTypeId, cancelledAt: r.cancelledAt, share: sum > 0 ? (base * Number(r.subtotal || 0)) / sum : base / b.bookingRooms.length }));
  }
  const n = Math.max(1, b.rooms || 1);
  return Array.from({ length: n }, () => ({ roomTypeId: b.roomTypeId, cancelledAt: null, share: base / n }));
};

const loadBookings = (hotelId, start, end) => prisma.booking.findMany({
  where: { hotelId, status: { not: 'PENDING' }, checkIn: { lt: end }, checkOut: { gt: start } },
  select: {
    id: true, status: true, stayType: true, rooms: true, roomTypeId: true, checkIn: true, checkOut: true, createdAt: true, cancelledAt: true,
    baseAmount: true, totalAmount: true, taxAmount: true,
    bookingRooms: { select: { roomTypeId: true, subtotal: true, cancelledAt: true } },
  },
});

/** Sold room nights per room type for the month, counting only what was booked (and not yet cancelled) at `asOf`. */
const onTheBooks = (bookings, b, asOf) => {
  const by = {};
  for (const bk of bookings) {
    if (bk.stayType === 'HOURLY' || new Date(bk.createdAt) > asOf) continue;
    const cancelledBy = bk.cancelledAt && new Date(bk.cancelledAt) <= asOf;
    if (cancelledBy || !(KEPT.includes(bk.status) || (bk.status === 'CANCELLED' && bk.cancelledAt && new Date(bk.cancelledAt) > asOf))) continue;
    const n = nightsIn(bk.checkIn, bk.checkOut, b.start, b.end).length;
    for (const u of unitsOf(bk)) if (!(u.cancelledAt && new Date(u.cancelledAt) <= asOf)) by[u.roomTypeId] = (by[u.roomTypeId] || 0) + n;
  }
  return by;
};

const monthFigures = async (hotelId, roomTypes, b) => {
  const [bookings, inventory] = await Promise.all([
    loadBookings(hotelId, b.start, b.end),
    prisma.inventory.findMany({ where: { roomTypeId: { in: roomTypes.map((r) => r.id) }, date: { gte: b.start, lt: b.end } }, select: { roomTypeId: true, date: true, totalRooms: true, stopSell: true } }),
  ]);
  const inv = new Map(inventory.map((i) => [`${i.roomTypeId}|${dayOf(i.date)}`, i]));
  const rows = Object.fromEntries(roomTypes.map((rt) => [rt.id, { roomTypeId: rt.id, name: rt.name, sold: 0, supply: 0, revenue: 0, cancellations: 0, cancelledNights: 0 }]));
  const daily = {};
  for (let t = b.start.getTime(); t < b.end.getTime(); t += DAY) {
    const d = dayOf(t); daily[d] = { date: d, sold: 0, supply: 0 };
    for (const rt of roomTypes) {
      const row = inv.get(`${rt.id}|${d}`);
      const supply = row ? (row.stopSell ? 0 : Number(row.totalRooms || 0)) : Number(rt.totalInventory || 0);
      rows[rt.id].supply += supply; daily[d].supply += supply;
    }
  }
  let hourly = { stays: 0, revenue: 0 };
  for (const bk of bookings) {
    if (bk.stayType === 'HOURLY') {
      if (KEPT.includes(bk.status) && dayOf(bk.checkIn) >= dayOf(b.start) && dayOf(bk.checkIn) < dayOf(b.end)) hourly = { stays: hourly.stays + 1, revenue: hourly.revenue + Number(bk.baseAmount || 0) };
      continue;
    }
    const nights = nightsIn(bk.checkIn, bk.checkOut, b.start, b.end);
    const totalNights = Math.max(1, Math.round((new Date(`${dayOf(bk.checkOut)}T00:00:00Z`) - new Date(`${dayOf(bk.checkIn)}T00:00:00Z`)) / DAY));
    for (const u of unitsOf(bk)) {
      const row = rows[u.roomTypeId] || (rows[u.roomTypeId] = { roomTypeId: u.roomTypeId, name: 'Room type no longer offered', sold: 0, supply: 0, revenue: 0, cancellations: 0, cancelledNights: 0 });
      if (bk.status === 'CANCELLED' || u.cancelledAt) {
        row.cancellations += 1; row.cancelledNights += nights.length;
      } else if (KEPT.includes(bk.status)) {
        row.sold += nights.length;
        row.revenue += (u.share / totalNights) * nights.length;
        for (const d of nights) if (daily[d]) daily[d].sold += 1;
      }
    }
  }
  const finish = (r) => ({
    ...r, revenue: Math.round(r.revenue), occupancy: pct(r.sold, r.supply),
    adr: r.sold ? Math.round(r.revenue / r.sold) : null, revpar: r.supply ? Math.round(r.revenue / r.supply) : null,
    cancellationRate: pct(r.cancelledNights, r.sold + r.cancelledNights),
  });
  const list = Object.values(rows).map(finish);
  const total = finish(list.reduce((t, r) => ({ ...t, sold: t.sold + r.sold, supply: t.supply + r.supply, revenue: t.revenue + r.revenue, cancellations: t.cancellations + r.cancellations, cancelledNights: t.cancelledNights + r.cancelledNights }), { roomTypeId: null, name: 'All room types', sold: 0, supply: 0, revenue: 0, cancellations: 0, cancelledNights: 0 }));
  return {
    month: b.key, byRoomType: list, total, hourly: { stays: hourly.stays, revenue: Math.round(hourly.revenue) },
    daily: Object.values(daily).map((d) => ({ ...d, occupancy: pct(d.sold, d.supply) })), bookings,
  };
};

const change = (now, before) => (now == null || before == null || before === 0 ? null : Math.round(((now - before) / Math.abs(before)) * 1000) / 10);

/** The month's report against the month before; month 'YYYY-MM' (default: this month). */
export const monthlyReport = async (hotelId, month) => {
  const b = monthBounds(month);
  const p = previousMonth(b);
  const roomTypes = await prisma.roomType.findMany({ where: { hotelId }, select: { id: true, name: true, totalInventory: true, isActive: true }, orderBy: { name: 'asc' } });
  const active = roomTypes.filter((r) => r.isActive !== false);
  const [cur, prev] = await Promise.all([monthFigures(hotelId, active, b), monthFigures(hotelId, active, p)]);

  // Pace: on the books now vs the month before at the same point (days before it started)
  const now = new Date();
  const lead = b.start.getTime() - now.getTime();
  const prevAsOf = new Date(p.start.getTime() - lead);
  const paceNow = onTheBooks(cur.bookings, b, now);
  const pacePrev = onTheBooks(prev.bookings, p, prevAsOf < now ? prevAsOf : now);
  const sum = (o) => Object.values(o).reduce((s, n) => s + n, 0);
  const prevById = Object.fromEntries(prev.byRoomType.map((r) => [r.roomTypeId, r]));
  const metrics = ['sold', 'supply', 'occupancy', 'revenue', 'adr', 'revpar', 'cancellations', 'cancellationRate'];
  const withChange = (r, pr) => ({ ...r, previous: pr ? Object.fromEntries(metrics.map((k) => [k, pr[k]])) : null, change: pr ? Object.fromEntries(metrics.map((k) => [k, change(r[k], pr[k])])) : null });
  return {
    month: b.key, previousMonth: p.key,
    status: now >= b.end ? 'PAST' : now >= b.start ? 'CURRENT' : 'FUTURE',
    total: withChange(cur.total, prev.total),
    byRoomType: cur.byRoomType.map((r) => withChange(r, prevById[r.roomTypeId])),
    hourly: { ...cur.hourly, previous: prev.hourly },
    pace: {
      asOf: now.toISOString(), daysBefore: Math.round(lead / DAY),
      onTheBooks: sum(paceNow), previousAtSamePoint: sum(pacePrev), change: change(sum(paceNow), sum(pacePrev)),
      byRoomType: active.map((rt) => ({ roomTypeId: rt.id, name: rt.name, onTheBooks: paceNow[rt.id] || 0, previousAtSamePoint: pacePrev[rt.id] || 0 })),
    },
    daily: cur.daily,
  };
};

/** The same as a CSV (one row per room type, then the total). */
export const monthlyReportCsv = (r) => {
  const head = ['Room type', 'Room nights sold', `Sold ${r.previousMonth}`, 'Room nights on sale', 'Occupancy %', `Occupancy % ${r.previousMonth}`, 'Revenue before GST', `Revenue ${r.previousMonth}`, 'ADR', 'RevPAR', 'Cancellations', 'Cancellation rate %', 'On the books now', `${r.previousMonth} at the same point`];
  const cell = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const pace = Object.fromEntries(r.pace.byRoomType.map((p) => [p.roomTypeId, p]));
  const line = (x, p) => [x.name, x.sold, x.previous?.sold, x.supply, x.occupancy, x.previous?.occupancy, x.revenue, x.previous?.revenue, x.adr, x.revpar, x.cancellations, x.cancellationRate, p?.onTheBooks, p?.previousAtSamePoint].map(cell).join(',');
  return [head.join(','), ...r.byRoomType.map((x) => line(x, pace[x.roomTypeId])), line(r.total, { onTheBooks: r.pace.onTheBooks, previousAtSamePoint: r.pace.previousAtSamePoint })].join('\n');
};

export default { monthlyReport, monthlyReportCsv, monthBounds };
