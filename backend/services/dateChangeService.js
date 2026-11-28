/**
 * Change dates (My Bookings → Manage → Change dates).
 *
 * A guest asks to move a confirmed night stay to other dates: same hotel, rooms, plans and guests,
 * priced at today's rates (the same pricing as a new booking, keeping any points already spent).
 * Only while free cancellation applies ("only where a refund is applicable"); not for hourly stays
 * or company / agency bookings.
 *
 *  1. The guest sees the new price and sends the request (PENDING). The hotel is told.
 *  2. The hotel approves or declines it in the extranet within 48 hours (or before check-in);
 *     unanswered requests expire. Nothing changes on the booking until it is approved.
 *  3. Approved:
 *     - the new dates cost more and the booking was paid online: the guest pays the difference
 *       online within 24 hours (AWAITING_PAYMENT), then the dates change;
 *     - otherwise the dates change at once: a lower price is refunded (to the card / UPI, Zivo Cash
 *       paid goes back to Zivo Cash) and an unpaid balance is settled at the hotel.
 *  Changing the dates releases the old nights and takes the new ones under the same locks bookings
 *  use; if the new dates sold out meanwhile, nothing changes (a paid difference is refunded).
 *  When an invoice already exists, the difference is a debit or credit note against it.
 */
import crypto from 'crypto';
import Razorpay from 'razorpay';
import prisma from '../config/db.js';
import { loadStayRooms, describeRooms, pricingSettings, priceWithPromotion } from './bookingService.js';
import { inventoryRepository } from '../repositories/inventoryRepository.js';
import { roomsPerType } from '../domains/roomLines.js';
import { getDatesInRange } from '../utils/dateUtils.js';
import { freeCancellationEndsAt } from '../domains/cancellationRules.js';
import { getDefaultPolicy } from '../utils/refundCalculator.js';
import { move as walletMove } from './finance/walletService.js';
import { notifyUser, notifyHotel } from './notifyService.js';
import { emailLayout, inr } from './emailLayout.js';
import { escapeHtml } from '../utils/html.js';
import { roundMoney } from '../utils/money.js';

const DAY = 86400000;
const ANSWER_HOURS = 48;
const PAY_HOURS = 24;
const MAX_NIGHTS = 30;
export const OPEN = ['PENDING', 'AWAITING_PAYMENT'];

export class DateChangeError extends Error {
  constructor(message, statusCode = 400) { super(message); this.statusCode = statusCode; }
}

const razorpay = () => new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
const ymd = (d) => new Date(d).toISOString().slice(0, 10);
const istToday = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const day = (d) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const datesText = (a, b) => `${day(a)} → ${day(b)}`;
const nightsBetween = (a, b) => Math.round((new Date(`${ymd(b)}T00:00:00Z`) - new Date(`${ymd(a)}T00:00:00Z`)) / DAY);
const money = (v) => roundMoney(Number(v) || 0);

const loadBooking = (id, db = prisma) => db.booking.findUnique({
  where: { id },
  include: { hotel: { select: { id: true, name: true, city: true } }, bookingRooms: { orderBy: { roomNumber: 'asc' } } },
});

/** Why this booking's dates can't be changed now (or null), and until when they can. */
export const eligibility = async (b, now = new Date()) => {
  if (!b) return { reason: 'Booking not found' };
  if (b.stayType === 'HOURLY') return { reason: 'Hourly stays can\'t move to other dates. Cancel it and book again, or add hours.' };
  if (b.organisationId) return { reason: 'Company and agency bookings are changed through your travel desk or agent.' };
  if (b.status !== 'CONFIRMED') return { reason: b.status === 'PENDING' ? 'Complete the payment first.' : 'Only a confirmed stay that hasn\'t started can move to other dates.' };
  const policy = await prisma.cancellationPolicy.findUnique({ where: { hotelId: b.hotelId } }) || getDefaultPolicy();
  const until = freeCancellationEndsAt(b, policy);
  if (now >= until) return { reason: 'Free cancellation has ended for this booking, so its dates can\'t be changed online. Call the hotel or ZivoPlus support.', until };
  return { reason: null, until };
};

