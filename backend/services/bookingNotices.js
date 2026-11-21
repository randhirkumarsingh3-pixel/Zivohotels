/**
 * Who hears about a booking, and how (through the notification hub):
 *
 *  confirmed        guest: bell (+ SMS when connected); the confirmation email is sent separately
 *                   hotel: extranet alert + "New booking" email to every booking recipient
 *  cancelled        guest: bell + email with the refund;  hotel: alert + email
 *  room cancelled   guest: bell (the email is sent by the cancellation);  hotel: email
 *  day before       guest: check-in reminder (bell + email + SMS)
 *  after the stay   guest: "how was it?" review request (bell + email)
 *
 * Each notice is sent once per booking (marked in booking.metadata.notices).
 */
import prisma from '../config/db.js';
import { notifyUser, notifyHotel } from './notifyService.js';
import { emailLayout, emailDay, inr } from './emailLayout.js';
import { BOOKING_ROOMS_INCLUDE, roomsSummary, guestsLabel } from './bookingRoomsView.js';
import { escapeHtml as h } from '../utils/html.js';

const load = (id) => prisma.booking.findUnique({
  where: { id },
  include: {
    hotel: { select: { id: true, name: true, location: true, city: true, integrationSettings: true } },
    roomType: { select: { name: true } },
    ...BOOKING_ROOMS_INCLUDE,
  },
});

/** Marks a notice sent; false if it already was (another process got there first). */
const claim = async (booking, key) => {
  const notices = booking.metadata?.notices || {};
  if (notices[key]) return false;
  await prisma.booking.update({
    where: { id: booking.id },
    data: { metadata: { ...(booking.metadata || {}), notices: { ...notices, [key]: new Date().toISOString() } } },
  });
  return true;
};

const stayRows = (b) => [
  ['Booking', b.bookingRef],
  ['Hotel', b.hotel?.name],
  ['Check-in', emailDay(b.checkIn)],
  ['Check-out', emailDay(b.checkOut)],
  ['Rooms', roomsSummary(b.bookingRooms, b, b.roomType?.name)],
  ['Guests', guestsLabel(b.adults, b.children)],
];
const guestRows = (b) => [
  ['Guest', b.guestName], ['Phone', b.guestPhone], ['Email', b.guestEmail],
];

export const onBookingConfirmed = async (bookingId) => {
  const b = await load(bookingId);
  if (!b || b.status !== 'CONFIRMED' || !(await claim(b, 'confirmed'))) return;
  const when = `${emailDay(b.checkIn)} to ${emailDay(b.checkOut)}`;

  if (b.userId) {
    await notifyUser(b.userId, {
      type: 'BOOKING_CONFIRMED',
      title: `Booking confirmed: ${b.hotel.name}`,
      message: `${b.bookingRef} · ${when}`,
      link: '/my-bookings',
      metadata: { bookingId: b.id },
      sms: `ZivoHotels: booking ${b.bookingRef} at ${b.hotel.name} is confirmed for ${when}. Details: My Bookings.`,
    });
  }

  await notifyHotel(b.hotelId, {
    type: 'NEW_BOOKING',
    title: `New booking: ${b.guestName}`,
    message: `${b.bookingRef} · ${when} · ${roomsSummary(b.bookingRooms, b, b.roomType?.name)} · ${inr(b.totalAmount)}`,
    metadata: { bookingId: b.id },
    email: {
      jobType: 'SEND_NEW_BOOKING_HOTEL',
      priority: 2,
      subject: `New booking ${b.bookingRef}: ${b.guestName}, ${emailDay(b.checkIn)}`,
      html: await emailLayout({
        title: `New booking at ${b.hotel.name}`,
        body: `<p>You have a new confirmed booking${b.paymentStatus === 'PAID' ? ', paid online' : ''}.</p>`,
        rows: [...stayRows(b), ...guestRows(b), ['Amount', `${inr(b.totalAmount)} incl. GST`]],
        cta: { label: 'Open in the extranet', href: '/extranet/bookings' },
        note: 'You get this email at your reception email, the owner email and the booking emails set in Extranet → Settings.',
      }),
    },
  });
};

/**
 * A whole booking was cancelled (by the guest, the hotel, an admin, or for non-payment).
 * `refundTo`: 'wallet' | 'source' | null.
 */
