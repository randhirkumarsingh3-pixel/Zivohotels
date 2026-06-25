import prisma from '../../config/db.js';

/**
 * Initializes a new property onboarding session (DRAFT state)
 */
export const initOnboarding = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Check if user already has a property in DRAFT or IN_REVIEW state
    const existingDraft = await prisma.hotel.findFirst({
      where: {
        ownerId: userId,
        status: { in: ['DRAFT', 'IN_REVIEW'] },
        isDeleted: false
      }
    });

    if (existingDraft) {
      return res.json({ 
        success: true, 
        message: 'Resuming existing onboarding session', 
        hotelId: existingDraft.id, // Direct access
        data: {
          hotelId: existingDraft.id, // Wrapped access
          step: existingDraft.onboardingStep 
        }
      });
    }

    // Create new DRAFT hotel
    const hotel = await prisma.hotel.create({
      data: {
        name: 'New Property',
        description: 'Onboarding in progress...',
        location: '',
        city: '',
        ownerId: userId,
        status: 'DRAFT',
        onboardingStep: 1,
        mode: 'INTERNAL'
      }
    });

    res.status(201).json({
      success: true,
      hotelId: hotel.id, // Direct access
      data: {
        hotelId: hotel.id, // Wrapped access
        step: 1
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Gets the current progress and data for an onboarding session
 */
export const getOnboardingProgress = async (req, res, next) => {
  try {
    const { hotelId } = req.params;
    const userId = req.user.id;

    const hotel = await prisma.hotel.findUnique({
      where: { id: hotelId },
      include: {
        kycRecords: true,
        media: true,
        roomTypes: { include: { ratePlans: true } },
        tasks: true,
        agreements: true
      }
    });

    if (!hotel || hotel.ownerId !== userId) {
      return res.status(404).json({ success: false, message: 'Onboarding session not found' });
    }

    res.json({ success: true, data: hotel });
  } catch (error) {
    next(error);
  }
};

/**
 * Saves data for a specific onboarding step
 */
export const saveOnboardingStep = async (req, res, next) => {
  try {
    const { hotelId, step } = req.params;
    const userId = req.user.id;
    const stepData = req.body;

    console.log(`[Onboarding] Saving Step ${step} for Hotel ${hotelId}. Data:`, JSON.stringify(stepData));

    const hotel = await prisma.hotel.findUnique({
      where: { id: hotelId }
    });

    if (!hotel || hotel.ownerId !== userId) {
      return res.status(404).json({ success: false, message: 'Onboarding session not found' });
    }

    let updateData = { onboardingStep: Math.max(hotel.onboardingStep, parseInt(step) + 1) };

    // Step-specific logic
    switch (parseInt(step)) {
      case 1: // Basic Info & Identity
        updateData = {
          ...updateData,
          name: stepData.name,
          type: stepData.type,
          legalName: stepData.legalName,
          brandName: stepData.brandName,
          gstin: stepData.gstin,
          pan: stepData.pan,
          incorporationType: stepData.incorporationType,
          description: stepData.description
        };
        break;
      
      case 3: // Location
        updateData = {
          ...updateData,
          location: stepData.location,
          city: stepData.city,
          landmark: stepData.landmark,
          latitude: stepData.latitude ? parseFloat(stepData.latitude) : null,
          longitude: stepData.longitude ? parseFloat(stepData.longitude) : null
        };
        break;

      case 4: // Amenities
        updateData = {
          ...updateData,
          amenities: stepData.amenities
        };
        break;

      case 5: // Policies
        updateData = {
          ...updateData,
          policies: stepData.policies
        };
        // Process HotelPolicy updates asynchronously to persist structured policies
        if (stepData.policies && typeof stepData.policies === 'object') {
          const policyPromises = Object.entries(stepData.policies).map(([code, val]) => {
            const valStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
            return prisma.hotelPolicy.upsert({
              where: {
                hotelId_policyCode: {
                  hotelId,
                  policyCode: code
                }
              },
              update: {
                value: valStr,
                metadata: typeof val === 'object' ? val : {}
              },
              create: {
                hotelId,
                policyCode: code,
                value: valStr,
                metadata: typeof val === 'object' ? val : {}
              }
            });
          });
          await Promise.all(policyPromises);
        }
        break;

      default:
        // Other steps handle their own complex model updates (KYC, Rooms, etc.)
        break;
    }

    const updatedHotel = await prisma.hotel.update({
      where: { id: hotelId },
      data: updateData
    });

    res.json({ success: true, step: updatedHotel.onboardingStep });
  } catch (error) {
    next(error);
  }
};

/**
 * Submits the property for final audit review
 */
export const submitForReview = async (req, res, next) => {
  try {
    const { hotelId } = req.params;
    const userId = req.user.id;

    const hotel = await prisma.hotel.findUnique({
      where: { id: hotelId },
      include: {
        kycRecords: true,
        media: true,
        roomTypes: true
      }
    });

    if (!hotel || hotel.ownerId !== userId) {
      return res.status(404).json({ success: false, message: 'Onboarding session not found' });
    }

    // Validation Check before submission
    const errors = [];
    if (!hotel.gstin) errors.push('Missing GSTIN');
    if (hotel.kycRecords.length < 2) errors.push('At least 2 KYC documents required');
    if (hotel.media.length < 5) errors.push('At least 5 property images required');
    if (hotel.roomTypes.length === 0) errors.push('At least one room type must be configured');

    if (errors.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Property not ready for review', 
        errors 
      });
    }

    const updatedHotel = await prisma.hotel.update({
      where: { id: hotelId },
      data: { 
        status: 'IN_REVIEW',
        statusReason: 'Initial submission for audit',
        statusUpdatedAt: new Date()
      }
    });

    // Notify Supply Team (Place holder)
    console.log(`[SUPPLY] New property submission for review: ${hotel.name} (${hotelId})`);

    res.json({ success: true, status: updatedHotel.status });
  } catch (error) {
    next(error);
  }
};
