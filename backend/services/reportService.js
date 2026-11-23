/**
 * Admin reports, from the real records: bookings, payments (audit log of each successful payment),
 * refunds, cancellations, occupancy (inventory and booked nights), settlements (commission, GST,
 * TCS, TDS and what each hotel is owed, made at check-out), tax and offers.
 *
 * Every report takes the same filters and returns { columns, rows, totals, cards?, truncated }:
 *   from, to       YYYY-MM-DD, inclusive (India time for moments, calendar dates for stay dates)
 *   dateField      which date the range applies to (each report lists its choices)
 *   hotelId, city, status, stayType (NIGHTLY|HOURLY), paymentType
 *   groupBy        none | day | week | month | property | city | status (numbers are added up)
 * Column types: text, date, datetime, money, int, pct. Totals add up money and int columns;
 * percentages and averages are worked out again from the totals.
 */
import prisma from '../config/db.js';

const n = (v) => (v === null || v === undefined ? 0 : Number(v));
const r2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const IST = 330 * 60000;
const ROW_LIMIT = 20000;

const STATUS = { PENDING: 'Awaiting payment', CONFIRMED: 'Confirmed', CHECKED_IN: 'Checked in', COMPLETED: 'Checked out', CANCELLED: 'Cancelled', NO_SHOW: 'No-show' };
const PAYMENT = { PREPAID: 'Paid online', PARTIAL: 'Part paid online', PAY_AT_HOTEL: 'Pay at hotel' };

const ymd = (d) => new Date(d).toISOString().slice(0, 10);
const thisMonth = () => {
  const now = new Date(Date.now() + IST);
  return { from: `${now.toISOString().slice(0, 7)}-01`, to: ymd(now) };
};

/** Moments (createdAt …): from 00:00 to 24:00 India time. */
const momentRange = (from, to) => ({ gte: new Date(new Date(`${from}T00:00:00Z`).getTime() - IST), lt: new Date(new Date(`${to}T00:00:00Z`).getTime() + 86400000 - IST) });
/** Calendar dates (check-in …), stored at midnight UTC. */
const dateRange = (from, to) => ({ gte: new Date(`${from}T00:00:00Z`), lt: new Date(new Date(`${to}T00:00:00Z`).getTime() + 86400000) });

export const normaliseFilters = (q = {}) => {
  const d = thisMonth();
  const ok = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(s)) ? String(s) : null);
  let from = ok(q.from) || d.from;
  let to = ok(q.to) || d.to;
  if (from > to) [from, to] = [to, from];
  // At most about 2 years in one report
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 731) from = ymd(Date.parse(to) - 731 * 86400000);
  return {
    from, to,
    dateField: String(q.dateField || ''),
    hotelId: q.hotelId ? String(q.hotelId) : null,
    city: q.city ? String(q.city).trim() : null,
    status: q.status ? String(q.status) : null,
    stayType: ['NIGHTLY', 'HOURLY'].includes(q.stayType) ? q.stayType : null,
    paymentType: Object.keys(PAYMENT).includes(q.paymentType) ? q.paymentType : null,
    groupBy: ['none', 'day', 'week', 'month', 'property', 'city', 'status'].includes(q.groupBy) ? q.groupBy : null,
  };
};

const hotelWhere = (f) => ({
  ...(f.hotelId ? { id: f.hotelId } : {}),
  ...(f.city ? { city: { equals: f.city, mode: 'insensitive' } } : {}),
});
const bookingHotel = (f) => (f.hotelId || f.city ? { hotel: hotelWhere(f) } : {});
const stayWhere = (f) => (f.stayType === 'HOURLY' ? { stayType: 'HOURLY' } : f.stayType === 'NIGHTLY' ? { NOT: { stayType: 'HOURLY' } } : {});

const nightsOf = (b) => (b.stayType === 'HOURLY' ? 0 : Math.max(1, Math.round((new Date(b.checkOut) - new Date(b.checkIn)) / 86400000)));
const stayLabel = (b) => (b.stayType === 'HOURLY' ? `Hourly (${b.hours || 0} h)` : 'Nightly');
const hotelSel = { select: { id: true, name: true, city: true, state: true, gstin: true } };

// ─── The reports ───────────────────────────────────────────────────────────────────────────────

