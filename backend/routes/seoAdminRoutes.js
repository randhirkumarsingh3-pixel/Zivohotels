import express from 'express';
import { getSeo, putSeo, listSeoHotels, putSeoHotel, previewSeo } from '../controllers/seoAdminController.js';

/** Admin → SEO (mounted at /admin/seo; needs seo.manage) */
const router = express.Router();
router.get('/', getSeo);
router.put('/', putSeo);
router.get('/hotels', listSeoHotels);
router.put('/hotels/:id', putSeoHotel);
router.get('/preview', previewSeo);
export default router;
