/**
 * Who may do what: staff roles for the admin console and for hotel teams.
 *
 * - Admin console: an ADMIN account's permissions come from its ADMIN StaffMember row (its role).
 *   An ADMIN account without one can sign in but do nothing in the console.
 * - Extranet: a hotel's owner (Hotel.ownerId) has every permission there; anyone else gets the
 *   permissions of their EXTRANET StaffMember row for that hotel (paused rows give nothing).
 *
 * loadAccess() is called for every signed-in request (one small query) and attached as
 * req.user.access; requests are checked with it (middleware/permissionGate.js, hotelScopeGuard,
 * utils/hotelAccess.js), and the website uses the same data to show only what a person may use.
 */
import prisma from '../config/db.js';
import { PRESET_ROLES, ALL, allows, expand } from '../constants/permissions.js';

/** { admin: [perms] | null, hotels: { [hotelId]: [perms] } } for a user record. */
export const loadAccess = async (user) => {
  if (!user || !['ADMIN', 'OWNER'].includes(user.role)) return { admin: null, hotels: {} };
  const [memberships, owned] = await Promise.all([
    prisma.staffMember.findMany({ where: { userId: user.id, status: 'ACTIVE' }, select: { scope: true, hotelId: true, role: { select: { permissions: true, name: true } } } }),
    user.role === 'OWNER' ? prisma.hotel.findMany({ where: { ownerId: user.id, isDeleted: false }, select: { id: true } }) : [],
  ]);
  const admin = user.role === 'ADMIN' ? [...new Set(memberships.filter((m) => m.scope === 'ADMIN').flatMap((m) => m.role.permissions))] : null;
  const hotels = {};
  const roleNames = {};
  for (const m of memberships) if (m.scope === 'EXTRANET' && m.hotelId) { hotels[m.hotelId] = m.role.permissions; roleNames[m.hotelId] = m.role.name; }
  for (const h of owned) { hotels[h.id] = [ALL]; roleNames[h.id] = 'Owner'; }
  const adminRole = memberships.filter((m) => m.scope === 'ADMIN').map((m) => m.role.name)[0] || null;
  return { admin, hotels, adminRole, roleNames };
};

/** The property a hotel account opens first: one it owns, else one whose team it's on. */
export const firstHotelFor = async (userId) => {
  const owned = await prisma.hotel.findFirst({ where: { ownerId: userId, isDeleted: false }, select: { id: true } });
  if (owned) return owned.id;
  const member = await prisma.staffMember.findFirst({ where: { userId, scope: 'EXTRANET', status: 'ACTIVE', hotel: { isDeleted: false } }, select: { hotelId: true }, orderBy: { createdAt: 'asc' } });
  return member?.hotelId || null;
};

/** May this signed-in user do `permission` (admin console)? */
export const canAdmin = (user, permission) => user?.role === 'ADMIN' && allows(user.access?.admin, permission);

/** May this user do `permission` at this hotel (extranet)? Admins with the matching console permission may too. */
export const canAtHotel = (user, hotelId, permission) => {
  if (!user || !hotelId) return false;
  if (user.role === 'ADMIN') return allows(user.access?.admin, ALL) || allows(user.access?.admin, 'properties.manage');
  const perms = user.access?.hotels?.[hotelId];
  return Boolean(perms) && (!permission || allows(perms, permission));
};

/** Hotel ids where this user has `permission` (any permission when none is given). */
export const hotelsWith = (user, permission) => Object.entries(user?.access?.hotels || {})
  .filter(([, perms]) => !permission || allows(perms, permission)).map(([id]) => id);

/** What the website needs: concrete permissions (ALL expanded) for the console and each hotel. */
export const accessForClient = (access) => ({
  admin: access?.admin ? expand('ADMIN', access.admin) : null,
  adminRole: access?.adminRole || null,
  isSuperAdmin: allows(access?.admin, ALL),
  hotels: Object.fromEntries(Object.entries(access?.hotels || {}).map(([id, perms]) => [id, { permissions: expand('EXTRANET', perms), owner: allows(perms, ALL), role: access?.roleNames?.[id] || null }])),
});

/**
 * Start-up: creates / updates the ready-made roles, and on a system with no Super Admin yet
 * (a new install, or the first start after roles were added) makes every admin account a Super
 * Admin so nobody is locked out. Locked so several server processes don't do it twice.
 */
export const ensureAccessSetup = async () => {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('zivo-access-setup'))`;
    for (const r of PRESET_ROLES) {
      await tx.accessRole.upsert({
        where: { key: r.key },
        update: { name: r.name, description: r.description, permissions: r.permissions, scope: r.scope, isSystem: true },
        create: { key: r.key, scope: r.scope, name: r.name, description: r.description, permissions: r.permissions, isSystem: true },
      });
    }
    const superRole = await tx.accessRole.findUnique({ where: { key: 'admin.super' } });
    const hasSuper = await tx.staffMember.count({ where: { roleId: superRole.id, status: 'ACTIVE', user: { role: 'ADMIN', status: { in: ['ACTIVE', 'INVITED'] } } } });
    if (!hasSuper) {
      const admins = await tx.user.findMany({ where: { role: 'ADMIN', status: { in: ['ACTIVE', 'INVITED'] } }, select: { id: true } });
      for (const a of admins) {
        const existing = await tx.staffMember.findFirst({ where: { userId: a.id, scope: 'ADMIN' } });
        if (existing) await tx.staffMember.update({ where: { id: existing.id }, data: { roleId: superRole.id, status: 'ACTIVE' } });
        else await tx.staffMember.create({ data: { userId: a.id, roleId: superRole.id, scope: 'ADMIN' } });
      }
      if (admins.length) console.log(`🔐 ${admins.length} admin account(s) set as Super Admin (no Super Admin existed yet)`);
    }
  }, { timeout: 20000 });
};

export default { loadAccess, canAdmin, canAtHotel, hotelsWith, accessForClient, ensureAccessSetup };
