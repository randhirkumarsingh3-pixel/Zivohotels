import prisma from '../config/db.js';
import reviewRepository from '../repositories/reviewRepository.js';
import reviewDomain from '../domains/reviewDomain.js';

export const reviewService = {
  
  createReview: async (payload, context) => {
    const { bookingId, rating, comment } = payload;
    const { userId } = context;

    // 1. Fetch Booking and Hotel safely
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { hotel: true }
    });

    if (!booking) {
      throw new Error('Booking not found');
    }

    // 2. Strict Ownership Validation
    if (booking.userId !== userId) {
      throw new Error('You can only review your own bookings');
    }

    // 3. Strict Status Validation
    if (booking.status !== 'COMPLETED') {
      throw new Error('You can only review a completed stay');
    }

    // 4. Duplicate Check (Idempotency)
    const existing = await reviewRepository.findByBookingId(bookingId);
    if (existing) {
      throw new Error('A review has already been submitted for this booking');
    }

    // 5. Calculate New Aggregate (Pure Domain)
    const currentStats = {
      averageRating: booking.hotel.rating || 0,
      totalReviews: booking.hotel.reviews || 0
    };

    const { newAverageRating, newTotalReviews } = reviewDomain.calculateNewAggregate(currentStats, rating);

    // 6. Execute Atomic Transaction
    const result = await prisma.$transaction(async (tx) => {
      
      const reviewData = {
        rating,
        comment,
        isVerified: true,
        status: 'PENDING',
        editableUntil: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
        bookingId,
        userId,
        hotelId: booking.hotelId
      };

      const { review } = await reviewRepository.createWithAggregateUpdate(tx, {
        reviewData,
        hotelId: booking.hotelId,
        newAverageRating,
        newTotalReviews
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          action: 'REVIEW_CREATED',
          entityType: 'REVIEW',
          entityId: review.id,
          userId,
          details: { bookingId, rating, newAverageRating }
        }
      });

      return review;
    });

    return result;
  },

  editReview: async (reviewId, payload, context) => {
    const { rating, comment } = payload;
    const { userId } = context;

    const review = await prisma.review.findUnique({
      where: { id: reviewId }
    });

    if (!review) {
      throw new Error('Review not found');
    }

    if (review.userId !== userId) {
      throw new Error('You can only edit your own reviews');
    }

    if (!review.editableUntil || new Date() > review.editableUntil) {
      throw new Error('Edit window expired');
    }

    // Pure domain calculation for adjusting aggregate would go here if rating changes.
    // For simplicity and since user didn't ask to rewrite aggregate math for edits,
    // we assume we just update the text, or if rating changes, we calculate delta.
    // Wait, editing rating requires adjusting the aggregate:
    // newSum = oldAvg * count - oldRating + newRating
    // newAvg = newSum / count
    let newAverageRating;
    
    const result = await prisma.$transaction(async (tx) => {
      const hotel = await tx.hotel.findUnique({ where: { id: review.hotelId } });
      
      let dataToUpdate = { comment, status: 'PENDING' }; // Reset to pending if edited

      if (rating && rating !== review.rating) {
        dataToUpdate.rating = rating;
        const currentTotal = hotel.reviews;
        const currentAvg = hotel.rating;
        const oldSum = currentAvg * currentTotal;
        const newSum = oldSum - review.rating + rating;
        newAverageRating = Math.max(1, Math.min(5, newSum / currentTotal));
        
        await tx.hotel.update({
          where: { id: review.hotelId },
          data: { rating: newAverageRating }
        });
      }

      const updatedReview = await tx.review.update({
        where: { id: reviewId },
        data: dataToUpdate
      });

      await tx.auditLog.create({
        data: {
          action: 'REVIEW_EDITED',
          entityType: 'REVIEW',
          entityId: review.id,
          userId,
          details: { oldRating: review.rating, newRating: rating }
        }
      });

      return updatedReview;
    });

    return result;
  }
};

export default reviewService;
