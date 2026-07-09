import prisma from '../config/db.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { z } from 'zod';
import rankingService from '../services/rankingService.js';
import cacheUtils from '../utils/cacheUtils.js';
import crypto from 'crypto';
import { mediaService } from '../services/MediaService.js';

// --- ZOD SCHEMAS ---

const hotelSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  address: z.string().optional(),
  location: z.string().optional(),
  city: z.string().min(2, 'City is required'),
  state: z.string().optional(),
  country: z.string().optional(),
  area: z.string().optional(),
  pincode: z.string().optional(),
  landmark: z.string().optional(),
  propertyType: z.string().optional(),
  rating: z.preprocess((val) => (val === '' || val === null || val === undefined ? undefined : Number(val)), z.number().min(0).max(5).optional()),
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
  // Step 3: Contact
  receptionPhone: z.string().optional(),
  receptionEmail: z.string().optional(),
  managerName: z.string().optional(),
  managerPhone: z.string().optional(),
  managerEmail: z.string().optional(),
  guestLandline: z.string().optional(),
  ownerName: z.string().optional(),
  ownerEmail: z.string().optional(),
  ownerPhone: z.string().optional(),
  // Step 4: Commercials & Legal
  bankDetail: z.object({
    accountName: z.string(),
    bankName: z.string(),
    accountNumber: z.string(),
    ifscCode: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Invalid IFSC code"),
    branchName: z.string().optional(),
    upiId: z.string().optional(),
  }).optional(),
  commissionRate: z.number().optional(),
  channelProvider: z.string().optional(),
  legalName: z.string().optional(),
  pan: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, "Invalid PAN format").optional(),
  gstin: z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, "Invalid GSTIN format").optional(),
  incorporationType: z.string().optional(),
  payoutCycle: z.string().optional(),
  msme: z.string().optional(),
  builtYear: z.preprocess((val) => (val === '' || val === null ? undefined : Number(val)), z.number().optional()),
  bookingSince: z.preprocess((val) => (val === '' || val === null ? undefined : Number(val)), z.number().optional()),
  status: z.enum(['DRAFT', 'PENDING', 'ACTIVE', 'INACTIVE', 'REJECTED']).optional(),
  lastUpdatedAt: z.string().optional(),
});

const hotelUpdateSchema = hotelSchema.partial();

// --- HELPERS ---

const calculatePropertyCompleteness = (hotel, normalizedData) => {
  const breakdown = {
    businessProfile: false,
    contactInfo: false,
    photos: false,
    rooms: false,
    amenities: false,
    policies: false,
    finance: false,
  };

  const { prismaData, _bankDetail, _media, _contactInfo, _commercials } = normalizedData;
  const mergedSettings = hotel.integrationSettings || {};
  const currentContact = _contactInfo || mergedSettings.contactInfo || {};
  const currentCommercials = _commercials || mergedSettings.commercials || {};

  // Check Business Profile
  breakdown.businessProfile = Boolean(
    prismaData.legalName || hotel.legalName
  ) && Boolean(
    currentCommercials.builtYear || hotel.builtYear
  );

  // Contact Info
  breakdown.contactInfo = Boolean(
    currentContact.ownerName && currentContact.ownerPhone
  ) && Boolean(
    currentContact.receptionPhone
  );

  // Photos
  const mediaCount = _media ? _media.length : (hotel.media ? hotel.media.length : 0);
  breakdown.photos = mediaCount >= 3;

  // Rooms (not in this payload, rely on hotel object)
  breakdown.rooms = hotel.roomTypes && hotel.roomTypes.length > 0;

  // Amenities
  const amenities = prismaData.amenities || hotel.amenities || [];
  breakdown.amenities = amenities.length > 0;

  // Policies
  const policies = prismaData.policies || hotel.policies || [];
  breakdown.policies = policies.length > 0;

  // Finance
  breakdown.finance = Boolean(
    (_bankDetail && _bankDetail.accountNumber) || 
    (hotel.bankDetail && hotel.bankDetail.accountNumber)
  ) && Boolean(
    prismaData.pan || hotel.pan
  );

  const total = Object.keys(breakdown).length;
  const completed = Object.values(breakdown).filter(Boolean).length;
  const score = Math.round((completed / total) * 100);

  return { score, breakdown };
};

