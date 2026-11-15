import loyalty from '../services/loyaltyService.js';

/**
 * Zivo Rewards API.
 *  Member: GET /loyalty/me, GET /loyalty/me/history
 *  Admin:  /admin/loyalty: GET /stats, PUT /config, GET /members, GET /members/:id, POST /members/:id/adjust
 */
const send = (res, req, fn, status = 200) => fn().then(
  (data) => res.status(status).json({ success: true, data, requestId: req.id }),
  (err) => {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message, requestId: req.id });
    console.error('[ZivoRewards]', err);
    return res.status(500).json({ success: false, message: 'Something went wrong with Zivo Rewards. Please try again.', requestId: req.id });
  }
);
const adminOnly = (req, res) => {
  if (req.user.role === 'ADMIN') return true;
  res.status(403).json({ success: false, message: 'Only Zivo admins manage Zivo Rewards', requestId: req.id });
  return false;
};

/** Public program description (earn rate, point value, tiers) for the Rewards page. */
export const getProgram = (req, res) => send(res, req, async () => {
  const c = await loyalty.getConfig();
  return { enabled: c.enabled, earnPointsPer100: c.earnPointsPer100, pointValue: c.pointValue, minRedeemPoints: c.minRedeemPoints, maxRedeemPercent: c.maxRedeemPercent, reviewBonusPoints: c.reviewBonusPoints, signupBonusPoints: c.signupBonusPoints, tierWindowMonths: c.tierWindowMonths, expiryMonths: c.expiryMonths, tiers: c.tiers };
});
export const getMyRewards = (req, res) => send(res, req, () => loyalty.memberSummary(req.user.id));
export const getMyHistory = (req, res) => send(res, req, () => loyalty.history(req.user.id, req.query));

export const getStats = (req, res) => adminOnly(req, res) && send(res, req, () => loyalty.programStats());
export const putConfig = (req, res) => adminOnly(req, res) && send(res, req, () => loyalty.updateConfig(req.body || {}, req.user.id));
export const getMembers = (req, res) => adminOnly(req, res) && send(res, req, () => loyalty.listMembers(req.query));
export const getMember = (req, res) => adminOnly(req, res) && send(res, req, async () => ({
  summary: await loyalty.memberSummary(req.params.id),
  history: await loyalty.history(req.params.id, { limit: 100 }),
}));
export const adjustMember = (req, res) => adminOnly(req, res) && send(res, req, () => loyalty.adjust({ userId: req.params.id, points: req.body?.points, reason: req.body?.reason }, req.user.id), 201);