/** The booking's active rooms, as booking lines (type, plan, guests, lead guest). */
const linesOf = (b) => {
  const rooms = (b.bookingRooms || []).filter((r) => !r.cancelledAt);
  if (rooms.length) return rooms.map((r) => ({ roomNumber: r.roomNumber, roomTypeId: r.roomTypeId, ratePlanId: r.ratePlanId, adults: r.adults, children: r.children, extraBeds: 0, guestName: r.guestName }));
  return [{ roomNumber: 1, roomTypeId: b.roomTypeId, ratePlanId: b.ratePlanId, adults: b.adults, children: b.children, extraBeds: 0, guestName: b.guestName }];
};

/** Today's price for the same rooms on the new dates. */
const reprice = async (b, checkIn, checkOut) => {
  const lines = linesOf(b);
  const { rooms, hotel } = await loadStayRooms(lines, { hotelId: b.hotelId, checkInDate: checkIn, checkOutDate: checkOut });
  const { taxRules, prepaidDiscountPercent } = await pricingSettings();
  const stayInput = { rooms, hotel, taxRules, prepaidDiscountPercent, checkInDate: checkIn, checkOutDate: checkOut, paymentType: b.paymentType, dynamicContext: { safeMode: true, userSegment: 'STANDARD', device: 'WEB' } };
  const { pricing } = await priceWithPromotion(stayInput, {
    hotelId: b.hotelId, checkIn, checkOut, userId: b.userId, code: b.couponCode || undefined,
    fixedLoyaltyDiscount: Number(b.metadata?.loyalty?.discountAmount) || 0,
  });
  const detail = describeRooms(pricing, rooms, lines).map((r, i) => ({ ...r, roomNumber: lines[i].roomNumber }));
  return {
    lines,
    pricing: {
      finalAmount: money(pricing.finalAmount), baseAmount: money(pricing.baseAmount), taxAmount: money(pricing.taxAmount),
      roomPrice: money(pricing.roomPrice), extraGuestCharges: money(pricing.extraGuestCharges), extraBedCharges: money(pricing.extraBedCharges),
      mealCharges: money(pricing.mealCharges), taxPercentage: pricing.taxPercentage, discountAmount: money(pricing.discountAmount),
      rooms: detail.map((r) => ({ roomNumber: r.roomNumber, roomPrice: money(r.roomPrice), extraGuestCharges: money(r.extraGuestCharges), mealCharges: money(r.mealCharges), extraBedCharges: money(r.extraBedCharges), subtotal: money(r.subtotal) })),
    },
  };
};

/** Are the rooms free on the new dates (counting the nights this booking already holds)? */
const roomsFree = async (b, lines, checkIn, checkOut, db = prisma) => {
  const held = new Set(getDatesInRange(new Date(b.checkIn), new Date(b.checkOut)).map(ymd));
  const nights = getDatesInRange(checkIn, checkOut);
  for (const g of roomsPerType(lines)) {
    const type = await db.roomType.findUnique({ where: { id: g.roomTypeId }, select: { totalInventory: true } });
    const rows = await db.inventory.findMany({ where: { roomTypeId: g.roomTypeId, date: { in: nights } }, select: { date: true, availableRooms: true, stopSell: true } });
    const byDay = new Map(rows.map((r) => [ymd(r.date), r]));
    for (const n of nights) {
      const r = byDay.get(ymd(n));
      if (r?.stopSell) return false;
      const free = (r ? r.availableRooms : type?.totalInventory || 0) + (held.has(ymd(n)) ? g.rooms : 0);
      if (free < g.rooms) return false;
    }
  }
  return true;
};

const parseDates = (input) => {
  const a = String(input.checkIn || '').slice(0, 10); const z = String(input.checkOut || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(z) || z <= a) throw new DateChangeError('Choose a check-in date before the check-out date.');
  if (a < istToday()) throw new DateChangeError('Check-in can\'t be in the past.');
  const checkIn = new Date(`${a}T00:00:00Z`); const checkOut = new Date(`${z}T00:00:00Z`);
  if (nightsBetween(checkIn, checkOut) > MAX_NIGHTS) throw new DateChangeError(`A stay can be up to ${MAX_NIGHTS} nights.`);
  return { checkIn, checkOut };
};