export const onBookingCancelled = async (bookingId, { initiatedBy = 'GUEST', refundAmount = 0, refundTo = null, reason = null } = {}) => {
  const b = await load(bookingId);
  if (!b || !(await claim(b, 'cancelled'))) return;
  const by = { GUEST: 'You cancelled', HOTEL: `${b.hotel.name} cancelled`, ADMIN: 'ZivoHotels cancelled', SYSTEM: 'We cancelled' }[initiatedBy] || 'We cancelled';
  const refundLine = refundAmount > 0
    ? `A refund of <b>${inr(refundAmount)}</b> ${refundTo === 'wallet' ? 'has been added to your Zivo Cash wallet.' : 'is on its way to your original payment method (usually 5–7 working days).'}`
    : 'No refund is due under the cancellation policy, or nothing was paid.';

  if (b.userId || b.guestEmail) {
    const email = b.guestEmail ? {
      to: b.guestEmail,
      jobType: 'SEND_BOOKING_CANCELLED_GUEST',
      priority: 2,
      subject: `Booking cancelled · ${b.bookingRef} · ${b.hotel.name}`,
      html: await emailLayout({
        title: 'Your booking is cancelled',
        body: `<p>${h(by)} booking <b>${h(b.bookingRef)}</b> at <b>${h(b.hotel.name)}</b>.${reason ? ` Reason: ${h(reason)}.` : ''}</p><p>${refundLine}</p>`,
        rows: stayRows(b),
        cta: { label: 'Find another stay', href: '/' },
      }),
    } : null;
    if (b.userId) {
      await notifyUser(b.userId, {
        type: 'BOOKING_CANCELLED', title: `Booking cancelled: ${b.hotel.name}`,
        message: `${b.bookingRef}${refundAmount > 0 ? ` · refund ${inr(refundAmount)}${refundTo === 'wallet' ? ' to Zivo Cash' : ''}` : ''}`,
        link: '/my-bookings', metadata: { bookingId: b.id }, email,
      });
    } else if (email) {
      const { queueService } = await import('./queueService.js');
      await queueService.enqueue('email', email.jobType, { to: email.to, subject: email.subject, html: email.html }, { priority: 2 }).catch(() => {});
    }
  }

  // The hotel already gets an extranet alert from the cancellation itself: email only
  await notifyHotel(b.hotelId, {
    inApp: false,
    email: {
      jobType: 'SEND_BOOKING_CANCELLED_HOTEL',
      priority: 2,
      subject: `Booking cancelled ${b.bookingRef}: ${b.guestName}, ${emailDay(b.checkIn)}`,
      html: await emailLayout({
        title: `Booking ${b.bookingRef} was cancelled`,
        body: `<p>${h({ GUEST: 'The guest', HOTEL: 'Your team', ADMIN: 'ZivoHotels', SYSTEM: 'The system (payment not received)' }[initiatedBy] || 'Someone')} cancelled this booking. The rooms are back in your inventory.</p>`,
        rows: [...stayRows(b), ...guestRows(b), ['Guest refund', refundAmount > 0 ? inr(refundAmount) : 'None']],
        cta: { label: 'Open in the extranet', href: '/extranet/bookings' },
      }),
    },
  });
};

/** One room of a multi-room booking was cancelled. */
export const onRoomCancelled = async (bookingId, { roomNumber, refundAmount = 0, initiatedBy = 'GUEST' } = {}) => {
  const b = await load(bookingId);
  if (!b) return;
  if (b.userId) {
    await notifyUser(b.userId, {
      type: 'ROOM_CANCELLED', title: `Room ${roomNumber} cancelled: ${b.hotel.name}`,
      message: `${b.bookingRef}${refundAmount > 0 ? ` · refund ${inr(refundAmount)}` : ''}`,
      link: '/my-bookings', metadata: { bookingId: b.id, roomNumber },
    });
  }
  await notifyHotel(b.hotelId, {
    inApp: false,
    email: {
      jobType: 'SEND_ROOM_CANCELLED_HOTEL',
      subject: `Room ${roomNumber} cancelled · ${b.bookingRef}`,
      html: await emailLayout({
        title: `Room ${roomNumber} of ${b.bookingRef} was cancelled`,
        body: `<p>${initiatedBy === 'GUEST' ? 'The guest' : initiatedBy === 'HOTEL' ? 'Your team' : 'ZivoHotels'} cancelled one room. The rest of the booking stands, and the room is back in your inventory.</p>`,
        rows: [...stayRows(b), ['Guest', b.guestName]],
        cta: { label: 'Open in the extranet', href: '/extranet/bookings' },
      }),
    },
  });
};

