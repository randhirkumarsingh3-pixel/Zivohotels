import { parseBackendRoomTypes } from '../utils/roomMapper';

export const buildHotelPayload = (formData, VITE_API_URL) => {
  return {
    name: formData.name,
    propertyType: formData.type,
    address: formData.address,
    location: formData.address,
    city: formData.city,
    state: formData.state,
    country: formData.country,
    area: formData.area,
    pincode: formData.pincode,
    description: formData.description || '',
    latitude: formData.latitude,
    longitude: formData.longitude,
    rating: formData.rating,
    
    // Media — send the raw url from DB (relative /uploads/...) or fully qualified
    media: (formData.images || [])
      .filter(img => img.url && !img.url.startsWith('blob:'))
      .map(img => ({
        url: img.url.startsWith('http') ? img.url : `${VITE_API_URL?.replace(/\/api\/v1\/?$/, '') || ''}${img.url.startsWith('/') ? img.url : '/' + img.url}`,
        tags: img.tags || []
      })),
    amenities: formData.amenities || [],
    policies: formData.policies || [],
    checkInTime: formData.checkInTime,
    checkOutTime: formData.checkOutTime,
    
    receptionPhone: formData.guestMobile || formData.receptionPhone || '',
    receptionEmail: formData.guestEmail || formData.receptionEmail || '',
    managerName: formData.managerName || '',
    managerPhone: formData.managerPhone || '',
    managerEmail: formData.managerEmail || '',
    guestLandline: formData.guestLandline || '',
    channelProvider: formData.hasChannelManager ? (formData.channelManagerName || 'Axisrooms') : 'NONE',
    
    ownerName: formData.ownerName || '',
    ownerEmail: formData.ownerEmail || '',
    ownerPhone: formData.ownerPhone || '',
    
    legalName: formData.legalName,
    pan: formData.pan,
    gstin: formData.gstin,
    msme: formData.msme,
    incorporationType: formData.incorporationType,
    payoutCycle: formData.payoutCycle,
    builtYear: formData.builtYear,
    bookingSince: formData.bookingSince,
    
    bankDetail: formData.accountNumber ? {
      accountName: formData.accountName,
      bankName: formData.bankName,
      accountNumber: formData.accountNumber,
      ifscCode: formData.ifscCode,
      branchName: formData.branchName,
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
