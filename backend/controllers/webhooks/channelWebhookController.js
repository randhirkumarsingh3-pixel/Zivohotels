import prisma from '../../config/db.js';
import channelManagerService from '../../services/channel/channelManagerService.js';

export const channelWebhookController = {
  /**
   * Handle incoming ARI (Availability, Rate, Inventory) updates
   */
  handleARIUpdate: async (req, res) => {
    try {
      const { provider } = req.params; // e.g., staah
      const payload = req.body;

      // 1. Authenticate (HMAC / API Key)
      // verifySignature(req);

      // 2. Identify Hotel via mapping
      // In a real system, the payload contains externalHotelId
      const externalHotelId = payload.hotel_id;
      const hotelMapping = await prisma.channelMapping.findFirst({
        where: { externalHotelId }
      });

      if (!hotelMapping) {
        return res.status(404).json({ success: false, message: 'Hotel mapping not found' });
      }

      const hotelId = hotelMapping.hotelId;

      // 3. Process updates based on provider logic
      const { adapter } = await channelManagerService.getAdapter(hotelId);
      const unifiedUpdate = await adapter.handleWebhook(payload);

      // 4. Update Zivo DB (Inventory & potentially base rates)
      // This keeps Zivo in sync with the Channel Manager source of truth
      for (const update of unifiedUpdate.updates) {
        // Map externalRoomId back to roomTypeId
        const roomMapping = await prisma.channelMapping.findFirst({
          where: { hotelId, externalRoomId: update.roomTypeId }
        });

        if (roomMapping) {
          await prisma.inventory.upsert({
            where: {
              roomTypeId_date: {
                roomTypeId: roomMapping.roomTypeId,
                date: new Date(update.date)
              }
            },
            update: { available: update.available },
            create: {
              hotelId,
              roomTypeId: roomMapping.roomTypeId,
              date: new Date(update.date),
              available: update.available,
              total: update.available // Assuming CM sends available physical rooms
            }
          });
        }
      }

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('[Webhook] ARI Update Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
};

export default channelWebhookController;
