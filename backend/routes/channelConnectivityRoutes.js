import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { authorizeRoles } from '../middleware/authMiddleware.js';
import {
  overview, connection, saveConnection, saveMappings, createApiKey,
  cmProperty, cmAri, cmBookings,
} from '../controllers/channelConnectivityController.js';

/** Admin -> Channel Manager (mounted under /api/v1/admin/channel-manager; admins only). */
export const adminChannelRoutes = express.Router();
adminChannelRoutes.use(authorizeRoles('ADMIN'));
adminChannelRoutes.get('/', overview);
adminChannelRoutes.get('/:hotelId', connection);
adminChannelRoutes.put('/:hotelId', saveConnection);
adminChannelRoutes.put('/:hotelId/mappings', saveMappings);
adminChannelRoutes.post('/:hotelId/api-key', createApiKey);

/** API for a property's channel manager (mounted at /api/v1/channel-manager; X-Api-Key). */
export const channelManagerApi = express.Router();
channelManagerApi.use(rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  keyGenerator: (req) => req.get('x-api-key') || ipKeyGenerator(req.ip),
  message: { success: false, message: 'Too many requests. Slow down and retry.' },
}));
channelManagerApi.get('/property', cmProperty);
channelManagerApi.post('/ari', cmAri);
channelManagerApi.get('/bookings', cmBookings);
