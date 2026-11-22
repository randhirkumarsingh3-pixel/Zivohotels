import express from 'express';
import { adminGet, adminSave, adminSetHotel, adminSample, adminAccuracy } from '../controllers/googleHotelsController.js';

/** Admin → Google Hotels (mounted at /admin/google; needs seo.manage) */
const router = express.Router();
router.get('/', adminGet);
router.put('/', adminSave);
router.put('/hotels/:id', adminSetHotel);
router.get('/hotels/:id/sample', adminSample);
router.post('/accuracy', adminAccuracy);
export default router;
