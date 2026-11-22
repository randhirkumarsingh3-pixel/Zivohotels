/**
 * Checks every admin-console and extranet request against the person's permissions
 * (services/accessService.js). Each rule matches a path (after /api/v1) and says which permission
 * reading (GET) and changing (anything else) need: for ZivoPlus staff (ADMIN accounts) and for
 * hotel teams (OWNER accounts, the extranet). The first matching rule applies; a path with no rule
 * needs every permission (only Super Admins / hotel owners), so nothing new is left open by default.
 *
 * Hotel teams: here it's enough to have the permission at one of their properties; the property
 * the request is about is checked by hotelScopeGuard / utils/hotelAccess.js with the permission
 * this sets on req.user.permission.
 */
import { ALL, allows } from '../constants/permissions.js';
import prisma from '../config/db.js';

// [path regex, admin [read, write], extranet [read, write]]. null instead of a pair: that kind of
// account can't use it at all; ANY: any member of the team may (e.g. marking notifications read)
const ANY = 'any';
const RULES = [
  // Staff & roles
  [/^\/admin\/staff/, ['staff.manage', 'staff.manage'], null],
  [/^\/extranet\/google/, ['properties.view', 'properties.manage'], ['dashboard.view', 'property.edit']],
  [/^\/extranet\/team/, ['properties.manage', 'properties.manage'], ['team.manage', 'team.manage']],

  // Extranet (hotel teams; admins acting on a property need properties.*)
  [/^\/extranet\/properties$/, ['properties.view', 'properties.view'], [ANY, ANY]],
  [/^\/extranet\/onboarding/, ['properties.manage', 'properties.manage'], ['property.edit', 'property.edit']],
  [/^\/extranet\/property/, ['properties.view', 'properties.manage'], ['dashboard.view', 'property.edit']],
  [/^\/extranet\/rooms/, ['properties.view', 'properties.manage'], ['rates.view', 'rates.manage']],
  [/^\/extranet\/(bookings|requests)/, ['bookings.view', 'bookings.manage'], ['bookings.view', 'bookings.manage']],
  [/^\/extranet\/reviews/, ['properties.view', 'reviews.moderate'], ['dashboard.view', 'reviews.reply']],
  [/^\/extranet\/hourly/, ['properties.view', 'hourly.manage'], ['rates.view', 'hourly.manage']],
  [/^\/extranet\/(notifications|activity|dashboard|performance)/, ['properties.view', 'properties.view'], ['dashboard.view', ANY]],
  [/^\/extranet\/(finance|wallet)/, ['finance.view', 'finance.manage'], ['finance.view', 'finance.view']],
  [/^\/extranet\/membership/, ['properties.view', 'loyalty.manage'], ['dashboard.view', 'membership.manage']],

  // Shared admin endpoints (hotel teams use them for their own property)
  [/^\/admin\/(rooms|inventory|ari|rate-plans|channel-manager)/, ['properties.view', 'properties.manage'], ['rates.view', 'rates.manage']],
  [/^\/(admin\/)?pricing/, ['properties.view', 'properties.manage'], ['rates.view', 'rates.manage']],
  [/^\/admin\/images/, ['properties.view', 'properties.manage'], ['property.edit', 'property.edit']],
  [/^\/admin\/hotels/, ['properties.view', 'properties.manage'], ['dashboard.view', 'property.edit']],
  [/^\/admin\/properties\/[^/]+\/submit/, ['properties.manage', 'properties.manage'], ['property.edit', 'property.edit']],
  [/^\/admin\/properties/, ['properties.view', 'properties.approve'], null],
  [/^\/admin\/agreements\/[^/]+\/sign/, ['properties.approve', 'properties.approve'], ['property.edit', 'property.edit']],
  [/^\/admin\/agreements/, ['properties.view', 'properties.approve'], null],
  [/^\/kyc\/documents\/[^/]+\/file/, ['properties.view', 'properties.view'], ['property.edit', 'property.edit']],
  [/^\/kyc\/[^/]+\/verify/, ['properties.approve', 'properties.approve'], null],
  [/^\/kyc/, ['properties.view', 'properties.approve'], ['property.edit', 'property.edit']],
  [/^\/admin\/bookings/, ['bookings.view', 'bookings.manage'], ['bookings.view', 'bookings.manage']],
  [/^\/admin\/invoices/, ['bookings.view', 'bookings.manage'], ['bookings.view', 'bookings.view']],
  [/^\/admin\/promotions/, ['dashboard.view', 'promotions.manage'], ['rates.view', 'promotions.manage']],
  [/^\/admin\/analytics/, ['dashboard.view', 'dashboard.view'], ['dashboard.view', 'dashboard.view']],

  // Admin console only
  [/^\/admin\/payments/, ['finance.view', 'bookings.manage'], null],
  [/^\/admin\/hourly/, ['properties.view', 'hourly.manage'], null],
  [/^\/admin\/reviews/, ['reviews.moderate', 'reviews.moderate'], null],
  [/^\/admin\/(loyalty|membership)/, ['loyalty.manage', 'loyalty.manage'], null],
  [/^\/admin\/wallets/, ['finance.view', 'finance.manage'], null],
  [/^\/admin\/users/, ['users.view', 'users.manage'], null],
  [/^\/admin\/(seo|google)/, ['seo.manage', 'seo.manage'], null],
  [/^\/admin\/(system|delivery)/, ['settings.view', 'settings.manage'], null],
  [/^\/finance/, ['finance.view', 'finance.manage'], null],
  [/^\/master\/finance/, ['finance.view', 'finance.manage'], null],
  [/^\/master/, ['dashboard.view', 'settings.manage'], null],
];