const REPORTS = {
  bookings: {
    title: 'Bookings', finance: false,
    dateFields: { booked: 'Booked on', stay: 'Check-in date' },
    statuses: STATUS,
    groupDate: 'date',
    async run(f) {
      const field = f.dateField === 'stay' ? 'checkIn' : 'createdAt';
      const rows = await prisma.booking.findMany({
        where: {
          [field]: field === 'checkIn' ? dateRange(f.from, f.to) : momentRange(f.from, f.to),
          ...bookingHotel(f), ...stayWhere(f),
          ...(f.status ? { status: f.status } : {}),
          ...(f.paymentType ? { paymentType: f.paymentType } : {}),
        },
        orderBy: { [field]: 'asc' }, take: ROW_LIMIT + 1,
        select: { bookingRef: true, createdAt: true, checkIn: true, checkOut: true, stayType: true, hours: true, rooms: true, guestName: true, status: true, paymentType: true, baseAmount: true, taxAmount: true, totalAmount: true, paidAmount: true, remainingAmount: true, refundAmount: true, walletAmount: true, couponCode: true, hotel: hotelSel },
      });
      return {
        columns: [
          { key: 'date', label: field === 'checkIn' ? 'Check-in' : 'Booked on', type: field === 'checkIn' ? 'date' : 'datetime' },
          { key: 'ref', label: 'Booking' }, { key: 'property', label: 'Property' }, { key: 'city', label: 'City' },
          { key: 'guest', label: 'Guest' }, { key: 'stay', label: 'Stay' }, { key: 'checkIn', label: 'Check-in', type: 'date' }, { key: 'checkOut', label: 'Check-out', type: 'date' },
          { key: 'nights', label: 'Nights', type: 'int' }, { key: 'rooms', label: 'Rooms', type: 'int' }, { key: 'status', label: 'Status' }, { key: 'payment', label: 'Payment' },
          { key: 'roomValue', label: 'Room value (before GST)', type: 'money' }, { key: 'gst', label: 'GST', type: 'money' }, { key: 'total', label: 'Total', type: 'money' },
          { key: 'paid', label: 'Paid online', type: 'money' }, { key: 'wallet', label: 'of which Zivo Cash', type: 'money' }, { key: 'due', label: 'Due at hotel', type: 'money' }, { key: 'refunded', label: 'Refunded', type: 'money' },
          { key: 'offer', label: 'Offer code' },
        ],
        rows: rows.map((b) => ({
          date: b[field], ref: b.bookingRef, property: b.hotel?.name, city: b.hotel?.city, guest: b.guestName, stay: stayLabel(b),
          checkIn: b.checkIn, checkOut: b.checkOut, nights: nightsOf(b), rooms: b.rooms, status: STATUS[b.status] || b.status, payment: PAYMENT[b.paymentType] || '',
          roomValue: r2(n(b.baseAmount)), gst: r2(n(b.taxAmount)), total: r2(n(b.totalAmount)), paid: r2(n(b.paidAmount)), wallet: r2(n(b.walletAmount)),
          due: ['CANCELLED', 'NO_SHOW'].includes(b.status) ? 0 : r2(n(b.remainingAmount)), refunded: r2(n(b.refundAmount)), offer: b.couponCode || '',
        })),
      };
    },
  },

  revenue: {
    title: 'Revenue & commission', finance: true,
    dateFields: { checkout: 'Check-out date' },
    groupDate: 'date', defaultGroup: 'property',
    async run(f) {
      const rows = await settlementsFor(f);
      return {
        columns: [
          { key: 'date', label: 'Checked out', type: 'datetime' }, { key: 'ref', label: 'Booking' }, { key: 'property', label: 'Property' }, { key: 'city', label: 'City' },
          { key: 'gross', label: 'Booking value (with GST)', type: 'money' }, { key: 'gst', label: 'GST on room', type: 'money' }, { key: 'roomRevenue', label: 'Room revenue (before GST)', type: 'money' },
          { key: 'commission', label: 'ZivoPlus commission', type: 'money' }, { key: 'rate', label: 'Commission rate', type: 'pct' }, { key: 'commissionGst', label: 'GST on commission', type: 'money' },
          { key: 'tcs', label: 'TCS', type: 'money' }, { key: 'tds', label: 'TDS', type: 'money' }, { key: 'net', label: 'Net payable to hotel', type: 'money' },
        ],
        rows: rows.map((s) => {
          const roomRevenue = r2(n(s.grossAmount) - n(s.taxAmount));
          return {
            date: s.createdAt, ref: s.booking?.bookingRef || '', property: s.hotel?.name, city: s.hotel?.city,
            gross: r2(n(s.grossAmount)), gst: r2(n(s.taxAmount)), roomRevenue, commission: r2(n(s.commissionAmount)), rate: roomRevenue ? r2((n(s.commissionAmount) / roomRevenue) * 100) : 0,
            commissionGst: r2(n(s.commissionGstAmount)), tcs: r2(n(s.tcsAmount)), tds: r2(n(s.tdsAmount)), net: r2(n(s.netPayable)),
          };
        }),
        derive: (t) => ({ ...t, rate: t.roomRevenue ? r2((t.commission / t.roomRevenue) * 100) : 0 }),
      };
    },
  },

  payments: {
    title: 'Payments received', finance: true,
    dateFields: { paid: 'Payment date' },
    groupDate: 'date',
    async run(f) {
      const logs = await prisma.auditLog.findMany({
        where: { action: { in: ['PAYMENT_SUCCESS', 'WEBHOOK_PAYMENT_CONFIRMED', 'HOURLY_EXTENDED', 'WEBHOOK_PAYMENT_FAILED'] }, entityType: 'BOOKING', createdAt: momentRange(f.from, f.to) },
        orderBy: { createdAt: 'asc' }, take: ROW_LIMIT + 1,
        select: { action: true, entityId: true, createdAt: true, details: true },
      });
      const bookings = await bookingsById(logs.map((l) => l.entityId), f);
      const out = [];
      for (const l of logs) {
        const b = bookings.get(l.entityId);
        if (!b) continue;
        const failed = l.action === 'WEBHOOK_PAYMENT_FAILED';
        const extension = l.action === 'HOURLY_EXTENDED';
        const amount = failed ? 0 : extension ? n(l.details?.amount) : n(l.details?.amountPaid ?? b.paidAmount);
        const wallet = failed || extension ? 0 : Math.min(amount, n(b.walletAmount));
        out.push({
          date: l.createdAt, ref: b.bookingRef, property: b.hotel?.name, city: b.hotel?.city, guest: b.guestName,
          what: failed ? 'Payment failed' : extension ? 'Extra hours' : b.paymentType === 'PARTIAL' ? 'Part payment' : 'Booking payment',
          method: failed ? 'Card / UPI' : wallet >= amount && amount > 0 ? 'Zivo Cash' : 'Razorpay (card / UPI / net banking)',
          gatewayRef: (extension ? l.details?.paymentId : b.razorpayPaymentId) || '',
          amount: r2(amount), wallet: r2(wallet), online: r2(amount - wallet), status: failed ? 'Failed' : 'Received',
          reason: failed ? String(l.details?.error || '') : '',
        });
      }
      // Paid at the hotel: the part guests paid at check-in, recorded when they checked out
      if (!f.paymentType || ['PAY_AT_HOTEL', 'PARTIAL'].includes(f.paymentType)) {
        const atHotel = await prisma.booking.findMany({
          where: { status: 'COMPLETED', paymentType: { in: ['PAY_AT_HOTEL', 'PARTIAL'] }, checkOut: dateRange(f.from, f.to), ...bookingHotel(f), ...stayWhere(f) },
          select: { bookingRef: true, checkOut: true, guestName: true, totalAmount: true, paidAmount: true, hotel: hotelSel }, take: ROW_LIMIT,
        });
        for (const b of atHotel) {
          const amount = r2(n(b.totalAmount) - n(b.paidAmount));
          if (amount <= 0) continue;
          out.push({ date: b.checkOut, ref: b.bookingRef, property: b.hotel?.name, city: b.hotel?.city, guest: b.guestName, what: 'Paid at hotel', method: 'Collected by the hotel', gatewayRef: '', amount, wallet: 0, online: 0, status: 'Received by hotel', reason: '' });
        }
      }
      out.sort((a, b) => new Date(a.date) - new Date(b.date));
      return {
        columns: [
          { key: 'date', label: 'Date', type: 'datetime' }, { key: 'ref', label: 'Booking' }, { key: 'property', label: 'Property' }, { key: 'guest', label: 'Guest' },
          { key: 'what', label: 'For' }, { key: 'method', label: 'Method' }, { key: 'gatewayRef', label: 'Razorpay payment ID' },
          { key: 'amount', label: 'Amount', type: 'money' }, { key: 'wallet', label: 'Zivo Cash', type: 'money' }, { key: 'online', label: 'Card / UPI / bank', type: 'money' },
          { key: 'status', label: 'Status' }, { key: 'reason', label: 'Failure reason' },
        ],
        rows: out,
        statusKey: 'status',
      };
    },
  },

  refunds: {
    title: 'Refunds', finance: true,
    dateFields: { requested: 'Requested on' },
    statuses: { INITIATED: 'In progress', SUCCESS: 'Refunded', FAILED: 'Failed' },
    groupDate: 'date',
    async run(f) {
      const rows = await prisma.refund.findMany({
        where: { createdAt: momentRange(f.from, f.to), ...(f.status ? { status: f.status } : {}), booking: { ...bookingHotel(f), ...stayWhere(f) } },
        orderBy: { createdAt: 'asc' }, take: ROW_LIMIT + 1,
        select: { amount: true, status: true, reason: true, razorpayRefundId: true, retryCount: true, createdAt: true, updatedAt: true, booking: { select: { bookingRef: true, guestName: true, walletAmount: true, totalAmount: true, hotel: hotelSel } } },
      });
      const label = { INITIATED: 'In progress', SUCCESS: 'Refunded', FAILED: 'Failed' };
      return {
        columns: [
          { key: 'date', label: 'Requested', type: 'datetime' }, { key: 'ref', label: 'Booking' }, { key: 'property', label: 'Property' }, { key: 'guest', label: 'Guest' },
          { key: 'bookingTotal', label: 'Booking total', type: 'money' }, { key: 'amount', label: 'Refund', type: 'money' }, { key: 'status', label: 'Status' },
          { key: 'to', label: 'Refunded to' }, { key: 'razorpayRef', label: 'Razorpay refund ID' }, { key: 'updated', label: 'Last update', type: 'datetime' },
          { key: 'days', label: 'Days taken', type: 'int', total: 'avg' }, { key: 'attempts', label: 'Attempts', type: 'int', total: 'none' }, { key: 'reason', label: 'Reason' },
        ],
        rows: rows.map((x) => ({
          date: x.createdAt, ref: x.booking?.bookingRef, property: x.booking?.hotel?.name, guest: x.booking?.guestName, bookingTotal: r2(n(x.booking?.totalAmount)),
          amount: r2(n(x.amount)), status: label[x.status] || x.status,
          to: x.razorpayRefundId ? 'Card / UPI (original method)' : n(x.booking?.walletAmount) > 0 || x.status === 'SUCCESS' ? 'Zivo Cash' : '',
          razorpayRef: x.razorpayRefundId || '', updated: x.updatedAt,
          days: x.status === 'SUCCESS' ? Math.max(0, Math.round((new Date(x.updatedAt) - new Date(x.createdAt)) / 86400000)) : null,
          attempts: x.retryCount + 1, reason: x.reason || '',
        })),
      };
    },
  },

  cancellations: {
    title: 'Cancellations & no-shows', finance: false,
    dateFields: { cancelled: 'Cancelled on', stay: 'Check-in date' },
    statuses: { CANCELLED: 'Cancelled', NO_SHOW: 'No-show' },
    groupDate: 'date', defaultGroup: 'property',
    async run(f) {
      const byStay = f.dateField === 'stay';
      const rows = await prisma.booking.findMany({
        where: {
          status: f.status && ['CANCELLED', 'NO_SHOW'].includes(f.status) ? f.status : { in: ['CANCELLED', 'NO_SHOW'] },
          ...(byStay ? { checkIn: dateRange(f.from, f.to) } : { OR: [{ cancelledAt: momentRange(f.from, f.to) }, { cancelledAt: null, status: 'NO_SHOW', checkIn: dateRange(f.from, f.to) }] }),
          ...bookingHotel(f), ...stayWhere(f), ...(f.paymentType ? { paymentType: f.paymentType } : {}),
        },
        orderBy: { checkIn: 'asc' }, take: ROW_LIMIT + 1,
        select: { bookingRef: true, createdAt: true, cancelledAt: true, checkIn: true, checkOut: true, stayType: true, hours: true, guestName: true, status: true, paymentType: true, totalAmount: true, paidAmount: true, refundAmount: true, hotel: hotelSel },
      });
      return {
        columns: [
          { key: 'date', label: byStay ? 'Check-in' : 'Cancelled on', type: byStay ? 'date' : 'datetime' }, { key: 'ref', label: 'Booking' }, { key: 'property', label: 'Property' }, { key: 'guest', label: 'Guest' },
          { key: 'status', label: 'Status' }, { key: 'stay', label: 'Stay' }, { key: 'checkIn', label: 'Check-in', type: 'date' }, { key: 'leadDays', label: 'Days before check-in', type: 'int', total: 'avg' },
          { key: 'payment', label: 'Payment' }, { key: 'total', label: 'Booking total', type: 'money' }, { key: 'paid', label: 'Paid', type: 'money' },
          { key: 'refunded', label: 'Refunded', type: 'money' }, { key: 'kept', label: 'Charge kept', type: 'money' },
        ],
        rows: rows.map((b) => {
          const when = b.cancelledAt || b.checkIn;
          return {
            date: byStay ? b.checkIn : when, ref: b.bookingRef, property: b.hotel?.name, city: b.hotel?.city, guest: b.guestName, status: STATUS[b.status],
            stay: stayLabel(b), checkIn: b.checkIn, leadDays: b.cancelledAt ? Math.max(0, Math.floor((new Date(b.checkIn) - new Date(b.cancelledAt)) / 86400000)) : 0,
            payment: PAYMENT[b.paymentType] || '', total: r2(n(b.totalAmount)), paid: r2(n(b.paidAmount)), refunded: r2(n(b.refundAmount)),
            kept: r2(Math.max(0, n(b.paidAmount) - n(b.refundAmount))),
          };
        }),
      };
    },
  },

  occupancy: {
    title: 'Occupancy', finance: false,
    dateFields: { stay: 'Stay date' },
    groupDate: 'date', defaultGroup: 'property',
    async run(f) {
      const range = dateRange(f.from, f.to);
      const hotels = await prisma.hotel.findMany({ where: { isDeleted: false, ...hotelWhere(f) }, select: { id: true, name: true, city: true, roomTypes: { where: { isActive: true }, select: { id: true, totalInventory: true } } } });
      const typeHotel = new Map(); const fallback = new Map();
      for (const h of hotels) {
        fallback.set(h.id, h.roomTypes.reduce((s, t) => s + (t.totalInventory || 0), 0));
        for (const t of h.roomTypes) typeHotel.set(t.id, h.id);
      }
      const inventory = await prisma.inventory.findMany({ where: { roomTypeId: { in: [...typeHotel.keys()] }, date: range }, select: { roomTypeId: true, date: true, totalRooms: true, stopSell: true } });
      const cell = new Map(); // `${hotel}|${date}` -> {available, sold, hourly, revenue}
      const at = (hotelId, date) => {
        const k = `${hotelId}|${date}`;
        if (!cell.has(k)) cell.set(k, { hotelId, date, available: null, sold: 0, hourly: 0, revenue: 0 });
        return cell.get(k);
      };
      for (const i of inventory) {
        const c = at(typeHotel.get(i.roomTypeId), ymd(i.date));
        c.available = (c.available || 0) + (i.stopSell ? 0 : i.totalRooms);
      }
      const bookings = await prisma.booking.findMany({
        where: { hotelId: { in: hotels.map((h) => h.id) }, status: { in: ['CONFIRMED', 'CHECKED_IN', 'COMPLETED'] }, checkIn: { lt: range.lt }, checkOut: { gt: range.gte }, ...stayWhere(f) },
        select: { hotelId: true, checkIn: true, checkOut: true, stayType: true, rooms: true, baseAmount: true, bookingRooms: { where: { cancelledAt: null }, select: { id: true } } },
      });
      for (const b of bookings) {
        const rooms = b.bookingRooms.length || b.rooms || 1;
        if (b.stayType === 'HOURLY') {
          const d = ymd(b.checkIn);
          if (d >= f.from && d <= f.to) { const c = at(b.hotelId, d); c.hourly += rooms; c.revenue += n(b.baseAmount); }
          continue;
        }
        const nights = nightsOf(b);
        for (let i = 0; i < nights; i += 1) {
          const d = ymd(new Date(b.checkIn).getTime() + i * 86400000);
          if (d < f.from || d > f.to) continue;
          const c = at(b.hotelId, d); c.sold += rooms; c.revenue += n(b.baseAmount) / nights;
        }
      }
      // Every day in the range for every property (days with no inventory use the room count)
      const names = new Map(hotels.map((h) => [h.id, h]));
      for (const h of hotels) for (let t = Date.parse(f.from); t <= Date.parse(f.to); t += 86400000) at(h.id, ymd(t));
      const rows = [...cell.values()].map((c) => {
        const available = c.available === null ? fallback.get(c.hotelId) || 0 : c.available;
        return deriveOcc({ date: c.date, property: names.get(c.hotelId)?.name, city: names.get(c.hotelId)?.city, available, sold: c.sold, hourly: c.hourly, revenue: r2(c.revenue) });
      }).sort((a, b) => (a.date === b.date ? String(a.property).localeCompare(String(b.property)) : a.date < b.date ? -1 : 1));
      return {
        columns: [
          { key: 'date', label: 'Date', type: 'date' }, { key: 'property', label: 'Property' }, { key: 'city', label: 'City' },
          { key: 'available', label: 'Rooms available', type: 'int' }, { key: 'sold', label: 'Room-nights sold', type: 'int' }, { key: 'occupancy', label: 'Occupancy', type: 'pct' },
          { key: 'hourly', label: 'Hourly stays', type: 'int' }, { key: 'revenue', label: 'Room revenue (before GST)', type: 'money' },
          { key: 'adr', label: 'Average daily rate (ADR)', type: 'money' }, { key: 'revpar', label: 'Revenue per available room (RevPAR)', type: 'money' },
        ],
        rows,
        derive: deriveOcc,
      };
    },
  },

  settlements: {
    title: 'Hotel settlements & payouts', finance: true,
    dateFields: { checkout: 'Check-out date' },
    statuses: { PENDING: 'On hold until payout date', READY: 'Due', PAID: 'Paid' },
    groupDate: 'date', defaultGroup: 'property',
    async run(f) {
      const rows = await settlementsFor(f, f.status ? { status: f.status } : {});
      const now = new Date();
      return {
        columns: [
          { key: 'date', label: 'Checked out', type: 'datetime' }, { key: 'ref', label: 'Booking' }, { key: 'property', label: 'Property' }, { key: 'kind', label: 'Type' },
          { key: 'net', label: 'Net payable to hotel', type: 'money' }, { key: 'onHold', label: 'On hold', type: 'money' }, { key: 'due', label: 'Due now', type: 'money' }, { key: 'paid', label: 'Paid', type: 'money' },
          { key: 'status', label: 'Status' }, { key: 'payoutDate', label: 'Payout date', type: 'date' },
        ],
        rows: rows.map((s) => {
          const net = r2(n(s.netPayable));
          const isDue = s.status === 'READY' || (s.status === 'PENDING' && s.holdUntil && new Date(s.holdUntil) <= now);
          return {
            date: s.createdAt, ref: s.booking?.bookingRef || '', property: s.hotel?.name, city: s.hotel?.city, kind: { STAY: 'Stay', CANCELLATION: 'Cancellation charge', NO_SHOW: 'No-show charge' }[s.kind] || s.kind,
            net, onHold: s.status === 'PENDING' && !isDue ? net : 0, due: s.status !== 'PAID' && isDue ? net : 0, paid: s.status === 'PAID' ? net : 0,
            status: s.status === 'PAID' ? 'Paid' : isDue ? 'Due' : 'On hold', payoutDate: s.status === 'PAID' ? s.payoutDate : s.holdUntil,
          };
        }),
      };
    },
  },

  tax: {
    title: 'Tax (GST, TCS, TDS)', finance: true,
    dateFields: { checkout: 'Check-out date' },
    groupDate: 'month', defaultGroup: 'property',
    async run(f) {
      const rows = await settlementsFor(f);
      return {
        columns: [
          { key: 'month', label: 'Month' }, { key: 'property', label: 'Property' }, { key: 'gstin', label: 'Hotel GSTIN' }, { key: 'state', label: 'Place of supply' },
          { key: 'roomRevenue', label: 'Room revenue (before GST)', type: 'money' }, { key: 'roomGst', label: 'GST on rooms', type: 'money' },
          { key: 'commission', label: 'Commission', type: 'money' }, { key: 'cgst', label: 'CGST on commission', type: 'money' }, { key: 'sgst', label: 'SGST on commission', type: 'money' },
          { key: 'igst', label: 'IGST on commission', type: 'money' }, { key: 'tcs', label: 'TCS (GST s.52)', type: 'money' }, { key: 'tds', label: 'TDS (IT s.194-O)', type: 'money' },
        ],
        rows: rows.map((s) => ({
          date: s.createdAt, month: new Date(new Date(s.createdAt).getTime() + IST).toISOString().slice(0, 7), property: s.hotel?.name, city: s.hotel?.city,
          gstin: s.hotel?.gstin || 'Not registered', state: s.placeOfSupply || s.hotel?.state || '',
          roomRevenue: r2(n(s.grossAmount) - n(s.taxAmount)), roomGst: r2(n(s.taxAmount)), commission: r2(n(s.commissionAmount)),
          cgst: r2(n(s.cgstAmount)), sgst: r2(n(s.sgstAmount)), igst: r2(n(s.igstAmount)), tcs: r2(n(s.tcsAmount)), tds: r2(n(s.tdsAmount)),
        })),
      };
    },
  },

  offers: {
    title: 'Offers & loyalty', finance: false,
    dateFields: { used: 'Used on' },
    groupDate: 'date',
    async run(f) {
      const range = momentRange(f.from, f.to);
      const used = await prisma.promotionRedemption.findMany({
        where: { createdAt: range, ...(f.hotelId ? { hotelId: f.hotelId } : {}) },
        orderBy: { createdAt: 'asc' }, take: ROW_LIMIT + 1,
        select: { createdAt: true, bookingId: true, hotelId: true, discountAmount: true, fundedBy: true, promotion: { select: { name: true, code: true } } },
      });
      const bookings = await bookingsById(used.map((u) => u.bookingId), f);
      const rows = used.filter((u) => bookings.has(u.bookingId)).map((u) => {
        const b = bookings.get(u.bookingId);
        return {
          date: u.createdAt, offer: u.promotion?.name || '', code: u.promotion?.code || 'Automatic', ref: b.bookingRef, property: b.hotel?.name, city: b.hotel?.city,
          bookingValue: r2(n(b.totalAmount)), discount: r2(n(u.discountAmount)), fundedBy: u.fundedBy === 'ZIVO' ? 'ZivoPlus' : 'Hotel',
          zivoFunded: u.fundedBy === 'ZIVO' ? r2(n(u.discountAmount)) : 0, hotelFunded: u.fundedBy === 'ZIVO' ? 0 : r2(n(u.discountAmount)),
        };
      });
      const points = await prisma.loyaltyPoint.groupBy({ by: ['type'], where: { createdAt: range }, _sum: { points: true } });
      const p = Object.fromEntries(points.map((x) => [x.type, Math.abs(n(x._sum.points))]));
      return {
        columns: [
          { key: 'date', label: 'Used on', type: 'datetime' }, { key: 'offer', label: 'Offer' }, { key: 'code', label: 'Code' }, { key: 'ref', label: 'Booking' }, { key: 'property', label: 'Property' },
          { key: 'bookingValue', label: 'Booking total', type: 'money' }, { key: 'discount', label: 'Discount', type: 'money' }, { key: 'fundedBy', label: 'Paid for by' },
          { key: 'zivoFunded', label: 'ZivoPlus-funded', type: 'money' }, { key: 'hotelFunded', label: 'Hotel-funded', type: 'money' },
        ],
        rows,
        cards: [
          { label: 'Zivo Rewards points earned', value: (p.EARN || 0) + (p.BONUS || 0) + (p.WELCOME || 0) + (p.REVIEW || 0), type: 'int' },
          { label: 'Points redeemed', value: p.REDEEM || 0, type: 'int' },
          { label: 'Points expired', value: p.EXPIRE || 0, type: 'int' },
        ],
      };
    },
  },
};

