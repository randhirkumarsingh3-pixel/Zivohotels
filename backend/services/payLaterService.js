/**
 * Reserve now, pay later: emails to the guest and the payment reminder.
 *
 *  - reserved: right after booking: rooms held, pay by <deadline> or the booking is cancelled
 *  - reminder: once, about 6 hours before the deadline, while still unpaid
 *  - expired:  the deadline passed without payment, so the booking was cancelled
 *
 * The deadline is booking.expiresAt (see domains/payLater.js); bookingExpiryService cancels.
 */
import prisma from '../config/db.js';
import { queueService } from './queueService.js';
import { escapeHtml as h } from '../utils/html.js';
import { reminderAt } from '../domains/payLater.js';
import { getSupportContacts } from '../config/supportContacts.js';

/** "Sat, 21 Nov, 6:30 pm" in India time */
export const payLaterLabel = (d) => new Date(d).toLocaleString('en-IN', {
  weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata',
});
const day = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const site = () => String(process.env.FRONTEND_URL || '').replace(/\/$/, '');

const COPY = {
  reserved: (b) => ({
    subject: `Reserved: pay by ${payLaterLabel(b.expiresAt)} to confirm · ${b.bookingRef}`,
    title: 'Your rooms are reserved',
    lead: `We're holding your booking at <b>${h(b.hotel.name)}</b>. Pay <b>${inr(b.totalAmount)}</b> online by <b>${h(payLaterLabel(b.expiresAt))}</b> to confirm it. If it isn't paid by then, the booking is cancelled automatically and the rooms are released.`,
    cta: 'Pay now',
  }),
  reminder: (b) => ({
    subject: `Reminder: pay by ${payLaterLabel(b.expiresAt)} or your booking is cancelled · ${b.bookingRef}`,
    title: 'Your booking is waiting for payment',
    lead: `Your booking at <b>${h(b.hotel.name)}</b> isn't confirmed yet. Pay <b>${inr(b.totalAmount)}</b> by <b>${h(payLaterLabel(b.expiresAt))}</b>, or it will be cancelled and the rooms released.`,
    cta: 'Pay now',
  }),
  expired: (b) => ({
    subject: `Booking cancelled: payment not received · ${b.bookingRef}`,
    title: 'Your booking was cancelled',
    lead: `We didn't receive the payment for your booking at <b>${h(b.hotel.name)}</b> by ${h(payLaterLabel(b.expiresAt))}, so it was cancelled and the rooms were released. Nothing was charged. You're welcome to book again.`,
    cta: 'Book again',
  }),
};

export const sendPayLaterEmail = async (bookingId, kind) => {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: { hotel: { select: { name: true } } } });
  if (!b?.guestEmail || !COPY[kind]) return null;
  const c = COPY[kind](b);
  const support = await getSupportContacts();
  const link = kind === 'expired' ? `${site()}/hotel/${b.hotelId}` : `${site()}/my-bookings`;
  const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#0f172a;max-width:560px;margin:0 auto;padding:20px">
    <h2 style="margin:0 0 12px;font-size:20px">${c.title}</h2>
    <p style="line-height:1.5">${c.lead}</p>
    <table style="font-size:14px;margin:12px 0;border-collapse:collapse">
      <tr><td style="color:#64748b;padding:2px 12px 2px 0">Booking</td><td><b>${h(b.bookingRef)}</b></td></tr>
      <tr><td style="color:#64748b;padding:2px 12px 2px 0">Stay</td><td>${day(b.checkIn)} to ${day(b.checkOut)} · ${b.rooms} room${b.rooms > 1 ? 's' : ''}</td></tr>
      <tr><td style="color:#64748b;padding:2px 12px 2px 0">Amount</td><td>${inr(b.totalAmount)} incl. GST</td></tr>
    </table>
    ${site() ? `<p><a href="${h(link)}" style="display:inline-block;background:#e7194a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold">${c.cta}</a></p>
    <p style="font-size:12px;color:#64748b">${kind === 'expired' ? '' : `Or open My Bookings: ${h(site())}/my-bookings`}</p>` : ''}
    ${support.phone || support.email ? `<p style="font-size:12px;color:#64748b">Questions? ZivoHotels support: ${[support.phone, support.email].filter(Boolean).map(h).join(' · ')}</p>` : ''}
  </body></html>`;
  if (b.userId) {
    // The bell too (no second email)
    const { notifyUser } = await import('./notifyService.js');
    notifyUser(b.userId, {
      type: `PAY_LATER_${kind.toUpperCase()}`,
      title: { reserved: `Reserved: pay by ${payLaterLabel(b.expiresAt)}`, reminder: `Pay by ${payLaterLabel(b.expiresAt)} or the booking is cancelled`, expired: 'Booking cancelled: payment not received' }[kind],
      message: `${b.bookingRef} · ${b.hotel.name} · ${inr(b.totalAmount)}`,
      link: '/my-bookings',
      metadata: { bookingId: b.id },
      sms: kind === 'reminder' ? `ZivoHotels: pay ${inr(b.totalAmount)} by ${payLaterLabel(b.expiresAt)} to keep booking ${b.bookingRef}, or it will be cancelled.` : null,
    }).catch(() => {});
  }
  return queueService.enqueue('email', 'SEND_PAY_LATER', { to: b.guestEmail, subject: c.subject, html }, { priority: 2 });
};

/**
 * Sends the one reminder for unpaid pay-later bookings whose reminder time has come.
 * Run by the booking expiry job every 5 minutes.
 */
export const sendDueReminders = async (now = new Date()) => {
  const due = await prisma.booking.findMany({
    where: { paymentType: 'PAY_AT_HOTEL', status: 'PENDING', paymentStatus: { not: 'PAID' }, expiresAt: { gt: now } },
    select: { id: true, createdAt: true, expiresAt: true, metadata: true },
    take: 200,
  });
  let sent = 0;
  for (const b of due) {
    if (b.metadata?.payLater?.remindedAt || reminderAt(b.createdAt, b.expiresAt) > now) continue;
    // Mark first, so a slow email never produces two reminders
    await prisma.booking.update({
      where: { id: b.id },
      data: { metadata: { ...(b.metadata || {}), payLater: { ...(b.metadata?.payLater || {}), remindedAt: now.toISOString() } } },
    });
    await sendPayLaterEmail(b.id, 'reminder').catch((e) => console.error('[PayLater] reminder failed:', e.message));
    sent += 1;
  }
  return sent;
};
