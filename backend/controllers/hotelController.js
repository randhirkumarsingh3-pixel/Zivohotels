import prisma from '../config/db.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { z } from 'zod';
import rankingService from '../services/rankingService.js';
import cacheUtils from '../utils/cacheUtils.js';
import crypto from 'crypto';

// --- ZOD SCHEMAS ---

const hotelSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  address: z.string().optional(),
  location: z.string().optional(),
  city: z.string().min(2, 'City is required'),
  state: z.string().optional(),
  description: z.string().optional().default(''),
  latitude: z.preprocess((val) => (val === '' || val === null ? undefined : parseFloat(val)), z.number().min(-90).max(90).optional()),
  longitude: z.preprocess((val) => (val === '' || val === null ? undefined : parseFloat(val)), z.number().min(-180).max(180).optional()),
  media: z.array(z.object({
    url: z.string().refine(val => val.startsWith('http') || val.startsWith('blob:'), {
      message: "URL must be a valid http/https or blob URL"
    }),
    tags: z.array(z.string()).optional().default([])
  })).max(20, "Maximum 20 images allowed").optional(),
  images: z.array(z.any()).optional(),
  amenities: z.array(z.string()).optional().default([]),
  policies: z.array(z.string()).optional().default([]),
  checkInTime: z.string().optional().default('14:00'),
  checkOutTime: z.string().optional().default('11:00'),
  // Step 3: Contact (Optional for now to prevent breaking changes)
  receptionPhone: z.string().optional(),
  receptionEmail: z.string().optional(),
  managerName: z.string().optional(),
  managerPhone: z.string().optional(),
  managerEmail: z.string().optional(),
  // Step 4: Commercials
  bankDetail: z.object({
    accountName: z.string(),
    bankName: z.string(),
    accountNumber: z.string(),
    ifscCode: z.string(),
    branchName: z.string().optional(),
  }).optional(),
  commissionRate: z.number().optional(),
});

const hotelUpdateSchema = hotelSchema.partial().extend({
  status: z.enum(['PENDING', 'ACTIVE', 'INACTIVE', 'REJECTED']).optional()
});

// --- HELPERS ---

/**
 * Normalizes hotel payload to ensure consistent data structure
 */
const normalizeHotelPayload = (data) => {
  const {
    name, address, location, city, description, latitude, longitude,
    amenities, policies, checkInTime, checkOutTime,
    media, images,
    receptionPhone, receptionEmail, managerName, managerPhone, managerEmail,
    bankDetail, commissionRate, status
  } = data;
  
  // 1. Consistent location derived from address and city
  const finalLocation = location || (address ? `${address}, ${city}` : city);
  
  const prismaData = {
    name,
    city,
    location: finalLocation,
    description,
    latitude: latitude ? parseFloat(latitude) : undefined,
    longitude: longitude ? parseFloat(longitude) : undefined,
    amenities,
    policies,
    checkInTime,
    checkOutTime
  };
  
  if (status) {
    prismaData.status = status;
  }

  // Clean up undefined fields
  Object.keys(prismaData).forEach(key => prismaData[key] === undefined && delete prismaData[key]);
  
  return {
    prismaData,
    _bankDetail: bankDetail,
    _commissionRate: commissionRate,
    _media: media
  };
};

const activeFilter = { isDeleted: false };