function deriveOcc(r) {
  return { ...r, occupancy: r.available ? r2((r.sold / r.available) * 100) : 0, adr: r.sold ? r2(r.revenue / r.sold) : 0, revpar: r.available ? r2(r.revenue / r.available) : 0 };
}

async function settlementsFor(f, extra = {}) {
  const rows = await prisma.settlement.findMany({
    where: { createdAt: momentRange(f.from, f.to), ...(f.hotelId ? { hotelId: f.hotelId } : {}), ...extra },
    orderBy: { createdAt: 'asc' }, take: ROW_LIMIT + 1,
  });
  const [hotels, bookings] = await Promise.all([
    prisma.hotel.findMany({ where: { id: { in: [...new Set(rows.map((s) => s.hotelId))] }, ...hotelWhere({ city: f.city }) }, select: hotelSel.select }),
    prisma.booking.findMany({ where: { id: { in: rows.map((s) => s.bookingId) } }, select: { id: true, bookingRef: true, stayType: true } }),
  ]);
  const h = new Map(hotels.map((x) => [x.id, x]));
  const b = new Map(bookings.map((x) => [x.id, x]));
  return rows
    .filter((s) => h.has(s.hotelId))
    .filter((s) => !f.stayType || (f.stayType === 'HOURLY') === (b.get(s.bookingId)?.stayType === 'HOURLY'))
    .map((s) => ({ ...s, hotel: h.get(s.hotelId), booking: b.get(s.bookingId) }));
}