/** The permission a request needs: undefined = no rule (needs ALL), null = not for this account type. */
export const permissionFor = (path, method, role) => {
  const rule = RULES.find(([re]) => re.test(path));
  if (!rule) return undefined;
  const pair = role === 'ADMIN' ? rule[1] : rule[2];
  if (!pair) return null;
  const p = ['GET', 'HEAD', 'OPTIONS'].includes(method) ? pair[0] : pair[1];
  return role === 'ADMIN' && p === ANY ? undefined : p;
};

const refuse = async (req, res, needed) => {
  await prisma.securityLog.create({
    data: { type: 'FORBIDDEN_ACCESS', userId: req.user.id, ip: req.ip, userAgent: req.headers['user-agent'], requestId: req.id, details: { endpoint: req.originalUrl, needed } },
  }).catch(() => {});
  return res.status(403).json({ success: false, code: 'NO_PERMISSION', message: 'Your role doesn\'t allow this. Ask your administrator for access.' });
};

/** Mount after protect on /api/v1/{admin,extranet,master,finance,kyc,pricing}. */
export const permissionGate = (req, res, next) => {
  const user = req.user;
  if (!user || !['ADMIN', 'OWNER'].includes(user.role)) return next(); // other checks refuse them
  const path = (req.originalUrl || '').split('?')[0].replace(/^\/api\/v1/, '');
  const needed = permissionFor(path, req.method, user.role);
  if (needed === null && user.role === 'ADMIN') return refuse(req, res, 'not for admin accounts');
  if (needed === null) return refuse(req, res, 'not for hotel accounts');

  if (user.role === 'ADMIN') {
    if (!allows(user.access?.admin, needed === undefined ? ALL : needed)) return refuse(req, res, needed || ALL);
    user.permission = needed || ALL;
    return next();
  }
  // Hotel team: the permission at one of their properties (the property itself is checked later)
  const want = needed === undefined ? ALL : needed;
  const hotels = Object.values(user.access?.hotels || {});
  if (want === ANY) { user.permission = null; return next(); }
  // No property yet (a new owner signing up): only onboarding
  if (!hotels.length && /^\/extranet\/onboarding/.test(path)) { user.permission = want; return next(); }
  if (!hotels.some((perms) => allows(perms, want))) return refuse(req, res, want);
  user.permission = want;
  return next();
};

export default permissionGate;