export const createHotel = asyncHandler(async (req, res) => {
  const validation = hotelSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(422).json({ 
      success: false, 
      message: 'Validation failed', 
      errors: validation.error.flatten(), 
      requestId: req.id 
    });
  }

  const normalized = normalizeHotelPayload(validation.data);
  const { prismaData, _bankDetail, _commissionRate, _media } = normalized;

  // Soft Delete Collision Prevention
  const existing = await prisma.hotel.findFirst({
    where: { 
      name: prismaData.name, 
      ownerId: req.user.id, 
      isDeleted: false 
    }
  });
  if (existing) {
    return res.status(400).json({ 
      success: false, 
      message: 'You already have an active property with this name', 
      requestId: req.id 
    });
  }

  const hotel = await prisma.hotel.create({
    data: { 
      ...prismaData,
      ownerId: req.user.id,
      status: 'PENDING'
    }
  });

  // Handle manual creation of agreement and bank detail to avoid client-sync issues
  if (_commissionRate) {
    await prisma.agreement.create({
      data: {
        hotelId: hotel.id,
        ownerId: req.user.id,
        commissionRate: _commissionRate,
        status: 'DRAFT'
      }
    });
  }

  if (_bankDetail) {
    await prisma.bankDetail.create({
      data: {
        ..._bankDetail,
        hotelId: hotel.id
      }
    });
  }

  await prisma.auditLog.create({
    data: {
      action: 'CREATE_HOTEL',
      entityType: 'HOTEL',
      entityId: hotel.id,
      userId: req.user.id,
      requestId: req.id,
      details: { name: hotel.name }
    }
  });

  // Update media links if provided
  if (_media && _media.length > 0) {
    await prisma.hotelImage.createMany({
      data: _media.map(img => ({
        url: img.url,
        tags: img.tags,
        category: 'EXTERIOR', // Default for hotel-level
        hotelId: hotel.id
      }))
    });
  }

  res.status(201).json({ success: true, data: hotel, requestId: req.id });
});

export const updateHotel = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existingHotel = await prisma.hotel.findUnique({ where: { id } });
  if (!existingHotel || existingHotel.isDeleted) {
    return res.status(404).json({ success: false, message: 'Property not found', requestId: req.id });
  }
  
  if (req.user.role === 'OWNER' && existingHotel.ownerId !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Forbidden', requestId: req.id });
  }

  const validation = hotelUpdateSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(422).json({ 
      success: false, 
      message: 'Validation failed', 
      errors: validation.error.flatten(), 
      requestId: req.id 
    });
  }

  const normalized = normalizeHotelPayload(validation.data);
  const { prismaData, _bankDetail, _commissionRate, _media } = normalized;

  if (prismaData.status === 'ACTIVE' && existingHotel.status !== 'ACTIVE') {
    const agreement = await prisma.agreement.findUnique({ where: { hotelId: id } });
    if (!agreement || agreement.status !== 'SIGNED') {
      return res.status(400).json({ success: false, message: 'Cannot activate: Agreement not signed.', requestId: req.id });
    }
  }

  const hotel = await prisma.hotel.update({
    where: { id },
    data: {
      ...prismaData,
      status: prismaData.status || existingHotel.status,
    }
  });

  // Manual upsert of agreement and bank detail to avoid client-sync issues
  if (_commissionRate !== undefined) {
    await prisma.agreement.upsert({
      where: { hotelId: id },
      create: { 
        hotelId: id,
        ownerId: existingHotel.ownerId, 
        commissionRate: _commissionRate, 
        status: 'DRAFT' 
      },
      update: { commissionRate: _commissionRate }
    });
  }

  if (_bankDetail) {
    await prisma.bankDetail.upsert({
      where: { hotelId: id },
      create: { 
        ..._bankDetail,
        hotelId: id 
      },
      update: _bankDetail
    });
  }

  await prisma.auditLog.create({
    data: {
      action: 'UPDATE_HOTEL',
      entityType: 'HOTEL',
      entityId: id,
      userId: req.user.id,
      requestId: req.id,
      details: { changedFields: Object.keys(req.body) }
    }
  });

  // Update media links if provided
  if (_media) {
    // For simplicity, we'll append new ones or the UI will handle it via imageController
    // But for this direct update:
    if (_media.length > 0) {
      await prisma.hotelImage.createMany({
        data: _media.map(img => ({
          url: img.url,
          tags: img.tags,
          category: 'EXTERIOR',
          hotelId: id
        }))
      });
    }
  }

  res.status(200).json({ success: true, data: hotel, requestId: req.id });
});

export const deleteHotel = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const hotel = await prisma.hotel.findUnique({ where: { id } });
  if (!hotel) return res.status(404).json({ success: false, message: 'Property not found', requestId: req.id });
  
  if (req.user.role === 'OWNER' && hotel.ownerId !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Forbidden', requestId: req.id });
  }

  await prisma.hotel.update({
    where: { id },
    data: { isDeleted: true, status: 'INACTIVE' }
  });

  await prisma.auditLog.create({
    data: { action: 'DELETE_HOTEL', entityType: 'HOTEL', entityId: id, userId: req.user.id, requestId: req.id }
  });

  res.status(200).json({ success: true, message: 'Property deleted successfully', requestId: req.id });
});

