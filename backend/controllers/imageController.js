import prisma from '../config/db.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { z } from 'zod';
import { mediaService } from '../services/MediaService.js';
import { canAtHotel } from '../services/accessService.js';

/**
 * Photos belong to one hotel: a hotel team may only see or change photos of their own hotels
 * (the route gate only checks they may edit photos somewhere). Answers 404, not 403, so ids of
 * other hotels' photos aren't confirmed.
 */
const notYours = (res) => res.status(404).json({ success: false, message: 'Not found' });
const mayUseHotel = (req, hotelId) => canAtHotel(req.user, String(hotelId || ''), req.user?.permission || undefined);
const roomTypeHotel = async (roomTypeId) => (await prisma.roomType.findUnique({ where: { id: String(roomTypeId) }, select: { hotelId: true } }).catch(() => null))?.hotelId;
const imageHotel = async (imageId) => (await prisma.hotelImage.findUnique({ where: { id: String(imageId) }, select: { hotelId: true } }).catch(() => null))?.hotelId;

const _IMAGE_TAGS = [
  "EXTERIOR", "HOTEL_ENTRANCE", "LOBBY", "RECEPTION", "CORRIDOR",
  "ELEVATOR", "PARKING", "GARDEN", "TERRACE", "ROOFTOP",
  "LOUNGE_AREA", "BUSINESS_CENTER", "CONFERENCE_HALL", "BANQUET_HALL"
];

const _IMAGE_CATEGORIES = ["ROOM", "EXTERIOR", "AMENITIES", "FOOD"];

// Loosened schema to allow string tags
const imageSchema = z.object({
  url: z.string().max(2048).refine(val => /^https:\/\/[^\s"'<>]+$/.test(val) || /^\/uploads\/[A-Za-z0-9/_.-]+$/.test(val) || /^gs:\/\/[^\s]+$/.test(val), {
    message: "Use an https:// photo address or upload the photo"
  }),
  hotelId: z.string().uuid(),
  category: z.string().optional().default('EXTERIOR'),
  tags: z.array(z.string()).optional().default([]),
  isPrimary: z.boolean().optional().default(false),
});

export const uploadHotelImage = asyncHandler(async (req, res) => {
  if (!mayUseHotel(req, req.body?.hotelId)) return notYours(res);
  // A storage address (gs://) is only ever set by the upload below, never taken from the request
  let url = typeof req.body.url === 'string' && req.body.url.startsWith('gs://') ? undefined : req.body.url;
  
  // Support base64 upload if 'image' field is present
  if (req.body.image && typeof req.body.image === 'string') {
    const base64Data = req.body.image;
    const matches = base64Data.match(/^data:(.+);base64,(.+)$/);
    
    if (matches && matches.length === 3) {
      const mimeType = matches[1];
      const buffer = Buffer.from(matches[2], 'base64');
      
      try {
        url = await mediaService.uploadHotelImage(
          buffer, 
          mimeType, 
          req.body.hotelId, 
          req.body.isPrimary
        );
      } catch (err) {
        return res.status(400).json({ success: false, message: err.message });
      }
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

  const clientUrl = image.url.startsWith('gs://') ? await mediaService.getSignedUrl(image.url) : image.url;
  res.status(201).json({ success: true, data: { ...image, url: clientUrl } });
});

export const getHotelImages = asyncHandler(async (req, res) => {
  const { hotelId, category, tag } = req.query;

  if (!hotelId) {
    return res.status(400).json({ success: false, message: 'hotelId is required' });
  }
  if (!mayUseHotel(req, hotelId)) return notYours(res);

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

  const mappedImages = await Promise.all(images.map(async (img) => {
    if (img.url && img.url.startsWith('gs://')) {
      const signedUrl = await mediaService.getSignedUrl(img.url);
      return { ...img, url: signedUrl };
    }
    return img;
  }));

  res.status(200).json({ success: true, data: mappedImages });
});

export const updateHotelImage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { tags, category, isPrimary } = req.body;

  const existing = await prisma.hotelImage.findUnique({ where: { id } });
  if (!existing || !mayUseHotel(req, existing.hotelId)) {
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

  const clientUrl = updated.url.startsWith('gs://') ? await mediaService.getSignedUrl(updated.url) : updated.url;
  res.status(200).json({ success: true, data: { ...updated, url: clientUrl } });
});

export const deleteHotelImage = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existing = await prisma.hotelImage.findUnique({ where: { id } });
  if (!existing || !mayUseHotel(req, existing.hotelId)) {
    return res.status(404).json({ success: false, message: 'Image not found' });
  }

  // Delete from MediaService (handles both local and GCS automatically)
  if (existing.url) {
    try {
      await mediaService.deleteMedia(existing.url);
    } catch (err) {
      console.error('Failed to delete physical file:', err);
    }
  }

  await prisma.hotelImage.delete({ where: { id } });

  res.status(200).json({ success: true, message: 'Image deleted successfully' });
});

export const attachImageToRoom = asyncHandler(async (req, res) => {
  const { roomTypeId } = req.params;
  const { imageId, isPrimary } = req.body;
  // The room type and the photo must both be at one of this user's hotels (and the same one)
  const hotelId = await roomTypeHotel(roomTypeId);
  if (!hotelId || !mayUseHotel(req, hotelId) || (await imageHotel(imageId)) !== hotelId) return notYours(res);

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
  const hotelId = await roomTypeHotel(roomTypeId);
  if (!hotelId || !mayUseHotel(req, hotelId)) return notYours(res);

  await prisma.roomTypeImage.deleteMany({
    where: { roomTypeId, imageId }
  });

  res.status(200).json({ success: true, message: 'Image detached from room' });
});

export const setRoomPrimaryImage = asyncHandler(async (req, res) => {
  const { roomTypeId, imageId } = req.params;
  const hotelId = await roomTypeHotel(roomTypeId);
  if (!hotelId || !mayUseHotel(req, hotelId)) return notYours(res);

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