/** Marks requests nobody acted on in time as expired. */
export const expireStale = (where = {}) => prisma.dateChangeRequest.updateMany({ where: { ...where, status: { in: OPEN }, expiresAt: { lt: new Date() } }, data: { status: 'EXPIRED' } });

/** How the money works out for a new total: { pay (online now), refund, atHotel (balance) }. */
const settlement = (b, newTotal) => {
  const paid = money(b.paidAmount);
  const diff = money(newTotal - Number(b.totalAmount));
  if (b.paymentStatus === 'PAID') return diff > 0 ? { pay: diff, refund: 0, atHotel: 0 } : { pay: 0, refund: -diff, atHotel: 0 };
  // Part paid, or nothing paid yet (pay at the hotel): the balance at the hotel changes; only money
  // already paid above the new total comes back
  return { pay: 0, refund: Math.max(0, money(paid - newTotal)), atHotel: Math.max(0, money(newTotal - paid)) };
};

/** The price for new dates, without asking anything yet. */
export const quote = async (bookingId, user, input = {}) => {
  const b = await loadBooking(bookingId);
  if (!b || b.userId !== user.id) throw new DateChangeError('Booking not found', 404);
  const { reason } = await eligibility(b);
  if (reason) throw new DateChangeError(reason, 409);
  const { checkIn, checkOut } = parseDates(input);
  if (ymd(checkIn) === ymd(b.checkIn) && ymd(checkOut) === ymd(b.checkOut)) throw new DateChangeError('These are your current dates. Choose other dates.');
  const { lines, pricing } = await reprice(b, checkIn, checkOut);
  const available = await roomsFree(b, lines, checkIn, checkOut);
  const oldTotal = money(b.totalAmount);
  return {
    checkIn: ymd(checkIn), checkOut: ymd(checkOut), nights: nightsBetween(checkIn, checkOut),
    available, oldTotal, newTotal: pricing.finalAmount, difference: money(pricing.finalAmount - oldTotal),
    ...settlement(b, pricing.finalAmount), pricing,
  };
};

const view = (r) => r && ({
  id: r.id, status: r.status, oldCheckIn: ymd(r.oldCheckIn), oldCheckOut: ymd(r.oldCheckOut), newCheckIn: ymd(r.newCheckIn), newCheckOut: ymd(r.newCheckOut),
  oldTotal: Number(r.oldTotal), newTotal: Number(r.newTotal), difference: Number(r.difference),
  guestNote: r.guestNote, hotelReply: r.hotelReply, expiresAt: r.expiresAt, respondedAt: r.respondedAt, appliedAt: r.appliedAt,
  refund: r.refund || null, createdAt: r.createdAt,
});

/** For My Bookings: can the dates change, until when, and the requests so far. */
export const forGuest = async (bookingId, user) => {
  const b = await loadBooking(bookingId);
  if (!b || b.userId !== user.id) throw new DateChangeError('Booking not found', 404);
  await expireStale({ bookingId });
  const [{ reason, until }, list] = await Promise.all([eligibility(b), prisma.dateChangeRequest.findMany({ where: { bookingId }, orderBy: { createdAt: 'desc' }, take: 10 })]);
  const open = list.find((r) => OPEN.includes(r.status));
  return {
    canRequest: !reason && !open, reason: open ? null : reason, freeChangeUntil: until || null,
    paidOnline: b.paymentStatus === 'PAID',
    open: open ? { ...view(open), toPay: open.status === 'AWAITING_PAYMENT' ? Number(open.difference) : 0 } : null,
    history: list.filter((r) => r !== open).map(view),
  };
};

const hotelEmail = async (b, r) => emailLayout({
  title: `Date change request · ${b.bookingRef}`,
  eyebrow: 'Guest request',
  preheader: `${b.guestName} would like to move to ${datesText(r.newCheckIn, r.newCheckOut)}.`,
  body: `<p><b>${escapeHtml(b.guestName)}</b> would like to move booking <b>${escapeHtml(b.bookingRef)}</b> to other dates. Please approve or decline it in the extranet by ${escapeHtml(new Date(r.expiresAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }))}.</p>`,
  rows: [
    ['Now', datesText(r.oldCheckIn, r.oldCheckOut)],
    ['Asked for', `<b>${datesText(r.newCheckIn, r.newCheckOut)}</b>`],
    ['Rooms', `${b.rooms} (same rooms and plans)`],
    ['New total', `${inr(r.newTotal)} (was ${inr(r.oldTotal)}, at today's rates)`],
    ...(r.guestNote ? [['Guest note', escapeHtml(r.guestNote)]] : []),
  ],
  cta: { label: 'Answer in the extranet', href: '/extranet/bookings' },
  note: 'The booking stays on its current dates until you approve. Unanswered requests expire.',
});

