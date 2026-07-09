import prisma from '../../config/db.js';
import { logActivity } from '../../services/activityService.js';
import { checkFeatureGate } from '../../services/featureGateService.js';
import { mediaService } from '../../services/MediaService.js';

export const getRooms = async (req, res) => {
  try {
    const hotelId = req.scopedHotelId;

    const rooms = await prisma.roomType.findMany({
      where: { hotelId },
      include: {
        images: { include: { image: true } },
        ratePlans: true
      }
    });

    const mappedRooms = await mediaService.signRoomTypesUrls(rooms);

    res.json({ success: true, data: mappedRooms });
  } catch (error) {
    console.error('Error fetching extranet rooms:', error);
    res.status(500).json({ success: false, message: 'Server error fetching rooms' });
  }
};

export const updateRoom = async (req, res) => {
  try {
    const hotelId = req.scopedHotelId;
    const { roomId } = req.params;
    const updateData = req.body;

    // Feature Gate: Prevent manual inventory edits if Channel Manager is active
    const canEditInventory = await checkFeatureGate(hotelId, 'INVENTORY_EDITING');
    if (!canEditInventory && (updateData.totalInventory !== undefined || updateData.basePrice !== undefined)) {
      return res.status(403).json({ success: false, message: 'Inventory and Rate changes are locked by Channel Manager.' });
    }

    // Verify room belongs to hotel
    const room = await prisma.roomType.findFirst({
      where: { id: roomId, hotelId }
    });

    if (!room) {
      return res.status(404).json({ success: false, message: 'Room not found or unauthorized' });
    }

    const updatedRoom = await prisma.roomType.update({
      where: { id: roomId },
      data: updateData
    });

    await logActivity({
      hotelId,
      userId: req.user.id,
      action: 'ROOM_TYPE_UPDATED',
      entityType: 'RoomType',
      entityId: roomId,
      before: room,
      after: updatedRoom
    });

    res.json({ success: true, data: updatedRoom, message: 'Room updated successfully.' });
  } catch (error) {
    console.error('Error updating extranet room:', error);
    res.status(500).json({ success: false, message: 'Server error updating room' });
  }
};
