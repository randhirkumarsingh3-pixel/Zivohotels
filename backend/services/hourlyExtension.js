/**
 * Extra hours on a booked hourly stay ("Add hours" in My Bookings).
 *
 * A confirmed, paid stay that hasn't ended can be extended by 1-3 hours at the hotel's extra-hour
 * price, if the room is free for the extra time plus the cleaning after it and the stay still ends
 * within the hotel's hourly opening hours. The guest pays the difference online (a separate
 * Razorpay order); the stay is extended only when that payment is confirmed (checked again under
 * the same lock bookings use). If the room was taken meanwhile, the payment is refunded.
 *
 * Booking metadata: pendingExtension (an order waiting for payment) and hourlyExtensions (paid
 * extensions, each with its own Razorpay payment, so refunds can go back to each payment).
 */
import crypto from 'crypto';
import Razorpay from 'razorpay';
import prisma from '../config/db.js';
import { hotelHourly, roomsNeeded, istDate, slotLabel, extensionPrice } from '../domains/hourly.js';
import { HOLDING, HourlyError, getPlatformHourly } from './hourlyService.js';
import { notifyHotel } from './notifyService.js';

export const EXTRA_HOURS = [1, 2, 3];
const ORDER_MINUTES = 15;

const razorpay = () => new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });

const loadBooking = (id, db = prisma) => db.booking.findUnique({
  where: { id },
  include: { hotel: { select: { id: true, name: true, hourlySettings: true } }, roomType: { select: { id: true, name: true, hourlyEnabled: true, hourlyRooms: true } } },
});

/** Why this booking can't be extended now (or null). */
const notExtendable = (b, userId, now) => {
  if (!b || b.stayType !== 'HOURLY' || (userId && b.userId !== userId)) return 'Booking not found';
  if (!['CONFIRMED', 'CHECKED_IN'].includes(b.status) || b.paymentStatus !== 'PAID') return 'Only a confirmed, paid hourly stay can be extended.';
  if (new Date(b.slotEnd) <= now) return 'This stay has already ended.';
  return null;
};

/** Is the room free from the current end to the new end (plus cleaning), not counting this stay? */
const freeFor = async (db, b, newEnd, settings) => {
  const pad = settings.cleaningMinutes * 60000;
  const others = await db.booking.findMany({
    where: { ...HOLDING(), id: { not: b.id }, roomTypeId: b.roomTypeId, slotStart: { lt: new Date(newEnd.getTime() + pad) }, slotEnd: { gt: new Date(new Date(b.slotEnd).getTime() - pad) } },
    select: { slotStart: true, slotEnd: true },
  });
  const ymd = b.metadata?.hourly?.date;
  const override = ymd ? await db.hourlyAllocation.findFirst({ where: { roomTypeId: b.roomTypeId, date: new Date(`${ymd}T00:00:00Z`) } }) : null;
  const rooms = override ? (override.stopSell ? 0 : override.rooms) : (b.roomType?.hourlyRooms || 0);
  // This stay already holds one of the rooms: the extra time must fit alongside the others
  return rooms > 0 && roomsNeeded(others.map((o) => ({ start: o.slotStart, end: o.slotEnd })), { start: b.slotEnd, end: newEnd }, settings.cleaningMinutes) <= rooms;
};

const settingsFor = async (b) => hotelHourly(b.hotel.hourlySettings, await getPlatformHourly());
const taxRules = () => prisma.taxRule.findMany({ where: { isActive: true }, orderBy: { effectiveFrom: 'desc' } });

/** The extensions a guest can buy now: [{ hours, endsAt, label, extraAmount, ... }] (may be empty). */
export const extensionOptions = async (bookingId, userId, now = new Date()) => {
  const b = await loadBooking(bookingId);
  const problem = notExtendable(b, userId, now);
  if (problem) throw new HourlyError(problem, problem === 'Booking not found' ? 404 : 400);
  const settings = await settingsFor(b);
  if (!settings.extraHourPrice) return { available: false, reason: 'This hotel doesn\'t sell extra hours online. Ask at the reception.', options: [] };
  const closeAt = istDate(b.metadata?.hourly?.date, settings.openTo);
  const rules = await taxRules();
  const options = [];
  for (const h of EXTRA_HOURS) {
    const endsAt = new Date(new Date(b.slotEnd).getTime() + h * 3600000);
    if (endsAt > closeAt) break;
    if (!(await freeFor(prisma, b, endsAt, settings))) break; // later options need this time too
    const price = extensionPrice(b, h, settings.extraHourPrice, rules);
    options.push({ hours: h, totalHours: b.hours + h, endsAt, label: slotLabel(b.slotStart, endsAt, b.hours + h), ...price });
  }
  return {
    available: options.length > 0,
    reason: options.length ? null : `The room isn't free after your stay ends (or the hotel's hourly stays end at ${settings.openTo}).`,
    perHour: settings.extraHourPrice,
    options,
  };
};

