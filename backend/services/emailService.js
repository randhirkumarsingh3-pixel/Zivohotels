import prisma from '../config/db.js';
import { BOOKING_ROOMS_INCLUDE, guestsLabel } from './bookingRoomsView.js';
import { queueService } from './queueService.js';
import { emailLayout, emailDay, moneyTable, bullets } from './emailLayout.js';
import { bookingFigures, MEAL } from './documents/bookingFigures.js';
import { houseRules } from './documents/houseRules.js';
import { getDocumentSettings } from './documents/documentSettings.js';
import { cancellationText } from './voucherService.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));



/**
 * The guest's booking confirmation email, in the ZivoPlus email look (services/emailLayout.js):
 * hotel and stay, each room, the price with each discount by name, payment, the cancellation
 * deadline, the hotel's own house rules, and buttons to manage the booking and get directions.
 * Everything comes from the booking and the hotel's own data; nothing is made up.
 */
const confirmationEmailHtml = async ({ booking: b, hotel, rooms, policy, settings }) => {
  const f = bookingFigures(b, rooms, { roomTypeName: b.roomType?.name, ratePlan: b.ratePlan });
  const hourly = b.stayType === 'HOURLY';
  const t = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  const hhmm = (v, fb) => { const m = /^(\d{1,2}):(\d{2})/.exec(v || ''); if (!m) return fb; const H = +m[1]; return `${((H + 11) % 12) + 1}:${m[2]} ${H < 12 ? 'am' : 'pm'}`; };
  const contact = hotel.integrationSettings?.contactInfo || {};
  const place = [hotel.location, hotel.city].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ');
  const maps = hotel.latitude && hotel.longitude ? `https://www.google.com/maps/search/?api=1&query=${hotel.latitude},${hotel.longitude}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${hotel.name}, ${hotel.city || ''}`)}`;
  const paid = f.paid >= f.total && f.total > 0;
  const roomsList = (rooms.filter((r) => !r.cancelledAt).length ? rooms.filter((r) => !r.cancelledAt) : [{ roomNumber: 1, roomType: b.roomType, ratePlan: b.ratePlan, adults: b.adults, children: b.children, guestName: b.guestName }])
    .map((r) => `${rooms.length > 1 ? `Room ${r.roomNumber}: ` : ''}${r.roomType?.name || 'Room'} · ${MEAL[r.ratePlan?.mealPlan] || 'Room only'} · ${guestsLabel(r.adults, r.children)} · lead guest ${r.guestName}`);
  const rules = houseRules(hotel);
  const invoiceNote = settings.guestInvoice.mode === 'HOTEL_ISSUES'
    ? 'The property issues the GST invoice for your stay at check-out.'
    : 'Your GST invoice is in My Bookings → Financials.';

  return emailLayout({
    eyebrow: hourly ? 'Hourly stay confirmed' : 'Booking confirmed',
    ref: b.bookingRef,
    status: { label: paid ? 'Paid' : f.paid > 0 ? 'Part-paid' : 'Pay at hotel', tone: paid ? 'ok' : 'warn' },
    preheader: `${hotel.name}, ${hourly ? `${emailDay(b.slotStart || b.checkIn)} ${t(b.slotStart || b.checkIn)}` : `${emailDay(b.checkIn)} to ${emailDay(b.checkOut)}`}`,
    title: `You're booked at ${hotel.name}`,
    body: `<p style="margin:0 0 4px">Hi ${esc(String(b.guestName || '').split(' ')[0] || 'there')}, your ${hourly ? 'hourly stay' : 'stay'} is confirmed. Show the attached voucher (or this email) at check-in with a photo ID.</p><p style="margin:0;color:#64748b">${esc(place)}</p>`,
    rows: hourly
      ? [['Date', emailDay(b.slotStart || b.checkIn)], ['Check-in', t(b.slotStart || b.checkIn)], ['Check-out', `${t(b.slotEnd || b.checkOut)} (${b.hours} hours)`], ['Guests', guestsLabel(b.adults, b.children)]]
      : [['Check-in', `${emailDay(b.checkIn)}, from ${hhmm(hotel.checkInTime, '2:00 pm')}`], ['Check-out', `${emailDay(b.checkOut)}, by ${hhmm(hotel.checkOutTime, '11:00 am')}`], ['Stay', `${f.nights} night${f.nights === 1 ? '' : 's'} · ${b.rooms} room${b.rooms === 1 ? '' : 's'} · ${guestsLabel(b.adults, b.children)}`], ['Front desk', contact.receptionPhone || '']],
    sections: [
      { title: rooms.length > 1 ? 'Your rooms' : 'Your room', html: bullets(roomsList) },
      { title: 'Price', html: moneyTable([
        ...f.lines.map((l) => [l.label, `₹${f.lines.length ? Math.round(l.amount).toLocaleString('en-IN') : 0}`]),
        ...f.discounts.map(([k, v]) => [k, `− ₹${Math.round(v).toLocaleString('en-IN')}`, 'less']),
        [`GST${f.taxPct != null ? ` (${f.taxPct}%)` : ''}`, `₹${Math.round(f.tax).toLocaleString('en-IN')}`],
        ['Total', `₹${Math.round(f.total).toLocaleString('en-IN')}`, 'total'],
        ['Paid online', `₹${Math.round(f.paid).toLocaleString('en-IN')}`, 'plus'],
        f.due ? ['To pay at the hotel', `₹${Math.round(f.due).toLocaleString('en-IN')}`, 'sub'] : null,
      ]) },
      { title: 'Cancellation', html: bullets(cancellationText(b, policy)) },
      rules.length ? { title: 'House rules', html: bullets(rules) } : null,
    ],
    cta: { label: 'Manage booking', href: '/my-bookings' },
    cta2: { label: 'Get directions', href: maps },
    note: `${invoiceNote} The property may ask for a refundable security deposit and charges extras separately.`,
  });
};

