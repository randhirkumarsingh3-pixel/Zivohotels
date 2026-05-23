import prisma from '../config/db.js';

export const createRatePlan = async (req, res, next) => {
  try {
    const { name, mealPlan, cancellationPolicy, basePrice, roomTypeId } = req.body;
    
    // Validate required fields
    if (!name || !mealPlan || basePrice === undefined || !roomTypeId) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    if (parseFloat(basePrice) <= 0) {
      return res.status(400).json({ success: false, message: 'Base price must be greater than 0' });
    }

    // Check scope: Does the user own the hotel this roomType belongs to?
    const roomType = await prisma.roomType.findUnique({
      where: { id: roomTypeId },
      include: { hotel: true }
    });

    if (!roomType) return res.status(404).json({ success: false, message: 'RoomType not found' });
    if (req.user.role === 'OWNER' && roomType.hotel.ownerId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const { occupancyPricing, ...rest } = req.body;
    
    const parseOptionalNumber = (val) => {
      if (val === "" || val === null || val === undefined) return null;
      const num = parseFloat(val);
      if (isNaN(num)) throw new Error(`Invalid numeric value: ${val}`);
      return num;
    };

    const ratePlan = await prisma.$transaction(async (tx) => {
      // Validation: Meal Price check
      if (mealPlan !== 'NONE' && mealPlan !== 'EP') {
        if (parseOptionalNumber(rest.mealPriceAdult) === null) {
          const error = new Error('Meal price is required for the selected meal plan');
          error.statusCode = 400;
          throw error;
        }
      }

      // Validation: Occupancy capacity
      if (occupancyPricing) {
        const maxCapacity = roomType.capacity;
        for (const op of occupancyPricing) {
          if (parseInt(op.occupancy) > maxCapacity) {
            const error = new Error(`Occupancy ${op.occupancy} exceeds room capacity of ${maxCapacity}`);
            error.statusCode = 400;
            throw error;
          }
        }
      }

      const rp = await tx.ratePlan.create({
        data: {
          name,
          mealPlan,
          cancellationPolicy: cancellationPolicy || '',
          basePrice: parseFloat(basePrice),
          roomTypeId,
          isActive: true,
          isConfigured: true,
          extraAdultPrice: parseOptionalNumber(rest.extraAdultPrice),
          extraChildPrice: parseOptionalNumber(rest.extraChildPrice),
          extraBedPrice: parseOptionalNumber(rest.extraBedPrice),
          extraBedIncluded: !!rest.extraBedIncluded,
          mealPriceAdult: parseOptionalNumber(rest.mealPriceAdult),
          mealPriceChild: parseOptionalNumber(rest.mealPriceChild),
        }
      });

      if (occupancyPricing && occupancyPricing.length > 0) {
        await tx.occupancyPricing.createMany({
          data: occupancyPricing.map(op => ({
            ratePlanId: rp.id,
            occupancy: parseInt(op.occupancy),
            price: parseFloat(op.price) || parseFloat(basePrice) // Fallback to basePrice if empty
          }))
        });
      }
      return rp;
    });

    res.status(201).json({ success: true, data: ratePlan });
  } catch (error) {
    next(error);
  }
};

export const updateRatePlan = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Check scope
    const ratePlan = await prisma.ratePlan.findUnique({
      where: { id },
      include: { roomType: { include: { hotel: true } } }
    });

    if (!ratePlan) return res.status(404).json({ success: false, message: 'RatePlan not found' });
    if (req.user.role === 'OWNER' && ratePlan.roomType.hotel.ownerId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const { occupancyPricing, ...rest } = req.body;
    const parseOptionalNumber = (val) => {
      if (val === "" || val === null || val === undefined) return null;
      const num = parseFloat(val);
      if (isNaN(num)) throw new Error(`Invalid numeric value: ${val}`);
      return num;
    };

    const dataToUpdate = { ...rest };
    
    if (dataToUpdate.basePrice !== undefined) {
      const bp = parseFloat(dataToUpdate.basePrice);
      if (isNaN(bp) || bp <= 0) {
        return res.status(400).json({ success: false, message: 'Base price must be greater than 0' });
      }
      dataToUpdate.basePrice = bp;
      dataToUpdate.isConfigured = true;
    }
    
    // Sanitize other numeric fields
    if (dataToUpdate.extraAdultPrice !== undefined) dataToUpdate.extraAdultPrice = parseOptionalNumber(dataToUpdate.extraAdultPrice);
    if (dataToUpdate.extraChildPrice !== undefined) dataToUpdate.extraChildPrice = parseOptionalNumber(dataToUpdate.extraChildPrice);
    if (dataToUpdate.extraBedPrice !== undefined) dataToUpdate.extraBedPrice = parseOptionalNumber(dataToUpdate.extraBedPrice);
    if (dataToUpdate.mealPriceAdult !== undefined) dataToUpdate.mealPriceAdult = parseOptionalNumber(dataToUpdate.mealPriceAdult);
    if (dataToUpdate.mealPriceChild !== undefined) dataToUpdate.mealPriceChild = parseOptionalNumber(dataToUpdate.mealPriceChild);

    const updatedRatePlan = await prisma.$transaction(async (tx) => {
      // Validation: Meal Price check if mealPlan is being changed
      const finalMealPlan = dataToUpdate.mealPlan || ratePlan.mealPlan;
      const finalMealPrice = dataToUpdate.mealPriceAdult !== undefined ? dataToUpdate.mealPriceAdult : ratePlan.mealPriceAdult;

      if (finalMealPlan !== 'NONE' && finalMealPlan !== 'EP') {
        if (finalMealPrice === null) {
          const error = new Error('Meal price is required for the selected meal plan');
          error.statusCode = 400;
          throw error;
        }
      }
      const updated = await tx.ratePlan.update({
        where: { id },
        data: dataToUpdate,
        include: { roomType: true }
      });

      if (occupancyPricing) {
        // 1. Validation: occupancy cannot exceed room capacity
        const maxCapacity = updated.roomType.capacity;
        for (const op of occupancyPricing) {
          if (parseInt(op.occupancy) > maxCapacity) {
            const error = new Error(`Occupancy ${op.occupancy} exceeds room capacity of ${maxCapacity}`);
            error.statusCode = 400;
            throw error;
          }
        }

        // 2. Smart Sync (Upsert Logic)
        const existing = await tx.occupancyPricing.findMany({ where: { ratePlanId: id } });
        const incomingOccupancies = new Set(occupancyPricing.map(op => parseInt(op.occupancy)));

        // DELETE: existing - incoming
        const toDelete = existing.filter(e => !incomingOccupancies.has(e.occupancy));
        if (toDelete.length > 0) {
          await tx.occupancyPricing.deleteMany({
            where: { id: { in: toDelete.map(d => d.id) } }
          });
        }

        // UPSERT: incoming
        for (const op of occupancyPricing) {
          await tx.occupancyPricing.upsert({
            where: { 
              ratePlanId_occupancy: { 
                ratePlanId: id, 
                occupancy: parseInt(op.occupancy) 
              } 
            },
            update: { price: parseFloat(op.price) || updated.basePrice },
            create: { 
              ratePlanId: id, 
              occupancy: parseInt(op.occupancy), 
              price: parseFloat(op.price) || updated.basePrice 
            }
          });
        }
      }
      return updated;
    });

    res.status(200).json({ success: true, data: updatedRatePlan });
  } catch (error) {
    next(error);
  }
};

export const deleteRatePlan = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check scope
    const ratePlan = await prisma.ratePlan.findUnique({
      where: { id },
      include: { roomType: { include: { hotel: true } } }
    });

    if (!ratePlan) return res.status(404).json({ success: false, message: 'RatePlan not found' });
    if (req.user.role === 'OWNER' && ratePlan.roomType.hotel.ownerId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    // Soft delete
    await prisma.ratePlan.update({
      where: { id },
      data: { isActive: false }
    });

    res.status(200).json({ success: true, message: 'Rate plan soft deleted successfully' });
  } catch (error) {
    next(error);
  }
};
