/**
 * Staff and roles: ZivoHotels' own team (scope ADMIN) and each hotel's team (scope EXTRANET).
 *
 * Rules (enforced here, whatever the screen sends):
 * - Nobody can give a role with permissions they don't have themselves (no self-promotion).
 * - Nobody changes, pauses or removes themselves; a hotel's owner isn't a team member (they
 *   always have full access).
 * - The last active Super Admin can't be demoted, paused or removed.
 * - Staff accounts are separate from guest accounts: an email used by a guest account can't be
 *   invited (use a work email); a hotel account can join another hotel's team.
 * - New people get an emailed link to set their password (valid 7 days).
 * Every change is written to the audit log.
 */
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from '../config/db.js';
import { queueService } from './queueService.js';
import { ALL, allows, catalogue, cleanPermissions, expand, SCOPES } from '../constants/permissions.js';
import { escapeHtml } from '../utils/html.js';

export class StaffError extends Error {
  constructor(message, statusCode = 400) { super(message); this.statusCode = statusCode; }
}

const site = () => String(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());

/** The permissions the person acting has in this scope (and hotel). */
const actorPermissions = (actor, scope, hotelId) => (scope === SCOPES.ADMIN ? (actor.access?.admin || []) : (actor.access?.hotels?.[hotelId] || []));

/** Every permission of the role must be one the actor has. */
const assertCanGrant = (actor, scope, hotelId, rolePermissions) => {
  const mine = actorPermissions(actor, scope, hotelId);
  if (allows(mine, ALL)) return;
  const missing = expand(scope, rolePermissions).filter((p) => !allows(mine, p));
  if (missing.length) throw new StaffError(`You can't give access you don't have yourself (${missing.map((p) => catalogue(scope)[p]?.label || p).join(', ')}).`, 403);
};

const audit = (actor, action, entityId, details, requestId) => prisma.auditLog.create({
  data: { action, entityType: 'STAFF', entityId, userId: actor.id, requestId: requestId || null, details },
}).catch(() => {});

/** Roles this team can use: the ready-made ones, plus its own custom roles. */
const rolesWhere = (scope, ownerId) => ({ scope, OR: [{ isSystem: true }, { isSystem: false, ownerId: ownerId || null }] });
const teamOwnerId = async (scope, hotelId) => (scope === SCOPES.EXTRANET ? (await prisma.hotel.findUnique({ where: { id: hotelId }, select: { ownerId: true } }))?.ownerId : null);

const roleView = (r, counts = {}) => ({
  id: r.id, key: r.key, name: r.name, description: r.description, isSystem: r.isSystem,
  permissions: expand(r.scope, r.permissions), all: allows(r.permissions, ALL), members: counts[r.id] || 0,
});

