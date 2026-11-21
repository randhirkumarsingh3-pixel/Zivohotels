// Must stay the first import: loads .env and validates required settings before anything else runs.
import './config/env.js';
import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import hotelRoutes from './routes/hotelRoutes.js';
import { getHomeFeed } from './controllers/homeController.js';
import roomRoutes from './routes/roomRoutes.js';
import authRoutes from './routes/authRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import deliveryRoutes from './routes/deliveryRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import ariRoutes from './routes/ariRoutes.js';
import { adminChannelRoutes, channelManagerApi } from './routes/channelConnectivityRoutes.js';
import inventoryRoutes from './routes/inventoryRoutes.js';
import ratePlanRoutes from './routes/ratePlanRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import agreementRoutes from './routes/agreementRoutes.js';
import userRoutes from './routes/userRoutes.js';
import { robotsTxt, sitemapXml } from './controllers/seoController.js';
import systemRoutes from './routes/systemRoutes.js';
import imageRoutes from './routes/imageRoutes.js';
import invoiceRoutes from './routes/invoiceRoutes.js';
import userInvoiceRoutes from './routes/userInvoiceRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import adminReviewRoutes from './routes/adminReviewRoutes.js';
import propertyReviewRoutes from './routes/propertyReviewRoutes.js';
import couponRoutes from './routes/couponRoutes.js';
import publicAnalyticsRoutes from './routes/publicAnalyticsRoutes.js';
import recommendationRoutes from './routes/recommendationRoutes.js';
import experimentRoutes from './routes/experimentRoutes.js';
import pricingRoutes from './routes/pricingRoutes.js';
import promotionRoutes from './routes/promotionRoutes.js';
import financeRoutes from './routes/financeRoutes.js';
// Worker initialization has been moved to dedicated standalone processes.
import masterAdminRoutes from './routes/masterAdminRoutes.js';
import extranetRoutes from './routes/extranetRoutes.js';
import kycRoutes from './routes/kycRoutes.js';
import socketService from './services/socketService.js';
import orchestrationService from './services/orchestrationService.js';
import { startEmailWorker } from './workers/emailWorker.js';
import { startBookingExpiryJob } from './services/bookingExpiryService.js';
import { startDynamicPricingJob } from './services/dynamicPricingService.js';
import { startLoyaltyJob } from './services/loyaltyService.js';
import loyaltyRoutes from './routes/loyaltyRoutes.js';
import walletRoutes from './routes/walletRoutes.js';
import membershipRoutes from './routes/membershipRoutes.js';
import adminMembershipRoutes from './routes/adminMembershipRoutes.js';
import { startMembershipJob } from './services/membershipService.js';
import { startNearbyJob } from './services/nearbyPlacesService.js';
import adminWalletRoutes from './routes/adminWalletRoutes.js';
import { startWalletJob } from './services/finance/walletService.js';
import adminLoyaltyRoutes from './routes/adminLoyaltyRoutes.js';
import { responseFormatter } from './middleware/responseFormatter.js';
import { errorHandler } from './middleware/errorHandler.js';
import { protect, authorizeRoles } from './middleware/authMiddleware.js';
import { requestLogger } from './middleware/logger.js';
import { maintenanceMiddleware } from './middleware/maintenanceMiddleware.js';
import prisma from './config/db.js';
import { isAllowedOrigin } from './config/origins.js';

import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

dotenv.config();

const app = express();

// 0. Security Headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// 1. Rate Limiter Definitions
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: { success: false, message: 'Too many requests, please try again later.' }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // 20 sign-in / sign-up / code requests per 15 minutes per address (sign-up and code sign-in take
  // 2-3 requests each). Codes have their own limit too: 5 per email or phone per 15 minutes.
  max: Number(process.env.AUTH_RATE_LIMIT_PER_15_MIN) || 20,
  // Only credential endpoints, not reads (GET /auth/me) or signing out
  skip: (req) => (req.method !== 'POST' && req.path !== '/password') || ['/logout', '/logout-all', '/session'].includes(req.path),
  message: { success: false, message: 'Too many login attempts. Please try again in 15 minutes.' }
});