const HOUR = 3600 * 1000;

/** The day-before check-in reminders and the after-stay review requests that are due. */
export const sendStayMessages = async (now = new Date()) => {
  let sent = 0;
  // Check-in within the next 12-36 hours (tomorrow), still confirmed
  const arriving = await prisma.booking.findMany({
    where: { status: 'CONFIRMED', checkIn: { gte: new Date(now.getTime() + 12 * HOUR), lte: new Date(now.getTime() + 36 * HOUR) } },
    select: { id: true }, take: 300,
  });
  for (const { id } of arriving) {
    const b = await load(id);
    if (!b || b.metadata?.notices?.checkinReminder || !(await claim(b, 'checkinReminder'))) continue;
    const contact = b.hotel.integrationSettings?.contactInfo || {};
    const email = b.guestEmail ? {
      to: b.guestEmail, jobType: 'SEND_CHECKIN_REMINDER',
      subject: `See you tomorrow at ${b.hotel.name} · ${b.bookingRef}`,
      html: await emailLayout({
        title: 'Your stay is tomorrow',
        body: `<p>Hi ${h(String(b.guestName || '').split(' ')[0])}, we hope you're ready for your stay at <b>${h(b.hotel.name)}</b>. Carry a government photo ID for every adult guest.${b.paymentStatus !== 'PAID' ? ` <b>${inr(b.totalAmount - (Number(b.paidAmount) || 0))}</b> is still to be paid.` : ''}</p>`,
        rows: [...stayRows(b), ['Address', [b.hotel.location, b.hotel.city].filter(Boolean).join(', ')], ['Hotel phone', contact.receptionPhone]],
        cta: { label: 'View booking', href: '/my-bookings' },
        note: 'Running late or need something? Send the hotel a request from My Bookings.',
      }),
    } : null;
    if (b.userId) {
      await notifyUser(b.userId, {
        type: 'CHECKIN_REMINDER', title: `Your stay at ${b.hotel.name} is tomorrow`, message: `${b.bookingRef} · check-in ${emailDay(b.checkIn)}`,
        link: '/my-bookings', metadata: { bookingId: b.id }, email,
        sms: `ZivoHotels: see you tomorrow at ${b.hotel.name}. Booking ${b.bookingRef}. Carry a photo ID.`,
      });
    }
    sent += 1;
  }

  // Checked out 6-48 hours ago and not reviewed yet
  const left = await prisma.booking.findMany({
    where: { status: { in: ['COMPLETED', 'CHECKED_IN', 'CONFIRMED'] }, checkOut: { gte: new Date(now.getTime() - 48 * HOUR), lte: new Date(now.getTime() - 6 * HOUR) }, review: null, userId: { not: null } },
    select: { id: true }, take: 300,
  });
  for (const { id } of left) {
    const b = await load(id);
    if (!b || b.metadata?.notices?.reviewRequest || !(await claim(b, 'reviewRequest'))) continue;
    await notifyUser(b.userId, {
      type: 'REVIEW_REQUEST', title: `How was ${b.hotel.name}?`, message: 'Rate your stay: it takes a minute and helps other guests.',
      link: '/my-bookings', metadata: { bookingId: b.id },
      email: b.guestEmail ? {
        to: b.guestEmail, jobType: 'SEND_REVIEW_REQUEST',
        subject: `How was your stay at ${b.hotel.name}?`,
        html: await emailLayout({
          title: 'How was your stay?',
          body: `<p>Thanks for staying at <b>${h(b.hotel.name)}</b> with ZivoHotels. Tell other guests how it went: rate your stay in My Bookings. It takes a minute.</p>`,
          rows: [['Booking', b.bookingRef], ['Stay', `${emailDay(b.checkIn)} to ${emailDay(b.checkOut)}`]],
          cta: { label: 'Rate your stay', href: '/my-bookings' },
        }),
      } : null,
    });
    sent += 1;
  }
  return sent;
};