/** Team screen data: members, roles and the permission list. */
export const teamOverview = async (scope, hotelId = null) => {
  const ownerId = await teamOwnerId(scope, hotelId);
  const [roles, members, hotel] = await Promise.all([
    prisma.accessRole.findMany({ where: rolesWhere(scope, ownerId), orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }] }),
    prisma.staffMember.findMany({
      where: { scope, hotelId: scope === SCOPES.ADMIN ? null : hotelId },
      include: { user: { select: { id: true, name: true, email: true, phone: true, status: true, lastLogin: true } }, role: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    scope === SCOPES.EXTRANET ? prisma.hotel.findUnique({ where: { id: hotelId }, select: { owner: { select: { id: true, name: true, email: true } } } }) : null,
  ]);
  const counts = members.reduce((m, x) => ({ ...m, [x.roleId]: (m[x.roleId] || 0) + 1 }), {});
  return {
    owner: hotel?.owner || null,
    members: members.map((m) => ({
      id: m.id, status: m.status, invited: m.user.status === 'INVITED', since: m.createdAt,
      user: { id: m.user.id, name: m.user.name, email: m.user.email, phone: m.user.phone, lastLogin: m.user.lastLogin },
      role: m.role,
    })),
    roles: roles
      .filter((r) => scope === SCOPES.ADMIN || r.key !== 'extranet.owner') // the owner role isn't given to team members
      .map((r) => roleView(r, counts)),
    permissions: Object.entries(catalogue(scope)).map(([key, v]) => ({ key, ...v })),
  };
};

const loadRole = async (scope, hotelId, roleId) => {
  const ownerId = await teamOwnerId(scope, hotelId);
  const role = await prisma.accessRole.findFirst({ where: { id: roleId, ...rolesWhere(scope, ownerId) } });
  if (!role || role.key === 'extranet.owner') throw new StaffError('Choose a role.');
  return role;
};

const superRoleId = async () => (await prisma.accessRole.findUnique({ where: { key: 'admin.super' }, select: { id: true } }))?.id;
const activeSuperAdmins = async () => prisma.staffMember.count({ where: { roleId: await superRoleId(), status: 'ACTIVE', scope: SCOPES.ADMIN } });

const inviteEmail = ({ to, name, inviter, where, roleName, link, isNew }) => queueService.enqueue('email', 'SEND_STAFF_INVITE', {
  to,
  subject: isNew ? `You're invited to ${where} on ZivoHotels` : `You've been added to ${where} on ZivoHotels`,
  html: `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2>Hello ${escapeHtml(name)},</h2>
      <p>${escapeHtml(inviter)} added you to <strong>${escapeHtml(where)}</strong> as <strong>${escapeHtml(roleName)}</strong>.</p>
      ${isNew
        ? `<p><a href="${link}" style="display:inline-block;background:#e7194a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Set your password</a></p><p style="color:#64748b;font-size:13px">The link works for 7 days.</p>`
        : `<p><a href="${link}">Sign in</a> with your existing account to see it.</p>`}
    </div>`,
});

/** Invites someone to the team (a new account, or an existing hotel account for a hotel team). */
export const inviteStaff = async (actor, { scope, hotelId = null, email, name, phone, roleId }, requestId) => {
  const mail = String(email || '').trim().toLowerCase();
  if (!isEmail(mail)) throw new StaffError('Enter a valid email address.');
  const role = await loadRole(scope, hotelId, roleId);
  assertCanGrant(actor, scope, hotelId, role.permissions);

  const hotel = scope === SCOPES.EXTRANET ? await prisma.hotel.findUnique({ where: { id: hotelId }, select: { id: true, name: true, ownerId: true } }) : null;
  const where = hotel ? hotel.name : 'the ZivoHotels team';
  const wantRole = scope === SCOPES.ADMIN ? 'ADMIN' : 'OWNER';
  let user = await prisma.user.findUnique({ where: { email: mail } });
  let raw = null;

  if (user) {
    if (hotel && user.id === hotel.ownerId) throw new StaffError('This is the property\'s owner: they already have full access.');
    if (user.role !== wantRole) {
      throw new StaffError(user.role === 'CUSTOMER'
        ? 'This email belongs to a guest account. Use a separate work email for staff.'
        : (scope === SCOPES.ADMIN ? 'This email belongs to a hotel account. Use a separate ZivoHotels email.' : 'This email belongs to a ZivoHotels staff account. Use a different email.'));
    }
    if (['BLOCKED', 'DELETED'].includes(user.status)) throw new StaffError('This account is blocked. Ask ZivoHotels support.');
    const already = await prisma.staffMember.findFirst({ where: { userId: user.id, scope, hotelId } });
    if (already) throw new StaffError('This person is already on the team.', 409);
  } else {
    if (String(name || '').trim().length < 2) throw new StaffError('Enter their name.');
    raw = crypto.randomBytes(32).toString('hex');
    user = await prisma.user.create({
      data: {
        name: String(name).trim(), email: mail, phone: phone ? String(phone).trim() : null, role: wantRole, status: 'INVITED',
        password: await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10),
        inviteToken: crypto.createHash('sha256').update(raw).digest('hex'),
        inviteExpiry: new Date(Date.now() + 7 * 86400000), mustChangePassword: false,
      },
    });
  }

  const member = await prisma.staffMember.create({ data: { userId: user.id, roleId: role.id, scope, hotelId, invitedById: actor.id } });
  const loginPath = scope === SCOPES.ADMIN ? '/admin/login' : '/extranet/login';
  await inviteEmail({
    to: mail, name: user.name, inviter: actor.name || 'Your team', where, roleName: role.name, isNew: Boolean(raw),
    link: raw ? `${site()}/accept-invite?token=${raw}&next=${encodeURIComponent(loginPath)}` : `${site()}${loginPath}`,
  }).catch((err) => console.error('[Staff] Invite email not queued:', err.message));
  await audit(actor, 'STAFF_INVITED', member.id, { scope, hotelId, email: mail, role: role.name, newAccount: Boolean(raw) }, requestId);
  return { id: member.id, newAccount: Boolean(raw), ...(process.env.EMAIL_TEST_MODE === 'true' && raw ? { inviteLink: `${site()}/accept-invite?token=${raw}&next=${encodeURIComponent(loginPath)}` } : {}) };
};

const loadMember = async (scope, hotelId, id) => {
  const m = await prisma.staffMember.findFirst({ where: { id, scope, hotelId: scope === SCOPES.ADMIN ? null : hotelId }, include: { role: true, user: { select: { id: true, name: true, email: true, status: true } } } });
  if (!m) throw new StaffError('Team member not found', 404);
  return m;
};

/** Changes someone's role and/or pauses / resumes them. */
export const updateStaff = async (actor, { scope, hotelId = null, id, roleId, status }, requestId) => {
  const m = await loadMember(scope, hotelId, id);
  if (m.userId === actor.id) throw new StaffError('You can\'t change your own access. Ask another administrator.', 403);
  // Changing someone with more access than you is self-promotion in disguise
  assertCanGrant(actor, scope, hotelId, m.role.permissions);
  const data = {};
  if (roleId && roleId !== m.roleId) {
    const role = await loadRole(scope, hotelId, roleId);
    assertCanGrant(actor, scope, hotelId, role.permissions);
    data.roleId = role.id;
  }
  if (status) {
    if (!['ACTIVE', 'PAUSED'].includes(status)) throw new StaffError('Unknown status');
    data.status = status;
  }
  if (!Object.keys(data).length) return m;
  if (scope === SCOPES.ADMIN && m.roleId === (await superRoleId()) && m.status === 'ACTIVE' && (data.status === 'PAUSED' || (data.roleId && data.roleId !== m.roleId)) && (await activeSuperAdmins()) <= 1) {
    throw new StaffError('This is the last Super Admin: add another Super Admin first.', 409);
  }
  const updated = await prisma.staffMember.update({ where: { id: m.id }, data });
  await audit(actor, 'STAFF_UPDATED', m.id, { scope, hotelId, email: m.user.email, ...data }, requestId);
  return updated;
};

/** Takes someone off the team (their account stays; a paused admin console account can do nothing). */
export const removeStaff = async (actor, { scope, hotelId = null, id }, requestId) => {
  const m = await loadMember(scope, hotelId, id);
  if (m.userId === actor.id) throw new StaffError('You can\'t remove yourself. Ask another administrator.', 403);
  assertCanGrant(actor, scope, hotelId, m.role.permissions);
  if (scope === SCOPES.ADMIN && m.roleId === (await superRoleId()) && m.status === 'ACTIVE' && (await activeSuperAdmins()) <= 1) {
    throw new StaffError('This is the last Super Admin: add another Super Admin first.', 409);
  }
  await prisma.staffMember.delete({ where: { id: m.id } });
  // Signed out everywhere, so nothing keeps working from an open tab
  await prisma.user.update({ where: { id: m.userId }, data: { tokenVersion: { increment: 1 } } }).catch(() => {});
  await audit(actor, 'STAFF_REMOVED', m.id, { scope, hotelId, email: m.user.email, role: m.role.name }, requestId);
};

/** A new set-password link for someone who hasn't accepted yet. */
export const resendStaffInvite = async (actor, { scope, hotelId = null, id }, requestId) => {
  const m = await loadMember(scope, hotelId, id);
  if (m.user.status !== 'INVITED') throw new StaffError('They have already set their password.');
  const raw = crypto.randomBytes(32).toString('hex');
  await prisma.user.update({ where: { id: m.userId }, data: { inviteToken: crypto.createHash('sha256').update(raw).digest('hex'), inviteExpiry: new Date(Date.now() + 7 * 86400000) } });
  const loginPath = scope === SCOPES.ADMIN ? '/admin/login' : '/extranet/login';
  const hotel = hotelId ? await prisma.hotel.findUnique({ where: { id: hotelId }, select: { name: true } }) : null;
  const link = `${site()}/accept-invite?token=${raw}&next=${encodeURIComponent(loginPath)}`;
  await inviteEmail({ to: m.user.email, name: m.user.name, inviter: actor.name || 'Your team', where: hotel?.name || 'the ZivoHotels team', roleName: m.role.name, isNew: true, link });
  await audit(actor, 'STAFF_INVITE_RESENT', m.id, { scope, hotelId, email: m.user.email }, requestId);
  return process.env.EMAIL_TEST_MODE === 'true' ? { inviteLink: link } : {};
};

/** Custom roles: create, edit, delete (ready-made roles can't be changed). */
export const saveRole = async (actor, { scope, hotelId = null, id, name, description, permissions }, requestId) => {
  const clean = cleanPermissions(scope, permissions).filter((p) => p !== ALL);
  if (String(name || '').trim().length < 2) throw new StaffError('Give the role a name.');
  if (!clean.length) throw new StaffError('Tick at least one permission.');
  assertCanGrant(actor, scope, hotelId, clean);
  const ownerId = await teamOwnerId(scope, hotelId);
  const data = { name: String(name).trim().slice(0, 60), description: description ? String(description).trim().slice(0, 200) : null, permissions: clean };
  if (id) {
    const existing = await prisma.accessRole.findFirst({ where: { id, scope, isSystem: false, ownerId: ownerId || null } });
    if (!existing) throw new StaffError('Ready-made roles can\'t be changed. Make a copy instead.', 403);
    assertCanGrant(actor, scope, hotelId, existing.permissions);
    const r = await prisma.accessRole.update({ where: { id }, data });
    await audit(actor, 'ROLE_UPDATED', id, { scope, hotelId, ...data }, requestId);
    return r;
  }
  const r = await prisma.accessRole.create({ data: { ...data, scope, ownerId: ownerId || null, createdById: actor.id } });
  await audit(actor, 'ROLE_CREATED', r.id, { scope, hotelId, ...data }, requestId);
  return r;
};

export const deleteRole = async (actor, { scope, hotelId = null, id }, requestId) => {
  const ownerId = await teamOwnerId(scope, hotelId);
  const role = await prisma.accessRole.findFirst({ where: { id, scope, isSystem: false, ownerId: ownerId || null } });
  if (!role) throw new StaffError('Ready-made roles can\'t be deleted.', 403);
  const used = await prisma.staffMember.count({ where: { roleId: id } });
  if (used) throw new StaffError(`${used} team member${used === 1 ? ' has' : 's have'} this role: give them another role first.`, 409);
  await prisma.accessRole.delete({ where: { id } });
  await audit(actor, 'ROLE_DELETED', id, { scope, hotelId, name: role.name }, requestId);
};

export default { teamOverview, inviteStaff, updateStaff, removeStaff, resendStaffInvite, saveRole, deleteRole };