/** The guest sends the request (at the price just shown). */
export const requestChange = async (bookingId, user, input = {}) => {
  const q = await quote(bookingId, user, input);
  if (!q.available) throw new DateChangeError('These dates are sold out for your rooms. Choose other dates.', 409);
  await expireStale({ bookingId });
  if (await prisma.dateChangeRequest.count({ where: { bookingId, status: { in: OPEN } } })) throw new DateChangeError('You already have a date change waiting. Withdraw it first to ask for other dates.', 409);
  const b = await loadBooking(bookingId);
  const expiresAt = new Date(Math.min(Date.now() + ANSWER_HOURS * 3600000, new Date(b.checkIn).getTime(), new Date(`${q.checkIn}T00:00:00Z`).getTime()));
  const r = await prisma.dateChangeRequest.create({
    data: {
      bookingId, hotelId: b.hotelId, userId: user.id,
      oldCheckIn: b.checkIn, oldCheckOut: b.checkOut, newCheckIn: new Date(`${q.checkIn}T00:00:00Z`), newCheckOut: new Date(`${q.checkOut}T00:00:00Z`),
      oldTotal: q.oldTotal, newTotal: q.newTotal, difference: q.difference, pricing: q.pricing,
      guestNote: String(input.note || '').replace(/\s+/g, ' ').trim().slice(0, 300) || null, expiresAt,
    },
  });
  await prisma.bookingTimelineEvent.create({ data: { bookingId, status: 'DATE_CHANGE_REQUESTED', title: 'Date change requested', message: `Asked the hotel to move to ${datesText(r.newCheckIn, r.newCheckOut)}.` } }).catch(() => {});
  notifyHotel(b.hotelId, {
    type: 'DATE_CHANGE_REQUEST', title: `Date change: ${b.guestName}`,
    message: `${b.bookingRef}: ${datesText(r.oldCheckIn, r.oldCheckOut)} → ${datesText(r.newCheckIn, r.newCheckOut)}. Approve or decline it in Bookings.`,
    metadata: { bookingId, dateChangeId: r.id },
    email: { subject: `Date change request · ${b.bookingRef}`, html: await hotelEmail(b, r), jobType: 'SEND_DATE_CHANGE' },
  }).catch(() => {});
  return view(r);
};

export const withdraw = async (bookingId, requestId, user) => {
  const r = await prisma.dateChangeRequest.findFirst({ where: { id: requestId, bookingId, userId: user.id } });
  if (!r) throw new DateChangeError('Request not found', 404);
  if (!OPEN.includes(r.status)) throw new DateChangeError('This request is already closed.');
  return view(await prisma.dateChangeRequest.update({ where: { id: r.id }, data: { status: 'WITHDRAWN' } }));
};

/** Gives money back for a cheaper stay: Zivo Cash paid first back to Zivo Cash, the rest to the card / UPI. */
const giveBack = async (b, amount) => {
  const wallet = Math.min(amount, money(b.walletAmount));
  const toSource = b.razorpayPaymentId ? money(amount - wallet) : 0;
  const toWallet = money(amount - toSource);
  const out = { amount, toWallet, toSource, refundId: null, status: 'DONE' };
  if (toWallet > 0 && b.userId) {
    await prisma.$transaction((tx) => walletMove(tx, { userId: b.userId, type: 'CREDIT', amount: toWallet, category: 'REFUND', description: `Date change refund · ${b.bookingRef}`, bookingId: b.id }));
  }
  if (toSource > 0) {
    try {
      const r = await razorpay().payments.refund(b.razorpayPaymentId, { amount: Math.round(toSource * 100), notes: { bookingId: b.id, reason: 'date change' } });
      out.refundId = r.id;
    } catch (err) {
      console.error('[DateChange] Refund failed:', b.bookingRef, err?.error?.description || err?.message);
      out.status = 'FAILED';
    }
  }
  return out;
};

