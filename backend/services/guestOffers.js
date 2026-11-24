/**
 * What signing in and creating an account are worth, for the "sign in to save" pop-up on hotel
 * pages. Both come from settings admins already manage, so the pop-up always matches checkout:
 *
 *  - sign-in price: the free Member plan's ZivoPlus discount (Admin -> Membership) plus the
 *    hotel's own member price (Extranet -> Membership), for every signed-in guest
 *  - first booking: the best active automatic offer marked "first booking only" (Admin ->
 *    Promotions; "Welcome offer: first booking" by default), applied at checkout on a new
 *    account's first booking, on top of the sign-in price
 */
import prisma from '../config/db.js';
import { coversHotel, promotionLabel } from '../domains/promotionDomain.js';
import { getShared, setShared } from '../utils/sharedCache.js';

const num = (v) => Number(v) || 0;

const loadSettings = async () => {
  const cached = await getShared('guest-offers');
  if (cached) return cached;
  const now = new Date();
  const [plan, promos] = await Promise.all([
    prisma.membershipPlan.findFirst({ where: { isFree: true, isActive: true }, orderBy: { sortOrder: 'asc' }, select: { name: true, benefits: true } }),
    prisma.promotion.findMany({
      where: {
        isActive: true, firstBookingOnly: true, code: null, audience: { in: ['ALL', 'MEMBERS'] },
        AND: [{ OR: [{ bookStart: null }, { bookStart: { lte: now } }] }, { OR: [{ bookEnd: null }, { bookEnd: { gte: now } }] }],
      },
    }),
  ]);
  const data = {
    signIn: plan ? { zivoPercent: num(plan.benefits?.zivoDiscountPercent), zivoMax: num(plan.benefits?.zivoDiscountMax), hotelRates: plan.benefits?.hotelMemberRates !== false } : null,
    firstBooking: promos.map((p) => ({ id: p.id, hotelId: p.hotelId, hotelIds: p.hotelIds, name: p.name, discountType: p.discountType, value: num(p.value), maxDiscount: p.maxDiscount != null ? num(p.maxDiscount) : null, label: promotionLabel(p) })),
  };
  setShared('guest-offers', data, 60 * 1000);
  return data;
};

/** The offers for one hotel's page (or in general without hotelId). */
export const guestOffers = async (hotelId = null) => {
  const s = await loadSettings();
  const hotel = hotelId ? await prisma.hotel.findUnique({ where: { id: String(hotelId) }, select: { memberDiscountPercent: true } }) : null;
  const hotelPercent = s.signIn?.hotelRates ? Math.max(0, Math.min(50, num(hotel?.memberDiscountPercent))) : 0;
  const zivoPercent = s.signIn?.zivoPercent || 0;
  // Hotel discount first, then ZivoPlus's on what is left (as at checkout)
  const signInPercent = Math.round((1 - (1 - hotelPercent / 100) * (1 - zivoPercent / 100)) * 1000) / 10;
  const firstChoices = s.firstBooking.filter((p) => !hotelId || ((p.hotelId === null || p.hotelId === hotelId) && coversHotel(p, hotelId)));
  const first = firstChoices.sort((a, b) => (b.discountType === a.discountType ? b.value - a.value : 0))[0] || null;
  return {
    signIn: signInPercent > 0 ? { percent: signInPercent, hotelPercent, zivoPercent, zivoMax: s.signIn?.zivoMax || 0 } : null,
    firstBooking: first ? { name: first.name, label: first.label, discountType: first.discountType, value: first.value, maxDiscount: first.maxDiscount } : null,
  };
};

export default { guestOffers };
