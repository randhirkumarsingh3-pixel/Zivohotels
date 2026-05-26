import { Prisma } from '@prisma/client';
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

    const dates = getDatesInRange(new Date(booking.checkIn), new Date(booking.checkOut));
    
    await tx.inventory.updateMany({
      where: {
        roomTypeId: booking.roomTypeId,
        date: { in: dates },
      },
      data: {
        bookedRooms: { decrement: booking.rooms },
        availableRooms: { increment: booking.rooms },
      },
    });

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
