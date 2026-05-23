import { getHotelActivity } from '../../services/activityService.js';

export const fetchActivityTimeline = async (req, res) => {
  try {
    const hotelId = req.scopedHotelId;
    const activities = await getHotelActivity(hotelId, 50);
    res.json({ success: true, data: activities });
  } catch (error) {
    console.error('Error fetching activity timeline:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
