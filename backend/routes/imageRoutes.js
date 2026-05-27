import express from 'express';
import { 
  uploadHotelImage, 
  getHotelImages, 
  attachImageToRoom, 
  detachImageFromRoom, 
  setRoomPrimaryImage,
  updateHotelImage,
  deleteHotelImage
} from '../controllers/imageController.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);
router.use(authorizeRoles('ADMIN', 'OWNER'));

router.route('/')
  .post(uploadHotelImage)
  .get(getHotelImages);

router.route('/:id')
  .patch(updateHotelImage)
  .delete(deleteHotelImage);

router.post('/room-types/:roomTypeId', attachImageToRoom);
router.delete('/room-types/:roomTypeId/images/:imageId', detachImageFromRoom);
router.patch('/room-types/:roomTypeId/images/:imageId/primary', setRoomPrimaryImage);

export default router;
