/**
 * Admin → Setup checklist: everything a super admin configures for ZivoPlus to run end to end,
 * checked live. Each item says what it is for, its state, what is set now, and where to change it
 * (an admin page, or a line in the server's deploy/vps/.env for keys that must stay on the server).
 *
 * status: 'done' | 'todo' (needed before going live) | 'optional' | 'info'
 */
import prisma from '../../config/db.js';
import { getFinanceSettings, STATE_NAMES } from '../finance/financeSettings.js';
import { getDocumentSettings } from './documentSettings.js';
import { getSupportContacts } from '../../config/supportContacts.js';
import { getSystemConfig } from '../../config/systemConfig.js';
import { hotelGstStateCode } from '../../constants/finance.js';

const env = (k) => String(process.env[k] || '').trim();
const item = (group, key, title, what, status, detail, where) => ({ group, key, title, what, status, detail, where });
const page = (label, path) => ({ type: 'page', label, path });
const envKey = (name) => ({ type: 'env', label: `deploy/vps/.env → ${name}`, name });
const MODE_LABEL = { ON_BEHALF: 'ZivoPlus, on behalf of the hotel', ZIVO_SUPPLIER: 'ZivoPlus as supplier', HOTEL_ISSUES: 'The hotel (ZivoPlus gives a receipt)' };

