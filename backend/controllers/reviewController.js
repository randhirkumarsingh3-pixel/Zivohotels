import { z } from 'zod';
import reviewService from '../services/reviewService.js';
import prisma from '../config/db.js';

const reviewSchema = z.object({
  bookingId: z.string().uuid(),
  rating: z.number().min(1).max(5),
  comment: z.string().max(1000).optional()
});

export const createReview = async (req, res, next) => {
  try {
    const validation = reviewSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(422).json({ 
        success: false, 
        message: 'Invalid review data', 
        errors: validation.error.format() 
      });
    }

    const context = { userId: req.user.id };
    const review = await reviewService.createReview(validation.data, context);

    res.status(201).json({
      success: true,
      message: 'Review submitted successfully',
      data: review
    });

  } catch (error) {
    if (error.message.includes('not found') || error.message.includes('only review')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    if (error.message.includes('already been submitted')) {
      return res.status(409).json({ success: false, message: error.message });
    }
    next(error);
  }
};

export const getHotelReviews = async (req, res, next) => {
  try {
    const { hotelId } = req.params;

    const hotel = await prisma.hotel.findUnique({
      where: { id: hotelId },
      select: { rating: true, reviews: true }
    });

    if (!hotel) return res.status(404).json({ success: false, message: 'Hotel not found' });

    const reviewList = await prisma.review.findMany({
      where: { hotelId, isVerified: true, status: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true } }
      }
    });

    res.status(200).json({
      success: true,
      data: {
        averageRating: hotel.rating,
        totalReviews: hotel.reviews,
        reviews: reviewList.map(r => ({
          id: r.id,
          rating: r.rating,
          comment: r.comment,
          user: r.user.name,
          createdAt: r.createdAt
        }))
      }
    });
  } catch (error) {
    next(error);
  }
};