/**
 * Normalizes hotel payload to ensure consistent data structure
 */
export const normalizeHotelPayload = (data) => {
  const {
    name, address, location, city, description, latitude, longitude,
    amenities, policies, checkInTime, checkOutTime,
    media, _images,
    receptionPhone, receptionEmail, managerName, managerPhone, managerEmail, guestLandline,
    ownerName, ownerEmail, ownerPhone,
    bankDetail, commissionRate, status, channelProvider,
    propertyType, rating, legalName, pan, gstin,
    incorporationType, payoutCycle, msme, builtYear, bookingSince,
    state, country, area, pincode, landmark
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
    checkOutTime,
    channelProvider,
    legalName,
    pan,
    gstin,
    incorporationType,
    payoutCycle,
    state,
    country,
    pincode,
    landmark
  };

  // Map propertyType to Prisma's 'type' field
  if (propertyType) prismaData.type = propertyType;
  // Map rating
  if (rating !== undefined && rating !== null) prismaData.rating = Number(rating);
  
  if (status) {
    prismaData.status = status;
  }

  // Clean up undefined fields
  Object.keys(prismaData).forEach(key => prismaData[key] === undefined && delete prismaData[key]);
  
  const _contactInfo = {
    receptionPhone, receptionEmail, managerName, managerPhone, managerEmail, guestLandline,
    ownerName, ownerEmail, ownerPhone
  };
  Object.keys(_contactInfo).forEach(key => _contactInfo[key] === undefined && delete _contactInfo[key]);

  // Address breakdown for edit property
  const _addressDetails = {};
  if (address) _addressDetails.address = address;
  if (area) _addressDetails.area = area;
  if (state) _addressDetails.state = state;
  if (pincode) _addressDetails.pincode = pincode;
  if (country) _addressDetails.country = country;

  // Commercial metadata
  const _commercials = {};
  if (msme !== undefined) _commercials.msme = msme;
  if (builtYear !== undefined) _commercials.builtYear = builtYear;
  if (bookingSince !== undefined) _commercials.bookingSince = bookingSince;

  return {
    prismaData,
    _bankDetail: bankDetail,
    _commissionRate: commissionRate,
    _media: media,
    _contactInfo,
    _addressDetails,
    _commercials
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
  const { prismaData, _bankDetail, _commissionRate, _media, _contactInfo, _addressDetails } = normalized;

  // Check for existing draft with same name — return it instead of blocking
  const existing = await prisma.hotel.findFirst({
    where: { 
      name: prismaData.name, 
      ownerId: req.user.id, 
      isDeleted: false 
    }
  });
  
  // Build integrationSettings with contactInfo and addressDetails
  const buildSettings = (base = {}) => {
    const settings = typeof base === 'object' && base ? { ...base } : {};
    if (Object.keys(_contactInfo).length > 0) settings.contactInfo = { ...(settings.contactInfo || {}), ..._contactInfo };
    if (Object.keys(_addressDetails).length > 0) settings.addressDetails = { ...(settings.addressDetails || {}), ..._addressDetails };
    return settings;
  };

  let hotel;
  if (existing) {
    hotel = await prisma.hotel.update({
      where: { id: existing.id },
      data: {
        ...prismaData,
        integrationSettings: buildSettings(existing.integrationSettings)
      }
    });
  } else {
    hotel = await prisma.hotel.create({
      data: { 
        ...prismaData,
        ownerId: req.user.id,
        status: prismaData.status || 'PENDING',
        integrationSettings: buildSettings()
      }
    });
  }

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
  
  if (req.body.lastUpdatedAt) {
    const incomingDate = new Date(req.body.lastUpdatedAt).getTime();
    const existingDate = existingHotel.updatedAt.getTime();
    if (incomingDate < existingDate) {
      return res.status(409).json({ success: false, message: 'Concurrency conflict: Property modified by another user.', requestId: req.id });
    }
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
  const { prismaData, _bankDetail, _commissionRate, _media, _contactInfo, _addressDetails, _commercials } = normalized;

  const isAdmin = req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN';

  // Role-Based Access Control (RBAC)
  if (!isAdmin) {
    // Protected fields dropped for non-admins
    delete prismaData.status;
    delete prismaData.channelProvider;
    delete prismaData.legalName;
    delete prismaData.pan;
    delete prismaData.gstin;
    normalized._bankDetail = undefined;
    normalized._commissionRate = undefined;
  }

  if (prismaData.status === 'ACTIVE' && existingHotel.status !== 'ACTIVE') {
    const agreement = await prisma.agreement.findUnique({ where: { hotelId: id } });
    if (!agreement || agreement.status !== 'SIGNED') {
      return res.status(400).json({ success: false, message: 'Cannot activate: Agreement not signed.', requestId: req.id });
    }
  }

  // Safely merge new contact info and address details into integrationSettings
  let newSettings = undefined;
  const hasContact = _contactInfo && Object.keys(_contactInfo).length > 0;
  const hasAddress = _addressDetails && Object.keys(_addressDetails).length > 0;
  const hasCommercials = _commercials && Object.keys(_commercials).length > 0;
  
  if (hasContact || hasAddress || hasCommercials) {
    const existingSettings = existingHotel.integrationSettings && typeof existingHotel.integrationSettings === 'object' ? existingHotel.integrationSettings : {};
    newSettings = { ...existingSettings };
    if (hasContact) {
      newSettings.contactInfo = { ...(existingSettings.contactInfo || {}), ..._contactInfo };
    }
    if (hasAddress) {
      newSettings.addressDetails = { ...(existingSettings.addressDetails || {}), ..._addressDetails };
    }
    if (hasCommercials) {
      newSettings.commercials = { ...(existingSettings.commercials || {}), ..._commercials };
    }
  }

  // Field-Level Audit Logging
  const auditDetails = { fields: {} };
  Object.keys(prismaData).forEach(key => {
    if (prismaData[key] !== undefined && JSON.stringify(prismaData[key]) !== JSON.stringify(existingHotel[key])) {
      auditDetails.fields[key] = { old: existingHotel[key], new: prismaData[key] };
    }
  });
  if (normalized._commissionRate !== undefined && normalized._commissionRate !== existingHotel.dynamicCommissionRate) {
    auditDetails.fields.commissionRate = { old: existingHotel.dynamicCommissionRate, new: normalized._commissionRate };
  }
  // Deep diff JSON settings
  if (newSettings) {
    ['contactInfo', 'addressDetails', 'commercials'].forEach(section => {
      if (newSettings[section]) {
        Object.keys(newSettings[section]).forEach(key => {
          const oldVal = existingHotel.integrationSettings?.[section]?.[key];
          const newVal = newSettings[section][key];
          if (newVal !== undefined && oldVal !== newVal) {
            auditDetails.fields[`${section}.${key}`] = { old: oldVal, new: newVal };
          }
        });
      }
    });
  }

  // Property Completeness Engine
  const completeness = calculatePropertyCompleteness(existingHotel, normalized);

  const hotel = await prisma.hotel.update({
    where: { id },
    data: {
      ...prismaData,
      status: prismaData.status || existingHotel.status,
      complianceScore: completeness.score,
      readinessBreakdown: completeness.breakdown,
      ...(newSettings ? { integrationSettings: newSettings } : {})
    }
  });

  if (Object.keys(auditDetails.fields).length > 0) {
    await prisma.auditLog.create({
      data: {
        action: 'UPDATE',
        entityType: 'HOTEL',
        entityId: hotel.id,
        userId: req.user.id,
        requestId: req.id,
        details: auditDetails
      }
    });
  }

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

  res.status(200).json({ success: true, data: hotel, requestId: req.id });
});

export const deleteHotel = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const hotel = await prisma.hotel.findUnique({ where: { id } });
  if (!hotel) return res.status(404).json({ success: false, message: 'Property not found', requestId: req.id });
  
  if (req.user.role === 'OWNER' && hotel.ownerId !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Forbidden', requestId: req.id });
  }

  await prisma.hotel.delete({ where: { id } });

  await prisma.auditLog.create({
    data: { action: 'HARD_DELETE_HOTEL', entityType: 'HOTEL', entityId: id, userId: req.user.id, requestId: req.id }
  });

  res.status(200).json({ success: true, message: 'Property permanently deleted', requestId: req.id });
});

