import prisma from '../../config/db.js';
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