/**
 * Moves the booking (inside one transaction): the old nights back, the new nights taken (409 if
 * sold out), the totals and rooms repriced. `paid` is a difference just paid online.
 */
const moveBooking = async (r, { paid = 0, paymentId = null } = {}) => prisma.$transaction(async (tx) => {
  const b = await loadBooking(r.bookingId, tx);
  if (!b || b.status !== 'CONFIRMED' || ymd(b.checkIn) !== ymd(r.oldCheckIn) || ymd(b.checkOut) !== ymd(r.oldCheckOut)) throw new DateChangeError('The booking changed since this request, so it can\'t be applied.', 409);
  const lines = linesOf(b);
  await inventoryRepository.restoreInventory(tx, b);
  for (const g of roomsPerType(lines)) {
    await inventoryRepository.lockInventory(tx, { roomTypeId: g.roomTypeId, checkInDate: r.newCheckIn, checkOutDate: r.newCheckOut, rooms: g.rooms });
  }
  const p = r.pricing;
  const newTotal = Number(r.newTotal);
  const s = settlement(b, newTotal);
  const paidNow = money(Number(b.paidAmount) + paid - s.refund * (paid ? 0 : 1));
  const booking = await tx.booking.update({
    where: { id: b.id },
    data: {
      checkIn: r.newCheckIn, checkOut: r.newCheckOut,
      totalAmount: newTotal, baseAmount: p.baseAmount, taxAmount: p.taxAmount, roomPrice: p.roomPrice,
      extraGuestCharges: p.extraGuestCharges, extraBedCharges: p.extraBedCharges, mealCharges: p.mealCharges,
      paidAmount: paidNow, remainingAmount: Math.max(0, money(newTotal - paidNow)),
      ...(s.refund > 0 && !paid ? { walletAmount: Math.max(0, money(Number(b.walletAmount) - Math.min(s.refund, Number(b.walletAmount)))) } : {}),
      metadata: {
        ...(b.metadata || {}),
        taxPercentage: p.taxPercentage,
        dateChanges: [...(b.metadata?.dateChanges || []), { requestId: r.id, from: [ymd(r.oldCheckIn), ymd(r.oldCheckOut)], to: [ymd(r.newCheckIn), ymd(r.newCheckOut)], oldTotal: Number(r.oldTotal), newTotal, at: new Date() }],
        ...(paymentId ? { extraPayments: [...(b.metadata?.extraPayments || []), { paymentId, amount: paid, kind: 'DATE_CHANGE', requestId: r.id }] } : {}),
      },
    },
  });
  for (const room of p.rooms || []) {
    await tx.bookingRoom.updateMany({ where: { bookingId: b.id, roomNumber: room.roomNumber }, data: { roomPrice: room.roomPrice, extraGuestCharges: room.extraGuestCharges, mealCharges: room.mealCharges, extraBedCharges: room.extraBedCharges, subtotal: room.subtotal } });
  }
  await tx.bookingTimelineEvent.create({ data: { bookingId: b.id, status: 'DATE_CHANGED', title: 'Dates changed', message: `Moved from ${datesText(r.oldCheckIn, r.oldCheckOut)} to ${datesText(r.newCheckIn, r.newCheckOut)}. New total ${inr(newTotal)}.` } });
  await tx.auditLog.create({ data: { action: 'BOOKING_DATES_CHANGED', entityType: 'BOOKING', entityId: b.id, details: { requestId: r.id, from: [ymd(r.oldCheckIn), ymd(r.oldCheckOut)], to: [ymd(r.newCheckIn), ymd(r.newCheckOut)], oldTotal: Number(r.oldTotal), newTotal, paid }, userId: r.userId || 'SYSTEM' } });
  const applied = await tx.dateChangeRequest.update({ where: { id: r.id }, data: { status: 'APPLIED', appliedAt: new Date(), ...(paymentId ? { paymentId } : {}) } });
  return { booking: { ...booking, hotel: b.hotel }, before: b, request: applied, refund: paid ? 0 : s.refund };
});

