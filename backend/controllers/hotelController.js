import prisma from '../config/db.js';
import { COVER_PHOTO_FIRST } from '../constants/coverPhoto.js';
import { PUBLIC_HOTEL_STATUSES } from '../constants/hotelStatus.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { z } from 'zod';
import rankingService from '../services/rankingService.js';
import { getShared, setShared } from '../utils/sharedCache.js';
import { logSearch } from '../services/ops/searchLog.js';
import crypto from 'crypto';
import bcrypt from '../utils/bcrypt.js';
import { mediaService } from '../services/MediaService.js';
import { queueService } from '../services/queueService.js';
import { STAY_BOOKING_STATUSES } from '../constants/bookingStatus.js';
import { CANCELLATION_POLICY_CODES, policyFieldsForCode } from '../utils/refundCalculator.js';
import { getDatesInRange } from '../utils/dateUtils.js';
import { displayOffers, displayOffersMany } from '../services/promotionService.js';
import { membershipFor } from '../services/membershipService.js';
import { escapeHtml } from '../utils/html.js';
import { planNightlyPrice } from '../services/ariService.js';
import nearbyPlaces from '../services/nearbyPlacesService.js';
import { hotelIdsForPlace, hotelsNear } from '../services/hotelPlaceMatch.js';
import { parseLatLng } from '../utils/places.js';
import { SEARCH_MAX_HOTELS } from '../services/hotelPlaceMatch.js';
import { managesHotel, managedHotelWhere } from '../utils/hotelAccess.js';
import { hotelSlug } from '../utils/hotelSlug.js';
import { seoChanged } from '../services/seoService.js';

const SEARCH_BATCH = 200;

// --- ZOD SCHEMAS ---

const hotelSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  address: z.string().optional(),
  location: z.string().optional(),
  city: z.string().min(2, 'City is required'),
  state: z.string().optional(),
  country: z.string().optional(),
  area: z.string().optional(),
  houseNo: z.string().max(200).optional(),
  pincode: z.string().optional(),
  landmark: z.string().optional(),
  propertyType: z.string().optional(),
  rating: z.preprocess((val) => (val === '' || val === null || val === undefined ? undefined : Number(val)), z.number().min(0).max(5).optional()),
  description: z.string().optional().default(''),
  latitude: z.preprocess((val) => (val === '' || val === null ? undefined : parseFloat(val)), z.number().min(-90).max(90).optional()),
  longitude: z.preprocess((val) => (val === '' || val === null ? undefined : parseFloat(val)), z.number().min(-180).max(180).optional()),
  media: z.array(z.object({
    // Full URLs (cloud storage) or this server's own /uploads/<file> paths (STORAGE_DRIVER=local,
    // e.g. the VPS, where the site calls the API at a relative /api/v1 so photo URLs are relative).
    // Plain file names only: local storage maps these to files on disk, so no folders or "..".
    url: z.string().refine(val => val.startsWith('http') || val.startsWith('blob:') || /^\/uploads\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(val) && !val.includes('..'), {
      message: "URL must be a valid http/https URL or an /uploads/ path"
    }),
    tags: z.array(z.string()).optional().default([])
  })).max(20, "Maximum 20 images allowed").optional(),
  images: z.array(z.any()).optional(),
  amenities: z.array(z.string()).optional().default([]),
  policies: z.array(z.string()).optional().default([]),
  checkInTime: z.string().optional().default('14:00'),
  checkOutTime: z.string().optional().default('11:00'),
  // Policies step: house rules (Yes/No answers, ID proofs, custom policy) and meal rack prices.
  // These were collected by the wizard but never sent or saved.
  policyRules: z.record(z.union([z.string().max(2000), z.array(z.string().max(60)).max(20), z.boolean()])).optional(),
  mealPrices: z.record(z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : Number(v)), z.number().min(0).max(100000).optional())).optional(),
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
  cancellationPolicy: z.enum(CANCELLATION_POLICY_CODES).optional(),
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
  // What's nearby (Location step): [{ name, category, type, lat?, lng?, distanceKm?, source, visible }]
  nearbyPlaces: z.array(z.object({}).passthrough()).max(80).optional(),
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

