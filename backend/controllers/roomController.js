import prisma from '../config/db.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { z } from 'zod';
import { mediaService } from '../services/MediaService.js';

// --- ZOD SCHEMAS ---

const roomTypeSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  code: z.string().min(2, 'Room code is required'),
  description: z.string().optional().default(''),
  maxOccupancy: z.number().int().min(1, 'Max occupancy must be at least 1'),
  baseOccupancy: z.number().int().optional().nullable(),
  totalRooms: z.number().int().min(1, 'Total rooms must be at least 1'),
  hotelId: z.string().uuid('Invalid hotel ID'),
  amenities: z.array(z.string()).optional().default([]),
  bedType: z.string().optional().default('King'),
  roomSize: z.string().optional(),
  viewType: z.string().optional(),
  isActive: z.boolean().optional().default(true),
  extraBedAllowed: z.boolean().optional().default(false),
  maxExtraBeds: z.number().int().optional().default(0),
  imageIds: z.array(z.string().uuid()).optional(),
  primaryImageId: z.string().uuid().optional(),
  basePrice: z.number().optional(),
  mealPlan: z.string().optional(),
}).strict();

const roomTypeUpdateSchema = roomTypeSchema.partial();

// --- HELPERS ---

const normalizeRoomPayload = (data) => {
  const { maxOccupancy, totalRooms, imageIds: _imageIds, primaryImageId: _primaryImageId, basePrice, mealPlan, ...rest } = data;
  
  return {
    prismaData: {
      ...rest,
      maxOccupancy,
      totalInventory: totalRooms,
    },
    basePrice,
    mealPlan
  };
};

export const createRoomType = asyncHandler(async (req, res) => {
  const validation = roomTypeSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(422).json({ 
      success: false, 
      message: 'Validation failed', 
      errors: validation.error.flatten(), 
      requestId: req.id 
    });
  }

  const normalized = normalizeRoomPayload(validation.data);
  const { hotelId } = normalized.prismaData;

  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId } });
  if (!hotel || hotel.isDeleted) return res.status(404).json({ success: false, message: 'Hotel not found', requestId: req.id });
  
  if (req.user.role === 'OWNER' && hotel.ownerId !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Forbidden', requestId: req.id });
  }
  const clash = await codeTaken(hotelId, normalized.prismaData.code);
  if (clash) {
    return res.status(409).json({ success: false, message: `Room code ${normalized.prismaData.code} is already used by ${clash.name}`, requestId: req.id });
  }
  if (normalized.basePrice !== undefined && normalized.basePrice < 0) {
    return res.status(400).json({ success: false, message: 'Prices can\'t be negative', requestId: req.id });
  }

  const roomType = await prisma.$transaction(async (tx) => {
    const room = await tx.roomType.create({
      data: normalized.prismaData
    });

    // Create Default Rate Plan (Clean Default)
    const ratePlan = await tx.ratePlan.create({
      data: {
        name: 'Standard Rate Plan',
        mealPlan: normalized.mealPlan || 'NONE',
        basePrice: normalized.basePrice || 0,
        extraAdultPrice: 0,
        extraChildPrice: 0,
        roomTypeId: room.id,
        isActive: true,
        isConfigured: (normalized.basePrice || 0) > 0, // a plan with a price is ready to sell
      }
    });

    // Seed 60 days of inventory
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    const inventoryData = [];

    for (let i = 0; i < 60; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      inventoryData.push({
        roomTypeId: room.id,
        date,
        totalRooms: room.totalInventory,
        availableRooms: room.totalInventory,
      });
    }

    await tx.inventory.createMany({ 
      data: inventoryData,
      skipDuplicates: true 
    });

    await tx.auditLog.create({
      data: {
        action: 'CREATE_ROOM_TYPE',
        entityType: 'ROOM',
        entityId: room.id,
        userId: req.user.id,
        requestId: req.id,
        details: { name: normalized.prismaData.name, hotelId, autoInventoryDays: 60, defaultRatePlanId: ratePlan.id }
      }
    });

    // Link images if provided
    if (validation.data.imageIds && validation.data.imageIds.length > 0) {
      await tx.roomTypeImage.createMany({
        data: validation.data.imageIds.map(imageId => ({
          roomTypeId: room.id,
          imageId,
          isPrimary: imageId === (validation.data.primaryImageId || validation.data.imageIds[0])
        }))
      });
    }

    return { ...room, ratePlans: [ratePlan] };
  });

  res.status(201).json({ success: true, data: roomType, requestId: req.id });
});

/**
 * Carries a new physical room count into the future inventory calendar (today onwards): dates
 * that sold every room keep doing so at the new count, and no date sells more rooms than exist.
 * Refuses when bookings already hold more rooms on some date than the new count.
 */
const applyRoomCountToInventory = async (tx, roomTypeId, oldCount, newCount) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rows = await tx.inventory.findMany({ where: { roomTypeId, date: { gte: today } } });
  const overbooked = rows.filter((r) => (r.bookedRooms || 0) > newCount).sort((a, b) => a.date - b.date)[0];
  if (overbooked) {
    throw Object.assign(new Error(`${overbooked.bookedRooms} room(s) are already booked on ${overbooked.date.toDateString()}, so this room type needs at least that many rooms`), { statusCode: 400 });
  }
  for (const r of rows) {
    const total = r.totalRooms === oldCount || r.totalRooms > newCount ? newCount : r.totalRooms;
    if (total !== r.totalRooms) {
      await tx.inventory.update({ where: { id: r.id }, data: { totalRooms: total, availableRooms: Math.max(0, total - (r.bookedRooms || 0)) } });
    }
  }
};

