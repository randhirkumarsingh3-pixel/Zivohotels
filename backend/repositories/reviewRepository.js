import prisma from '../config/db.js';

export const reviewRepository = {
  
  findByBookingId: async (bookingId) => {
    return prisma.review.findUnique({ where: { bookingId } });
  },

  /**
   * Atomically creates a review and updates the hotel's aggregate rating.
   */
  createWithAggregateUpdate: async (tx, { reviewData, hotelId, newAverageRating, newTotalReviews }) => {
    // 1. Create the review
    const review = await tx.review.create({
      data: reviewData
    });

    // 2. Update the hotel stats
    const hotel = await tx.hotel.update({
      where: { id: hotelId },
      data: {
        rating: newAverageRating,
        reviews: newTotalReviews
      }
    });

    return { review, hotel };
  }
};

export default reviewRepository;