/** After the dates moved: refund, invoice notes, and telling the guest and the hotel. */
const afterMove = async ({ booking: b, before, request: r, refund }) => {
  if (refund > 0) {
    const out = await giveBack(before, refund);
    await prisma.dateChangeRequest.update({ where: { id: r.id }, data: { refund: out } });
    r.refund = out;
  }
  // An invoice issued already (rare before the stay): the difference is a debit / credit note
  (async () => {
    const inv = await prisma.invoice.findUnique({ where: { bookingId: b.id } });
    if (!inv) return;
    const diff = money(Number(r.newTotal) - Number(r.oldTotal));
    if (!diff) return;
    const taxPct = Number(r.pricing?.taxPercentage) || 0;
    const tax = roundMoney(Math.abs(diff) * taxPct / (100 + taxPct));
    await (await import('./guestNoteService.js')).issueNote(b.id, { kind: diff > 0 ? 'DEBIT' : 'CREDIT', amount: Math.abs(diff), tax, reason: `Dates changed to ${datesText(r.newCheckIn, r.newCheckOut)}`, key: `dates-${r.id}` });
  })().catch((err) => console.error('[DateChange] Note not issued:', err.message));

  const money_ = refund > 0
    ? `${inr(refund)} is being refunded${r.refund?.toWallet > 0 && !r.refund?.toSource ? ' to your Zivo Cash' : ' to your original payment method'}.`
    : Number(b.remainingAmount) > 0 ? `${inr(b.remainingAmount)} is to be paid at the hotel.` : '';
  const html = await emailLayout({
    title: 'Your dates have changed',
    eyebrow: b.bookingRef,
    preheader: `${b.hotel?.name}: ${datesText(r.newCheckIn, r.newCheckOut)}.`,
    body: `<p>${escapeHtml(b.hotel?.name || 'The hotel')} approved your date change. ${escapeHtml(money_)}</p>`,
    rows: [['New dates', `<b>${datesText(r.newCheckIn, r.newCheckOut)}</b>`], ['Was', datesText(r.oldCheckIn, r.oldCheckOut)], ['New total', inr(r.newTotal)]],
    cta: { label: 'See your booking', href: '/my-bookings' },
    note: 'Download the updated voucher from My Bookings.',
  });
  notifyUser(b.userId, {
    type: 'DATE_CHANGE_APPLIED', title: `New dates confirmed: ${b.hotel?.name}`, message: `${datesText(r.newCheckIn, r.newCheckOut)}. ${money_}`.trim(), link: '/my-bookings',
    metadata: { bookingId: b.id, dateChangeId: r.id },
    email: b.guestEmail ? { to: b.guestEmail, subject: `Dates changed · ${b.bookingRef}`, html, jobType: 'SEND_DATE_CHANGE' } : null,
  }).catch(() => {});
  notifyHotel(b.hotelId, {
    type: 'DATE_CHANGE_APPLIED', title: `Dates changed: ${b.bookingRef}`,
    message: `${b.guestName}: now ${datesText(r.newCheckIn, r.newCheckOut)} (was ${datesText(r.oldCheckIn, r.oldCheckOut)}). New total ${inr(r.newTotal)}.`,
    metadata: { bookingId: b.id, dateChangeId: r.id },
  }).catch(() => {});
  return view(r);
};

const tellGuest = async (r, b, { title, message, subject, body }) => {
  const html = await emailLayout({ title, eyebrow: b.bookingRef, preheader: message, body, rows: [['Asked for', datesText(r.newCheckIn, r.newCheckOut)], ['Current dates', datesText(r.oldCheckIn, r.oldCheckOut)]], cta: { label: 'Open My Bookings', href: '/my-bookings' } });
  return notifyUser(r.userId, { type: 'DATE_CHANGE_ANSWERED', title, message, link: '/my-bookings', metadata: { bookingId: b.id, dateChangeId: r.id }, email: b.guestEmail ? { to: b.guestEmail, subject, html, jobType: 'SEND_DATE_CHANGE' } : null }).catch(() => {});
};

// ─── The hotel (extranet) ──────────────────────────────────────────────────────────────────────

