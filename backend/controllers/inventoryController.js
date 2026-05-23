import prisma from '../config/db.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

/**
 * bulkUpdateInventory
 * Optimized strategy: 
 * 1. CreateMany with skipDuplicates for missing dates.
 * 2. UpdateMany for existing dates.
 * 3. Atomic raw sync for availableRooms.
 */
export const bulkUpdateInventory = asyncHandler(async (req, res) => {
  const { roomTypeId, startDate, endDate, totalRooms } = req.body;

  if (!roomTypeId || !startDate || !endDate) {
    return res.status(400).json({ success: false, message: 'Missing required fields', requestId: req.id });
  }

  // 1. Verify Owner Scope
  const roomType = await prisma.roomType.findUnique({
    where: { id: roomTypeId },
    include: { hotel: true }
  });

  if (!roomType) return res.status(404).json({ success: false, message: 'RoomType not found', requestId: req.id });
  
  if (req.user.role === 'OWNER' && roomType.hotel.ownerId !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Unauthorized', requestId: req.id });
  }

  if (totalRooms !== undefined && parseInt(totalRooms) > roomType.totalInventory) {
    return res.status(400).json({ 
      success: false, 
      message: `Cannot allocate more than physical inventory (${roomType.totalInventory})`,
      requestId: req.id 
    });
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  const dates = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(new Date(d));
  }

  // A. Create entries for dates that don't exist yet
  const inventoryData = dates.map(date => ({
    roomTypeId,
    date,
    totalRooms: totalRooms !== undefined ? parseInt(totalRooms) : roomType.totalInventory,
    availableRooms: totalRooms !== undefined ? parseInt(totalRooms) : roomType.totalInventory
  }));

  await prisma.inventory.createMany({
    data: inventoryData,
    skipDuplicates: true
  });

  // B. Update existing entries
  if (totalRooms !== undefined) {
    await prisma.inventory.updateMany({
      where: {
        roomTypeId,
        date: { gte: start, lte: end }
      },
      data: {
        totalRooms: parseInt(totalRooms)
      }
    });

    // C. Atomic Sync for availability
    await prisma.$executeRaw`
      UPDATE "Inventory" 
      SET "availableRooms" = "totalRooms" - "bookedRooms" 
      WHERE "roomTypeId" = ${roomTypeId} 
        AND "date" >= ${start} 
        AND "date" <= ${end}
    `;
  }

  res.status(200).json({ 
    success: true, 
    message: `Inventory updated for ${dates.length} days.`,
    requestId: req.id 
  });
});

export const getInventory = asyncHandler(async (req, res) => {
  const { propertyId, startDate, endDate } = req.query;

  if (!propertyId || !startDate || !endDate) {
    return res.status(400).json({ success: false, message: 'propertyId, startDate, and endDate are required', requestId: req.id });
  }

  // 1. Fetch inventory at RoomType level
  const inventory = await prisma.$queryRaw`
    SELECT 
      i.*,
      rt.name as "roomTypeName",
      rt."totalInventory" as "maxPhysicalInventory"
    FROM "Inventory" i
    JOIN "RoomType" rt ON i."roomTypeId" = rt.id
    WHERE rt."hotelId" = ${propertyId}
      AND i.date >= ${new Date(startDate)}
      AND i.date <= ${new Date(endDate)}
    ORDER BY i.date ASC
  `;

  // 2. We also need all RoomTypes for this property to fill gaps (virtual rows)
  const allRoomTypes = await prisma.roomType.findMany({
    where: { hotelId: propertyId, isActive: true },
    select: { id: true, name: true, totalInventory: true }
  });

  // 3. Combine and return
  // For the UI, we'll return a structure that emphasizes RoomType-level availability
  res.status(200).json({ success: true, data: inventory, roomTypes: allRoomTypes, requestId: req.id });
});
