import prisma from '../../config/db.js';
import { roomsSummary } from '../../services/bookingRoomsView.js';

/**
 * GET /extranet/dashboard: what a property needs to know today, from live data.
 *   today       arrivals, departures and guests in house; rooms sold tonight out of rooms on sale
 *   upcoming    the next arrivals (7 days)
 *   month       stays checking in this month: bookings, room nights, revenue (cancelled excluded)
 *   week        bookings made and cancellations in the last 7 days
 *   reviews     score, count, and how many approved reviews still have no reply
 *   todo        setup gaps that cost bookings (few photos, no map pin, no bank account...)
 * Days are India days (stay dates are stored as midnight IST).
 */
const IST = 330 * 60 * 1000;
const indiaDay = (d = new Date()) => new Date(new Date(d).getTime() + IST).toISOString().slice(0, 10);
const startOf = (day) => new Date(`${day}T00:00:00+05:30`);
const addDays = (day, n) => indiaDay(new Date(startOf(day).getTime() + n * 86400000));
const LIVE = ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED'];

export const getDashboard = async (req, res) => {
  try {
    const hotelId = req.scopedHotelId;
    const today = indiaDay();
    const t0 = startOf(today); const t1 = startOf(addDays(today, 1)); const t8 = startOf(addDays(today, 8));
    const monthStart = startOf(`${today.slice(0, 7)}-01`);
    const [yy, mm] = today.split('-').map(Number);
    const nextMonth = startOf(mm === 12 ? `${yy + 1}-01-01` : `${yy}-${String(mm + 1).padStart(2, '0')}-01`);
    const weekAgo = new Date(Date.now() - 7 * 86400000);

    const booking = { select: { id: true, bookingRef: true, guestName: true, checkIn: true, checkOut: true, rooms: true, status: true, paymentType: true, totalAmount: true, paidAmount: true, roomType: { select: { name: true } }, bookingRooms: { select: { roomType: { select: { name: true } } } } } };
    const [hotel, arrivals, departures, inHouse, upcoming, monthRows, newWeek, cancelledWeek, tonightInv, roomTypes, awaitingReply, unread, images, bank] = await Promise.all([
      prisma.hotel.findUnique({ where: { id: hotelId }, select: { name: true, status: true, description: true, latitude: true, longitude: true, nearbyPlaces: true, reviewScore: true, reviewCount: true, memberDiscountPercent: true, amenities: true } }),
      prisma.booking.findMany({ where: { hotelId, checkIn: { gte: t0, lt: t1 }, status: { in: ['CONFIRMED', 'CHECKED_IN'] } }, orderBy: { createdAt: 'asc' }, ...booking }),
      prisma.booking.findMany({ where: { hotelId, checkOut: { gte: t0, lt: t1 }, status: { in: ['CHECKED_IN', 'CONFIRMED', 'COMPLETED'] } }, ...booking }),
      prisma.booking.count({ where: { hotelId, status: 'CHECKED_IN' } }),
      prisma.booking.findMany({ where: { hotelId, checkIn: { gte: t1, lt: t8 }, status: { in: ['PENDING', 'CONFIRMED'] } }, orderBy: { checkIn: 'asc' }, take: 8, ...booking }),
      prisma.booking.findMany({ where: { hotelId, checkIn: { gte: monthStart, lt: nextMonth }, status: { in: LIVE } }, select: { totalAmount: true, rooms: true, checkIn: true, checkOut: true } }),
      prisma.booking.count({ where: { hotelId, createdAt: { gte: weekAgo }, status: { in: [...LIVE, 'CANCELLED', 'NO_SHOW'] } } }),
      prisma.booking.count({ where: { hotelId, status: 'CANCELLED', updatedAt: { gte: weekAgo } } }).catch(() => 0),
      prisma.inventory.findMany({ where: { date: { gte: t0, lt: t1 }, roomType: { hotelId, isActive: { not: false } } }, select: { totalRooms: true, availableRooms: true, stopSell: true } }),
      prisma.roomType.findMany({ where: { hotelId, isActive: { not: false } }, select: { totalInventory: true, ratePlans: { where: { isActive: true }, select: { id: true } } } }),
      prisma.review.count({ where: { hotelId, status: 'APPROVED', reply: null } }),
      prisma.notification.count({ where: { hotelId, isRead: false } }),
      prisma.hotelImage.count({ where: { hotelId } }),
      prisma.bankDetail.findUnique({ where: { hotelId }, select: { id: true } }).catch(() => null),
    ]);
    if (!hotel) return res.status(404).json({ success: false, message: 'Property not found' });

    const roomsOnSale = roomTypes.reduce((s, r) => s + (r.totalInventory || 0), 0);
    const tonightTotal = tonightInv.length ? tonightInv.reduce((s, i) => s + (i.stopSell ? 0 : i.totalRooms), 0) : roomsOnSale;
    const tonightSold = tonightInv.length ? tonightInv.reduce((s, i) => s + Math.max(0, (i.stopSell ? 0 : i.totalRooms) - i.availableRooms), 0) : 0;
    const nights = (b) => Math.max(1, Math.round((new Date(b.checkOut) - new Date(b.checkIn)) / 86400000));
    const monthRevenue = monthRows.reduce((s, b) => s + Number(b.totalAmount || 0), 0);
    const monthNights = monthRows.reduce((s, b) => s + nights(b) * (b.rooms || 1), 0);
    const shape = ({ bookingRooms, ...b }) => ({ ...b, nights: nights(b), roomType: b.roomType?.name || '', roomsLabel: roomsSummary(bookingRooms, b, b.roomType?.name), dueAtHotel: Math.max(0, Number(b.totalAmount || 0) - Number(b.paidAmount || 0)) });

    const todo = [
      !roomTypes.length && { key: 'rooms', text: 'Add your rooms and rates', link: '/extranet/rooms' },
      roomTypes.length > 0 && roomTypes.some((r) => !r.ratePlans.length) && { key: 'rates', text: 'A room type has no rate plan, so it can’t be booked', link: '/extranet/rooms' },
      images < 5 && { key: 'photos', text: `Add more photos (${images} so far; listings with 5+ get more bookings)`, link: 'EDIT_LISTING' },
      String(hotel.description || '').trim().length < 80 && { key: 'description', text: 'Write a fuller description of your property', link: '/extranet/property' },
      !(hotel.latitude && hotel.longitude) && { key: 'pin', text: 'Set your property on the map so guests see where it is', link: 'EDIT_LISTING' },
      hotel.latitude && hotel.longitude && !(Array.isArray(hotel.nearbyPlaces) && hotel.nearbyPlaces.length) && { key: 'nearby', text: 'Add what’s nearby (stations, attractions, restaurants)', link: 'EDIT_LISTING' },
      !bank && { key: 'bank', text: 'Add the bank account for your payouts', link: '/extranet/settings' },
      awaitingReply > 0 && { key: 'reviews', text: `${awaitingReply} review${awaitingReply === 1 ? '' : 's'} waiting for your reply`, link: '/extranet/reviews' },
    ].filter(Boolean);

    res.json({
      success: true,
      data: {
        today: { date: today, arrivals: arrivals.map(shape), departures: departures.map(shape), inHouse, tonightSold, tonightTotal },
        upcoming: upcoming.map(shape),
        month: { bookings: monthRows.length, roomNights: monthNights, revenue: Math.round(monthRevenue) },
        week: { newBookings: newWeek, cancellations: cancelledWeek },
        reviews: { score: hotel.reviewScore || null, count: hotel.reviewCount || 0, awaitingReply },
        notifications: { unread },
        todo,
      },
    });
  } catch (error) {
    console.error('Error building extranet dashboard:', error);
    res.status(500).json({ success: false, message: 'Could not load the dashboard' });
  }
};
