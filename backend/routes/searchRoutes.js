import express from 'express';
import { searchAll, getPopularCities, searchNearby } from '../controllers/publicSearchController.js';

const router = express.Router();

router.get('/', searchAll);
router.get('/popular', getPopularCities);
router.get('/nearby', searchNearby);

export default router;
