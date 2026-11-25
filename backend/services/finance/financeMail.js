/**
 * Monthly finance documents for hotel owners: on the 1st, last month's commission invoices are
 * issued and each owner is emailed the Tax Invoice, Statement of Account and the Excel workbook
 * (Admin → Finance → Settings turns either step off). Admins can also send them by hand.
 */
import prisma from '../../config/db.js';
import { queueService } from '../queueService.js';
import { emailLayout, inr } from '../emailLayout.js';
import { getFinanceSettings } from './financeSettings.js';
import docs from './financeDocuments.js';

const RUN_KEY = 'finance_monthly_last';

/** Queues the month's documents to a hotel's owner. Returns the address used (or null). */
export const emailOwner = async (hotelId, period) => {
  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId }, select: { name: true, owner: { select: { email: true, name: true } } } });
  const to = hotel?.owner?.email;
  if (!to) return null;
  const st = await docs.statementFor(hotelId, period);
  const list = await prisma.financeDocument.findMany({ where: { hotelId, period }, select: { id: true, kind: true, number: true } });
  const t = st.totals;
  const html = await emailLayout({
    title: `Your ZivoPlus statement for ${st.label}`,
    body: `<p>Hi ${hotel.owner.name || 'there'},</p><p>Attached are ${hotel.name}'s documents for ${st.label}: ${list.length ? 'the commission tax invoice, ' : ''}the statement of account and an Excel workbook with every stay, TCS, TDS and payout.</p>`,
    rows: [
      ['Stays settled', String(t.stays)],
      ['Commission + GST', inr(t.commission + t.commissionGst)],
      ['TCS + TDS deducted', inr(t.tcs + t.tds)],
      ['Paid out', inr(t.paid)],
      ['Closing balance', `${t.closing < 0 ? '−' : ''}${inr(Math.abs(t.closing))}`],
      ...list.map((d) => [d.kind === 'INVOICE' ? 'Tax invoice' : 'Credit note', d.number]),
    ],
    cta: { href: '/extranet/finance', label: 'Open Finance Hub' },
    note: st.live ? 'Keep these for your GST and income-tax records. Questions? Reply to partners@zivoplus.com.' : 'These are test documents (invoicing is not live yet) and are not tax invoices.',
  });
  await queueService.enqueue('email', 'SEND_FINANCE_DOCUMENTS', {
    to,
    subject: `${st.live ? '' : '[TEST] '}ZivoPlus statement and invoice · ${hotel.name} · ${st.label}`,
    html,
    financeAttachments: [
      ...list.map((d) => ({ type: 'document', id: d.id })),
      { type: 'statement', hotelId, period },
      { type: 'workbook', hotelId, period },
    ],
  });
  if (list.length) await prisma.financeDocument.updateMany({ where: { id: { in: list.map((d) => d.id) } }, data: { emailedAt: new Date() } });
  return to;
};

/** Hotels with anything to report for a month (stays settled, documents or payouts). */
export const hotelsWithActivity = async (period) => {
  const range = docs.periodRange(period);
  const [a, b, c] = await Promise.all([
    prisma.settlement.findMany({ where: { createdAt: range }, distinct: ['hotelId'], select: { hotelId: true } }),
    prisma.financeDocument.findMany({ where: { period }, distinct: ['hotelId'], select: { hotelId: true } }),
    prisma.payout.findMany({ where: { createdAt: range }, distinct: ['hotelId'], select: { hotelId: true } }),
  ]);
  return [...new Set([...a, ...b, ...c].map((x) => x.hotelId))];
};

