/**
 * Finishing an application (ZivoPlus for Business / Partner Hub): the payout or refund bank
 * account, submitting the draft, ZivoPlus checking the bank account, and a reminder for drafts
 * left unfinished.
 *
 *  setBank(org, actor, input)      holder, account number, IFSC (looked up), type; stored encrypted.
 *                                  A ₹1 test deposit checks it when the bank-check service is set
 *                                  up; otherwise ZivoPlus checks it against the cancelled cheque.
 *  submit(orgId, user, { declaration })  DRAFT → IN_REVIEW once every required item is in
 *  reviewBank(id, admin, { status, note })  VERIFIED or REJECTED (the organisation is told)
 *  sendDraftReminders()            one email 2 days after a draft was started and not submitted
 */
import prisma from '../../config/db.js';
import { encryptText } from '../../utils/dataCrypto.js';
import { lookupIfsc, startAccountCheck, pollAccountCheck } from '../verification/kyc.js';
import { membershipFor, sendSubmitted, readBank, PORTAL, orgView, adminDetail } from './organisationService.js';
import { missingItems } from './orgChecklist.js';
import { getBusinessSettings } from './businessSettings.js';
import { notifyUser } from '../notifyService.js';
import { emailLayout, siteUrl } from '../emailLayout.js';

const fail = (m, code = 400) => Object.assign(new Error(m), { statusCode: code });
const clean = (v, max = 200) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const site = () => siteUrl() || 'http://localhost:5173';
const audit = (action, entityId, userId, details) => prisma.auditLog.create({ data: { action, entityType: 'ORGANISATION', entityId, userId: userId || 'SYSTEM', details } }).catch(() => {});
const ACCOUNT_TYPES = ['CURRENT', 'SAVINGS'];
const EDITABLE = ['DRAFT', 'IN_REVIEW', 'ON_HOLD', 'ACTIVE'];

/** Checks and saves the bank account (encrypted). Returns the organisation's view. */
export const setBank = async (org, actor, input = {}, { staff = false } = {}) => {
  if (!EDITABLE.includes(org.status)) throw fail('This organisation can\'t be changed.', 409);
  const holderName = clean(input.holderName, 120);
  const accountNumber = String(input.accountNumber || '').replace(/\s/g, '');
  const confirm = input.confirmAccountNumber === undefined ? accountNumber : String(input.confirmAccountNumber).replace(/\s/g, '');
  const accountType = ACCOUNT_TYPES.includes(input.accountType) ? input.accountType : 'CURRENT';
  if (holderName.length < 3) throw fail('Enter the account holder\'s name as the bank has it.');
  if (!/^\d{9,18}$/.test(accountNumber)) throw fail('Enter the account number: 9 to 18 digits.');
  if (accountNumber !== confirm) throw fail('The two account numbers don\'t match.');
  const ifsc = await lookupIfsc(input.ifsc);
  if (!ifsc.ok) throw fail(ifsc.message);
  const details = { holderName, accountNumber, ifsc: ifsc.ifsc, bankName: ifsc.bank || clean(input.bankName, 80) || null, branch: ifsc.branch || clean(input.branch, 120) || null, accountType };
  const check = await startAccountCheck({ accountNumber, ifsc: ifsc.ifsc, holderName, contactName: org.name, email: org.billingEmail }).catch(() => ({ status: 'MANUAL' }));
  const bankStatus = { VERIFIED: 'VERIFIED', NAME_MISMATCH: 'NAME_MISMATCH', PENDING: 'CHECKING' }[check.status] || 'PENDING';
  await prisma.organisation.update({
    where: { id: org.id },
    data: { bankDetails: encryptText(JSON.stringify(details)), bankLast4: accountNumber.slice(-4), bankStatus, bankNote: check.status === 'FAILED' ? clean(check.message, 300) : null, bankCheckRef: check.ref || null },
  });
  await audit(staff ? 'ORG_BANK_SET_BY_STAFF' : 'ORG_BANK_SET', org.id, actor.id, { ifsc: ifsc.ifsc, last4: accountNumber.slice(-4), check: check.status });
  return { status: bankStatus, message: check.message || null };
};

export const setBankAsMember = async (orgId, user, input) => {
  const { org } = await membershipFor(orgId, user, 'org.edit');
  const r = await setBank(org, user, input);
  return { ...r, organisation: orgView(await prisma.organisation.findUnique({ where: { id: org.id } }), await getBusinessSettings()) };
};

/** A test deposit sent earlier: read its result. */
export const refreshBankCheck = async (org) => {
  if (org.bankStatus !== 'CHECKING' || !org.bankCheckRef) return org;
  const b = readBank(org);
  const r = await pollAccountCheck(org.bankCheckRef, b?.holderName).catch(() => null);
  if (!r || r.status === 'PENDING') return org;
  const bankStatus = { VERIFIED: 'VERIFIED', NAME_MISMATCH: 'NAME_MISMATCH' }[r.status] || 'PENDING';
  return prisma.organisation.update({ where: { id: org.id }, data: { bankStatus, bankNote: r.status === 'FAILED' ? clean(r.message, 300) : bankStatus === 'NAME_MISMATCH' ? clean(r.message, 300) : null } });
};