async function bookingsById(ids, f) {
  const rows = await prisma.booking.findMany({
    where: { id: { in: [...new Set(ids)] }, ...bookingHotel(f), ...stayWhere(f), ...(f.paymentType ? { paymentType: f.paymentType } : {}) },
    select: { id: true, bookingRef: true, guestName: true, paymentType: true, paidAmount: true, walletAmount: true, totalAmount: true, razorpayPaymentId: true, hotel: hotelSel },
  });
  return new Map(rows.map((b) => [b.id, b]));
}

// ─── Totals and grouping ─────────────────────────────────────────────────────────────────────────

const SUMMED = new Set(['money', 'int']);

const groupKey = (row, by, dateKey) => {
  if (by === 'property') return row.property || '—';
  if (by === 'city') return row.city || '—';
  if (by === 'status') return row.status || '—';
  const raw = row[dateKey] ?? row.date;
  if (by === 'month' && typeof raw === 'string' && /^\d{4}-\d{2}$/.test(raw)) return raw;
  const d = new Date(new Date(raw).getTime() + (typeof raw === 'string' && raw.length === 10 ? 0 : IST));
  if (Number.isNaN(d.getTime())) return '—';
  if (by === 'day') return d.toISOString().slice(0, 10);
  if (by === 'month') return d.toISOString().slice(0, 7);
  // week: the Monday it starts on
  const day = (d.getUTCDay() + 6) % 7;
  return `Week of ${new Date(d.getTime() - day * 86400000).toISOString().slice(0, 10)}`;
};