/** Stores the cancellation policy the property chose at onboarding (used for guest refunds). */
const saveCancellationPolicy = async (hotelId, code) => {
  if (!code) return;
  const fields = policyFieldsForCode(code);
  await prisma.cancellationPolicy.upsert({
    where: { hotelId },
    create: { hotelId, ...fields },
    update: fields
  });
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
    bankDetail, commissionRate, cancellationPolicy, status, channelProvider,
    propertyType, rating, legalName, pan, gstin,
    incorporationType, payoutCycle, msme, builtYear, bookingSince,
    state, country, area, pincode, landmark, policyRules, mealPrices, houseNo
  } = data;
  
  // 1. Consistent location derived from address and city
  // (A partial update without the city used to save "<address>, undefined")
  const finalLocation = location || (address ? [address, city].filter(Boolean).join(', ') : city);
  
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
  if (houseNo) _addressDetails.houseNo = houseNo;
  if (area) _addressDetails.area = area;
  if (state) _addressDetails.state = state;
  if (pincode) _addressDetails.pincode = pincode;
  if (country) _addressDetails.country = country;

  // Commercial metadata
  const _commercials = {};
  if (msme !== undefined) _commercials.msme = msme;
  if (builtYear !== undefined) _commercials.builtYear = builtYear;
  if (bookingSince !== undefined) _commercials.bookingSince = bookingSince;

  // Guest-facing details shown on the hotel page
  const _guestInfo = {};
  if (policyRules) _guestInfo.policyRules = policyRules;
  if (mealPrices) _guestInfo.mealPrices = Object.fromEntries(Object.entries(mealPrices).filter(([, v]) => v !== undefined));

  return {
    prismaData,
    _guestInfo,
    _bankDetail: bankDetail,
    _commissionRate: commissionRate,
    _cancellationPolicy: cancellationPolicy,
    _media: media,
    _contactInfo,
    _addressDetails,
    _commercials
  };
};

const activeFilter = { isDeleted: false };

/**
 * Finds the owner account for the email entered in the property form, or creates an invited
 * OWNER account (temporary password + set-password link, emailed by sendOwnerInvite). A customer
 * account with that email becomes an owner. Returns { ownerId, invite? }.
 */
const resolveOwnerAccount = async (contact) => {
  const email = String(contact.ownerEmail).trim().toLowerCase();
  const existingOwner = await prisma.user.findUnique({ where: { email } });
  if (existingOwner) {
    if (existingOwner.role === 'CUSTOMER') {
      await prisma.user.update({ where: { id: existingOwner.id }, data: { role: 'OWNER' } });
    }
    return { ownerId: existingOwner.id };
  }
  // Invite link token: the raw value goes in the email, its SHA-256 is stored (as
  // /users/accept-invite expects)
  const inviteToken = crypto.randomBytes(32).toString('hex');
  const tempPassword = crypto.randomBytes(6).toString('hex');
  const newOwner = await prisma.user.create({
    data: {
      name: contact.ownerName || 'Property Owner',
      email,
      password: await bcrypt.hash(tempPassword, 10),
      phone: contact.ownerPhone || null,
      role: 'OWNER',
      status: 'INVITED',
      inviteToken: crypto.createHash('sha256').update(inviteToken).digest('hex'),
      inviteExpiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      mustChangePassword: true
    }
  });
  return { ownerId: newOwner.id, invite: { inviteToken, tempPassword } };
};