/** The confirmation email for a booking (loaded with hotel, room type, rate plan, rooms). */
export const buildConfirmationEmail = async (booking) => {
  const [policy, settings] = await Promise.all([
    booking.stayType === 'HOURLY' ? null : prisma.cancellationPolicy.findUnique({ where: { hotelId: booking.hotelId } }),
    getDocumentSettings(),
  ]);
  return { html: await confirmationEmailHtml({ booking, hotel: booking.hotel, rooms: booking.bookingRooms || [], policy, settings }), settings };
};

/**
 * Send Booking Confirmation Email
 * @param {string} bookingId - Booking ID in DB
 * @returns {Promise<boolean>}
 */
export const sendBookingConfirmationEmail = async (bookingId) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { hotel: true, roomType: { select: { name: true } }, ratePlan: { select: { name: true, mealPlan: true } }, ...BOOKING_ROOMS_INCLUDE },
    });
    if (!booking) {
      console.error(`[EmailService] Booking not found: ${bookingId}`);
      return false;
    }
    const { html, settings } = await buildConfirmationEmail(booking);
    await queueService.enqueue('email', 'SEND_BOOKING_CONFIRMATION', {
      to: booking.guestEmail,
      subject: booking.stayType === 'HOURLY'
        ? `Hourly stay confirmed at ${booking.hotel.name} · ${booking.bookingRef}`
        : `Booking confirmed at ${booking.hotel.name} · ${booking.bookingRef}`,
      html,
      // The booking voucher PDF, drawn when the email is sent
      ...(settings.email.attachGuestVoucher ? { financeAttachments: [{ type: 'guestVoucher', bookingId }] } : {}),
    }, { priority: 2 });
    // Bell / SMS for the guest and the "New booking" alert + email for the hotel (once per booking)
    import('./bookingNotices.js').then((m) => m.onBookingConfirmed(bookingId)).catch((e) => console.error('[Notify] booking confirmed:', e.message));
    return true;
  } catch (error) {
    console.error('[EmailService] Error enqueuing booking confirmation email:', error);
    return false;
  }
};

/**
 * Emails a one-time code. `purpose` picks the wording (sign-up, sign-in, hotel email check).
 */
export const sendOTPEmail = async (to, otp, expiryMinutes = 10, { purpose = 'VERIFY', name } = {}) => {
  const { emailLayout } = await import('./emailLayout.js');
  const what = {
    SIGNUP: { subject: `${otp} is your ZivoPlus sign-up code`, title: 'Confirm your email', line: 'Enter this code to finish creating your ZivoPlus account:' },
    LOGIN: { subject: `${otp} is your ZivoPlus sign-in code`, title: 'Your sign-in code', line: 'Enter this code to sign in to ZivoPlus:' },
    PHONE: { subject: `${otp} is your ZivoPlus code`, title: 'Your ZivoPlus code', line: 'Enter this code to continue:' },
    VERIFY: { subject: `${otp} is your ZivoPlus verification code`, title: 'Verify your email', line: 'Your ZivoPlus verification code is:' },
    AGREEMENT: { subject: `${otp} is your code to sign the ZivoPlus agreement`, title: 'Sign your agreement', line: 'Enter this code to sign your ZivoPlus listing agreement. If you didn\'t ask to sign, ignore this email:' },
  }[purpose] || { subject: `${otp} is your ZivoPlus code`, title: 'Your ZivoPlus code', line: 'Your code is:' };
  const html = await emailLayout({
    title: what.title,
    body: `${name ? `<p>Hi ${esc(name)},</p>` : ''}<p>${what.line}</p>
      <div style="background:#f1f5f9;border-radius:8px;padding:14px;text-align:center;margin:16px 0;font-size:32px;font-weight:bold;letter-spacing:6px">${esc(otp)}</div>
      <p>It is valid for ${expiryMinutes} minutes and works once. Never share it: ZivoPlus will never ask you for it.</p>`,
    note: "If you didn't ask for this code, you can ignore this email.",
  });
  await queueService.enqueue('email', 'SEND_OTP', { to, subject: what.subject, html }, { priority: 1 });
  return { success: true };
};
