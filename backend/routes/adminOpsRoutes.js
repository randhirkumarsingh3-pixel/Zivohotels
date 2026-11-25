/**
 * Admin operations pages, all mounted under /api/v1/admin (permissions in middleware/permissionGate.js):
 *
 *  /control      System control: safety switches and their change log      settings.view / settings.manage
 *  /health       System health: live checks of the platform               settings.view
 *  /insights     Demand forecasting and revenue per search                 dashboard.view
 *  /experiments  A/B experiments: set up, run, results                     settings.view / settings.manage
 *  /risk         Fraud & risk: accounts and bookings to review            finance.view / users.manage
 */
import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { SWITCHES, readSwitches, setSwitch, changeLog } from '../services/ops/controlService.js';
import { healthReport } from '../services/ops/healthService.js';
import { forecast, searchRevenue } from '../services/ops/insightsService.js';
import { listExperiments, createExperiment, updateExperiment, deleteExperiment, experimentResults } from '../services/ops/experimentAdmin.js';
import { riskOverview, accountDetail, reviewAccount, setIpBlock } from '../services/ops/riskService.js';

const send = (res, data) => res.json({ success: true, data });
const fail = (res, e) => {
  if (e.statusCode && e.statusCode < 500) return res.status(e.statusCode).json({ success: false, message: e.message });
  throw e;
};

// ─── System control ──────────────────────────────────────────────────────────
export const controlRouter = express.Router();

controlRouter.get('/', asyncHandler(async (req, res) => {
  const [state, log] = await Promise.all([readSwitches(), changeLog(30)]);
  const switches = Object.entries(SWITCHES).map(([key, d]) => ({ key, label: d.label, danger: d.danger, on: state.values[key], effectOn: d.on, effectOff: d.off }));
  send(res, { switches, maintenanceMessage: state.maintenanceMessage, log });
}));

controlRouter.put('/:key', asyncHandler(async (req, res) => {
  try {
    await setSwitch({ key: req.params.key, value: req.body?.on, reason: req.body?.reason, message: req.body?.message }, req.user);
    const [state, log] = await Promise.all([readSwitches(), changeLog(30)]);
    const switches = Object.entries(SWITCHES).map(([key, d]) => ({ key, label: d.label, danger: d.danger, on: state.values[key], effectOn: d.on, effectOff: d.off }));
    send(res, { switches, maintenanceMessage: state.maintenanceMessage, log });
  } catch (e) { fail(res, e); }
}));

controlRouter.get('/log', asyncHandler(async (req, res) => send(res, await changeLog(Number(req.query.limit) || 100))));

// ─── System health ───────────────────────────────────────────────────────────
export const healthRouter = express.Router();
healthRouter.get('/', asyncHandler(async (req, res) => send(res, await healthReport())));

// ─── Demand forecasting, revenue per search ─────────────────────────────────
export const insightsRouter = express.Router();
insightsRouter.get('/forecast', asyncHandler(async (req, res) => send(res, await forecast({ days: req.query.days, city: req.query.city, hotelId: req.query.hotelId }))));
insightsRouter.get('/search-revenue', asyncHandler(async (req, res) => send(res, await searchRevenue({ days: req.query.days, city: req.query.city }))));

// ─── Experiments ─────────────────────────────────────────────────────────────
export const experimentsRouter = express.Router();
experimentsRouter.get('/', asyncHandler(async (req, res) => send(res, await listExperiments())));
experimentsRouter.post('/', asyncHandler(async (req, res) => { try { res.status(201); send(res, await createExperiment(req.body || {}, req.user)); } catch (e) { fail(res, e); } }));
experimentsRouter.patch('/:id', asyncHandler(async (req, res) => { try { send(res, await updateExperiment(req.params.id, req.body || {}, req.user)); } catch (e) { fail(res, e); } }));
experimentsRouter.delete('/:id', asyncHandler(async (req, res) => { try { await deleteExperiment(req.params.id); send(res, { deleted: true }); } catch (e) { fail(res, e); } }));
experimentsRouter.get('/:id/results', asyncHandler(async (req, res) => { try { send(res, await experimentResults(req.params.id)); } catch (e) { fail(res, e); } }));

// ─── Fraud & risk ────────────────────────────────────────────────────────────
export const riskRouter = express.Router();
riskRouter.get('/', asyncHandler(async (req, res) => send(res, await riskOverview({ days: Math.min(90, Math.max(1, Number(req.query.days) || 30)) }))));
riskRouter.get('/accounts/:id', asyncHandler(async (req, res) => { try { send(res, await accountDetail(req.params.id)); } catch (e) { fail(res, e); } }));
riskRouter.post('/accounts/:id/review', asyncHandler(async (req, res) => { try { send(res, await reviewAccount(req.params.id, req.body || {}, req.user)); } catch (e) { fail(res, e); } }));
riskRouter.post('/ips', asyncHandler(async (req, res) => { try { send(res, await setIpBlock(req.body?.ip, req.body?.block !== false, req.body?.note, req.user)); } catch (e) { fail(res, e); } }));
