import { parseBackendRoomTypes } from '../utils/roomMapper';

// Helper: returns value only if it's a non-empty string, otherwise undefined
const str = (val) => (val && String(val).trim() !== '' ? String(val).trim() : undefined);
// Helper: returns value only if it's a non-empty string (used for required fields with fallback)
const strReq = (val, fallback) => (val && String(val).trim() !== '' ? String(val).trim() : fallback);

export const buildHotelPayload = (formData, VITE_API_URL) => {
  return {
    name: strReq(formData.name, 'Untitled Property'),
    propertyType: str(formData.type),
    address: str(formData.address),
    location: str(formData.address),
    city: strReq(formData.city, 'Default City'),
    state: str(formData.state),
    country: str(formData.country),
    area: str(formData.area),
    pincode: str(formData.pincode),
    description: formData.description || '',
    latitude: formData.latitude || undefined,
    longitude: formData.longitude || undefined,
    rating: formData.rating !== undefined && formData.rating !== '' ? formData.rating : undefined,

    // Media — send the raw url from DB (relative /uploads/...) or fully qualified
    media: (formData.images || [])
      .filter(img => img.url && !img.url.startsWith('blob:'))
      .map(img => ({
        url: img.url.startsWith('http') ? img.url : `${VITE_API_URL?.replace(/\/api\/v1\/?$/, '') || ''}${img.url.startsWith('/') ? img.url : '/' + img.url}`,
        tags: img.tags || []
      })),
    amenities: formData.amenities || [],
    policies: formData.policies || [],
    checkInTime: str(formData.checkInTime),
    checkOutTime: str(formData.checkOutTime),

    // Contact — send undefined (not '') for empty optional strings
    receptionPhone: str(formData.guestMobile || formData.receptionPhone),
    receptionEmail: str(formData.guestEmail || formData.receptionEmail),
    managerName: str(formData.managerName),
    managerPhone: str(formData.managerPhone),
    managerEmail: str(formData.managerEmail),
    guestLandline: str(formData.guestLandline),
    channelProvider: formData.hasChannelManager ? (str(formData.channelManagerName) || 'Axisrooms') : 'NONE',

    ownerName: str(formData.ownerName),
    ownerEmail: str(formData.ownerEmail),
    ownerPhone: str(formData.ownerPhone),

    // Legal — these have strict regex on backend; only send if non-empty
    legalName: str(formData.legalName),
    pan: str(formData.pan),
    gstin: str(formData.gstin),
    msme: str(formData.msme),
    incorporationType: str(formData.incorporationType),
    payoutCycle: str(formData.payoutCycle),
    builtYear: formData.builtYear ? Number(formData.builtYear) : undefined,
    bookingSince: formData.bookingSince ? Number(formData.bookingSince) : undefined,

    bankDetail: formData.accountNumber ? {
      accountName: formData.accountName,
      bankName: formData.bankName,
      accountNumber: formData.accountNumber,
      ifscCode: formData.ifscCode,
      branchName: str(formData.branchName),
    } : undefined,

    commissionRate: formData.commission ? parseFloat(formData.commission) : undefined,
    lastUpdatedAt: formData.lastUpdatedAt,
  };
};


export const mapBackendToFormData = (hotel) => {
  const parsedRooms = parseBackendRoomTypes(hotel.roomTypes);

  return {
    id: hotel.id,
    name: hotel.name || '',
    type: hotel.propertyType || 'Hotel',
    description: hotel.description || '',
    rating: String(hotel.rating || '3'),
    
    country: hotel.country || 'India',
    state: hotel.state || hotel.integrationSettings?.addressDetails?.state || '',
    city: hotel.city || '',
    area: hotel.area || hotel.integrationSettings?.addressDetails?.area || '',
    address: hotel.addressLine || hotel.integrationSettings?.addressDetails?.address || hotel.location || '',
    pincode: hotel.pincode || hotel.integrationSettings?.addressDetails?.pincode || '',
    latitude: hotel.latitude || '',
    longitude: hotel.longitude || '',
    
    receptionPhone: hotel.receptionPhone || hotel.integrationSettings?.contactInfo?.receptionPhone || '',
    receptionEmail: hotel.receptionEmail || hotel.integrationSettings?.contactInfo?.receptionEmail || '',
    guestEmail: hotel.receptionEmail || hotel.integrationSettings?.contactInfo?.receptionEmail || '',
    guestMobile: hotel.receptionPhone || hotel.integrationSettings?.contactInfo?.receptionPhone || '',
    guestLandline: hotel.guestLandline || hotel.integrationSettings?.contactInfo?.guestLandline || '',
    isEmailVerified: Boolean(hotel.receptionEmail || hotel.integrationSettings?.contactInfo?.receptionEmail),
    isMobileVerified: Boolean(hotel.receptionPhone || hotel.integrationSettings?.contactInfo?.receptionPhone),
    hasChannelManager: Boolean(hotel.channelProvider && hotel.channelProvider !== 'NONE'),
    channelManagerName: hotel.channelProvider && hotel.channelProvider !== 'NONE' ? hotel.channelProvider : 'Axisrooms',
    managerName: hotel.managerName || hotel.integrationSettings?.contactInfo?.managerName || '',
    managerPhone: hotel.managerPhone || hotel.integrationSettings?.contactInfo?.managerPhone || '',
    managerEmail: hotel.managerEmail || hotel.integrationSettings?.contactInfo?.managerEmail || '',
    ownerName: hotel.owner?.name || '',
    ownerEmail: hotel.owner?.email || '',
    ownerPhone: hotel.owner?.phone || '',
    
    amenities: Array.isArray(hotel.amenities) ? hotel.amenities : [],
    rooms: parsedRooms,
    images: Array.isArray(hotel.media) ? hotel.media : [],
    policies: Array.isArray(hotel.policies) ? hotel.policies : [],
    
    checkInTime: hotel.checkInTime || '14:00',
    checkOutTime: hotel.checkOutTime || '11:00',
    cancellationPolicy: hotel.cancellationPolicy || 'FREE_CANCEL_24H',
    policyRules: hotel.policyRules || {},
    mealPrices: hotel.mealPrices || {},
    
    legalName: hotel.legalName || '',
    pan: hotel.pan || '',
    gstin: hotel.gstin || '',
    incorporationType: hotel.incorporationType || 'INDIVIDUAL',
    payoutCycle: hotel.payoutCycle || 'T+2',
    accountName: hotel.bankDetail?.accountName || '',
    bankName: hotel.bankDetail?.bankName || '',
    accountNumber: hotel.bankDetail?.accountNumber || '',
    ifscCode: hotel.bankDetail?.ifscCode || '',
    branchName: hotel.bankDetail?.branchName || '',
    
    commission: hotel.agreement?.commissionRate
      || hotel.integrationSettings?.commercials?.commissionRate
      || '',
    lastUpdatedAt: hotel.updatedAt || null,
  };
};