const sendOwnerInvite = (hotel, ownerEmail, { inviteToken, tempPassword }) =>
  queueService.enqueue('email', 'SEND_OWNER_INVITE', {
    to: ownerEmail,
    subject: 'Welcome to ZivoPlus - Claim Your Property',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2>Welcome to ZivoPlus!</h2>
        <p>An admin has started onboarding your property: <strong>${escapeHtml(hotel.name)}</strong>.</p>
        <p>An owner account has been created for you. Please log in using the temporary credentials below to review and submit your property.</p>
        <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Email:</strong> ${escapeHtml(ownerEmail)}</p>
          <p><strong>Temporary Password:</strong> ${tempPassword}</p>
        </div>
        <p>Or set your own password here (link valid for 7 days):<br>
          <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/accept-invite?token=${inviteToken}">Set my password</a></p>
        <p>Please change your password immediately after logging in.</p>
      </div>
    `
  }, { priority: 1 });

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
  const { prismaData, _bankDetail, _commissionRate, _media, _contactInfo, _addressDetails, _commercials, _guestInfo } = normalized;
  if (validation.data.nearbyPlaces) {
    prismaData.nearbyPlaces = nearbyPlaces.normalizeList(validation.data.nearbyPlaces, prismaData.latitude, prismaData.longitude);
    prismaData.nearbyAutoFilledAt = new Date(); // the owner manages the list: don't auto-fill over it
  }

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
    if (Object.keys(_commercials).length > 0) settings.commercials = { ...(settings.commercials || {}), ..._commercials };
    Object.assign(settings, _guestInfo);
    return settings;
  };

  // The owner named in the form (admin onboarding): an existing account, or a new invited one
  const ownerEmail = _contactInfo.ownerEmail;
  const resolved = ownerEmail ? await resolveOwnerAccount(_contactInfo) : null;
  const targetOwnerId = resolved?.ownerId || req.user.id;
  const isNewOwner = Boolean(resolved?.invite);

  let hotel;
  if (existing) {
    hotel = await prisma.hotel.update({
      where: { id: existing.id },
      data: {
        ...prismaData,
        ownerId: targetOwnerId, // Update to resolved owner
        updatedBy: req.user.id,
        integrationSettings: buildSettings(existing.integrationSettings)
      }
    });
  } else {
    hotel = await prisma.hotel.create({
      data: { 
        ...prismaData,
        ownerId: targetOwnerId,
        createdBy: req.user.id, // Logged in Admin is the creator
        updatedBy: req.user.id,
        status: prismaData.status || 'DRAFT',
        integrationSettings: buildSettings()
      }
    });
  }

  if (isNewOwner) await sendOwnerInvite(hotel, ownerEmail, resolved.invite);
  if (!hotel.nearbyAutoFilledAt) nearbyPlaces.scheduleAutoFill(hotel.id); // fills what's nearby once a pin is set and none were added

  // Handle manual creation of agreement and bank detail to avoid client-sync issues.
  // Only an admin sets commission; an owner's property gets its agreement at approval.
  const isAdminCreator = req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN';
  if (_commissionRate && isAdminCreator) {
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

  await saveCancellationPolicy(hotel.id, normalized._cancellationPolicy);

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
  
  // Optimistic concurrency: reject only if ANOTHER user edited the property since the client
  // loaded it. updatedAt alone can't be used: the owner's own photo and KYC uploads also bump it
  // (compliance score), which made every onboarding submission fail with a false conflict.
  if (req.body.lastUpdatedAt) {
    const since = new Date(req.body.lastUpdatedAt);
    if (!isNaN(since.getTime()) && since < existingHotel.updatedAt) {
      const otherEdit = await prisma.auditLog.findFirst({
        where: {
          entityType: 'HOTEL',
          entityId: id,
          action: 'UPDATE',
          createdAt: { gt: since },
          NOT: { userId: req.user.id }
        },
        select: { id: true }
      });
      if (otherEdit) {
        return res.status(409).json({ success: false, message: 'This property was changed by someone else while you were editing. Reload the page to see their changes, then try again.', requestId: req.id });
      }
    }
  }
  
  if (req.user.role === 'OWNER' && !managesHotel(req.user, existingHotel)) {
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
  const { prismaData, _media, _contactInfo, _addressDetails, _commercials, _guestInfo } = normalized;

  // What's nearby: distances follow the map pin (also when only the pin moved)
  const pinLat = prismaData.latitude ?? existingHotel.latitude;
  const pinLng = prismaData.longitude ?? existingHotel.longitude;
  const pinMoved = (prismaData.latitude !== undefined && prismaData.latitude !== existingHotel.latitude) || (prismaData.longitude !== undefined && prismaData.longitude !== existingHotel.longitude);
  if (validation.data.nearbyPlaces) {
    prismaData.nearbyPlaces = nearbyPlaces.normalizeList(validation.data.nearbyPlaces, pinLat, pinLng);
    if (!existingHotel.nearbyAutoFilledAt) prismaData.nearbyAutoFilledAt = new Date(); // owner manages it now
  } else if (pinMoved && Array.isArray(existingHotel.nearbyPlaces) && existingHotel.nearbyPlaces.length) {
    prismaData.nearbyPlaces = nearbyPlaces.normalizeList(existingHotel.nearbyPlaces, pinLat, pinLng);
  }

  const isAdmin = req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN';

  // Role-Based Access Control (RBAC)
  if (!isAdmin) {
    delete prismaData.status;
    delete prismaData.channelProvider;
    // Commission is agreed with ZivoPlus: only an admin can set it
    normalized._commissionRate = undefined;
    // Owners fill in legal and bank details while onboarding; once submitted they're locked
    // (changing the payout account later goes through support)
    if (!['DRAFT', 'INFORMATION_REQUESTED'].includes(existingHotel.status)) {
      delete prismaData.legalName;
      delete prismaData.pan;
      delete prismaData.gstin;
      normalized._bankDetail = undefined;
    }
  }
  // Read after the RBAC step so the restrictions above actually apply
  const { _bankDetail, _commissionRate } = normalized;

  if (prismaData.status === 'ACTIVE' && existingHotel.status !== 'ACTIVE') {
    const agreement = await prisma.agreement.findUnique({ where: { hotelId: id } });
    if (!agreement || agreement.status !== 'SIGNED') {
      return res.status(400).json({ success: false, message: 'Cannot activate: Agreement not signed.', requestId: req.id });
    }
  }

  // Admin onboarding: the draft is created (step 1) before the owner's email is entered, so the
  // property starts out owned by the admin. When the owner email is saved, link (or invite) that
  // owner. A property that already belongs to an owner account is never moved this way.
  let ownerChange = null;
  if (isAdmin && _contactInfo?.ownerEmail) {
    const currentOwner = await prisma.user.findUnique({ where: { id: existingHotel.ownerId }, select: { email: true, role: true } });
    const wanted = String(_contactInfo.ownerEmail).trim().toLowerCase();
    if (currentOwner?.role !== 'OWNER' && currentOwner?.email?.toLowerCase() !== wanted) {
      ownerChange = await resolveOwnerAccount(_contactInfo);
      prismaData.ownerId = ownerChange.ownerId;
    }
  }

  // Safely merge new contact info and address details into integrationSettings
  let newSettings = undefined;
  const hasContact = _contactInfo && Object.keys(_contactInfo).length > 0;
  const hasAddress = _addressDetails && Object.keys(_addressDetails).length > 0;
  const hasCommercials = _commercials && Object.keys(_commercials).length > 0;
  const hasGuestInfo = _guestInfo && Object.keys(_guestInfo).length > 0;

  if (hasContact || hasAddress || hasCommercials || hasGuestInfo) {
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
    if (hasGuestInfo) Object.assign(newSettings, _guestInfo);
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

  if (ownerChange?.invite) await sendOwnerInvite(hotel, _contactInfo.ownerEmail, ownerChange.invite);
  if (!hotel.nearbyAutoFilledAt && hotel.latitude && hotel.longitude && !(hotel.nearbyPlaces || []).length) nearbyPlaces.scheduleAutoFill(id);

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
        ownerId: hotel.ownerId, 
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

  await saveCancellationPolicy(id, normalized._cancellationPolicy);

  seoChanged(hotel.id).catch(() => {}); // search pages and IndexNow
  res.status(200).json({ success: true, data: hotel, requestId: req.id });
});

export const deleteHotel = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const hotel = await prisma.hotel.findUnique({ where: { id } });
  if (!hotel) return res.status(404).json({ success: false, message: 'Property not found', requestId: req.id });
  
  if (req.user.role === 'OWNER' && !managesHotel(req.user, hotel)) {
    return res.status(403).json({ success: false, message: 'Forbidden', requestId: req.id });
  }

  // Bookings keep a property: it can't be erased (archive it instead). Its cancellation policy
  // and any sales lead pointing at it used to block the delete with a database error.
  const bookings = await prisma.booking.count({ where: { hotelId: id } });
  if (bookings > 0) {
    return res.status(409).json({ success: false, message: `This property has ${bookings} booking(s), so it can't be permanently deleted. Deactivate it instead.`, requestId: req.id });
  }
  await prisma.$transaction([
    prisma.cancellationPolicy.deleteMany({ where: { hotelId: id } }),
    prisma.propertyLead.updateMany({ where: { hotelId: id }, data: { hotelId: null } }),
    prisma.hotel.delete({ where: { id } }),
  ]);

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
    policyRules: integSettings.policyRules || {},
    mealPrices: integSettings.mealPrices || {},
    addressLine: addressDetails.address || null,
    houseNo: addressDetails.houseNo || null,
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
    Object.assign(where, managedHotelWhere(req.user));
  } else if (!req.user || req.user.role !== 'ADMIN') {
    // Public & customer listings must only show approved, live hotels — never drafts,
    // properties under review, or suspended ones. Admins/owners still see everything they manage.
    where.status = { in: PUBLIC_HOTEL_STATUSES };
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
        media: COVER_PHOTO_FIRST, // the cover photo for the card
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

    const listed = {
      ...flattenedHotel,
      slug: hotelSlug(hotel),
      image: signedImage,
      startingPrice: startingPrice || 0,
      price: startingPrice || 0
    };
    // The public list returned every field, including PAN, GSTIN, owner and manager contacts,
    // commission and credit score. Only admins and the owner (own hotels) get the full record.
    return isAdminOrOwner
      ? listed
      : { ...publicHotelView(listed), slug: listed.slug, startingPrice: listed.startingPrice, price: listed.price };
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

/** Fields a guest may see about a live property (no bank, legal, commercial or owner details). */
const PUBLIC_HOTEL_FIELDS = [
  'id', 'name', 'description', 'type', 'propertyType', 'starRating', 'rating',
  'city', 'location', 'landmark', 'state', 'country', 'pincode', 'area', 'addressLine', 'latitude', 'longitude',
  'amenities', 'policies', 'checkInTime', 'checkOutTime', 'images', 'image',
  'status', 'cancellationPolicy', 'viewsToday', 'bookingsToday', 'builtYear', 'mealPrices',
  'reviewScore', 'reviewCount', 'reviewAspects', 'memberDiscountPercent'
];
/** House-rule answers from onboarding that guests may see (the Policies step). */
const PUBLIC_HOUSE_RULES = [
  'unmarriedCouples', 'guestsBelow18', 'maleGroupsAllowed', 'identityProofs', 'sameCityId',
  'smokingAllowed', 'partiesAllowed', 'alcoholAllowed', 'wheelchairAccessible', 'outsideVisitors',
  'petsOnProperty', 'petsAllowed', 'has24HrCheckin', 'infantIncluded', 'infantFood',
  'extraBedInRates', 'extraBedAdults', 'extraBedKids', 'customPolicy'
];
const publicHotelView = (hotel) => {
  const view = Object.fromEntries(PUBLIC_HOTEL_FIELDS.filter((k) => hotel[k] !== undefined && hotel[k] !== null).map((k) => [k, hotel[k]]));
  const rules = hotel.policyRules || {};
  view.nearbyPlaces = nearbyPlaces.publicList(hotel.nearbyPlaces);
  view.houseRules = Object.fromEntries(PUBLIC_HOUSE_RULES.filter((k) => rules[k] !== undefined && rules[k] !== '' && !(Array.isArray(rules[k]) && !rules[k].length)).map((k) => [k, rules[k]]));
  // Photos: only what the page needs (no AI analysis or internal ids of other records)
  if (Array.isArray(hotel.media)) {
    view.media = hotel.media.map((m) => ({ id: m.id, url: m.url, tags: m.tags || [], category: m.category, isPrimary: m.isPrimary }));
  }
  if (Array.isArray(hotel.roomTypes)) {
    view.roomTypes = hotel.roomTypes.map(({ images, inventories: _inv, bookings: _b, hotelId: _h, ...rt }) => ({
      ...rt,
      images: (images || []).filter((li) => li.image?.url).map((li) => ({ id: li.image.id, url: li.image.url, tags: li.image.tags || [], isPrimary: li.isPrimary })),
    }));
  }
  return view;
};

export const getHotelById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const hotel = await prisma.hotel.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true, phone: true, role: true } },
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

  // Only an admin or the property's own owner sees the full record (bank account, agreement, PAN,
  // owner contact...). Everyone else gets the public view of a live property. Before, this
  // endpoint needed no login and returned the bank account and PAN of any hotel.
  const isPrivileged = req.user && (req.user.role === 'ADMIN' || (req.user.role === 'OWNER' && managesHotel(req.user, hotel)));
  if (!isPrivileged && !PUBLIC_HOTEL_STATUSES.includes(hotel.status)) {
    return res.status(404).json({ success: false, message: 'Hotel not found', requestId: req.id });
  }

  // Fetch agreement and bankDetail manually to avoid Prisma client out-of-sync issues
  const [agreement, bankDetail, cancellationPolicy] = await Promise.all([
    prisma.agreement.findUnique({ where: { hotelId: id } }),
    prisma.bankDetail.findUnique({ where: { hotelId: id } }),
    prisma.cancellationPolicy.findUnique({ where: { hotelId: id } })
  ]);

  // Fetch urgency metrics
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [viewsToday, bookingsToday] = await Promise.all([
    prisma.hotelView.count({ where: { hotelId: id, createdAt: { gte: today } } }),
    prisma.booking.count({ where: { hotelId: id, status: { in: STAY_BOOKING_STATUSES }, createdAt: { gte: today } } })
  ]);

  // With stay dates (?checkin=&checkout=): price of each rate plan for those nights (daily rates
  // included) and whether each room type can be booked, so the hotel page matches checkout
  const nights = req.query.checkin && req.query.checkout ? getDatesInRange(req.query.checkin, req.query.checkout) : [];
  if (nights.length > 0 && nights.length <= 60) {
    const planIds = hotel.roomTypes.flatMap(rt => rt.ratePlans.map(rp => rp.id));
    const [rateRows, invRows] = await Promise.all([
      prisma.dailyRate.findMany({ where: { ratePlanId: { in: planIds }, date: { in: nights } }, select: { ratePlanId: true, date: true, price: true } }),
      prisma.inventory.findMany({ where: { roomTypeId: { in: hotel.roomTypes.map(rt => rt.id) }, date: { in: nights } }, select: { roomTypeId: true, date: true, availableRooms: true, stopSell: true } }),
    ]);
    const ratesByPlan = {};
    rateRows.forEach(r => { (ratesByPlan[r.ratePlanId] ||= {})[r.date.toISOString()] = r.price; });
    hotel.roomTypes.forEach(rt => {
      const inv = new Map(invRows.filter(i => i.roomTypeId === rt.id).map(i => [i.date.toISOString(), i]));
      const avail = Math.min(...nights.map(n => { const row = inv.get(n.toISOString()); return row ? (row.stopSell ? 0 : row.availableRooms) : rt.totalInventory; }));
      rt.availableForStay = Math.max(0, avail);
      rt.ratePlans.forEach(rp => {
        rp.stayNightlyPrice = planNightlyPrice(rp, rt, nights, ratesByPlan[rp.id] || {});
      });
    });

    // Automatic offers (promotions without a code): the same discount checkout gives for one room
    const stayEnd = new Date(nights[nights.length - 1]);
    stayEnd.setDate(stayEnd.getDate() + 1);
    const offers = await displayOffers({
      hotelId: id, checkIn: nights[0], checkOut: stayEnd, membership: await membershipFor(req.user?.id),
      plans: hotel.roomTypes.flatMap(rt => rt.ratePlans.filter(rp => rp.stayNightlyPrice > 0).map(rp => ({ roomTypeId: rt.id, ratePlanId: rp.id, nightlyPrice: rp.stayNightlyPrice })))
    });
    hotel.roomTypes.forEach(rt => rt.ratePlans.forEach(rp => { if (offers[rp.id]) rp.offer = offers[rp.id]; }));
  }

  const signedHotel = await mediaService.signHotelUrls(hotel);
  const full = {
    ...formatHotelResponse(signedHotel),
    agreement,
    bankDetail,
    cancellationPolicy: cancellationPolicy?.policyCode || null,
    viewsToday,
    bookingsToday
  };

  // Guests never see a rate plan without a price (it could otherwise be booked for ₹0)
  if (!isPrivileged) {
    full.roomTypes = (full.roomTypes || [])
      .map(rt => ({ ...rt, ratePlans: (rt.ratePlans || []).filter(rp => Number(rp.basePrice) > 0) }))
      .filter(rt => rt.ratePlans.length > 0);
  }
  const data = { ...(isPrivileged ? full : publicHotelView(full)), slug: hotelSlug(hotel) };
  res.status(200).json({ success: true, data, requestId: req.id });
});

