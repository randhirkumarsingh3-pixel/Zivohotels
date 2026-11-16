import { Prisma } from '@prisma/client';
import { scheduleRecompute } from '../services/dynamicPricingService.js';
import { getDatesInRange } from '../utils/dateUtils.js';

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
      throw new Error("RoomType not found");
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
      throw new Error(`Not available on ${closed.date.toDateString()} (closed for sale)`);
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
      throw new Error("Sold out for the requested dates");
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
    const rows = await tx.bookingRoom.findMany({ where: { bookingId: booking.id }, select: { roomTypeId: true } });
    if (!rows.length) return [{ roomTypeId: booking.roomTypeId, rooms: booking.rooms }];
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
