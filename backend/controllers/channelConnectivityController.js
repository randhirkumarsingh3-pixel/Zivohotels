import cm from '../services/channelConnectivityService.js';

const send = (res, req, fn, status = 200) => fn().then(
  (data) => res.status(status).json({ success: true, data, requestId: req.id }),
  (e) => res.status(e.status || 500).json({ success: false, message: e.status ? e.message : 'Could not complete the request', requestId: req.id })
);

// ── Admin (ZivoHotels team) ──
export const overview = (req, res) => send(res, req, () => cm.getOverview());
export const connection = (req, res) => send(res, req, () => cm.getConnection(req.params.hotelId));
export const saveConnection = (req, res) => send(res, req, () => cm.saveConnection(req.params.hotelId, req.body || {}));
export const saveMappings = (req, res) => send(res, req, () => cm.saveMappings(req.params.hotelId, req.body?.roomTypes));
export const createApiKey = (req, res) => send(res, req, () => cm.createApiKey(req.params.hotelId), 201);

// ── Channel manager API (X-Api-Key) ──
const withIntegration = (fn) => (req, res) => send(res, req, async () => {
  const integ = await cm.authenticate(req.get('x-api-key'));
  return fn(integ, req);
});
export const cmProperty = withIntegration((integ) => cm.propertyForChannel(integ));
export const cmAri = withIntegration((integ, req) => cm.applyAri(integ, req.body));
export const cmBookings = withIntegration((integ, req) => cm.bookingsForChannel(integ, req.query));
