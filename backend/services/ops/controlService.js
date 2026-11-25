/**
 * Admin → System control: the platform's safety switches, each change recorded with who made it
 * and why (SystemActionLog). Every switch here is enforced in the code:
 *
 *  maintenanceMode       middleware/maintenanceMiddleware.js — site answers 503, staff tools stay open
 *  isBookingDisabled     same middleware — new bookings refused, prices still shown
 *  isPaymentDisabled     same middleware — online payments refused, pay at hotel still works
 *  dynamicPricingPaused  services/dynamicPricingService.js — automatic price updates stop
 *  experimentsEnabled    services/experimentService.js (AppState.globalExperimentToggle) — every
 *                        visitor sees the standard version
 */
import prisma from '../../config/db.js';
import { clearSystemConfigCache } from '../../config/systemConfig.js';
import cacheUtils from '../../utils/cacheUtils.js';

export const SWITCHES = {
  maintenanceMode: {
    label: 'Maintenance mode', danger: true, store: 'config', default: false,
    on: 'The website and app show a maintenance notice. Guests can\'t search or book. Staff can still sign in and use Admin and Extranet.',
    off: 'The website is open to guests.',
  },
  isBookingDisabled: {
    label: 'Pause new bookings', danger: true, store: 'config', default: false,
    on: 'Guests can browse and see prices, but new bookings are refused with a notice. Existing bookings are not affected.',
    off: 'Guests can book.',
  },
  isPaymentDisabled: {
    label: 'Pause online payments', danger: true, store: 'config', default: false,
    on: 'Online payment is refused. Guests can still book with Pay at hotel. Payments already started are still confirmed.',
    off: 'Online payments are taken.',
  },
  dynamicPricingPaused: {
    label: 'Pause automatic pricing', danger: false, store: 'config', default: false,
    on: 'Automatic price rules stop changing prices. Prices already set stay as they are. Hotels can still edit prices by hand.',
    off: 'Hotels with automatic pricing switched on get prices updated every hour.',
  },
  experimentsEnabled: {
    label: 'Run experiments', danger: false, store: 'appState', default: true,
    on: 'Running experiments show their versions to the share of visitors set on the Experiments page.',
    off: 'Every visitor sees the standard version. Experiments keep their settings and results.',
  },
};

const truthy = (v) => v === true || v === 'true';

export const readSwitches = async () => {
  const [rows, app] = await Promise.all([
    prisma.systemConfig.findMany({ where: { key: { in: [...Object.keys(SWITCHES), 'maintenanceMessage'] } } }),
    prisma.appState.findUnique({ where: { id: 'singleton' } }),
  ]);
  const cfg = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const values = {};
  for (const [key, def] of Object.entries(SWITCHES)) {
    if (def.store === 'appState') values[key] = app ? app.globalExperimentToggle !== false : def.default;
    else values[key] = cfg[key] === undefined ? def.default : truthy(cfg[key]);
  }
  return { values, maintenanceMessage: typeof cfg.maintenanceMessage === 'string' ? cfg.maintenanceMessage : '' };
};

export const isDynamicPricingPaused = async () => {
  const row = await prisma.systemConfig.findUnique({ where: { key: 'dynamicPricingPaused' } });
  return truthy(row?.value);
};

const who = (user) => user?.email || user?.name || user?.id || 'unknown';

/** Turn one switch on or off. reason is required (it's what the next person reads). */
export const setSwitch = async ({ key, value, reason, message }, user) => {
  const def = SWITCHES[key];
  if (!def) throw Object.assign(new Error('Unknown switch'), { statusCode: 400 });
  const on = Boolean(value);
  const why = String(reason || '').trim();
  if (why.length < 5) throw Object.assign(new Error('Say why (at least 5 characters). It is shown in the change log.'), { statusCode: 400 });

  if (def.store === 'appState') {
    await prisma.appState.upsert({ where: { id: 'singleton' }, update: { globalExperimentToggle: on }, create: { id: 'singleton', globalExperimentToggle: on } });
    cacheUtils.clearCache(); // this process at once; the others within a minute
  } else {
    await prisma.systemConfig.upsert({ where: { key }, update: { value: on }, create: { key, value: on, description: def.label } });
  }
  if (key === 'maintenanceMode' && message !== undefined) {
    const text = String(message || '').trim().slice(0, 300);
    await prisma.systemConfig.upsert({ where: { key: 'maintenanceMessage' }, update: { value: text }, create: { key: 'maintenanceMessage', value: text, description: 'Maintenance notice' } });
  }
  clearSystemConfigCache();
  await prisma.systemActionLog.create({
    data: { actionType: key, reason: why.slice(0, 500), triggeredBy: who(user), impact: { key, label: def.label, on, effect: on ? def.on : def.off }, status: on ? 'ON' : 'OFF' },
  });
  return readSwitches();
};

export const changeLog = async (limit = 50) => {
  const rows = await prisma.systemActionLog.findMany({ orderBy: { timestamp: 'desc' }, take: Math.min(200, Math.max(1, limit)) });
  return rows.map((r) => ({
    id: r.id, at: r.timestamp, key: r.actionType, label: r.impact?.label || SWITCHES[r.actionType]?.label || r.actionType,
    on: r.impact?.on ?? null, status: r.status, reason: r.reason, by: r.triggeredBy,
  }));
};

export default { SWITCHES, readSwitches, setSwitch, changeLog, isDynamicPricingPaused };
