import { Prisma } from '@prisma/client';

import { scheduleRecompute } from '../services/dynamicPricingService.js';
import { getDatesInRange } from '../utils/dateUtils.js';

/** A refusal the guest should see as it is (sold out, closed), not as a server error. */
const refusal = (statusCode, message) => Object.assign(new Error(message), { statusCode, status: statusCode, code: statusCode === 409 ? 'SOLD_OUT' : 'NOT_FOUND' });

export const inventoryRepository = {

  /**
   * Locks inventory for the requested dates using SELECT ... FOR UPDATE
   * Must be called inside a Prisma transaction ($transaction)
   * 
   * @param {Object} tx - The Prisma transaction client
   * @param {Object} params - Locking parameters
   */
  lockInventory: async (tx, params) => {
    const { roomTypeId, checkInDate, checkOutDate, rooms } = params;
    const dateRange = getDatesInRange(checkInDate, checkOutDate);

    // Ensure inventory records exist in the database for the dates (fallback to physical inventory)
    const roomType = await tx.roomType.findUnique({
      where: { id: roomTypeId },
      select: { totalInventory: true }
    });
    if (!roomType) {
      throw refusal(404, "This room type is no longer available");
    }

    const inventoryData = dateRange.map(date => ({
      roomTypeId,
      date,
      totalRooms: roomType.totalInventory,
      availableRooms: roomType.totalInventory,
      bookedRooms: 0
    }));

    await tx.inventory.createMany({
      data: inventoryData,
      skipDuplicates: true
    });

    // 1. Hard Lock the rows to prevent race conditions
    await tx.$queryRaw`
      SELECT id FROM "Inventory"
      WHERE "roomTypeId" = ${roomTypeId}
      AND "date" IN (${Prisma.join(dateRange)})
      FOR UPDATE
    `;

    // 1b. Dates closed for sale (stop-sell) can't be booked, checked under the same row locks
    const closed = await tx.inventory.findFirst({
      where: { roomTypeId, date: { in: dateRange }, stopSell: true },
      select: { date: true }
    });
    if (closed) {
      throw refusal(409, `This room isn't available on ${closed.date.toDateString()} (closed for sale). Please choose other dates or another room.`);
    }

    // 2. Atomic Bulk Update
    const updateResult = await tx.inventory.updateMany({
      where: {
        roomTypeId,
        date: { in: dateRange },
        availableRooms: { gte: rooms }
      },
      data: {
        availableRooms: { decrement: rooms },
        bookedRooms: { increment: rooms }
      }
    });

    if (updateResult.count !== dateRange.length) {
      // Someone else took the last room between search and booking: a normal answer, not a server error
      throw refusal(409, "Sorry, this room has just sold out for your dates. Please choose another room or other dates.");
    }

    // 3. Hard Guard against Negative Inventory
    const negativeCheck = await tx.inventory.findFirst({
      where: { roomTypeId, date: { in: dateRange }, availableRooms: { lt: 0 } }
    });

    if (negativeCheck) {
      throw new Error("Inventory corruption detected");
    }

    return dateRange;
  },

  /**
   * Restores inventory (used in cancellation, expiry, failure)
   * Must be called inside a Prisma transaction
   * 
   * @param {Object} tx - The Prisma transaction client
   * @param {Object} booking - The booking record to restore from
   */
  restoreInventory: async (tx, booking) => {
    if (booking.status === 'CANCELLED') return; // Safety check
    if (booking.stayType === 'HOURLY') return; // hourly stays never take night rooms
    scheduleRecompute(booking.hotelId); // rooms freed up: refresh dynamic prices shortly

    const dates = getDatesInRange(new Date(booking.checkIn), new Date(booking.checkOut));
    
    // Each room type of the booking gets its rooms back
    for (const group of await inventoryRepository.roomsByType(tx, booking)) {
      await tx.inventory.updateMany({
        where: {
          roomTypeId: group.roomTypeId,
          date: { in: dates },
        },
        data: {
          bookedRooms: { decrement: group.rooms },
          availableRooms: { increment: group.rooms },
        },
      });
    }

    await tx.auditLog.create({
      data: {
        action: 'INVENTORY_RESTORED',
        entityType: 'INVENTORY',
        entityId: booking.roomTypeId,
        userId: 'SYSTEM',
        details: { 
          bookingId: booking.id, 
          rooms: booking.rooms, 
          dates: dates.length 
        }
      }
    });
  },

  /**
   * Rooms a booking holds per room type: [{ roomTypeId, rooms }]. From its BookingRoom rows (rooms
   * can be different types); bookings made before those existed hold booking.rooms of one type.
   */
  roomsByType: async (tx, booking) => {
    const all = await tx.bookingRoom.findMany({ where: { bookingId: booking.id }, select: { roomTypeId: true, cancelledAt: true } });
    if (!all.length) return [{ roomTypeId: booking.roomTypeId, rooms: booking.rooms }];
    // Rooms cancelled on their own were already given back
    const rows = all.filter((r) => !r.cancelledAt);
    const counts = new Map();
    for (const r of rows) counts.set(r.roomTypeId, (counts.get(r.roomTypeId) || 0) + 1);
    return [...counts.entries()].map(([roomTypeId, rooms]) => ({ roomTypeId, rooms }));
  },

  /**
   * Checks for low inventory alert (can be outside transaction)
   */
  checkLowInventory: async (prisma, roomTypeId, dateRange) => {
    const lowInventoryAlert = await prisma.inventory.findFirst({
      where: { roomTypeId, date: { in: dateRange }, availableRooms: { lte: 2 } }
    });
    return !!lowInventoryAlert;
  }
};

export default inventoryRepository;
