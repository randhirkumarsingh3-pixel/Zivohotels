import express from 'express';
import { getTeam, invite, update, remove, resend, saveRole, deleteRole } from '../controllers/staffController.js';

/** Team members and roles. Mounted at /admin/staff and /extranet/team (permissions checked before). */
const router = express.Router();
router.get('/', getTeam);
router.post('/invite', invite);
router.post('/roles', saveRole);
router.put('/roles/:id', saveRole);
router.delete('/roles/:id', deleteRole);
router.patch('/:id', update);
router.delete('/:id', remove);
router.post('/:id/resend', resend);
export default router;