export const getAllHotels = asyncHandler(async (req, res) => {
  const { destination, stars, page = 1, limit = 10 } = req.query;
  const finalLimit = Math.min(parseInt(limit) || 10, 100);
  const skip = (parseInt(page) - 1) * finalLimit;

  const where = { ...activeFilter };
  if (req.user && req.user.role === 'OWNER') {
    where.ownerId = req.user.id;
  }

  if (destination) {
    where.OR = [
      { city:     { contains: destination, mode: 'insensitive' } },
      { location: { contains: destination, mode: 'insensitive' } },
      { name:     { contains: destination, mode: 'insensitive' } },
    ];
  }

  const [hotels, total] = await Promise.all([
    prisma.hotel.findMany({
      where,
      skip,
      take: finalLimit,
      orderBy: { updatedAt: 'desc' },
      include: {
        owner: {
          select: { id: true, name: true, email: true }
        },
        media: {
          take: 1
        },
        roomTypes: {
          where: { isActive: true },
          include: {
            ratePlans: {
              where: { isActive: true },
              orderBy: { basePrice: 'asc' },
              take: 1
            }
          }
        }
      }
    }),
    prisma.hotel.count({ where })
  ]);

  // Flatten and Filter for Data Integrity
  const formattedHotels = hotels.map(hotel => {
    let startingPrice = null;
    
    // Find the absolute lowest price across all room types
    hotel.roomTypes.forEach(rt => {
      const cheapestPlan = rt.ratePlans[0];
      if (cheapestPlan && cheapestPlan.basePrice > 0 && (startingPrice === null || cheapestPlan.basePrice < startingPrice)) {
        startingPrice = cheapestPlan.basePrice;
      }
    });

    // P0 DATA INTEGRITY GUARD: Skip hotels with no price or no images
    if (!startingPrice || startingPrice <= 0) return null;
    if (!hotel.media || hotel.media.length === 0) return null;

    return {
      ...hotel,
      image: hotel.media[0].url,
      startingPrice: startingPrice
    };
  }).filter(h => h !== null); // Remove blocked properties

  res.status(200).json({
    success: true,
    results: formattedHotels.length,
    total: formattedHotels.length, // Simplified total for this view
    page: parseInt(page),
    limit: finalLimit,
    requestId: req.id,
    data: formattedHotels
  });
});

export const getHotelById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const hotel = await prisma.hotel.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true, phone: true } },
      media: true, // 👈 New Media Library
      roomTypes: {
        where: { isActive: true },
        include: { 
          ratePlans: { 
            where: { isActive: true },
            include: { occupancyPricing: { orderBy: { occupancy: 'asc' } } }
          },
          images: { include: { image: true } }
        }
      }
    }
  });

  if (!hotel || hotel.isDeleted) {
    return res.status(404).json({ success: false, message: 'Hotel not found', requestId: req.id });
  }

  // Fetch agreement and bankDetail manually to avoid Prisma client out-of-sync issues
  const [agreement, bankDetail] = await Promise.all([
    prisma.agreement.findUnique({ where: { hotelId: id } }),
    prisma.bankDetail.findUnique({ where: { hotelId: id } })
  ]);

  // Fetch urgency metrics
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [viewsToday, bookingsToday] = await Promise.all([
    prisma.hotelView.count({ where: { hotelId: id, createdAt: { gte: today } } }),
    prisma.booking.count({ where: { hotelId: id, status: { in: ['CONFIRMED', 'COMPLETED'] }, createdAt: { gte: today } } })
  ]);

  const data = { ...hotel, agreement, bankDetail, viewsToday, bookingsToday };

  res.status(200).json({ success: true, data, requestId: req.id });
});