/** Starts paying for an extension: a Razorpay order for the difference, kept for 15 minutes. */
export const startExtension = async (bookingId, userId, hours, now = new Date()) => {
  const { options } = await extensionOptions(bookingId, userId, now);
  const option = options.find((o) => o.hours === Number(hours));
  if (!option) throw new HourlyError('These extra hours aren\'t available any more. Choose again.', 409);
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  let order;
  try {
    order = await razorpay().orders.create({ amount: Math.round(option.extraAmount * 100), currency: 'INR', receipt: `${b.bookingRef}-X${option.totalHours}`.slice(0, 40), notes: { bookingId, extension: String(option.hours) } });
  } catch (err) {
    console.error('[HourlyExtension] Razorpay order failed:', err?.statusCode, err?.error?.description || err?.message);
    throw new HourlyError('Online payment is unavailable right now. Please try again in a few minutes.', 502);
  }
  await prisma.booking.update({
    where: { id: bookingId },
    data: { metadata: { ...(b.metadata || {}), pendingExtension: { orderId: order.id, hours: option.hours, extraAmount: option.extraAmount, expiresAt: new Date(now.getTime() + ORDER_MINUTES * 60000) } } },
  });
  return { order, option };
};

const refund = async (paymentId, amount, bookingId) => {
  try {
    await razorpay().payments.refund(paymentId, { amount: Math.round(amount * 100), notes: { bookingId, reason: 'extension not possible' } });
    return true;
  } catch (err) {
    console.error('[HourlyExtension] Refund failed:', paymentId, err?.error?.description || err?.message);
    return false;
  }
};

/**
 * Applies a paid extension (from the payment page, or Razorpay's webhook): checked again under
 * the booking lock; the stay gets longer and the totals go up. Idempotent per order.
 * Returns { applied: true, booking } or { applied: false, refunded, message }.
 */
