import prisma from '../config/db.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { z } from 'zod';

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
  const { maxOccupancy, totalRooms, _imageIds, _primaryImageId, basePrice, mealPlan, ...rest } = data;
  
  return {
    prismaData: {
      ...rest,
      capacity: maxOccupancy,
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
  const { hotelId, _code } = normalized.prismaData;

  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId } });
  if (!hotel || hotel.isDeleted) return res.status(404).json({ success: false, message: 'Hotel not found', requestId: req.id });
  
  if (req.user.role === 'OWNER' && hotel.ownerId !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Forbidden', requestId: req.id });
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
        isConfigured: false,
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
          isPrimary: imageId === validation.data.primaryImageId
        }))
      });
    }

    return { ...room, ratePlans: [ratePlan] };
  });

  res.status(201).json({ success: true, data: roomType, requestId: req.id });
});

export const updateRoomType = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const existing = await prisma.roomType.findUnique({
    where: { id },
    include: { hotel: true }
  });

  if (!existing || !existing.isActive) {
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

  const normalized = normalizeRoomPayload(validation.data);

  const roomType = await prisma.$transaction(async (tx) => {
    const updated = await tx.roomType.update({
      where: { id },
      data: normalized.prismaData
    });

    // Update Default Rate Plan
    const standardRate = await tx.ratePlan.findFirst({
      where: { roomTypeId: id, name: 'Standard Rate Plan' }
    });

    if (standardRate && (normalized.basePrice !== undefined || normalized.mealPlan !== undefined)) {
      await tx.ratePlan.update({
        where: { id: standardRate.id },
        data: {
          basePrice: normalized.basePrice !== undefined ? normalized.basePrice : standardRate.basePrice,
          mealPlan: normalized.mealPlan !== undefined ? normalized.mealPlan : standardRate.mealPlan
        }
      });
    }

    // Update Occupancy Pricing for Standard Rate Plan
    if (validation.data.occupancyPricing) {
      const standardRate = await tx.ratePlan.findFirst({
        where: { roomTypeId: id, name: 'Standard Rate' }
      });

      if (standardRate) {
        // Clear old ones
        await tx.occupancyPricing.deleteMany({
          where: { ratePlanId: standardRate.id }
        });
        // Add new ones
        await tx.occupancyPricing.createMany({
          data: validation.data.occupancyPricing.map(op => ({
            ...op,
            ratePlanId: standardRate.id
          }))
        });
      }
    }

    // Update Images
    if (validation.data.imageIds) {
      // Clear old links
      await tx.roomTypeImage.deleteMany({ where: { roomTypeId: id } });
      // Create new ones
      if (validation.data.imageIds.length > 0) {
        await tx.roomTypeImage.createMany({
          data: validation.data.imageIds.map(imageId => ({
            roomTypeId: id,
            imageId,
            isPrimary: imageId === validation.data.primaryImageId
          }))
        });
      }
    }

    return updated;
  });

  await prisma.auditLog.create({
    data: {
      action: 'UPDATE_ROOM',
      entityType: 'ROOM',
      entityId: id,
      userId: req.user.id,
      requestId: req.id,
      details: { changed: Object.keys(req.body) }
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

  await prisma.roomType.update({
    where: { id },
    data: { isActive: false }
  });

  await prisma.auditLog.create({
    data: { action: 'DELETE_ROOM', entityType: 'ROOM', entityId: id, userId: req.user.id, requestId: req.id }
  });

  res.status(200).json({ success: true, message: 'Room type deleted', requestId: req.id });
});

export const getRoomTypes = asyncHandler(async (req, res) => {
  const { hotelId, propertyId } = req.query;
  const finalId = hotelId || propertyId;

  if (!finalId) return res.status(400).json({ success: false, message: 'Hotel ID required', requestId: req.id });

  const hotel = await prisma.hotel.findUnique({ where: { id: finalId } });
  if (!hotel || hotel.isDeleted) return res.status(404).json({ success: false, message: 'Hotel not found', requestId: req.id });
  
  if (req.user.role === 'OWNER' && hotel.ownerId !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Forbidden', requestId: req.id });
  }

  const roomTypes = await prisma.roomType.findMany({ 
    where: { hotelId: finalId, isActive: true },
    include: { 
      ratePlans: { 
        where: { isActive: true },
        include: { occupancyPricing: { orderBy: { occupancy: 'asc' } } }
      },
      images: { 
        include: { image: true } 
      }
    },
    orderBy: { name: 'asc' }
  });

  res.status(200).json({ success: true, data: roomTypes, requestId: req.id });
});