const codeTaken = (hotelId, code, exceptId) => code
  ? prisma.roomType.findFirst({ where: { hotelId, code, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true, name: true } })
  : null;

export const updateRoomType = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Inactive room types can be edited too, so they can be switched back on.
  const existing = await prisma.roomType.findUnique({
    where: { id },
    include: { hotel: true }
  });

  if (!existing) {
    return res.status(404).json({ success: false, message: 'Room not found', requestId: req.id });
  }

  if (req.user.role === 'OWNER' && existing.hotel.ownerId !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Forbidden', requestId: req.id });
  }

  const validation = roomTypeUpdateSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors: validation.error.flatten(),
      requestId: req.id
    });
  }
  // A room type stays with its property (the onboarding wizard sends the same hotelId back).
  if (validation.data.hotelId && validation.data.hotelId !== existing.hotelId) {
    return res.status(400).json({ success: false, message: 'A room type can\'t be moved to another property', requestId: req.id });
  }
  const { hotelId: _hotelId, ...changes } = validation.data;
  const clash = await codeTaken(existing.hotelId, changes.code, id);
  if (clash) {
    return res.status(409).json({ success: false, message: `Room code ${changes.code} is already used by ${clash.name}`, requestId: req.id });
  }

  const normalized = normalizeRoomPayload(changes);
  if (normalized.prismaData.totalInventory === undefined) delete normalized.prismaData.totalInventory;
  if (normalized.prismaData.maxOccupancy === undefined) delete normalized.prismaData.maxOccupancy;
  const maxOcc = normalized.prismaData.maxOccupancy ?? existing.maxOccupancy ?? 2;
  const baseOcc = normalized.prismaData.baseOccupancy !== undefined ? normalized.prismaData.baseOccupancy : existing.baseOccupancy;
  if (baseOcc && baseOcc > maxOcc) {
    return res.status(400).json({ success: false, message: 'Base occupancy can\'t be more than max occupancy', requestId: req.id });
  }

  const roomType = await prisma.$transaction(async (tx) => {
    const updated = await tx.roomType.update({
      where: { id },
      data: normalized.prismaData
    });

    const newCount = normalized.prismaData.totalInventory;
    if (newCount !== undefined && newCount !== existing.totalInventory) {
      await applyRoomCountToInventory(tx, id, existing.totalInventory, newCount);
    }

    // Update Images
    if (changes.imageIds) {
      await tx.roomTypeImage.deleteMany({ where: { roomTypeId: id } });
      if (changes.imageIds.length > 0) {
        await tx.roomTypeImage.createMany({
          data: changes.imageIds.map(imageId => ({
            roomTypeId: id,
            imageId,
            isPrimary: imageId === (changes.primaryImageId || changes.imageIds[0])
          }))
        });
      }
    }

    return updated;
  }, { timeout: 30000 });

  await prisma.auditLog.create({
    data: {
      action: 'UPDATE_ROOM',
      entityType: 'ROOM',
      entityId: id,
      userId: req.user.id,
      requestId: req.id,
      details: { changed: Object.keys(changes) }
    }
  });

  res.status(200).json({ success: true, data: roomType, requestId: req.id });
});

export const deleteRoomType = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await prisma.roomType.findUnique({
    where: { id },
    include: { hotel: true }
  });

  if (!existing) return res.status(404).json({ success: false, message: 'Room not found', requestId: req.id });
  if (req.user.role === 'OWNER' && existing.hotel.ownerId !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Forbidden', requestId: req.id });
  }

  // Switched off rather than deleted: past and upcoming bookings still point at it. Upcoming
  // bookings stay valid; it just can't be booked again until it is switched back on.
  await prisma.roomType.update({
    where: { id },
    data: { isActive: false }
  });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = await prisma.booking.count({ where: { roomTypeId: id, checkIn: { gte: today }, status: { in: ['CONFIRMED', 'PENDING'] } } });

  await prisma.auditLog.create({
    data: { action: 'DELETE_ROOM', entityType: 'ROOM', entityId: id, userId: req.user.id, requestId: req.id }
  });

  res.status(200).json({
    success: true,
    message: upcoming ? `Room type switched off. ${upcoming} upcoming booking(s) for it are kept.` : 'Room type switched off',
    data: { upcomingBookings: upcoming },
    requestId: req.id
  });
});

export const getRoomTypes = asyncHandler(async (req, res) => {
  const { hotelId, propertyId, includeInactive } = req.query;
  const finalId = hotelId || propertyId;
  // includeInactive=true lists switched-off room types and rate plans too (Room Config screens),
  // so they can be switched back on.
  const all = includeInactive === 'true';

  if (!finalId) return res.status(400).json({ success: false, message: 'Hotel ID required', requestId: req.id });

  const hotel = await prisma.hotel.findUnique({ where: { id: finalId } });
  if (!hotel || hotel.isDeleted) return res.status(404).json({ success: false, message: 'Hotel not found', requestId: req.id });
  
  if (req.user.role === 'OWNER' && hotel.ownerId !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Forbidden', requestId: req.id });
  }

  const roomTypes = await prisma.roomType.findMany({ 
    where: { hotelId: finalId, ...(all ? {} : { isActive: true }) },
    include: {
      ratePlans: {
        ...(all ? {} : { where: { isActive: true } }),
        orderBy: { name: 'asc' },
        include: { occupancyPricing: { orderBy: { occupancy: 'asc' } } }
      },
      images: { 
        include: { image: true } 
      }
    },
    orderBy: { name: 'asc' }
  });

  res.status(200).json({ success: true, data: await mediaService.signRoomTypesUrls(roomTypes), requestId: req.id });
});
