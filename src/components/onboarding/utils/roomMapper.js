import { mapMealPlanToFrontend, mapMealPlanToBackend } from './mealPlanHelpers';

export const parseBackendRoomTypes = (roomTypes) => {
  if (!Array.isArray(roomTypes)) return [];
  return roomTypes.map(rt => {
    let beds = [{ type: 'Queen Bed', count: 1 }];
    if (rt.bedType) {
      const parts = rt.bedType.split(',').map(p => p.trim());
      const parsed = parts.map(part => {
        const match = part.match(/^(\d+)x\s+(.+)$/);
        if (match) {
          return { type: match[2], count: parseInt(match[1]) };
        }
        return { type: part, count: 1 };
      });
      if (parsed.length > 0) beds = parsed;
    }

    let size = '';
    let sizeUnit = 'Square Feet';
    if (rt.roomSize) {
      const match = rt.roomSize.match(/^([\d.]+)\s+(.+)$/);
      if (match) {
        size = match[1];
        sizeUnit = match[2];
      } else {
        size = rt.roomSize;
      }
    }

    const standardRatePlan = rt.ratePlans?.find(rp => rp.isActive) || rt.ratePlans?.[0] || {};

    return {
      id: rt.id,
      code: rt.code || '',
      type: rt.name.includes('Deluxe') ? 'Deluxe' : rt.name.includes('Suite') ? 'Suite' : rt.name.includes('Standard') ? 'Standard' : 'Deluxe',
      view: rt.viewType || 'Airport View',
      size: size,
      sizeUnit: sizeUnit,
      name: rt.name,
      count: rt.totalInventory || 1,
      description: rt.description || '',
      beds: beds,
      allowExtraBed: rt.extraBedAllowed ? 'Yes' : 'No',
      allowAlternateSleeping: 'No',
      baseAdults: rt.baseOccupancy || 2,
      maxAdults: rt.maxOccupancy || 2,
      baseChildren: 1,
      maxChildren: 1,
      maxOccupancy: rt.maxOccupancy || 3,
      bathrooms: 1,
      mealPlan: mapMealPlanToFrontend(standardRatePlan.mealPlan),
      basePrice: standardRatePlan.basePrice || '',
      extraAdultPrice: standardRatePlan.extraAdultPrice || '',
      childPrice: standardRatePlan.extraChildPrice || '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
      amenities: Array.isArray(rt.amenities) ? rt.amenities : [],
      ratePlanId: standardRatePlan.id
    };
  });
};

export const buildRoomPayload = (room, hotelId, isNew = false) => {
  return {
    name: room.name,
    code: room.code || room.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).substring(2, 6),
    description: room.description || '',
    maxOccupancy: parseInt(room.maxOccupancy) || 2,
    baseOccupancy: parseInt(room.baseAdults) || 2,
    totalRooms: parseInt(room.count) || 1,
    hotelId: hotelId,
    amenities: room.amenities || [],
    bedType: room.beds?.map(b => `${b.count}x ${b.type}`).join(', ') || 'King Bed',
    roomSize: room.size ? `${room.size} ${room.sizeUnit}` : 'Standard',
    viewType: room.view || 'Airport View',
    extraBedAllowed: room.allowExtraBed === 'Yes',
    maxExtraBeds: room.allowExtraBed === 'Yes' ? 1 : 0
  };
};

export const normalizeRatePlans = (room) => {
  return {
    basePrice: parseFloat(room.basePrice) || 0,
    mealPlan: mapMealPlanToBackend(room.mealPlan),
    extraAdultPrice: parseFloat(room.extraAdultPrice) || 0,
    extraChildPrice: parseFloat(room.childPrice) || 0,
    mealPriceAdult: 0,
    mealPriceChild: 0
  };
};

export const normalizeInventory = (room) => {
  return {
    startDate: room.startDate,
    endDate: room.endDate,
    count: parseInt(room.count) || 1
  };
};
