import prisma from '../config/db.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { z } from 'zod';

const IMAGE_TAGS = [
  "BEDROOM", "BATHROOM", "LIVING_AREA", "VIEW", "BALCONY",
  "DINING", "WORKSPACE", "EXTERIOR", "AMENITIES", "FOOD_DRINK"
];

const IMAGE_CATEGORIES = ["ROOM", "EXTERIOR", "AMENITIES", "FOOD"];

const imageSchema = z.object({
  url: z.string().refine(val => val.startsWith('http') || val.startsWith('blob:'), {
    message: "URL must be a valid http/https or blob URL"
  }),
  hotelId: z.string().uuid(),
  category: z.enum(IMAGE_CATEGORIES),
  tags: z.array(z.enum(IMAGE_TAGS)).optional().default([]),
  isPrimary: z.boolean().optional().default(false),
});

export const uploadHotelImage = asyncHandler(async (req, res) => {
  const validation = imageSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(422).json({ success: false, errors: validation.error.format() });
  }

  const image = await prisma.hotelImage.create({
    data: validation.data
  });

  res.status(201).json({ success: true, data: image });
});

export const getHotelImages = asyncHandler(async (req, res) => {
  const { hotelId, category, tag } = req.query;

  if (!hotelId) {
    return res.status(400).json({ success: false, message: 'hotelId is required' });
  }

  const images = await prisma.hotelImage.findMany({
    where: {
      hotelId,
      ...(category && { category }),
      ...(tag && { tags: { has: tag } }),
    },
    orderBy: { createdAt: 'desc' }
  });

  res.status(200).json({ success: true, data: images });
});

export const attachImageToRoom = asyncHandler(async (req, res) => {
  const { roomTypeId } = req.params;
  const { imageId, isPrimary } = req.body;

  const link = await prisma.roomTypeImage.create({
    data: {
      roomTypeId,
      imageId,
      isPrimary: isPrimary || false
    }
  });

  res.status(201).json({ success: true, data: link });
});

export const detachImageFromRoom = asyncHandler(async (req, res) => {
  const { roomTypeId, imageId } = req.params;

  await prisma.roomTypeImage.deleteMany({
    where: { roomTypeId, imageId }
  });

  res.status(200).json({ success: true, message: 'Image detached from room' });
});

export const setRoomPrimaryImage = asyncHandler(async (req, res) => {
  const { roomTypeId, imageId } = req.params;

  await prisma.$transaction([
    prisma.roomTypeImage.updateMany({
      where: { roomTypeId },
      data: { isPrimary: false }
    }),
    prisma.roomTypeImage.update({
      where: { roomTypeId_imageId: { roomTypeId, imageId } },
      data: { isPrimary: true }
    })
  ]);

  res.status(200).json({ success: true, message: 'Primary image set' });
});