export const formatHotelResponse = (hotel) => {
  const integSettings = (hotel.integrationSettings && typeof hotel.integrationSettings === 'object')
    ? hotel.integrationSettings : {};
  const contactInfo = integSettings.contactInfo || {};
  const addressDetails = integSettings.addressDetails || {};

  return {
    ...hotel,
    receptionPhone: contactInfo.receptionPhone || null,
    receptionEmail: contactInfo.receptionEmail || null,
    managerName: contactInfo.managerName || null,
    managerPhone: contactInfo.managerPhone || null,
    managerEmail: contactInfo.managerEmail || null,
    guestLandline: contactInfo.guestLandline || null,
    ownerName: contactInfo.ownerName || null,
    ownerEmail: contactInfo.ownerEmail || null,
    ownerPhone: contactInfo.ownerPhone || null,
    msme: integSettings.commercials?.msme || null,
    builtYear: integSettings.commercials?.builtYear || null,
    bookingSince: integSettings.commercials?.bookingSince || null,
    addressLine: addressDetails.address || null,
    area: addressDetails.area || null,
    state: addressDetails.state || null,
    pincode: addressDetails.pincode || null,
    country: addressDetails.country || null,
  };
};

export const getAllHotels = asyncHandler(async (req, res) => {
  const { destination, _stars, page = 1, limit = 10 } = req.query;
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

  const [hotels, _total] = await Promise.all([
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
  const formattedHotelsPromises = hotels.map(async (hotel) => {
    let startingPrice = null;
    
    // Find the absolute lowest price across all room types
    hotel.roomTypes.forEach(rt => {
      const cheapestPlan = rt.ratePlans[0];
      if (cheapestPlan && cheapestPlan.basePrice > 0 && (startingPrice === null || cheapestPlan.basePrice < startingPrice)) {
        startingPrice = cheapestPlan.basePrice;
      }
    });

    const hasPrice = startingPrice !== null && startingPrice > 0;
    const hasMedia = hotel.media && hotel.media.length > 0;

    // Check if the user is an admin or owner to show draft/incomplete properties
    const isAdminOrOwner = req.user && (req.user.role === 'ADMIN' || req.user.role === 'OWNER');

    if (!isAdminOrOwner) {
      // P0 DATA INTEGRITY GUARD: Skip hotels with no price or no images for public listing
      if (!hasPrice || !hasMedia) return null;
    }

    const signedHotel = await mediaService.signHotelUrls(hotel);
    const flattenedHotel = formatHotelResponse(signedHotel);
    const rawImage = hasMedia ? signedHotel.media[0].url : '';
    const signedImage = rawImage.startsWith('gs://') ? await mediaService.getSignedUrl(rawImage) : rawImage;

    return {
      ...flattenedHotel,
      image: signedImage,
      startingPrice: startingPrice || 0,
      price: startingPrice || 0
    };
  });

  const formattedHotelsWithNulls = await Promise.all(formattedHotelsPromises);
  const formattedHotels = formattedHotelsWithNulls.filter(h => h !== null); // Remove blocked properties

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

  const signedHotel = await mediaService.signHotelUrls(hotel);
  const data = {
    ...formatHotelResponse(signedHotel),
    agreement,
    bankDetail,
    viewsToday,
    bookingsToday
  };

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
      OR: [
        { city: { equals: city, mode: 'insensitive' } },
        { location: { contains: city, mode: 'insensitive' } }
      ],
      status: 'ACTIVE',
      isDeleted: false
    },
    take: 100,
    include: {
      media: { take: 1 },
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
        startingPrice: hotelMinPrice === Infinity ? 0 : hotelMinPrice,
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
