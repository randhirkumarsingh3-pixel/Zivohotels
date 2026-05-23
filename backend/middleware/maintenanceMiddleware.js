/**
 * maintenanceMiddleware.js
 * Emergency "Kill Switch" and operational safety gate.
 */

import { getSystemConfig } from '../config/systemConfig.js';

export const maintenanceMiddleware = async (req, res, next) => {
  try {
    const config = await getSystemConfig();

    // 1. Check Global Maintenance Mode
    if (config.maintenanceMode) {
      // Allow Admin/Owner paths to remain accessible for recovery
      if (req.path.startsWith('/api/v1/admin')) {
        return next();
      }
      
      return res.status(503).json({
        success: false,
        message: 'System is under maintenance. Please try again later.',
        retryAfter: 300,
        requestId: req.id
      });
    }

    // 2. Check Booking Specific Kill Switch
    const isBookingPath = req.path === '/' || req.path === '' || req.path.includes('/preview');
    if (config.isBookingDisabled && req.baseUrl.includes('/bookings') && isBookingPath && req.method === 'POST') {
      return res.status(403).json({
        success: false,
        message: 'New bookings are temporarily disabled. Please check back shortly.',
        requestId: req.id
      });
    }

    // 3. Check Payment Specific Kill Switch
    if (config.isPaymentDisabled && req.baseUrl.includes('/payments') && req.method === 'POST') {
      return res.status(403).json({
        success: false,
        message: 'Payments are temporarily unavailable. Please try again in a few minutes.',
        requestId: req.id
      });
    }

    next();
  } catch (error) {
    // If config fetch fails, we default to "open" but log the error
    console.error('Maintenance Check Failed:', error.message);
    next();
  }
};