export const listForHotel = async (hotelId, { status } = {}) => {
  await expireStale({ hotelId });
  const rows = await prisma.dateChangeRequest.findMany({
    where: { hotelId, ...(status ? { status: String(status).toUpperCase() } : {}) },
    orderBy: { createdAt: 'desc' }, take: 100,
    include: { booking: { select: { id: true, bookingRef: true, guestName: true, guestPhone: true, rooms: true, guests: true, paymentType: true, roomType: { select: { name: true } } } } },
  });
  return rows.map((r) => ({ ...view(r), booking: r.booking }));
};

/** The hotel approves (dates change, or the guest is asked to pay the difference) or declines. */
export const respond = async (hotelId, requestId, { decision, reply } = {}, user) => {
  const d = String(decision || '').toUpperCase();
  if (!['APPROVE', 'DECLINE'].includes(d)) throw new DateChangeError('Choose Approve or Decline.');
  const note = String(reply || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (d === 'DECLINE' && note.length < 3) throw new DateChangeError('Tell the guest why, or which dates would work.');
  await expireStale({ hotelId });
  const r = await prisma.dateChangeRequest.findFirst({ where: { id: requestId, hotelId } });
  if (!r) throw new DateChangeError('Request not found', 404);
  if (r.status !== 'PENDING') throw new DateChangeError(r.status === 'EXPIRED' ? 'This request expired before it was answered.' : 'This request has already been answered or withdrawn.', 409);
  const b = await loadBooking(r.bookingId);
  const answered = { hotelReply: note || null, respondedAt: new Date(), respondedBy: user?.id || null };

  if (d === 'DECLINE') {
    const done = await prisma.dateChangeRequest.update({ where: { id: r.id }, data: { status: 'DECLINED', ...answered } });
    await tellGuest(r, b, { title: `${b.hotel.name} couldn't change your dates`, message: `Your booking stays on ${datesText(r.oldCheckIn, r.oldCheckOut)}. "${note}"`, subject: `Date change not possible · ${b.bookingRef}`, body: `<p>${escapeHtml(b.hotel.name)} couldn't move your booking. It stays on its current dates.</p><p><b>The hotel says:</b> ${escapeHtml(note)}</p>` });
    return view(done);
  }

  const toPay = settlement(b, Number(r.newTotal)).pay;
  if (toPay > 0) {
    if (!(await roomsFree(b, linesOf(b), r.newCheckIn, r.newCheckOut))) throw new DateChangeError('The rooms are no longer free on those dates. Decline the request and suggest other dates.', 409);
    const expiresAt = new Date(Math.min(Date.now() + PAY_HOURS * 3600000, new Date(r.newCheckIn).getTime(), new Date(b.checkIn).getTime()));
    const done = await prisma.dateChangeRequest.update({ where: { id: r.id }, data: { status: 'AWAITING_PAYMENT', expiresAt, ...answered } });
    await tellGuest(r, b, { title: `Approved: pay ${inr(toPay)} to confirm your new dates`, message: `${b.hotel.name} approved ${datesText(r.newCheckIn, r.newCheckOut)}. Pay the difference in My Bookings to confirm.`, subject: `Pay ${inr(toPay)} to confirm your new dates · ${b.bookingRef}`, body: `<p>${escapeHtml(b.hotel.name)} approved your new dates. Pay the difference of <b>${inr(toPay)}</b> in My Bookings within ${PAY_HOURS} hours to confirm them; until then your booking stays on its current dates.</p>${note ? `<p><b>The hotel says:</b> ${escapeHtml(note)}</p>` : ''}` });
    return view(done);
  }

  await prisma.dateChangeRequest.update({ where: { id: r.id }, data: answered });
  try {
    return await afterMove(await moveBooking({ ...r, ...answered }));
  } catch (err) {
    if (err.statusCode === 409 || err.code === 'SOLD_OUT') {
      await prisma.dateChangeRequest.update({ where: { id: r.id }, data: { status: 'FAILED' } });
      throw new DateChangeError('The rooms are no longer free on those dates, so the booking wasn\'t changed. The guest can ask for other dates.', 409);
    }
    throw err;
  }
};

// ─── Paying the difference ─────────────────────────────────────────────────────────────────────

/** A Razorpay order for the difference on an approved request. */
export const startPayment = async (bookingId, requestId, user) => {
  await expireStale({ bookingId });
  const r = await prisma.dateChangeRequest.findFirst({ where: { id: requestId, bookingId, userId: user.id } });
  if (!r) throw new DateChangeError('Request not found', 404);
  if (r.status !== 'AWAITING_PAYMENT') throw new DateChangeError(r.status === 'EXPIRED' ? 'The time to pay ran out. Ask for the dates again.' : 'Nothing to pay for this request.', 409);
  const b = await loadBooking(bookingId);
  const amount = Number(r.difference);
  let order;
  try {
    order = await razorpay().orders.create({ amount: Math.round(amount * 100), currency: 'INR', receipt: `${b.bookingRef}-DC`.slice(0, 40), notes: { bookingId, dateChange: r.id } });
  } catch (err) {
    console.error('[DateChange] Razorpay order failed:', err?.statusCode, err?.error?.description || err?.message);
    throw new DateChangeError('Online payment is unavailable right now. Please try again in a few minutes.', 502);
  }
  await prisma.dateChangeRequest.update({ where: { id: r.id }, data: { orderId: order.id } });
  return { order, amount, key: process.env.RAZORPAY_KEY_ID, bookingRef: b.bookingRef };
};

/**
 * A paid difference (from the payment page or the webhook): moves the booking; if the rooms were
 * taken meanwhile or the time ran out, the payment is refunded. Idempotent per order.
 */
export const applyPaid = async (orderId, paymentId, paidPaise = null) => {
  const r = await prisma.dateChangeRequest.findUnique({ where: { orderId } });
  if (!r) throw new DateChangeError('This payment doesn\'t match a date change.', 400);
  if (r.status === 'APPLIED') return { applied: true, already: true, request: view(r) };
  const amount = Number(r.difference);
  if (paidPaise != null && paidPaise !== Math.round(amount * 100)) throw new DateChangeError('The amount paid doesn\'t match the difference.', 400);
  const refundPayment = async (why) => {
    let refunded = false;
    try { await razorpay().payments.refund(paymentId, { amount: Math.round(amount * 100), notes: { dateChange: r.id, reason: why } }); refunded = true; }
    catch (err) { console.error('[DateChange] Refund of paid difference failed:', paymentId, err?.error?.description || err?.message); }
    await prisma.dateChangeRequest.update({ where: { id: r.id }, data: { status: 'FAILED', paymentId, refund: { amount, toSource: amount, status: refunded ? 'DONE' : 'FAILED', reason: why } } });
    return { applied: false, refunded, message: `Your dates couldn't be changed (${why}).${refunded ? ' Your payment is being refunded.' : ' Your payment will be refunded.'}` };
  };
  if (r.status !== 'AWAITING_PAYMENT') return refundPayment('the request had closed');
  try {
    const moved = await moveBooking(r, { paid: amount, paymentId });
    return { applied: true, request: await afterMove(moved) };
  } catch (err) {
    if (err.statusCode === 409 || err.code === 'SOLD_OUT') return refundPayment('the rooms were booked by someone else meanwhile');
    throw err;
  }
};

/** Payment page: checks Razorpay's signature, then applies. */
export const verifyPayment = async (bookingId, requestId, user, { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature }) => {
  const r = await prisma.dateChangeRequest.findFirst({ where: { id: requestId, bookingId, userId: user.id } });
  if (!r || r.orderId !== orderId) throw new DateChangeError('Request not found', 404);
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
  const a = Buffer.from(expected); const c = Buffer.from(String(signature || ''));
  if (a.length !== c.length || !crypto.timingSafeEqual(a, c)) throw new DateChangeError('Invalid payment signature', 400);
  return applyPaid(orderId, paymentId);
};

export const isDateChangeOrder = async (orderId) => Boolean(orderId && await prisma.dateChangeRequest.findUnique({ where: { orderId }, select: { id: true } }));

export default { eligibility, quote, forGuest, requestChange, withdraw, listForHotel, respond, startPayment, applyPaid, verifyPayment, isDateChangeOrder, expireStale };