// Guests in each room of the search: occ=2-0,1-1 (adults-children), else guests over rooms
const groupRoomsFrom = ({ occ, guests, rooms }) => {
  const fromOcc = String(occ || '').split(',').filter(Boolean).slice(0, 8)
    .map((p) => p.split('-').reduce((t, n) => t + (parseInt(n) || 0), 0)).filter((n) => n > 0);
  if (fromOcc.length) return fromOcc;
  const r = Math.min(Math.max(parseInt(rooms) || 1, 1), 8);
  const g = Math.max(parseInt(guests) || 1, r);
  return Array.from({ length: r }, (_, i) => Math.floor(g / r) + (i < g % r ? 1 : 0));
};

// Can the hotel give every room of the group a room type big enough with rooms left? Biggest party
// first, into the smallest room type that fits it (rooms of a booking can be different types).
export const canHostGroup = (typeRoomsLeft, groupRooms) => {
  const types = typeRoomsLeft.map((t) => ({ ...t })).sort((a, b) => a.maxGuests - b.maxGuests);
  for (const size of [...groupRooms].sort((a, b) => b - a)) {
    const t = types.find((x) => x.maxGuests >= size && x.left > 0);
    if (!t) return false;
    t.left -= 1;
  }
  return true;
};

export const searchHotels = asyncHandler(async (req, res) => {
  const { city, checkIn, checkOut, sort, minPrice, maxPrice, minRating, minStars, amenities, includeSoldOut } = req.query;
  // "Near me": a map point instead of a place name
  const near = parseLatLng(req.query.lat, req.query.lng);
  // Guests per room (occ=2-0,1-1); without it, guests split over rooms
  const groupRooms = groupRoomsFrom(req.query);

  if ((!city && !near) || !checkIn || !checkOut) {
    return res.status(400).json({ success: false, message: 'A destination (or your location), checkIn and checkOut are required' });
  }

  // Generate cache key
  const cacheKey = crypto.createHash('md5').update(JSON.stringify(req.query)).digest('hex');
  
  // Admin → Revenue per search: one row per search (repeats in the same visit count once)
  const logIt = (data) => logSearch({
    sessionId: req.headers['x-session-id'], userId: req.user?.id, place: near ? 'Near me' : city, checkIn,
    nights: getDatesInRange(checkIn, checkOut).length, guests: groupRooms.reduce((a, b) => a + b, 0), rooms: groupRooms.length,
    results: (data?.hotels || []).filter((h) => !h.badges?.isSoldOut).length,
  });

  const cachedData = await getShared(`search:${cacheKey}`);
  if (cachedData) {
    logIt(cachedData);
    return res.status(200).json({ success: true, data: cachedData });
  }

  // Stay nights exactly as the booking engine stores them (inventory rows, daily rates)
  const stayNights = getDatesInRange(checkIn, checkOut);
  if (stayNights.length === 0) {
    return res.status(400).json({ success: false, message: 'Check-out must be after check-in' });
  }

  // 1. The public hotels this search covers (up to SEARCH_MAX_HOTELS): the city under either of
  // its names (Bangalore / Bengaluru), an area, landmark or state, or the hotels near a map point.
  // Loaded in batches so a big city doesn't become one huge query; the page shows them a few at
  // a time.
  const distances = near ? await hotelsNear(near) : null;
  const matchedIds = (near ? [...distances.keys()] : await hotelIdsForPlace(city)).slice(0, SEARCH_MAX_HOTELS);
  const hotels = [];
  for (let i = 0; i < matchedIds.length; i += SEARCH_BATCH) {
    hotels.push(...await prisma.hotel.findMany({
      where: {
        id: { in: matchedIds.slice(i, i + SEARCH_BATCH) },
        // Go-live sets LIVE; 'ACTIVE' alone hid every property taken live through the admin flow
        status: { in: PUBLIC_HOTEL_STATUSES },
        isDeleted: false
      },
      include: {
        media: { ...COVER_PHOTO_FIRST, select: { url: true } },
        cancellationPolicy: { select: { policyCode: true } },
        roomTypes: {
          where: { isActive: true },
          include: {
            ratePlans: { where: { isActive: true } },
            inventories: {
               where: { date: { in: stayNights } }
            }
          }
        }
      }
    }));
  }

  const hotelIds = hotels.map(h => h.id);
  const agreements = await prisma.agreement.findMany({
    where: { hotelId: { in: hotelIds } }
  });

  const agreementMap = agreements.reduce((acc, curr) => {
    acc[curr.hotelId] = curr;
    return acc;
  }, {});

  // Daily rates for every rate plan in these hotels over the stay
  const planIds = hotels.flatMap(h => h.roomTypes.flatMap(rt => rt.ratePlans.map(rp => rp.id)));
  const rateRows = planIds.length
    ? await prisma.dailyRate.findMany({ where: { ratePlanId: { in: planIds }, date: { in: stayNights } }, select: { ratePlanId: true, date: true, price: true } })
    : [];
  const ratesByPlan = {};
  rateRows.forEach(r => { (ratesByPlan[r.ratePlanId] ||= {})[r.date.toISOString()] = r.price; });

  // 2. Map and calculate availability & price
  const mappedHotels = hotels.map(hotel => {
     let hotelMinPrice = Infinity;
     let totalRooms = 0;
     let availableRooms = 0;
     let hasFreeCancellation = false;
     const bookablePlans = [];

     const typeRoomsLeft = [];
     hotel.roomTypes.forEach(rt => {
         // Availability over the stay: the lowest available count across the nights; a night with
         // no inventory row sells the physical count; a stop-sell night closes the room type
         const invByNight = new Map((rt.inventories || []).map(inv => [inv.date.toISOString(), inv]));
         let minAvail = rt.totalInventory || 0;
         for (const night of stayNights) {
            const inv = invByNight.get(night.toISOString());
            const dayAvail = inv ? (inv.stopSell ? 0 : inv.availableRooms) : (rt.totalInventory || 0);
            if (dayAvail < minAvail) minAvail = dayAvail;
         }
         availableRooms += Math.max(0, minAvail);
         totalRooms += (rt.totalInventory || 0);
         if (minAvail > 0 && rt.ratePlans.length) typeRoomsLeft.push({ maxGuests: rt.maxOccupancy || 2, left: minAvail });

         // Price shown = average nightly price for these dates (daily rates included), cheapest
         // plan of a room type that can actually be booked
         if (minAvail > 0) {
           rt.ratePlans.forEach(rp => {
             const nightly = planNightlyPrice(rp, rt, stayNights, ratesByPlan[rp.id] || {});
             if (nightly > 0) bookablePlans.push({ roomTypeId: rt.id, ratePlanId: rp.id, nightlyPrice: nightly });
             if (nightly < hotelMinPrice) hotelMinPrice = nightly;
           });
         }
     });

     // Free cancellation comes from the property's cancellation policy (no saved policy = free
     // until 24h before check-in)
     hasFreeCancellation = (hotel.cancellationPolicy?.policyCode || 'FREE_CANCEL_24H') !== 'NON_REFUNDABLE';

     // Fully sold out: still show a price so the hotel can be listed as sold out
     if (hotelMinPrice === Infinity) {
       hotel.roomTypes.forEach(rt => rt.ratePlans.forEach(rp => {
         const nightly = planNightlyPrice(rp, rt, stayNights, ratesByPlan[rp.id] || {});
         if (nightly < hotelMinPrice) hotelMinPrice = nightly;
       }));
     }

     return {
        id: hotel.id,
        slug: hotelSlug(hotel),
        name: hotel.name,
        price: hotelMinPrice === Infinity ? 0 : hotelMinPrice,
        startingPrice: hotelMinPrice === Infinity ? 0 : hotelMinPrice,
        // Guest review score from published reviews (Hotel.rating is the star category)
        rating: hotel.reviewScore || 0,
        reviewCount: hotel.reviewCount || 0,
        starRating: Number.isInteger(hotel.rating) ? hotel.rating : null,
        // Member price: % off for signed-in members (hotel's choice); the page works out the price
        memberDiscountPercent: hotel.memberDiscountPercent || 0,
        commission: agreementMap[hotel.id]?.commissionRate || 15,
        totalRooms: totalRooms || 1,
        availableRooms: availableRooms || 0,
        freeCancellation: hasFreeCancellation,
        amenities: hotel.amenities || [],
        // For the card, the map and the locality / type filters on the results page
        city: hotel.city,
        area: hotel.integrationSettings?.addressDetails?.area || '',
        location: [hotel.integrationSettings?.addressDetails?.area || hotel.landmark, hotel.city].filter(Boolean).join(', ') || hotel.location,
        image: hotel.media?.[0]?.url || null,
        latitude: hotel.latitude ?? null,
        longitude: hotel.longitude ?? null,
        type: hotel.type || null,
        ...(distances ? { distanceKm: Math.round(distances.get(hotel.id) * 10) / 10 } : {}),
        fitsGroup: canHostGroup(typeRoomsLeft, groupRooms),
        bookablePlans
     };
  });

  // Best automatic offer per hotel (promotions without a code), on the plan it makes cheapest
  const searchEnd = new Date(stayNights[stayNights.length - 1]);
  searchEnd.setDate(searchEnd.getDate() + 1);
  const offersByHotel = await displayOffersMany({
    hotels: mappedHotels.map((h) => ({ hotelId: h.id, plans: h.bookablePlans })),
    checkIn: stayNights[0], checkOut: searchEnd,
  });
  for (const h of mappedHotels) {
    const plans = h.bookablePlans;
    delete h.bookablePlans;
    const offers = offersByHotel[h.id];
    if (!plans.length || !offers) continue;
    let best = null;
    for (const p of plans) {
      const o = offers[p.ratePlanId];
      const after = o ? o.nightlyPriceAfter : p.nightlyPrice;
      if (o && (!best || after < best.nightlyPriceAfter)) best = { ...o, nightlyPriceBefore: p.nightlyPrice };
    }
    if (best && best.nightlyPriceAfter < h.price) h.offer = best;
  }

  // Apply filters. A hotel with rooms left but not enough (or none big enough) for the group is left
  // out; a fully sold-out one is still listed as sold out.
  let filteredHotels = mappedHotels.filter(h => h.price > 0 && (h.fitsGroup || h.availableRooms === 0));
  filteredHotels.forEach(h => { delete h.fitsGroup; });

  if (minPrice) {
    filteredHotels = filteredHotels.filter(h => h.price >= parseFloat(minPrice));
  }
  if (maxPrice) {
    filteredHotels = filteredHotels.filter(h => h.price <= parseFloat(maxPrice));
  }
  // minRating = guest review score; minStars = the property's star category
  if (minRating) {
    filteredHotels = filteredHotels.filter(h => h.rating >= parseFloat(minRating));
  }
  if (minStars) {
    filteredHotels = filteredHotels.filter(h => (h.starRating || 0) >= parseFloat(minStars));
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
  // Near me: nearest first (sold out still last) unless another order was chosen
  if (distances && sortBy === 'RECOMMENDED') {
    rankedHotels.sort((a, b) => (a.badges?.isSoldOut ? 1 : 0) - (b.badges?.isSoldOut ? 1 : 0) || a.distanceKm - b.distanceKm);
  }

  // The commission rate is used for ranking but is confidential: don't send it to the browser
  const responseData = { hotels: rankedHotels.map(({ commission: _commission, ...h }) => h) };
  
  setShared(`search:${cacheKey}`, responseData, 60000); // 60 s, shared by all server processes
  logIt(responseData);

  res.status(200).json({
    success: true,
    data: responseData
  });
});

export const signAgreement = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const hotel = await prisma.hotel.findUnique({ where: { id } });

  if (!hotel) return res.status(404).json({ success: false, message: 'Hotel not found' });
  
  if (req.user.role === 'OWNER' && !managesHotel(req.user, hotel)) {
    return res.status(403).json({ success: false, message: 'Not authorized to sign for this property' });
  }

  if (hotel.status !== 'PENDING_AGREEMENT') {
    return res.status(400).json({ success: false, message: 'Property is not pending an agreement' });
  }

  // Agreement, status and audit trail are saved together. (The audit write used fields that don't
  // exist on AdminActionLog, so every signature returned a 500 after the first two writes had
  // already been saved: the owner saw an error although the agreement was signed.)
  const updated = await prisma.$transaction(async (tx) => {
    const agreement = await tx.agreement.update({
      where: { hotelId: id },
      data: {
        status: 'SIGNED',
        signedAt: new Date(),
        ipAddress: req.ip || req.connection.remoteAddress
      }
    });

    const hotelNow = await tx.hotel.update({
      where: { id },
      data: { status: 'READY_FOR_GO_LIVE' }
    });

    await tx.auditLog.create({
      data: {
        action: 'STATUS_AGREEMENT_SIGNED',
        entityType: 'HOTEL',
        entityId: id,
        userId: req.user.id,
        requestId: req.id,
        details: { commissionRate: agreement.commissionRate, signedBy: req.user.role, ipAddress: agreement.ipAddress }
      }
    });

    return hotelNow;
  });

  res.json({ success: true, data: updated });
});
