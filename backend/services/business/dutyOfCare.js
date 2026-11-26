/**
 * ZivoPlus for Business: where the company's travellers are (duty of care). For admins, bookers,
 * approvers and finance (bookings.viewAll), from the company's confirmed bookings:
 *   staying    checked in or due in, and not yet checked out (today in India)
 *   arriving   checking in within the next days
 *   recent     checked out within the last days
 * with the hotel's address, map position and front-desk phone, the traveller's phone and cost
 * centre, and a count by city of who is staying now. Also as a CSV file.
 */
import prisma from '../../config/db.js';
import { membershipFor, can } from './organisationService.js';

const fail = (m, code = 400) => Object.assign(new Error(m), { statusCode: code });
const DAY = 86400000;
/** Today's date in India, as UTC midnight (how stay dates are kept) */
const todayIst = () => new Date(`${new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10)}T00:00:00.000Z`);
const dayOf = (d) => new Date(`${new Date(new Date(d).getTime() + 5.5 * 3600000).toISOString().slice(0, 10)}T00:00:00.000Z`);

const row = (b, today) => {
  const contact = b.hotel?.integrationSettings?.contactInfo || {};
  const t = b.businessPricing?.traveller || null;
  const ci = dayOf(b.checkIn); const co = dayOf(b.checkOut);
  const when = ci <= today && co > today ? 'STAYING' : ci > today ? 'ARRIVING' : 'RECENT';
  return {
    bookingId: b.id, bookingRef: b.bookingRef, status: b.status, when,
    traveller: { name: t?.name || b.guestName, memberId: t?.memberId || null, costCenter: t?.costCenter || null, phone: b.guestPhone || null },
    hotel: {
      id: b.hotel?.id, name: b.hotel?.name, city: b.hotel?.city || '',
      address: [b.hotel?.location, b.hotel?.city, b.hotel?.pincode].filter(Boolean).join(', '),
      phone: contact.receptionPhone || contact.guestLandline || null,
      latitude: b.hotel?.latitude ?? null, longitude: b.hotel?.longitude ?? null,
    },
    checkIn: b.checkIn, checkOut: b.checkOut, nights: Math.max(1, Math.round((co - ci) / DAY)), rooms: b.rooms,
  };
};

export const travellers = async (orgId, user, { days = 7, city = '' } = {}) => {
  const { org, member } = await membershipFor(orgId, user);
  if (org.kind !== 'CORPORATE') throw fail('This is for company accounts.');
  if (!can(member, 'bookings.viewAll')) throw fail('Only admins, bookers, approvers and finance see where everyone is.', 403);
  const n = Math.min(Math.max(Math.round(Number(days) || 7), 1), 30);
  const today = todayIst();
  const until = new Date(today.getTime() + (n + 1) * DAY);
  const since = new Date(today.getTime() - n * DAY);
  const rows = await prisma.booking.findMany({
    where: {
      organisationId: org.id, status: { in: ['CONFIRMED', 'CHECKED_IN', 'COMPLETED'] },
      checkIn: { lt: until }, checkOut: { gte: since },
    },
    include: { hotel: { select: { id: true, name: true, city: true, location: true, pincode: true, latitude: true, longitude: true, integrationSettings: true } } },
    orderBy: { checkIn: 'asc' }, take: 1000,
  });
  const c = String(city || '').trim().toLowerCase();
  const list = rows.map((b) => row(b, today))
    // A booking still CONFIRMED after its check-out date was never checked in: not "recent"
    .filter((r) => !(r.when === 'RECENT' && r.status === 'CONFIRMED'))
    .filter((r) => !c || r.hotel.city.toLowerCase() === c);
  const byCity = {};
  for (const r of list.filter((x) => x.when === 'STAYING')) byCity[r.hotel.city || 'Other'] = (byCity[r.hotel.city || 'Other'] || 0) + 1;
  const cities = [...new Set(rows.map((b) => b.hotel?.city).filter(Boolean))].sort();
  return {
    days: n, today, cities,
    staying: list.filter((r) => r.when === 'STAYING'),
    arriving: list.filter((r) => r.when === 'ARRIVING'),
    recent: list.filter((r) => r.when === 'RECENT').reverse(),
    byCity: Object.entries(byCity).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ city: name, count })),
  };
};

const cell = (v) => {
  const s = String(v ?? '');
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // never a formula in a spreadsheet
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const BOM = String.fromCharCode(0xfeff); // so Excel reads the file as UTF-8
const d10 = (d) => dayOf(d).toISOString().slice(0, 10);

export const travellersCsv = async (orgId, user, q = {}) => {
  const t = await travellers(orgId, user, q);
  const head = ['Where', 'Traveller', 'Phone', 'Cost centre', 'Hotel', 'City', 'Address', 'Hotel phone', 'Check-in', 'Check-out', 'Booking', 'Status'];
  const label = { STAYING: 'Staying now', ARRIVING: 'Arriving', RECENT: 'Checked out' };
  const lines = [...t.staying, ...t.arriving, ...t.recent].map((r) => [label[r.when], r.traveller.name, r.traveller.phone, r.traveller.costCenter, r.hotel.name, r.hotel.city, r.hotel.address, r.hotel.phone, d10(r.checkIn), d10(r.checkOut), r.bookingRef, r.status].map(cell).join(','));
  return `${BOM}${[head.join(','), ...lines].join('\n')}\n`;
};

export default { travellers, travellersCsv };
