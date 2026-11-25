/**
 * Safety switches set in Admin → System control (SystemConfig keys):
 *  maintenanceMode    the website and apps answer 503; staff can still sign in and use /admin
 *  isBookingDisabled  no new bookings or price checks for new bookings
 *  isPaymentDisabled  no new online payments (pay-at-hotel bookings still go through)
 *
 * Runs for every request (mounted on the app), so it matches on the full URL.
 */
import { getSystemConfig } from '../config/systemConfig.js';

const on = (v) => v === true || v === 'true';
// Always reachable: health checks, sign-in (staff need it to switch maintenance off), admin and
// extranet tools, the payment gateway's webhook (a paid booking must still be confirmed),
// the public config the website reads to show the notice
const ALWAYS_OPEN = [
  /^\/(health|ready|live)/,
  /^\/api\/v1\/(health|ready)/,
  /^\/api\/v1\/auth\//,
  /^\/api\/v1\/(admin|extranet|master|finance|kyc)\b/,
  /^\/api\/v1\/bookings\/webhook/,
  /^\/api\/v1\/payments\/webhook/,
  /^\/api\/v1\/webhooks\//,
  /^\/api\/v1\/system\/config/,
];
// Price checks (/preview) stay open so hotel pages keep showing prices
const NEW_BOOKING = /^\/api\/v1\/bookings(\/hourly)?\/?$/;
const NEW_PAYMENT = /^\/api\/v1\/(payments\/create-order|bookings\/[^/]+\/hourly\/extend)\/?$/;

export const maintenanceMiddleware = async (req, res, next) => {
  try {
    const config = await getSystemConfig();
    const path = req.path;

    if (on(config.maintenanceMode) && !ALWAYS_OPEN.some((r) => r.test(path))) {
      if (!path.startsWith('/api/')) return next(); // the website's own files: it shows the notice
      res.set('Retry-After', '300');
      return res.status(503).json({
        success: false,
        code: 'MAINTENANCE',
        message: config.maintenanceMessage || 'ZivoPlus is down for maintenance. Please try again in a few minutes.',
        retryAfter: 300,
        requestId: req.id,
      });
    }

    if (req.method === 'POST' && on(config.isBookingDisabled) && NEW_BOOKING.test(path)) {
      return res.status(403).json({
        success: false,
        code: 'BOOKINGS_PAUSED',
        message: 'New bookings are paused for a short while. Please check back shortly.',
        requestId: req.id,
      });
    }

    if (req.method === 'POST' && on(config.isPaymentDisabled) && NEW_PAYMENT.test(path)) {
      return res.status(403).json({
        success: false,
        code: 'PAYMENTS_PAUSED',
        message: 'Online payments are paused for a short while. You can choose Pay at hotel, or try again in a few minutes.',
        requestId: req.id,
      });
    }

    next();
  } catch (error) {
    // If the config can't be read, stay open (and say so in the logs)
    console.error('Maintenance check failed:', error.message);
    next();
  }
};
