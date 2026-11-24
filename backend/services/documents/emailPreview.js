/** Booking emails rendered for Admin → Documents & emails previews (nothing is sent). */
import prisma from '../../config/db.js';
import { BOOKING_ROOMS_INCLUDE } from '../bookingRoomsView.js';

export const previewBookingEmail = async (bookingId, who) => {
  if (who === 'hotel') {
    const { loadForNotice, hotelBookingEmail } = await import('../bookingNotices.js');
    return (await hotelBookingEmail(await loadForNotice(bookingId))).html;
  }
  const { buildConfirmationEmail } = await import('../emailService.js');
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { hotel: true, roomType: { select: { name: true } }, ratePlan: { select: { name: true, mealPlan: true } }, ...BOOKING_ROOMS_INCLUDE } });
  return (await buildConfirmationEmail(booking)).html;
};

export default { previewBookingEmail };
