import prisma from '../../config/db.js';
import { getNotifications, markAsRead } from '../../services/notificationService.js';

export const fetchNotifications = async (req, res) => {
  try {
    const hotelId = req.scopedHotelId;
    const notifications = await getNotifications(hotelId);
    res.json({ success: true, data: notifications });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const markNotificationsRead = async (req, res) => {
  try {
    const hotelId = req.scopedHotelId;
    const { notificationIds } = req.body;
    await markAsRead(hotelId, notificationIds);
    res.json({ success: true, message: 'Notifications marked as read' });
  } catch (error) {
    console.error('Error marking notifications read:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
