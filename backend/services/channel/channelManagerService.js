import prisma from '../../config/db.js';
import staahAdapter from './adapters/staahAdapter.js';

const adapters = {
  STAAH: staahAdapter,
  // AXISROOMS: axisRoomsAdapter,
  // RATEGAIN: rateGainAdapter
};

export const channelManagerService = {
  /**
   * Get an adapter for a specific hotel's provider
   */
  getAdapter: async (hotelId) => {
    const hotel = await prisma.hotel.findUnique({
      where: { id: hotelId },
      select: { channelProvider: true }
    });

    if (!hotel || !hotel.channelProvider) {
      throw new Error('Hotel has no channel manager provider configured');
    }

    const adapter = adapters[hotel.channelProvider];
    if (!adapter) {
      throw new Error(`No adapter found for provider: ${hotel.channelProvider}`);
    }

    const integration = await prisma.channelIntegration.findUnique({
      where: { hotelId }
    });

    if (!integration || !integration.isActive) {
      throw new Error('Channel integration is missing or inactive');
    }

    return { adapter, credentials: integration.credentials };
  },

  /**
   * Fetch inventory from external source
   */
  getInventory: async (hotelId, roomTypeId, startDate, endDate) => {
    const { adapter, credentials } = await channelManagerService.getAdapter(hotelId);
    
    // Check mapping to get external IDs
    const mapping = await prisma.channelMapping.findUnique({
      where: { hotelId_roomTypeId: { hotelId, roomTypeId } }
    });

    if (!mapping) throw new Error('No channel mapping found for this room type');

    return adapter.fetchInventory(credentials, mapping.externalHotelId, mapping.externalRoomId, startDate, endDate);
  },

  /**
   * Push a new booking to the external channel manager
   */
  pushBooking: async (hotelId, bookingData) => {
    try {
      const { adapter, credentials } = await channelManagerService.getAdapter(hotelId);
      return await adapter.pushBooking(credentials, bookingData);
    } catch (error) {
      console.error(`[ChannelManager] PushBooking failed for hotel ${hotelId}:`, error.message);
      // In production, we'd add this to a retry queue (BullMQ)
      throw error;
    }
  }
};

export default channelManagerService;
