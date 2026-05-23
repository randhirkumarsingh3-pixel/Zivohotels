import prisma from '../../config/db.js';
import channelManagerService from '../channel/channelManagerService.js';

export const unifiedInventoryService = {
  /**
   * Gets available inventory for a room type and date range
   */
  getAvailableInventory: async (hotelId, roomTypeId, startDate, endDate) => {
    const hotel = await prisma.hotel.findUnique({
      where: { id: hotelId },
      select: { integrationMode: true, channelProvider: true }
    });

    if (hotel?.integrationMode === 'CHANNEL_MANAGER') {
      // In Channel Manager mode, we trust the external source (often cached in our DB via webhooks)
      // But for real-time validation, we might call the provider adapter
      return channelManagerService.getInventory(hotelId, roomTypeId, startDate, endDate);
    }

    // INTERNAL MODE: Use local DB source of truth
    const inventories = await prisma.inventory.findMany({
      where: {
        roomTypeId,
        date: { gte: new Date(startDate), lte: new Date(endDate) }
      }
    });

    return inventories;
  },

  /**
   * Updates inventory after a booking or sync
   */
  updateInventory: async (hotelId, roomTypeId, date, delta) => {
    const hotel = await prisma.hotel.findUnique({
      where: { id: hotelId },
      select: { integrationMode: true }
    });

    if (hotel?.integrationMode === 'CHANNEL_MANAGER') {
      // Logic for channel manager sync (usually we don't push inventory back, we just consume)
      // But we might need to decrement our local cache to prevent double-booking before next webhook
      return;
    }

    // INTERNAL MODE: Atomic decrement/increment
    await prisma.inventory.update({
      where: { roomTypeId_date: { roomTypeId, date } },
      data: { available: { increment: delta } }
    });
  }
};

export default unifiedInventoryService;
