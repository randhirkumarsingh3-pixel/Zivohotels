import prisma from '../config/db.js';
import socketService from './socketService.js';

/**
 * Creates a notification for a hotel.
 */
export const createNotification = async ({ hotelId, type, title, message, metadata = {} }) => {
  try {
    const notification = await prisma.notification.create({
      data: {
        hotelId,
        type,
        title,
        message,
        metadata
      }
    });
    
    // Live to the extranet (the alerts list and bell update without a reload)
    socketService.emitTo(`hotel_${hotelId}`, 'notification', notification);

    return notification;
  } catch (error) {
    console.error('Failed to create notification:', error);
    return null;
  }
};

/**
 * Gets notifications for a hotel.
 */
export const getNotifications = async (hotelId, limit = 20) => {
  return await prisma.notification.findMany({
    where: { hotelId },
    orderBy: { createdAt: 'desc' },
    take: limit
  });
};

/**
 * Marks notifications as read.
 */
export const markAsRead = async (hotelId, notificationIds) => {
  return await prisma.notification.updateMany({
    where: { 
      hotelId,
      id: { in: notificationIds }
    },
    data: { isRead: true }
  });
};
