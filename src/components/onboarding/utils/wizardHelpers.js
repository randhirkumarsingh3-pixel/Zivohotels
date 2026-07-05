export const getDefaultFormData = () => {
  return JSON.parse(JSON.stringify({
    // Basic Info
    name: '',
    type: 'Hotel',
    description: '',
    rating: '3',
    guestEmail: '',
    guestMobile: '',
    guestLandline: '',
    isEmailVerified: false,
    isMobileVerified: false,
    hasChannelManager: false,
    channelManagerName: 'Axisrooms',
    receptionPhone: '',
    receptionEmail: '',
    managerName: '',
    managerPhone: '',
    managerEmail: '',
    ownerName: '',
    ownerEmail: '',
    ownerPhone: '',
    
    // Location
    country: 'India',
    state: '',
    city: '',
    area: '',
    houseNo: '',
    pincode: '',
    address: '',
    agreeAddress: false,
    latitude: '',
    longitude: '',
    
    // Amenities
    amenities: [],
    
    // Rooms
    rooms: [],

    // Photos
    images: [],
    
    // Policies
    policies: [],
    checkInTime: '14:00',
    checkOutTime: '11:00',
    cancellationPolicy: 'FREE_CANCEL_24H',
    policyRules: {},
    mealPrices: {},
    
    // Finance & Legal
    legalName: '',
    pan: '',
    gstin: '',
    accountName: '',
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    branchName: '',
    commission: '',
  }));
};