export const addTotals = (columns, rows, derive) => {
  const t = {};
  for (const c of columns) {
    if (!SUMMED.has(c.type) || c.total === 'none') continue;
    if (c.total === 'avg') {
      // Averages (days before check-in, days taken): over the rows that have a value
      const vals = rows.map((r) => r[c.key]).filter((v) => v !== null && v !== undefined && v !== '');
      t[c.key] = vals.length ? r2(vals.reduce((s, v) => s + n(v), 0) / vals.length) : null;
    } else t[c.key] = r2(rows.reduce((s, r) => s + n(r[c.key]), 0));
  }
  return derive ? derive(t) : t;
};

export const groupRows = (report, columns, rows, by, derive) => {
  const labels = { day: 'Day', week: 'Week', month: 'Month', property: 'Property', city: 'City', status: 'Status' };
  const groups = new Map();
  for (const r of rows) {
    const k = groupKey(r, by, report.groupDate === 'month' ? 'month' : 'date');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const numeric = columns.filter((c) => SUMMED.has(c.type) || (derive && c.type === 'pct') || (derive && ['adr', 'revpar'].includes(c.key)));
  return {
    columns: [{ key: 'group', label: labels[by] }, { key: 'count', label: 'Rows', type: 'int' }, ...numeric],
    rows: [...groups.entries()].sort(([a], [b]) => (['property', 'city', 'status'].includes(by) ? a.localeCompare(b) : a < b ? -1 : 1))
      .map(([group, list]) => ({ group, count: list.length, ...addTotals(numeric, list, derive) })),
  };
};

// ─── Public API ──────────────────────────────────────────────────────────────────────────────────

export const catalogue = (canFinance) => Object.entries(REPORTS)
  .filter(([, r]) => canFinance || !r.finance)
  .map(([key, r]) => ({ key, title: r.title, finance: r.finance, dateFields: r.dateFields, statuses: r.statuses || null, defaultGroup: r.defaultGroup || 'none' }));

export const isFinanceReport = (key) => Boolean(REPORTS[key]?.finance);
export const exists = (key) => Boolean(REPORTS[key]);

/** Runs a report: { title, filters, columns, rows, totals, cards, truncated, grouped }. */
export const runReport = async (key, query) => {
  const report = REPORTS[key];
  if (!report) throw Object.assign(new Error('Unknown report'), { status: 404 });
  const f = normaliseFilters(query);
  if (!report.dateFields[f.dateField]) f.dateField = Object.keys(report.dateFields)[0];
  const by = f.groupBy || report.defaultGroup || 'none';
  const result = await report.run(f);
  let rows = result.rows;
  // Status filter for reports that work it out (payments)
  if (f.status && result.statusKey) rows = rows.filter((r) => r[result.statusKey] === f.status);
  const truncated = rows.length > ROW_LIMIT;
  if (truncated) rows = rows.slice(0, ROW_LIMIT);
  const totals = addTotals(result.columns, rows, result.derive);
  const base = { key, title: report.title, filters: { ...f, groupBy: by }, cards: result.cards || null, truncated, totals };
  if (by !== 'none') {
    const g = groupRows(report, result.columns, rows, by, result.derive);
    return { ...base, grouped: true, columns: g.columns, rows: g.rows, totals: { count: rows.length, ...totals } };
  }
  return { ...base, grouped: false, columns: result.columns, rows };
};

export default { catalogue, runReport, isFinanceReport, exists, normaliseFilters };
