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
import roomRoutes from './routes/roomRoutes.js';
import authRoutes from './routes/authRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import inventoryRoutes from './routes/inventoryRoutes.js';
import ratePlanRoutes from './routes/ratePlanRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import agreementRoutes from './routes/agreementRoutes.js';
import userRoutes from './routes/userRoutes.js';
import systemRoutes from './routes/systemRoutes.js';
import imageRoutes from './routes/imageRoutes.js';
import invoiceRoutes from './routes/invoiceRoutes.js';
import userInvoiceRoutes from './routes/userInvoiceRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import couponRoutes from './routes/couponRoutes.js';
import publicAnalyticsRoutes from './routes/publicAnalyticsRoutes.js';
import recommendationRoutes from './routes/recommendationRoutes.js';
import experimentRoutes from './routes/experimentRoutes.js';
import pricingRoutes from './routes/pricingRoutes.js';
import financeRoutes from './routes/financeRoutes.js';
import { startIntegrityWorker } from './workers/integrityWorker.js';
import { startExperimentWorker } from './workers/experimentWorker.js';
import { startPricingWorker } from './workers/pricingWorker.js';
import { startPricingTrainer } from './workers/pricingTrainer.js';
import { startFinanceWorker } from './workers/financeWorker.js';
import { startMarketplaceBalancer } from './workers/marketplaceBalancer.js';
import workerManager from './services/workerManager.js';
import masterAdminRoutes from './routes/masterAdminRoutes.js';
import extranetRoutes from './routes/extranetRoutes.js';
import socketService from './services/socketService.js';
import orchestrationService from './services/orchestrationService.js';
import { errorHandler } from './middleware/errorHandler.js';
import { protect, authorizeRoles } from './middleware/authMiddleware.js';
import { requestLogger } from './middleware/logger.js';
import { maintenanceMiddleware } from './middleware/maintenanceMiddleware.js';

import rateLimit from 'express-rate-limit';

dotenv.config();

const app = express();

// 1. Rate Limiter Definitions
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: { success: false, message: 'Too many requests, please try again later.' }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // 10 login attempts per 15 mins
  message: { success: false, message: 'Too many login attempts. Please try again in 15 minutes.' }
});

const bookingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5, // 5 booking requests per minute
  message: { success: false, message: 'Booking system is busy. Please wait a minute.' }
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // 100 admin requests per 15 mins
  message: { success: false, message: 'Admin rate limit exceeded.' }
});

// 2. Proxy Hardening
app.set('trust proxy', 1);

// 3. Security & Logging
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://zivohotels.com', 'https://admin.zivohotels.com'] 
    : ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true
}));
app.use(requestLogger);
app.use(maintenanceMiddleware);

// 4. APPLY GLOBAL RATE LIMITING
app.use('/api', globalLimiter);

// Body Parsing
app.use(express.json({
  limit: '50mb',
  verify: (req, res, buf) => {
    if (req.originalUrl.includes('/webhook')) req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Ensure public/uploads directory exists
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Serve uploaded images statically
app.use('/uploads', express.static(uploadDir));

// Static File Serving for Invoices removed for security, use /api/v1/invoices/:id/download

// ─── PUBLIC APIS ─────────────────────────────────────────────────────────────
import searchRoutes from './routes/searchRoutes.js';

const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 50, // 50 search requests per minute per IP
  message: { success: false, message: 'Too many search requests. Please wait a minute.' }
});

app.use('/api/v1/auth', loginLimiter, authRoutes);
app.use('/api/v1/hotels', hotelRoutes);
app.use('/api/v1/public/search', searchLimiter, searchRoutes);
app.use('/api/v1/bookings', bookingLimiter, bookingRoutes);
app.use('/api/v1/reviews', reviewRoutes);
app.use('/api/v1/coupons', couponRoutes);
app.use('/api/v1/invoices', protect, userInvoiceRoutes);
app.use('/api/v1/payments', bookingLimiter, paymentRoutes);
app.use('/api/v1/analytics', publicAnalyticsRoutes);
app.use('/api/v1/recommendations', recommendationRoutes);
app.use('/api/v1/experiments', experimentRoutes);
app.get('/api/v1/system/config', (req, res, next) => {
  import('./controllers/systemController.js').then(m => m.getPublicConfig(req, res, next));
});

// ─── MASTER ADMIN APIS (Intelligence & Global Control) ────────────────────────
app.use('/api/v1/master', masterAdminRoutes);

// ─── PARTNER EXTRANET APIS (Isolated Property Control) ───────────────────────
app.use('/api/v1/extranet', extranetRoutes);

// ─── ADMIN / OWNER APIS (Legacy Transition) ──────────────────────────────────
app.use('/api/v1/admin', protect, authorizeRoles('ADMIN', 'OWNER'), adminLimiter);

app.use('/api/v1/admin/hotels',     hotelRoutes);
app.use('/api/v1/admin/rooms',      roomRoutes);
app.use('/api/v1/admin/inventory',  inventoryRoutes);
app.use('/api/v1/admin/bookings',   bookingRoutes);
app.use('/api/v1/admin/rate-plans', ratePlanRoutes);
app.use('/api/v1/admin/invoices',   invoiceRoutes);
app.use('/api/v1/admin/payments',   paymentRoutes);
app.use('/api/v1/admin/analytics',  analyticsRoutes);
app.use('/api/v1/admin/users',      userRoutes);
app.use('/api/v1/admin/agreements', agreementRoutes);
app.use('/api/v1/admin/system',     systemRoutes);
app.use('/api/v1/admin/images',     imageRoutes);
app.use('/api/v1/admin/pricing',    pricingRoutes);
app.use('/api/v1/pricing', pricingRoutes);
app.use('/api/v1/finance', financeRoutes);

// Error Handling
app.use(errorHandler);

const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 ZivoHotels Backend running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  
  // Initialize Real-time Infrastructure
  socketService.init(server);
  
  // Initialize Autonomous Governance
  orchestrationService.init();
  
  // Register Self-Healing Workers
  workerManager.register('IntegrityWorker', startIntegrityWorker);
  workerManager.register('ExperimentWorker', startExperimentWorker);
  workerManager.register('PricingWorker', startPricingWorker);
  workerManager.register('PricingTrainer', startPricingTrainer);
  workerManager.register('FinanceWorker', startFinanceWorker);
  workerManager.register('MarketplaceBalancer', startMarketplaceBalancer);
});