const bookingLimiter = rateLimit({
  windowMs: 60 * 1000,
  // 5 booking requests per minute per address (BOOKING_RATE_LIMIT_PER_MINUTE: higher only for automated tests)
  max: Number(process.env.BOOKING_RATE_LIMIT_PER_MINUTE) || 5,
  // Only throttle writes (create/preview/pay/cancel). Never throttle the Razorpay webhook:
  // a 429 there means a paid booking is never confirmed.
  // Price previews have their own, looser limit: checkout re-prices each time the guest switches
  // payment option, and counting those here locked guests out ("busy") before they could book.
  // Requests to the hotel (/:id/requests) have their own limit below.
  skip: (req) => req.method === 'GET' || req.path.startsWith('/webhook') || req.path === '/preview' || /^\/[^/]+\/requests(\/|$)/.test(req.path),
  message: { success: false, message: 'Booking system is busy. Please wait a minute.' }
});

// Requests to the hotel (late arrival, pickup…): sending or withdrawing, per IP
const stayRequestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  skip: (req) => req.method === 'GET',
  message: { success: false, message: 'Too many requests to the hotel at once. Please wait a minute.' }
});

const previewLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60, // price previews per minute per IP
  message: { success: false, message: 'Too many price checks. Please wait a moment.' }
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // 100 admin requests per 15 mins
  message: { success: false, message: 'Admin rate limit exceeded.' }
});

// 2. Proxy Hardening
// Number of reverse proxies in front of the API, so req.ip is the real visitor (rate limits, logs).
// 1 = one proxy (default: Cloud Run, or Nginx on a VPS). Caddy -> web container -> API = 2.
const trustProxyHops = Number.parseInt(process.env.TRUST_PROXY ?? '1', 10);
app.set('trust proxy', Number.isNaN(trustProxyHops) ? 1 : trustProxyHops);

// 3. Security & Logging
// Allowed origins: built-in domains plus CORS_ORIGINS (see config/origins.js)

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    if (isAllowedOrigin(origin)) return callback(null, true);
    return callback(new Error(`CORS: Origin ${origin} not allowed`));
  },
  credentials: true
}));
app.use(requestLogger);
app.use(maintenanceMiddleware);

// 4. APPLY GLOBAL RATE LIMITING
app.use('/api', globalLimiter);

// Body Parsing
// Small default limit to protect memory; only uploads that carry a base64 file inside JSON
// (hotel images, KYC documents) get a large one. 15mb of base64 ≈ an 11MB file.
const keepRawBody = (req, res, buf) => {
  if (req.originalUrl.includes('/webhook')) req.rawBody = buf;
};
const jsonDefault = express.json({ limit: '1mb', verify: keepRawBody });
const jsonImageUpload = express.json({ limit: '15mb', verify: keepRawBody });
app.use((req, res, next) => {
  const isFileUpload = (req.method === 'POST' || req.method === 'PUT') && (
    /^\/api\/v1\/admin\/images\/?$/.test(req.path) ||
    /^\/api\/v1\/reviews(\/[^/]+)?\/?$/.test(req.path) ||
    /^\/api\/v1\/kyc\/[^/]+\/upload\/?$/.test(req.path)
  );
  return (isFileUpload ? jsonImageUpload : jsonDefault)(req, res, next);
});
app.use(express.urlencoded({ limit: '1mb', extended: true }));

// Ensure public/uploads directory exists
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Serve uploaded images statically
app.use('/uploads', express.static(uploadDir));

// ─── HEALTH & LIVENESS PROBES ────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Process is running' });
});

app.get('/ready', async (req, res) => {
  try {
    // Check DB connectivity
    await prisma.$queryRaw`SELECT 1`;
    // If we had external queues/redis we would ping them here too
    res.status(200).json({ status: 'READY', message: 'All dependencies reachable' });
  } catch (error) {
    console.error('Readiness probe failed:', error);
    res.status(503).json({ status: 'UNAVAILABLE', message: 'Dependencies unreachable' });
  }
});

// Static File Serving for Invoices removed for security, use /api/v1/invoices/:id/download

// Apply standard API response formatter
app.use(responseFormatter);

// ─── PUBLIC APIS ─────────────────────────────────────────────────────────────
import searchRoutes from './routes/searchRoutes.js';

const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 50, // 50 search requests per minute per IP
  message: { success: false, message: 'Too many search requests. Please wait a minute.' }
});

