/**
 * The notification hub. Every event that should tell someone something goes through here, and
 * this decides how: an in-app alert (the bell, live over the socket), an email, an SMS.
 *
 *  - notifyUser(userId, …):   one person (a guest, an owner as a person, an admin)
 *  - notifyAdmins(…):         every active admin, plus ADMIN_ALERT_EMAILS by email
 *  - notifyHotel(hotelId, …): a property's team: extranet alert, and email to the hotel's
 *                             booking recipients (reception email, owner, extra booking emails)
 *
 * Nothing here throws: a failed alert must never fail the booking or payment that caused it.
 */
import prisma from '../config/db.js';
import { queueService } from './queueService.js';
import { sendSms } from './smsService.js';
import socketService from './socketService.js';

const warn = (what, e) => console.error(`[Notify] ${what}:`, e?.message || e);
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());

const queueEmail = (to, email, jobType = 'NOTIFY') => queueService
  .enqueue('email', email.jobType || jobType, { to, subject: email.subject, html: email.html, ...(email.financeAttachments ? { financeAttachments: email.financeAttachments } : {}) }, { priority: email.priority || 3 })
  .catch((e) => warn(`email to ${to} not queued`, e));

/**
 * One person. `email`: { subject, html } sends to their account email (or email.to).
 * `sms`: text, sent only to a verified phone.
 */
export const notifyUser = async (userId, { type, title, message, link = null, metadata = null, email = null, sms = null, inApp = true } = {}) => {
  if (!userId) return null;
  let row = null;
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, phone: true, phoneVerifiedAt: true, status: true } });
    if (!user || user.status === 'BLOCKED') return null;
    if (inApp) {
      row = await prisma.userNotification.create({ data: { userId, type, title, message, link, metadata: metadata || undefined } });
      socketService.emitTo(`user_${userId}`, 'notification', row);
    }
    if (email) {
      const to = email.to || user.email;
      if (isEmail(to)) await queueEmail(to, email);
    }
    if (sms && user.phone && user.phoneVerifiedAt) await sendSms(user.phone, sms).catch((e) => warn('sms failed', e));
  } catch (e) { warn(`user ${userId}`, e); }
  return row;
};

/** Emails for admin alerts (comma-separated ADMIN_ALERT_EMAILS); the bell reaches every admin. */
export const adminAlertEmails = () => String(process.env.ADMIN_ALERT_EMAILS || '').split(',').map((s) => s.trim()).filter(isEmail);

export const notifyAdmins = async ({ type, title, message, link = null, metadata = null, email = null } = {}) => {
  try {
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN', status: { not: 'BLOCKED' } }, select: { id: true } });
    if (admins.length) {
      await prisma.userNotification.createMany({ data: admins.map((a) => ({ userId: a.id, type, title, message, link, metadata: metadata || undefined })) });
      socketService.emitTo('admin_global', 'notification', { type, title, message, link, createdAt: new Date() });
    }
    if (email) for (const to of adminAlertEmails()) await queueEmail(to, email);
  } catch (e) { warn('admins', e); }
};

/**
 * Where a hotel's booking emails go: the reception email, the owner's login email, any extra
 * addresses the hotel added in Extranet → Settings → Booking emails, and the hotel's team members
 * (Extranet → Team) whose role can see bookings. No duplicates.
 */
export const hotelEmailRecipients = (hotel) => {
  const contact = hotel?.integrationSettings?.contactInfo || {};
  const extra = Array.isArray(contact.bookingEmails) ? contact.bookingEmails : [];
  const team = (hotel?.staff || [])
    .filter((m) => m.status === 'ACTIVE' && m.user?.status !== 'BLOCKED' && (m.role?.permissions || []).some((p) => p === 'bookings.view' || p === 'bookings.manage'))
    .map((m) => m.user?.email);
  const seen = new Set();
  return [contact.receptionEmail, hotel?.owner?.email, ...extra, ...team]
    .map((e) => String(e || '').trim().toLowerCase())
    .filter((e) => isEmail(e) && !seen.has(e) && seen.add(e));
};

/** What hotelEmailRecipients needs, for a Prisma select on a hotel. */
export const HOTEL_RECIPIENTS_SELECT = {
  integrationSettings: true,
  owner: { select: { email: true, name: true } },
  staff: { where: { scope: 'EXTRANET', status: 'ACTIVE' }, select: { status: true, user: { select: { email: true, status: true } }, role: { select: { permissions: true } } } },
};

const loadHotel = (hotelId) => prisma.hotel.findUnique({
  where: { id: hotelId },
  select: { id: true, name: true, ...HOTEL_RECIPIENTS_SELECT },
});

/**
 * A property's team. Writes the extranet alert (and pushes it live). `email`: { subject, html }
 * goes to every booking recipient (see hotelEmailRecipients), or email.to if given.
 */
export const notifyHotel = async (hotelId, { type, title, message, metadata = {}, email = null, inApp = true } = {}) => {
  if (!hotelId) return null;
  let row = null;
  try {
    if (inApp) {
      row = await prisma.notification.create({ data: { hotelId, type, title, message, metadata } });
      socketService.emitTo(`hotel_${hotelId}`, 'notification', row);
    }
    if (email) {
      const hotel = await loadHotel(hotelId);
      const to = email.to ? [].concat(email.to) : hotelEmailRecipients(hotel);
      for (const addr of to) if (isEmail(addr)) await queueEmail(addr, email);
    }
  } catch (e) { warn(`hotel ${hotelId}`, e); }
  return row;
};

// ─── The bell (guests and admins) ───────────────────────────────────────────────────────────────

export const listForUser = async (userId, { limit = 30 } = {}) => {
  const [items, unread] = await Promise.all([
    prisma.userNotification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: Math.min(Number(limit) || 30, 100) }),
    prisma.userNotification.count({ where: { userId, isRead: false } }),
  ]);
  return { items, unread };
};

/** Marks some (ids) or all of a person's notifications read. */
export const markUserRead = (userId, ids) => prisma.userNotification.updateMany({
  where: { userId, isRead: false, ...(Array.isArray(ids) && ids.length ? { id: { in: ids.map(String) } } : {}) },
  data: { isRead: true },
});