/** Builds the files attached to a finance email (called by the email worker). */
export const buildAttachments = async (list = []) => {
  const out = [];
  for (const a of list) {
    if (a.type === 'document') {
      const d = await prisma.financeDocument.findUnique({ where: { id: a.id } });
      if (d) out.push({ filename: `${d.number.replace(/\//g, '-')}.pdf`, content: await docs.documentPdf(d) });
    } else if (a.type === 'statement') {
      out.push({ filename: `ZivoPlus-Statement-${a.period}.pdf`, content: await docs.statementPdf(a.hotelId, a.period) });
    } else if (a.type === 'guestVoucher' || a.type === 'hotelVoucher') {
      // Booking vouchers attached to the booking emails (Admin → Settings → Documents & emails)
      const v = await import('../voucherService.js');
      const data = await v.loadVoucherData(a.bookingId);
      if (data) {
        const html = a.type === 'guestVoucher' ? v.guestVoucherHtml(data) : v.hotelierVoucherHtml(data, await v.hotelierFigures(data));
        out.push({ filename: `${a.type === 'guestVoucher' ? 'Booking' : 'Hotelier-Voucher'}-${data.booking.bookingRef}.pdf`, content: await v.renderPdf(html, data) });
      }
    } else if (a.type === 'agreement') {
      // The property listing agreement (signed copy after signing)
      const { agreementPdf } = await import('../agreements/agreementService.js');
      const ag = await prisma.agreement.findUnique({ where: { hotelId: a.hotelId }, select: { reference: true } });
      const pdf = await agreementPdf(a.hotelId);
      if (pdf) out.push({ filename: `ZivoPlus-Agreement-${ag?.reference || a.hotelId.slice(0, 8)}.pdf`, content: pdf });
    } else if (a.type === 'agreementAudit') {
      // Leegality's audit trail for an agreement signed with Aadhaar eSign
      const { agreementPdf } = await import('../agreements/agreementService.js');
      const ag = await prisma.agreement.findUnique({ where: { hotelId: a.hotelId }, select: { reference: true } });
      const pdf = await agreementPdf(a.hotelId, { auditTrail: true });
      if (pdf) out.push({ filename: `ZivoPlus-Agreement-${ag?.reference || a.hotelId.slice(0, 8)}-audit-trail.pdf`, content: pdf });
    } else if (a.type === 'workbook') {
      out.push({ filename: `ZivoPlus-Statement-${a.period}.xlsx`, content: await docs.statementWorkbook(a.hotelId, a.period) });
    }
  }
  return out;
};

/** The 1st of the month (from 06:00 India time): issue last month's invoices, email owners. Once per month. */
export const runMonthly = async ({ force = false } = {}) => {
  const now = new Date(Date.now() + 330 * 60000);
  if (!force && (now.getUTCDate() !== 1 || now.getUTCHours() < 6)) return null;
  const period = docs.previousPeriod();
  const last = await prisma.systemConfig.findUnique({ where: { key: RUN_KEY } }).catch(() => null);
  if (!force && last?.value?.period === period) return null;
  const settings = await getFinanceSettings();
  const issued = settings.automation.issueMonthly ? await docs.issueInvoices({ period }) : [];
  let emailed = 0;
  if (settings.automation.emailOwners) {
    for (const hotelId of await hotelsWithActivity(period)) {
      try { if (await emailOwner(hotelId, period)) emailed += 1; } catch (err) { console.error('[Finance] email failed for', hotelId, err.message); }
    }
  }
  const value = { period, at: new Date().toISOString(), issued: issued.length, emailed };
  await prisma.systemConfig.upsert({ where: { key: RUN_KEY }, update: { value }, create: { key: RUN_KEY, value, description: 'Last monthly finance documents run' } });
  console.log(`[Finance] ${period}: ${issued.length} invoice(s) issued, ${emailed} owner email(s) queued`);
  return value;
};

export const startFinanceDocumentsJob = () => {
  const run = () => runMonthly().catch((err) => console.error('[Finance] monthly documents failed:', err.message));
  const first = setTimeout(run, 60 * 1000); first.unref?.();
  const timer = setInterval(run, 30 * 60 * 1000); timer.unref?.();
  return timer;
};

export default { emailOwner, hotelsWithActivity, buildAttachments, runMonthly, startFinanceDocumentsJob };
