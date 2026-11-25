/**
 * Extranet → Business rates: a hotel opts in to company bookings (with a discount) and to travel
 * agent bookings (with a trade discount: the agent's net rate, or their commission). Off unless
 * the hotel turns them on.
 */
import prisma from '../../config/db.js';

const fail = (m, code = 400) => Object.assign(new Error(m), { statusCode: code });
const pct = (v, label) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 50) throw fail(`${label} must be between 0 and 50%.`);
  return Math.round(n * 100) / 100;
};

const view = (r, hotelId) => ({
  hotelId,
  corporateEnabled: Boolean(r?.corporateEnabled), corporateDiscountPct: Number(r?.corporateDiscountPct || 0),
  agentEnabled: Boolean(r?.agentEnabled), agentDiscountPct: Number(r?.agentDiscountPct || 0),
  updatedAt: r?.updatedAt || null,
});

export const getHotelBusinessRates = async (hotelId) => view(await prisma.hotelBusinessRate.findUnique({ where: { hotelId } }), hotelId);

export const saveHotelBusinessRates = async (hotelId, user, input = {}) => {
  const data = {
    corporateEnabled: Boolean(input.corporateEnabled), corporateDiscountPct: pct(input.corporateDiscountPct ?? 0, 'The company discount'),
    agentEnabled: Boolean(input.agentEnabled), agentDiscountPct: pct(input.agentDiscountPct ?? 0, 'The travel agent discount'),
    updatedById: user?.id || null,
  };
  if (data.agentEnabled && data.agentDiscountPct < 1) throw fail('Give travel agents at least 1%: it is their net-rate discount or their commission.');
  const before = await prisma.hotelBusinessRate.findUnique({ where: { hotelId } });
  const r = await prisma.hotelBusinessRate.upsert({ where: { hotelId }, update: data, create: { hotelId, ...data } });
  await prisma.auditLog.create({ data: { action: 'HOTEL_BUSINESS_RATES_UPDATED', entityType: 'HOTEL', entityId: hotelId, userId: user?.id || 'SYSTEM', details: { before: before ? view(before, hotelId) : null, after: view(r, hotelId) } } }).catch(() => {});
  return view(r, hotelId);
};

export default { getHotelBusinessRates, saveHotelBusinessRates };
