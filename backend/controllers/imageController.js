import prisma from '../config/db.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const _IMAGE_TAGS = [
  "EXTERIOR", "HOTEL_ENTRANCE", "LOBBY", "RECEPTION", "CORRIDOR",
  "ELEVATOR", "PARKING", "GARDEN", "TERRACE", "ROOFTOP",
  "LOUNGE_AREA", "BUSINESS_CENTER", "CONFERENCE_HALL", "BANQUET_HALL"
];

const _IMAGE_CATEGORIES = ["ROOM", "EXTERIOR", "AMENITIES", "FOOD"];

// Loosened schema to allow string tags
const imageSchema = z.object({
  url: z.string().refine(val => val.startsWith('http') || val.startsWith('blob:') || val.startsWith('/uploads'), {
    message: "URL must be a valid http/https, blob, or local upload URL"
  }),
  hotelId: z.string().uuid(),
  category: z.string().optional().default('EXTERIOR'),
  tags: z.array(z.string()).optional().default([]),
  isPrimary: z.boolean().optional().default(false),
});

export const uploadHotelImage = asyncHandler(async (req, res) => {
  let url = req.body.url;
  
  // Support base64 upload if 'image' field is present
  if (req.body.image && typeof req.body.image === 'string') {
    const base64Data = req.body.image;
    const matches = base64Data.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    
    if (matches && matches.length === 3) {
      const mimeType = matches[1];
      const buffer = Buffer.from(matches[2], 'base64');
      const extension = mimeType.split('/')[1] || 'jpg';
      const filename = `img-${Date.now()}-${Math.floor(Math.random() * 10000)}.${extension}`;
      
      const uploadDir = path.join(__dirname, '../public/uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      const filePath = path.join(uploadDir, filename);
      fs.writeFileSync(filePath, buffer);
      url = `/uploads/${filename}`;
    } else {
      return res.status(400).json({ success: false, message: 'Invalid base64 image data format' });
    }
  }

  // Build data payload for schema validation
  const dataToValidate = {
    ...req.body,
    url
  };

  const validation = imageSchema.safeParse(dataToValidate);
  if (!validation.success) {
    return res.status(422).json({ success: false, errors: validation.error.format() });
  }

  const { isPrimary, hotelId } = validation.data;

  // Use transaction to ensure only one image is primary if set
  const image = await prisma.$transaction(async (tx) => {
    if (isPrimary) {
      await tx.hotelImage.updateMany({
        where: { hotelId, isPrimary: true },
        data: { isPrimary: false }
      });
    }
    return await tx.hotelImage.create({
      data: validation.data
    });
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
    include: {
      roomLinks: true
    },
    orderBy: { createdAt: 'desc' }
  });

  res.status(200).json({ success: true, data: images });
});

export const updateHotelImage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { tags, category, isPrimary } = req.body;

  const existing = await prisma.hotelImage.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Image not found' });
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (isPrimary === true) {
      await tx.hotelImage.updateMany({
        where: { hotelId: existing.hotelId, id: { not: id } },
        data: { isPrimary: false }
      });
    }

    return await tx.hotelImage.update({
      where: { id },
      data: {
        ...(tags !== undefined && { tags }),
        ...(category !== undefined && { category }),
        ...(isPrimary !== undefined && { isPrimary })
      }
    });
  });

  res.status(200).json({ success: true, data: updated });
});

export const deleteHotelImage = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existing = await prisma.hotelImage.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Image not found' });
  }

  // Delete the physical file if it's a local upload
  if (existing.url.startsWith('/uploads')) {
    const filename = existing.url.replace('/uploads/', '');
    const filePath = path.join(__dirname, '../public/uploads', filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error('Failed to delete physical file:', err);
      }
    }
  }

  await prisma.hotelImage.delete({ where: { id } });

  res.status(200).json({ success: true, message: 'Image deleted successfully' });
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