export const searchHotels = asyncHandler(async (req, res) => {
  const { city, checkIn, checkOut, sort, minPrice, maxPrice, minRating, amenities, includeSoldOut } = req.query;

  if (!city || !checkIn || !checkOut) {
    return res.status(400).json({ success: false, message: 'City, checkIn, and checkOut are required' });
  }

  // Generate cache key
  const cacheKey = crypto.createHash('md5').update(JSON.stringify(req.query)).digest('hex');
  
  const cachedData = cacheUtils.getCache(cacheKey);
  if (cachedData) {
    return res.status(200).json({ success: true, data: cachedData });
  }

  // 1. Fetch active hotels in city (limit to 100 for latency)
  const hotels = await prisma.hotel.findMany({
    where: { 
      city: { equals: city, mode: 'insensitive' },
      status: 'ACTIVE',
      isDeleted: false
    },
    take: 100,
    include: {
      roomTypes: {
        where: { isActive: true },
        include: {
          ratePlans: { where: { isActive: true } },
          inventories: {
             where: { date: { gte: new Date(checkIn), lt: new Date(checkOut) } }
          }
        }
      }
    }
  });

  const hotelIds = hotels.map(h => h.id);
  const agreements = await prisma.agreement.findMany({
    where: { hotelId: { in: hotelIds } }
  });

  const agreementMap = agreements.reduce((acc, curr) => {
    acc[curr.hotelId] = curr;
    return acc;
  }, {});

  // 2. Map and calculate availability & price
  const mappedHotels = hotels.map(hotel => {
     let hotelMinPrice = Infinity;
     let totalRooms = 0;
     let availableRooms = 0;
     let hasFreeCancellation = false;

     hotel.roomTypes.forEach(rt => {
         rt.ratePlans.forEach(rp => {
             if (rp.basePrice < hotelMinPrice) hotelMinPrice = rp.basePrice;
             // Naive free cancellation check (can be improved based on schema)
             if (rp.cancellationPolicy && rp.cancellationPolicy.includes('FREE')) {
                 hasFreeCancellation = true;
             }
         });
         
         const startDate = new Date(checkIn);
         const endDate = new Date(checkOut);
         const daysCount = Math.max(1, Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)));
          
         let minAvail = rt.totalInventory || 0;
         const inventoryMap = {};
         if (rt.inventories) {
            rt.inventories.forEach(inv => {
               const dateStr = new Date(inv.date).toISOString().split('T')[0];
               inventoryMap[dateStr] = inv.availableRooms;
            });
         }
          
         for (let d = 0; d < daysCount; d++) {
            const currDate = new Date(startDate);
            currDate.setDate(startDate.getDate() + d);
            const currDateStr = currDate.toISOString().split('T')[0];
             
            const dayAvail = inventoryMap[currDateStr] !== undefined ? inventoryMap[currDateStr] : (rt.totalInventory || 0);
            if (dayAvail < minAvail) {
               minAvail = dayAvail;
            }
         }
          
         availableRooms += Math.max(0, minAvail);
         totalRooms += (rt.totalInventory || 0);
     });

     return {
        id: hotel.id,
        name: hotel.name,
        price: hotelMinPrice === Infinity ? 0 : hotelMinPrice,
        rating: hotel.rating || 0,
        reviewCount: hotel.reviews || 0,
        commission: agreementMap[hotel.id]?.commissionRate || 15,
        totalRooms: totalRooms || 1,
        availableRooms: availableRooms || 0,
        freeCancellation: hasFreeCancellation,
        amenities: hotel.amenities || []
     };
  });

  // Apply filters
  let filteredHotels = mappedHotels.filter(h => h.price > 0);

  if (minPrice) {
    filteredHotels = filteredHotels.filter(h => h.price >= parseFloat(minPrice));
  }
  if (maxPrice) {
    filteredHotels = filteredHotels.filter(h => h.price <= parseFloat(maxPrice));
  }
  if (minRating) {
    filteredHotels = filteredHotels.filter(h => h.rating >= parseFloat(minRating));
  }
  if (amenities) {
    const requiredAmenities = amenities.split(',').map(a => a.trim().toLowerCase());
    filteredHotels = filteredHotels.filter(h => 
      requiredAmenities.every(reqAm => 
        h.amenities.some(ha => ha.toLowerCase().includes(reqAm))
      )
    );
  }

  // 3. Send to rankingService
  const isSoldOutIncluded = includeSoldOut === 'true' || includeSoldOut === true;
  const sortBy = sort || 'RECOMMENDED';
  
  const rankedHotels = rankingService.rankResults(filteredHotels, sortBy, isSoldOutIncluded);

  const responseData = { hotels: rankedHotels };
  
  cacheUtils.setCache(cacheKey, responseData, 60000); // 60s TTL

  res.status(200).json({
    success: true,
    data: responseData
  });
});
