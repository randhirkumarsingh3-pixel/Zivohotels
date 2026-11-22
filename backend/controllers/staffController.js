/**
 * Staff & roles screens: ZivoPlus' team (/admin/staff, needs staff.manage) and a hotel's team
 * (/extranet/team, needs team.manage at that property). The rules live in services/staffService.js.
 */
import { asyncHandler } from '../middleware/asyncHandler.js';
import staff, { StaffError } from '../services/staffService.js';

const scopeOf = (req) => (req.baseUrl.includes('/extranet') ? { scope: 'EXTRANET', hotelId: req.scopedHotelId } : { scope: 'ADMIN', hotelId: null });
const run = (fn) => asyncHandler(async (req, res) => {
  try {
    const data = await fn(req, scopeOf(req));
    res.json({ success: true, data: data ?? null, requestId: req.id });
  } catch (e) {
    if (e instanceof StaffError) return res.status(e.statusCode).json({ success: false, message: e.message, requestId: req.id });
    throw e;
  }
});

export const getTeam = run((req, s) => staff.teamOverview(s.scope, s.hotelId));
export const invite = run((req, s) => staff.inviteStaff(req.user, { ...s, ...req.body }, req.id));
export const update = run((req, s) => staff.updateStaff(req.user, { ...s, id: req.params.id, roleId: req.body?.roleId, status: req.body?.status }, req.id));
export const remove = run((req, s) => staff.removeStaff(req.user, { ...s, id: req.params.id }, req.id));
export const resend = run((req, s) => staff.resendStaffInvite(req.user, { ...s, id: req.params.id }, req.id));
export const saveRole = run((req, s) => staff.saveRole(req.user, { ...s, ...req.body, id: req.params.id }, req.id));
export const deleteRole = run((req, s) => staff.deleteRole(req.user, { ...s, id: req.params.id }, req.id));
