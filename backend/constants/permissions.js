/**
 * Permissions: what each kind of staff may do.
 *
 * ADMIN permissions are for ZivoPlus' own team (the admin console). EXTRANET permissions are
 * for a hotel's team, per property. A role is a named set of them; ready-made roles are below,
 * and Super Admins / hotel owners can make their own.
 *
 * Every permission has a label and a group, used by the role editor. "view" permissions only
 * read; "manage" ones change things. ALL means every permission of that scope.
 */

export const ADMIN_PERMISSIONS = {
  'dashboard.view': { group: 'Overview', label: 'See the dashboard and reports' },
  'bookings.view': { group: 'Bookings', label: 'See bookings and invoices' },
  'bookings.manage': { group: 'Bookings', label: 'Change, cancel and refund bookings' },
  'properties.view': { group: 'Properties', label: 'See properties, rooms and rates' },
  'properties.manage': { group: 'Properties', label: 'Edit properties, rooms, rates and photos' },
  'properties.approve': { group: 'Properties', label: 'Approve properties, documents and go-live' },
  'hourly.manage': { group: 'Properties', label: 'Hourly stays settings and approvals' },
  'promotions.manage': { group: 'Marketing', label: 'Create and edit offers' },
  'reviews.moderate': { group: 'Marketing', label: 'Moderate guest reviews' },
  'loyalty.manage': { group: 'Marketing', label: 'Zivo Rewards and membership plans' },
  'seo.manage': { group: 'Marketing', label: 'SEO and Google Hotels: page titles, redirects, search engines, Google price feeds' },
  'finance.view': { group: 'Finance', label: 'See payments, settlements, wallets and ledger' },
  'finance.manage': { group: 'Finance', label: 'Record payouts and adjust wallets' },
  'business.view': { group: 'Business', label: 'See companies and travel agents, their accounts and documents' },
  'business.manage': { group: 'Business', label: 'Approve companies and travel agents, set their credit and terms' },
  'users.view': { group: 'People', label: 'See guest and partner accounts' },
  'users.manage': { group: 'People', label: 'Block, unblock and edit accounts' },
  'staff.manage': { group: 'People', label: 'Invite ZivoPlus staff and manage roles' },
  'settings.view': { group: 'Settings', label: 'See platform settings and system health' },
  'settings.manage': { group: 'Settings', label: 'Change platform settings (taxes, support, emails, security)' },
};

export const EXTRANET_PERMISSIONS = {
  'dashboard.view': { group: 'Overview', label: 'See the dashboard, notifications and reports' },
  'property.edit': { group: 'Property', label: 'Edit property details, photos, policies and documents' },
  'rates.view': { group: 'Rates', label: 'See rooms, rates and availability' },
  'rates.manage': { group: 'Rates', label: 'Change rooms, rates, availability and pricing' },
  'hourly.manage': { group: 'Rates', label: 'Hourly stays setup and day allocations' },
  'promotions.manage': { group: 'Rates', label: 'Create and edit offers' },
  'bookings.view': { group: 'Bookings', label: 'See bookings and guest requests' },
  'bookings.manage': { group: 'Bookings', label: 'Check in / no-show, answer guest requests' },
  'reviews.reply': { group: 'Guests', label: 'Reply to and report reviews' },
  'finance.view': { group: 'Finance', label: 'See earnings, settlements and payouts' },
  'membership.manage': { group: 'Finance', label: 'Member price settings' },
  'team.manage': { group: 'Team', label: 'Invite team members and manage roles' },
};

export const ALL = '*';
export const SCOPES = { ADMIN: 'ADMIN', EXTRANET: 'EXTRANET' };
export const catalogue = (scope) => (scope === SCOPES.ADMIN ? ADMIN_PERMISSIONS : EXTRANET_PERMISSIONS);

/** Ready-made roles (created on start-up, can't be edited or deleted). */
export const PRESET_ROLES = [
  { key: 'admin.super', scope: 'ADMIN', name: 'Super Admin', description: 'Everything, including staff and roles.', permissions: [ALL] },
  {
    key: 'admin.operations', scope: 'ADMIN', name: 'Operations', description: 'Bookings, properties and approvals, offers and reviews.',
    permissions: ['dashboard.view', 'bookings.view', 'bookings.manage', 'properties.view', 'properties.manage', 'properties.approve', 'hourly.manage', 'promotions.manage', 'reviews.moderate', 'seo.manage', 'users.view', 'business.view', 'business.manage'],
  },
  {
    key: 'admin.finance', scope: 'ADMIN', name: 'Finance', description: 'Payments, refunds, settlements and payouts.',
    permissions: ['dashboard.view', 'bookings.view', 'bookings.manage', 'finance.view', 'finance.manage', 'properties.view', 'users.view', 'business.view'],
  },
  {
    key: 'admin.support', scope: 'ADMIN', name: 'Support Agent', description: 'Help guests and hotels: see bookings and accounts, change bookings.',
    permissions: ['dashboard.view', 'bookings.view', 'bookings.manage', 'properties.view', 'users.view'],
  },
  {
    key: 'admin.content', scope: 'ADMIN', name: 'Content & SEO', description: 'Property content and photos, offers and reviews.',
    permissions: ['dashboard.view', 'properties.view', 'properties.manage', 'promotions.manage', 'reviews.moderate', 'seo.manage'],
  },
  {
    key: 'admin.viewer', scope: 'ADMIN', name: 'Read-only', description: 'Can look at everything, change nothing.',
    permissions: Object.keys(ADMIN_PERMISSIONS).filter((p) => p.endsWith('.view')),
  },
  { key: 'extranet.owner', scope: 'EXTRANET', name: 'Owner', description: 'Everything for the property, including the team.', permissions: [ALL] },
  {
    key: 'extranet.manager', scope: 'EXTRANET', name: 'Manager', description: 'Runs the property day to day; can\'t manage the team.',
    permissions: Object.keys(EXTRANET_PERMISSIONS).filter((p) => p !== 'team.manage'),
  },
  {
    key: 'extranet.frontdesk', scope: 'EXTRANET', name: 'Front Desk', description: 'Bookings, check-ins and guest requests.',
    permissions: ['dashboard.view', 'bookings.view', 'bookings.manage', 'rates.view', 'reviews.reply'],
  },
  {
    key: 'extranet.revenue', scope: 'EXTRANET', name: 'Revenue Manager', description: 'Rates, availability, hourly stays and offers.',
    permissions: ['dashboard.view', 'rates.view', 'rates.manage', 'hourly.manage', 'promotions.manage', 'bookings.view'],
  },
  {
    key: 'extranet.accountant', scope: 'EXTRANET', name: 'Accountant', description: 'Earnings, settlements and payouts.',
    permissions: ['dashboard.view', 'finance.view', 'bookings.view'],
  },
];

/** Keeps only permissions that exist for the scope (or ALL). */
export const cleanPermissions = (scope, list) => {
  const known = catalogue(scope);
  const set = new Set((Array.isArray(list) ? list : []).filter((p) => p === ALL || known[p]));
  return set.has(ALL) ? [ALL] : [...set];
};

/** Does a permission list include this permission? */
export const allows = (list, permission) => {
  if (!list) return false;
  const has = list instanceof Set ? (p) => list.has(p) : (p) => list.includes(p);
  return has(ALL) || has(permission);
};

/** Every concrete permission a list stands for (ALL expanded). */
export const expand = (scope, list) => (allows(list, ALL) ? Object.keys(catalogue(scope)) : [...(list || [])]);
