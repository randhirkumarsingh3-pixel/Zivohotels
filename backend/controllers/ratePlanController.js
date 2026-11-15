import prisma from '../config/db.js';
import { z } from 'zod';

/**
 * Rate plans of a room type (Admin -> Room Config and Extranet -> Rooms & Rate Plans).
 * Owners can only touch plans of their own properties. Only the fields below can be set; the
 * room type a plan belongs to can't be changed after it is created.
 */

const MEAL_PLANS = ['NONE', 'EP', 'CP', 'MAP', 'AP'];
const optionalMoney = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
  z.number().min(0, 'Prices can\'t be negative').nullable()
);

const ratePlanFields = {
  name: z.string().trim().min(2, 'Give the rate plan a name'),
  mealPlan: z.enum(MEAL_PLANS),
  cancellationPolicy: z.string().max(2000).optional().nullable(),
  basePrice: z.preprocess((v) => Number(v), z.number().positive('Enter a base price above ₹0')),
  extraAdultPrice: optionalMoney.optional(),
  extraChildPrice: optionalMoney.optional(),
  extraBedPrice: optionalMoney.optional(),
  extraBedIncluded: z.boolean().optional(),
  mealPriceAdult: optionalMoney.optional(),
  mealPriceChild: optionalMoney.optional(),
  isActive: z.boolean().optional(),
  occupancyPricing: z.array(z.object({
    occupancy: z.preprocess((v) => Number(v), z.number().int().min(1)),
    price: z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : Number(v)), z.number().positive().optional())
  })).optional(),
};

const createSchema = z.object({ ...ratePlanFields, roomTypeId: z.string().uuid() }).strip();
// Updates accept ₹0 so onboarding drafts can be saved before the price is known; a plan without a
// price is never shown to guests (and is flagged "No price" to the hotel).
const updateSchema = z.object({
  ...ratePlanFields,
  basePrice: z.preprocess((v) => Number(v), z.number().min(0, 'Prices can\'t be negative'))
}).partial().strip();

const fail = (res, status, message, req) => res.status(status).json({ success: false, message, requestId: req.id });
const firstIssue = (error) => error.issues[0]?.message || 'Check the rate plan details';
const needsMealPrice = (mealPlan) => mealPlan && mealPlan !== 'NONE' && mealPlan !== 'EP';

const checkOccupancy = (occupancyPricing, roomType) => {
  const max = roomType.maxOccupancy || 2;
  const over = (occupancyPricing || []).find((op) => op.occupancy > max);
  return over ? `Occupancy ${over.occupancy} is more than this room's maximum of ${max} guests` : null;
};

const loadOwned = async (req, res, ratePlanId) => {
  const ratePlan = await prisma.ratePlan.findUnique({ where: { id: ratePlanId }, include: { roomType: { include: { hotel: true } } } });
  if (!ratePlan) { fail(res, 404, 'Rate plan not found', req); return null; }
  if (req.user.role === 'OWNER' && ratePlan.roomType.hotel.ownerId !== req.user.id) { fail(res, 403, 'You can only manage your own properties', req); return null; }
  return ratePlan;
};

export const createRatePlan = async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 422, firstIssue(parsed.error), req);
    const { occupancyPricing, roomTypeId, ...data } = parsed.data;

    const roomType = await prisma.roomType.findUnique({ where: { id: roomTypeId }, include: { hotel: true } });
    if (!roomType) return fail(res, 404, 'Room type not found', req);
    if (req.user.role === 'OWNER' && roomType.hotel.ownerId !== req.user.id) return fail(res, 403, 'You can only manage your own properties', req);
    if (needsMealPrice(data.mealPlan) && data.mealPriceAdult == null) return fail(res, 400, 'Enter the meal price per adult for this meal plan', req);
    const occError = checkOccupancy(occupancyPricing, roomType);
    if (occError) return fail(res, 400, occError, req);

    const ratePlan = await prisma.$transaction(async (tx) => {
      const rp = await tx.ratePlan.create({
        data: { ...data, cancellationPolicy: data.cancellationPolicy || '', roomTypeId, isActive: data.isActive ?? true, isConfigured: true }
      });
      if (occupancyPricing?.length) {
        await tx.occupancyPricing.createMany({
          data: occupancyPricing.map((op) => ({ ratePlanId: rp.id, occupancy: op.occupancy, price: op.price ?? data.basePrice }))
        });
      }
      return rp;
    });

    res.status(201).json({ success: true, data: ratePlan, requestId: req.id });
  } catch (error) {
    next(error);
  }
};

export const updateRatePlan = async (req, res, next) => {
  try {
    const ratePlan = await loadOwned(req, res, req.params.id);
    if (!ratePlan) return;
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 422, firstIssue(parsed.error), req);
    const { occupancyPricing, ...data } = parsed.data;

    const finalMealPlan = data.mealPlan ?? ratePlan.mealPlan;
    const finalMealPrice = data.mealPriceAdult !== undefined ? data.mealPriceAdult : ratePlan.mealPriceAdult;
    if (needsMealPrice(finalMealPlan) && finalMealPrice == null) return fail(res, 400, 'Enter the meal price per adult for this meal plan', req);
    const occError = checkOccupancy(occupancyPricing, ratePlan.roomType);
    if (occError) return fail(res, 400, occError, req);

    const updated = await prisma.$transaction(async (tx) => {
      const rp = await tx.ratePlan.update({
        where: { id: ratePlan.id },
        data: { ...data, ...(data.basePrice !== undefined ? { isConfigured: data.basePrice > 0 } : {}) }
      });
      if (occupancyPricing) {
        const incoming = new Set(occupancyPricing.map((op) => op.occupancy));
        await tx.occupancyPricing.deleteMany({ where: { ratePlanId: rp.id, occupancy: { notIn: [...incoming] } } });
        for (const op of occupancyPricing) {
          const price = op.price ?? rp.basePrice;
          await tx.occupancyPricing.upsert({
            where: { ratePlanId_occupancy: { ratePlanId: rp.id, occupancy: op.occupancy } },
            update: { price },
            create: { ratePlanId: rp.id, occupancy: op.occupancy, price }
          });
        }
      }
      return rp;
    });

    res.status(200).json({ success: true, data: updated, requestId: req.id });
  } catch (error) {
    next(error);
  }
};

/** Takes a rate plan off sale (kept for past bookings). A room type keeps at least one plan on sale. */
export const deleteRatePlan = async (req, res, next) => {
  try {
    const ratePlan = await loadOwned(req, res, req.params.id);
    if (!ratePlan) return;
    const othersOnSale = await prisma.ratePlan.count({ where: { roomTypeId: ratePlan.roomTypeId, isActive: true, id: { not: ratePlan.id } } });
    if (ratePlan.isActive && othersOnSale === 0 && ratePlan.roomType.isActive) {
      return fail(res, 400, 'This is the only rate plan on sale for this room. Add another plan first, or deactivate the room type.', req);
    }
    await prisma.ratePlan.update({ where: { id: ratePlan.id }, data: { isActive: false } });
    res.status(200).json({ success: true, message: 'Rate plan removed from sale', requestId: req.id });
  } catch (error) {
    next(error);
  }
};