export const applyExtension = async (bookingId, { orderId, paymentId, paidPaise = null }) => {
  const result = await prisma.$transaction(async (tx) => {
    const b = await loadBooking(bookingId, tx);
    if (!b) throw new HourlyError('Booking not found', 404);
    if ((b.metadata?.hourlyExtensions || []).some((x) => x.orderId === orderId)) return { applied: true, already: true, booking: b };
    const pending = b.metadata?.pendingExtension;
    if (!pending || pending.orderId !== orderId) throw new HourlyError('This payment doesn\'t match an extension of this booking.', 400);
    if (paidPaise != null && paidPaise !== Math.round(pending.extraAmount * 100)) throw new HourlyError('The amount paid doesn\'t match the extension.', 400);

    const ymd = b.metadata?.hourly?.date;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`hourly:${b.roomTypeId}:${ymd}`}))`;
    const settings = hotelHourly(b.hotel.hourlySettings, await getPlatformHourly());
    const newEnd = new Date(new Date(b.slotEnd).getTime() + pending.hours * 3600000);
    const stillOk = ['CONFIRMED', 'CHECKED_IN'].includes(b.status) && newEnd <= istDate(ymd, settings.openTo) && (await freeFor(tx, b, newEnd, settings));
    const price = extensionPrice(b, pending.hours, settings.extraHourPrice, await tx.taxRule.findMany({ where: { isActive: true }, orderBy: { effectiveFrom: 'desc' } }));
    if (!stillOk || !price) {
      await tx.booking.update({ where: { id: b.id }, data: { metadata: { ...b.metadata, pendingExtension: null } } });
      return { applied: false, refundAmount: pending.extraAmount };
    }
    const totalHours = b.hours + pending.hours;
    const label = slotLabel(b.slotStart, newEnd, totalHours);
    const paid = pending.extraAmount; // what this order charged (the price shown when it was made)
    const booking = await tx.booking.update({
      where: { id: b.id },
      data: {
        hours: totalHours, slotEnd: newEnd, checkOut: newEnd,
        roomPrice: Math.round(Number(b.roomPrice || 0)) + price.extraBase,
        baseAmount: price.newBase, taxAmount: price.newTax, totalAmount: Math.round(Number(b.totalAmount)) + paid,
        paidAmount: Math.round(Number(b.paidAmount || 0)) + paid,
        metadata: {
          ...b.metadata,
          pendingExtension: null,
          hourly: { ...(b.metadata?.hourly || {}), hours: totalHours, label },
          taxPercentage: price.taxPercentage,
          hourlyExtensions: [...(b.metadata?.hourlyExtensions || []), { orderId, paymentId, hours: pending.hours, amount: paid, extraBase: price.extraBase, perHour: price.perHour, paidAt: new Date() }],
        },
      },
    });
    await tx.bookingRoom.updateMany({ where: { bookingId: b.id }, data: { roomPrice: Math.round(Number(b.roomPrice || 0)) + price.extraBase, subtotal: Math.round(Number(b.roomPrice || 0)) + price.extraBase } });
    await tx.auditLog.create({ data: { action: 'HOURLY_EXTENDED', entityType: 'BOOKING', entityId: b.id, details: { orderId, paymentId, hours: pending.hours, amount: paid }, userId: b.userId || 'SYSTEM' } });
    return { applied: true, booking: { ...booking, hotel: b.hotel, roomType: b.roomType }, hours: pending.hours, label };
  });

  if (!result.applied) {
    const refunded = paymentId ? await refund(paymentId, result.refundAmount, bookingId) : false;
    return { applied: false, refunded, message: `The room was booked by someone else for that time, so we couldn't add the hours.${refunded ? ' Your payment is being refunded.' : ' Your payment will be refunded.'}` };
  }
  if (!result.already) {
    const b = result.booking;
    notifyHotel(b.hotelId, {
      type: 'HOURLY_EXTENDED', title: `Stay extended: ${b.bookingRef}`,
      message: `${b.guestName} added ${result.hours} hour${result.hours === 1 ? '' : 's'} (${b.roomType?.name}): now ${result.label}.`,
      metadata: { bookingId: b.id },
    }).catch(() => {});
    // An invoice already issued (stay over) is redrawn; otherwise it is issued at departure
    import('./invoiceService.js').then((m) => m.invoiceService.regenerateInvoice(b.id)).catch(() => {});
  }
  return { applied: true, booking: result.booking };
};

/** Payment page: checks Razorpay's signature, then applies the extension. */
export const verifyExtension = async (bookingId, userId, { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature }) => {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, select: { userId: true } });
  if (!b || b.userId !== userId) throw new HourlyError('Booking not found', 404);
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
  const a = Buffer.from(expected); const c = Buffer.from(String(signature || ''));
  if (a.length !== c.length || !crypto.timingSafeEqual(a, c)) throw new HourlyError('Invalid payment signature', 400);
  return applyExtension(bookingId, { orderId, paymentId });
};

/** Razorpay webhook: a captured payment for an extension order (if the page didn't confirm it). */
export const bookingForExtensionOrder = (orderId) => prisma.booking.findFirst({ where: { metadata: { path: ['pendingExtension', 'orderId'], equals: orderId } }, select: { id: true } });

/** Every online payment on a booking, with what it paid: the booking's own, then each extension. */
export const paymentsOf = (booking) => {
  const ext = (booking.metadata?.hourlyExtensions || []).filter((x) => x.paymentId).map((x) => ({ paymentId: x.paymentId, amount: Number(x.amount) || 0 }));
  const extTotal = ext.reduce((t, x) => t + x.amount, 0);
  const main = booking.razorpayPaymentId ? [{ paymentId: booking.razorpayPaymentId, amount: Math.max(0, (Number(booking.paidAmount) || 0) - (Number(booking.walletAmount) || 0) - extTotal) }] : [];
  return [...main, ...ext];
};

export default { extensionOptions, startExtension, applyExtension, verifyExtension, bookingForExtensionOrder, paymentsOf };