/** The applicant submits the draft (every required item in, and the declaration accepted). */
export const submit = async (orgId, user, { declaration } = {}) => {
  const { org } = await membershipFor(orgId, user, 'org.edit');
  if (org.status !== 'DRAFT') throw fail('This application has already been submitted.', 409);
  const s = await getBusinessSettings();
  if (!(org.kind === 'AGENCY' ? s.agency : s.corporate).enabled) throw fail(`${PORTAL[org.kind].name} isn't taking applications right now.`, 403);
  const missing = missingItems(org);
  if (missing.length) throw fail(`Still needed before you submit: ${missing.join('; ')}.`, 409);
  if (!declaration) throw fail('Confirm that the details and documents are true and that you may apply for this business.');
  const updated = await prisma.organisation.update({ where: { id: org.id }, data: { status: 'IN_REVIEW', submittedAt: new Date(), declarationAt: new Date() } });
  await audit('ORG_APPLIED', org.id, user.id, { kind: org.kind, code: org.code, name: org.name });
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true, name: true, email: true } });
  await sendSubmitted(updated, me);
  return orgView(updated, s);
};

/** ZivoPlus checks the bank account against the cancelled cheque (or the test deposit). */
export const reviewBank = async (id, admin, { status, note } = {}) => {
  const org = await prisma.organisation.findUnique({ where: { id: String(id) } });
  if (!org) throw fail('Organisation not found', 404);
  if (!org.bankDetails) throw fail('No bank account has been entered.', 409);
  if (!['VERIFIED', 'REJECTED'].includes(status)) throw fail('Choose verified or not acceptable.');
  const text = clean(note, 300);
  if (status === 'REJECTED' && text.length < 3) throw fail('Say what is wrong, so they can correct it.');
  await prisma.organisation.update({ where: { id: org.id }, data: { bankStatus: status, bankNote: text || null } });
  await audit(status === 'VERIFIED' ? 'ORG_BANK_VERIFIED' : 'ORG_BANK_REJECTED', org.id, admin.id, { note: text || null });
  if (status === 'REJECTED') {
    const admins = await prisma.orgMember.findMany({ where: { organisationId: org.id, role: 'ADMIN', status: 'ACTIVE' }, select: { userId: true } });
    for (const a of admins) await notifyUser(a.userId, { type: 'ORG_BANK_REJECTED', title: 'Please check your bank account details', message: text, link: PORTAL[org.kind].path }).catch(() => {});
  }
  return adminDetail(org.id);
};

/** One reminder for drafts started more than 2 days ago and not submitted. */
export const sendDraftReminders = async () => {
  const drafts = await prisma.organisation.findMany({
    where: { status: 'DRAFT', draftReminderAt: null, createdAt: { lt: new Date(Date.now() - 2 * 86400000) } },
    take: 100, include: { members: { where: { role: 'ADMIN', status: 'ACTIVE' }, select: { userId: true } } },
  });
  for (const org of drafts) {
    const missing = missingItems(org);
    const portal = PORTAL[org.kind];
    for (const m of org.members) {
      await notifyUser(m.userId, {
        type: 'ORG_DRAFT_REMINDER', title: `Finish your ${portal.name} application`, message: missing.length ? `Still needed: ${missing.join('; ')}.` : 'Everything is in: submit it for review.', link: portal.path,
        email: { subject: `Finish your ${portal.name} application for ${org.name}`, html: await emailLayout({
          title: 'Your application is waiting', eyebrow: portal.name, ref: org.code, status: { label: 'Not submitted', tone: 'warn' },
          body: `<p>You started an application for <b>${org.name.replace(/[<>&]/g, '')}</b> but haven't submitted it yet. It's saved, so you can carry on where you left off.</p>${missing.length ? `<p><b>Still needed:</b> ${missing.map((x) => x.replace(/[<>&]/g, '')).join('; ')}.</p>` : '<p>Everything is in: review it and submit.</p>'}`,
          cta: { label: 'Finish the application', href: `${site()}${portal.path}` },
        }) },
      }).catch(() => {});
    }
    await prisma.organisation.update({ where: { id: org.id }, data: { draftReminderAt: new Date() } });
  }
  return { reminded: drafts.length };
};

/** Twice a day, only in the jobs process. */
export const startDraftReminderJob = () => {
  const run = () => sendDraftReminders().catch((e) => console.error('[OrgDrafts] reminders failed:', e.message));
  setTimeout(run, 5 * 60 * 1000).unref();
  setInterval(run, 12 * 3600 * 1000).unref();
};

export default { setBank, setBankAsMember, refreshBankCheck, submit, reviewBank, sendDraftReminders, startDraftReminderJob };