app.use('/api/v1/auth', loginLimiter, authRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/hotels', hotelRoutes);
app.use('/api/v1/rooms', roomRoutes);
app.use('/api/v1/kyc', kycRoutes);
app.use('/api/v1/public/search', searchLimiter, searchRoutes);
app.get('/api/v1/public/home', getHomeFeed); // home page: cities, top-rated hotels, offers, reviews
app.use('/api/v1/bookings/preview', previewLimiter);
app.use(/^\/api\/v1\/bookings\/[^/]+\/requests/, stayRequestLimiter);
app.use('/api/v1/bookings', bookingLimiter, bookingRoutes);
app.use('/api/v1/reviews', reviewRoutes);
app.use('/api/v1/loyalty', loyaltyRoutes);
app.use('/api/v1/wallet', walletRoutes);
app.use('/api/v1/membership', membershipRoutes);
app.use('/api/v1/coupons', couponRoutes);
app.use('/api/v1/invoices', protect, userInvoiceRoutes);
app.use('/api/v1/payments', bookingLimiter, paymentRoutes);
app.use('/api/v1/analytics', publicAnalyticsRoutes);
app.use('/api/v1/recommendations', recommendationRoutes);
app.use('/api/v1/experiments', experimentRoutes);
// Search engines (served at the site root by the website's Nginx)
app.get('/robots.txt', robotsTxt);
app.get('/sitemap.xml', sitemapXml);
app.get('/api/v1/system/config', (req, res, next) => {
  import('./controllers/systemController.js').then(m => m.getPublicConfig(req, res, next));
});

// ─── MASTER ADMIN APIS (Intelligence & Global Control) ────────────────────────
app.use('/api/v1/master', masterAdminRoutes);

// ─── PARTNER EXTRANET APIS (Isolated Property Control) ───────────────────────
app.use('/api/v1/extranet', extranetRoutes);
// Channel managers push rates & availability and pull bookings (API key per property)
app.use('/api/v1/channel-manager', channelManagerApi);

// ─── ADMIN / OWNER APIS (Legacy Transition) ──────────────────────────────────
app.use('/api/v1/admin', protect, authorizeRoles('ADMIN', 'OWNER'), adminLimiter);

app.use('/api/v1/admin/delivery',   deliveryRoutes);
app.use('/api/v1/admin/hotels',     hotelRoutes);
app.use('/api/v1/admin/rooms',      roomRoutes);
app.use('/api/v1/admin/inventory',  inventoryRoutes);
app.use('/api/v1/admin/ari',        ariRoutes);
app.use('/api/v1/admin/channel-manager', adminChannelRoutes);
app.use('/api/v1/admin/bookings',   bookingRoutes);
app.use('/api/v1/admin/rate-plans', ratePlanRoutes);
app.use('/api/v1/admin/invoices',   invoiceRoutes);
app.use('/api/v1/admin/payments',   paymentRoutes);
app.use('/api/v1/admin/analytics',  analyticsRoutes);
app.use('/api/v1/admin/users',      userRoutes);
app.use('/api/v1/admin/agreements', agreementRoutes);
app.use('/api/v1/admin/properties', propertyReviewRoutes);
app.use('/api/v1/admin/system',     systemRoutes);
app.use('/api/v1/admin/images',     imageRoutes);
app.use('/api/v1/admin/pricing',    pricingRoutes);
app.use('/api/v1/admin/promotions', promotionRoutes);
app.use('/api/v1/admin/reviews',    adminReviewRoutes);
app.use('/api/v1/admin/loyalty',    adminLoyaltyRoutes);
app.use('/api/v1/admin/wallets',    adminWalletRoutes);
app.use('/api/v1/admin/membership', adminMembershipRoutes);
app.use('/api/v1/pricing', pricingRoutes);
app.use('/api/v1/finance', financeRoutes);

// Error Handling
app.use(errorHandler);

const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
// HOST=127.0.0.1 behind a reverse proxy (e.g. Nginx on a VPS) keeps the port off the internet.
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`🚀 ZivoHotels Backend running on ${HOST}:${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  
  // Initialize Real-time Infrastructure
  socketService.init(server);
  
  // Initialize Autonomous Governance
  orchestrationService.init();
  
  // Start email worker in-process (required on Render free tier which only runs one process)
  // This polls the BackgroundJob queue and sends emails via Resend
  startEmailWorker().catch(err => {
    console.error('❌ Email worker failed to start:', err.message);
  });

  // Release unpaid bookings whose payment window has passed (every 5 minutes)
  startBookingExpiryJob();
  startDynamicPricingJob();
  startLoyaltyJob();
  startWalletJob();
  startMembershipJob();
  startNearbyJob(); // fills what's nearby once for properties with a map pin (live ones included)
  console.log('✉️  Email worker started in-process');
});