export const setupStatus = async () => {
  const [fin, docs, support, sys] = await Promise.all([getFinanceSettings(), getDocumentSettings(), getSupportContacts().catch(() => ({})), getSystemConfig()]);
  const c = fin.company || {};
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [emailSent, emailFailed, liveHotels, admins, freePlan, welcome] = await Promise.all([
    prisma.backgroundJob.count({ where: { queue: 'email', status: 'COMPLETED', updatedAt: { gte: since } } }),
    prisma.backgroundJob.count({ where: { queue: 'email', status: 'FAILED', updatedAt: { gte: since } } }),
    prisma.hotel.findMany({ where: { status: { in: ['LIVE', 'ACTIVE'] }, isDeleted: { not: true } }, select: { gstin: true, state: true, integrationSettings: true } }),
    prisma.user.count({ where: { role: 'ADMIN', status: { not: 'BLOCKED' } } }),
    prisma.membershipPlan.findFirst({ where: { isFree: true, isActive: true }, select: { benefits: true } }),
    prisma.promotion.findFirst({ where: { firstBookingOnly: true, code: null, isActive: true }, select: { name: true, value: true, discountType: true } }),
  ]);

  const LABELS = { legalName: 'legal name', gstin: 'GSTIN', pan: 'PAN', address: 'registered address', stateCode: 'state' };
  const companyMissing = Object.keys(LABELS).filter((k) => !String(c[k] || '').trim()).map((k) => LABELS[k]);
  const hotelStates = [...new Set(liveHotels.map((h) => hotelGstStateCode({ gstin: h.gstin, state: h.state || h.integrationSettings?.addressDetails?.state })).filter(Boolean))];
  const tcsMissing = hotelStates.filter((s) => !fin.tcsRegistrations?.[s]);
  const razorKey = env('RAZORPAY_KEY_ID');
  const signIn = Number(freePlan?.benefits?.zivoDiscountPercent) || 0;

  const items = [
    // 1. Company, tax and invoicing
    item('Company & tax', 'company', 'ZivoPlus legal details', 'Printed on every invoice, credit note, statement and voucher footer: legal name, GSTIN, PAN, CIN, registered address and state.',
      companyMissing.length ? 'todo' : 'done', companyMissing.length ? `Missing: ${companyMissing.join(', ')}` : `${c.legalName} · GSTIN ${c.gstin}`, page('Finance Settings → Company', '/admin/finance/settings')),
    item('Company & tax', 'tan', 'TAN for TDS (section 194-O)', 'Shown on hotel statements so hotels can claim the TDS ZivoPlus deducts.',
      c.tan ? 'done' : 'todo', c.tan || 'Not set', page('Finance Settings → Company', '/admin/finance/settings')),
    item('Company & tax', 'tcs', 'TCS registration in each hotel state', 'ZivoPlus collects TCS (GST section 52) under its registration in the state of each hotel.',
      !hotelStates.length ? 'info' : tcsMissing.length ? 'todo' : 'done', !hotelStates.length ? 'No live hotels yet' : tcsMissing.length ? `Missing for: ${tcsMissing.map((s) => STATE_NAMES[s] || s).join(', ')}` : `${hotelStates.length} state${hotelStates.length === 1 ? '' : 's'} covered`, page('Finance Settings → TCS registrations', '/admin/finance/settings')),
    item('Company & tax', 'commissionLive', 'Commission invoicing live', 'Until switched on, commission invoices are numbered TEST-… and marked "not a tax invoice". Switch on once the company details are right; numbering then starts at 000001.',
      fin.invoice?.live ? 'done' : 'todo', fin.invoice?.live ? `Live since ${fin.invoice.liveSince ? new Date(fin.invoice.liveSince).toLocaleDateString('en-IN') : '—'} · series ${fin.invoice.prefix}` : `Test mode · series ${fin.invoice?.prefix || 'ZPC'}`, page('Finance Settings → Invoices', '/admin/finance/settings')),
    item('Company & tax', 'signatory', 'Authorised signatory', 'The name under "For ZivoPlus …" on invoices.',
      fin.invoice?.signatory && fin.invoice.signatory !== 'Authorised signatory' ? 'done' : 'optional', fin.invoice?.signatory || 'Authorised signatory', page('Finance Settings → Invoices', '/admin/finance/settings')),

    // 2. Guest documents and emails
    item('Guest documents & emails', 'invoiceMode', 'Who issues the guest\'s GST invoice', 'Decides what the guest invoice says and what vouchers tell guests and hotels. Confirm the choice with your CA.',
      'done', MODE_LABEL[docs.guestInvoice.mode] || docs.guestInvoice.mode, page('Documents & Emails', '/admin/documents')),
    item('Guest documents & emails', 'invoiceSeries', 'Guest invoice number series', 'Prefix for guest invoices, numbered per year (e.g. ZIV/2026/000001).',
      'done', `${docs.guestInvoice.prefix}/${new Date().getFullYear()}/…`, page('Documents & Emails', '/admin/documents')),
    item('Guest documents & emails', 'attachments', 'Vouchers attached to booking emails', 'The guest\'s confirmation email carries the booking voucher PDF; the hotel\'s new-booking email carries the hotelier voucher.',
      'done', `Guest: ${docs.email.attachGuestVoucher ? 'on' : 'off'} · Hotel: ${docs.email.attachHotelVoucher ? 'on' : 'off'}`, page('Documents & Emails', '/admin/documents')),
    item('Guest documents & emails', 'support', 'Support contacts', 'Shown in every email footer, on vouchers and on the Help page.',
      support.email && support.phone ? 'done' : 'todo', [support.phone, support.email].filter(Boolean).join(' · ') || 'Not set', page('Platform Settings → Support', '/admin/platform-settings')),

    // 3. Delivery: email, SMS, alerts
    item('Email, SMS & alerts', 'email', 'Email sending (Resend)', 'Sends every email. The domain in EMAIL_FROM must be verified in Resend and the key must be allowed to send from it.',
      !env('RESEND_API_KEY') ? 'todo' : emailFailed > 0 && emailSent === 0 ? 'todo' : 'done',
      !env('RESEND_API_KEY') ? 'No key on the server' : `Last 24 h: ${emailSent} sent, ${emailFailed} failed${env('EMAIL_FROM') ? ` · from ${env('EMAIL_FROM')}` : ''}`, envKey('RESEND_API_KEY, EMAIL_FROM')),
    item('Email, SMS & alerts', 'adminAlerts', 'Admin alert emails', 'Where urgent alerts go (refund failed, payment not matched, property submitted).',
      env('ADMIN_ALERT_EMAILS') ? 'done' : 'todo', env('ADMIN_ALERT_EMAILS') ? `${env('ADMIN_ALERT_EMAILS').split(',').length} address(es)` : 'Not set: admins only see the in-app bell', envKey('ADMIN_ALERT_EMAILS')),
    item('Email, SMS & alerts', 'sms', 'SMS (sign-in codes, booking texts)', 'Needs an SMS provider with DLT-approved sender ID and templates in India.',
      env('SMS_PROVIDER') && env('SMS_PROVIDER') !== 'test' && (env('MSG91_AUTH_KEY') || env('TWILIO_ACCOUNT_SID')) ? 'done' : 'optional',
      env('SMS_PROVIDER') ? `Provider: ${env('SMS_PROVIDER')}` : 'Off (email codes only)', envKey('SMS_PROVIDER, MSG91_AUTH_KEY, MSG91_OTP_TEMPLATE_ID')),

    // 4. Payments and sign-in
    item('Payments & sign-in', 'razorpay', 'Razorpay payments', 'Takes guest payments. Use live keys (rzp_live_…) only on the live site.',
      razorKey.startsWith('rzp_live_') ? 'done' : razorKey ? 'info' : 'todo', razorKey ? (razorKey.startsWith('rzp_live_') ? 'Live keys' : 'Test keys') : 'No key', envKey('RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET')),
    item('Payments & sign-in', 'webhook', 'Razorpay webhook', 'Confirms payments even when a guest closes the page before returning.',
      env('RAZORPAY_WEBHOOK_SECRET') ? 'done' : 'todo', env('RAZORPAY_WEBHOOK_SECRET') ? 'Secret set' : 'Not set', envKey('RAZORPAY_WEBHOOK_SECRET')),
    item('Payments & sign-in', 'google', 'Google sign-in', 'Lets guests sign in with Google.',
      env('GOOGLE_CLIENT_ID') ? 'done' : 'optional', env('GOOGLE_CLIENT_ID') ? 'Client ID set' : 'Off', envKey('GOOGLE_CLIENT_ID')),
    item('Payments & sign-in', 'payOptions', 'Payment options', 'Part-payment share and pay-now discount offered at checkout.',
      'info', `Part-payment ${sys.partialPaymentPercent ?? 30}% · pay-now discount ${sys.prepaidDiscountPercent ?? 5}%`, page('Platform Settings → Payments', '/admin/platform-settings')),

    // 5. Offers
    item('Offers', 'signIn', 'Sign-in price', 'ZivoPlus-funded discount every signed-in guest gets (plus each hotel\'s own member price).',
      signIn > 0 ? 'done' : 'optional', signIn > 0 ? `${signIn}% off` : 'Off', page('Membership → Member plan', '/admin/membership')),
    item('Offers', 'welcome', 'First-booking offer', 'Extra discount on a new account\'s first booking, applied automatically at checkout and shown in the sign-in card.',
      welcome ? 'done' : 'optional', welcome ? `${welcome.name}: ${welcome.discountType === 'FLAT' ? `₹${Number(welcome.value)}` : `${Number(welcome.value)}%`}` : 'Off', page('Promotions', '/admin/promotions')),

    // 6. Platform and security
    item('Platform & security', 'admins', 'Super admins', 'At least two people with full access, so the console is never locked out.',
      admins >= 2 ? 'done' : 'todo', `${admins} admin account${admins === 1 ? '' : 's'}`, page('Staff & Roles', '/admin/staff')),
    item('Platform & security', 'encryption', 'Data encryption key', 'Encrypts bank details and KYC files. Keep a copy of the key in a safe place: without it they can\'t be read.',
      env('DATA_ENCRYPTION_KEY') ? 'done' : 'todo', env('DATA_ENCRYPTION_KEY') ? 'Set (created by deploy.sh)' : 'Not set', envKey('DATA_ENCRYPTION_KEY')),
    item('Platform & security', 'indexing', 'Search engine indexing', 'Keep off on staging (test data); turn on only for the live site.',
      'info', env('ALLOW_INDEXING') === 'true' ? 'On' : 'Off', envKey('ALLOW_INDEXING')),
    item('Platform & security', 'backups', 'Backups and off-site copy', 'Nightly encrypted database backups run on the server; an off-site copy (e.g. Cloudflare R2) protects against losing the server.',
      'info', 'Runs on the server (deploy.sh sets it up); the off-site copy is on hold', envKey('BACKUP_* settings (off-site, optional)')),
    item('Platform & security', 'hotels', 'Live properties', 'Properties guests can book.', liveHotels.length ? 'done' : 'todo', `${liveHotels.length} live`, page('Properties', '/admin/properties')),
  ];

  const counts = items.reduce((m, i) => ({ ...m, [i.status]: (m[i.status] || 0) + 1 }), {});
  return { items, counts, checkedAt: new Date().toISOString() };
};

export default { setupStatus };
