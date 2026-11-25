import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import {
  Briefcase, Handshake, Loader2, CheckCircle2, AlertTriangle, Clock, Ban, Wallet, Users, FileText, Building2,
  Upload, Download, Trash2, Plus, IndianRupee, Percent, ReceiptText, ShieldCheck, BedDouble, CalendarCheck,
} from 'lucide-react';
import { businessApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import usePageTitle from '../hooks/usePageTitle';
import { BookTab, BookingsTab, CommissionTab, BrandingForm } from './business/PartnerBooking';
import { PolicyTab, ApprovalsTab, ReportsTab, MemberPolicyFields } from './business/CompanyTools';

/**
 * ZivoPlus for Business (/business, companies) and ZivoPlus Partner Hub (/partners, travel agents).
 * Signed out: what it is. Signed in without an organisation: apply. Member: the organisation's
 * status, account (wallet + credit, top-ups, statement), team and roles, details and KYC files.
 */
const COPY = {
  CORPORATE: {
    name: 'ZivoPlus for Business', icon: Briefcase, path: '/business', who: 'company', open: 'Open a company account',
    tagline: 'Hotel stays for your company\'s travel, on one business account.',
    points: [
      [Percent, 'Company rates', 'Discounts at hotels that offer them to businesses, shown only to your team.'],
      [ReceiptText, 'GST invoices in your company\'s name', 'For your input tax credit, with your GSTIN on every invoice.'],
      [Wallet, 'One account', 'Prepaid wallet, or a credit line with monthly settlement once approved.'],
      [Users, 'Your team, your rules', 'Admins, bookers, approvers, finance and travellers, each with their own login.'],
    ],
  },
  AGENCY: {
    name: 'ZivoPlus Partner Hub', icon: Handshake, path: '/partners', who: 'agency', open: 'Open an agency account',
    tagline: 'Book ZivoPlus hotels for your customers and earn on every stay.',
    points: [
      [IndianRupee, 'Net rates or commission', 'Net rates with your own markup, or the public price with commission paid monthly.'],
      [Wallet, 'Wallet and credit', 'Top up online or by bank transfer; credit for approved agents.'],
      [ReceiptText, 'Proper paperwork', 'GST invoices, and commission statements with TDS under section 194H.'],
      [Users, 'Your staff', 'Every agent in your agency with their own login and role.'],
    ],
  },
};
const TYPES = [['PVT_LTD', 'Private limited company'], ['PUBLIC_LTD', 'Public limited company'], ['LLP', 'LLP'], ['PARTNERSHIP', 'Partnership firm'], ['INDIVIDUAL', 'Proprietorship (individual)'], ['HUF', 'HUF'], ['TRUST', 'Trust / society']];
const ROLE_NAMES = { ADMIN: 'Admin', BOOKER: 'Booker', APPROVER: 'Approver', FINANCE: 'Finance', TRAVELLER: 'Traveller' };
const MODE = { PREPAID: 'Prepaid wallet', CREDIT: 'Credit line', BOTH: 'Wallet first, then credit' };
const INVOICE = { ON_BEHALF: 'Hotel as supplier (issued by ZivoPlus on its behalf)', ZIVO_SUPPLIER: 'ZivoPlus as supplier', HOTEL_ISSUES: 'The hotel issues it' };
const PRICING = { NET: 'Net rates + your markup', COMMISSION: 'Public price + commission', BOTH: 'Net rates or commission, your choice per booking' };
const ENTRY = { TOPUP: 'Top-up', BOOKING: 'Booking', REFUND: 'Refund', PAYMENT: 'Payment received', ADJUSTMENT: 'Adjustment', COMMISSION: 'Commission', TDS: 'TDS' };

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const input = 'mt-1 w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base sm:text-sm disabled:bg-gray-50 disabled:text-gray-500';
const btn = 'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold disabled:opacity-50';
const Note = ({ msg }) => (msg ? <p role={msg.ok ? 'status' : 'alert'} className={`text-sm px-3 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p> : null);

const loadRazorpay = () => new Promise((resolve) => {
  if (window.Razorpay) return resolve(true);
  const s = document.createElement('script');
  s.src = 'https://checkout.razorpay.com/v1/checkout.js';
  s.onload = () => resolve(true); s.onerror = () => resolve(false);
  document.body.appendChild(s);
});
const openBlob = async (fn, setMsg) => {
  try { const b = await fn(); const u = URL.createObjectURL(b); window.open(u, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(u), 60000); } catch (e) { setMsg({ ok: false, text: e.message }); }
};

// ─── Signed out / applying ───────────────────────────────────────────────────
const Hero = ({ kind, children }) => {
  const c = COPY[kind]; const Icon = c.icon;
  return (
    <div className="space-y-8">
      <div className="rounded-3xl p-6 md:p-10 text-white bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 shadow-xl">
        <p className="text-sm font-bold uppercase tracking-wider opacity-80 flex items-center gap-2"><Icon size={16} aria-hidden="true" /> {c.name}</p>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight mt-2 max-w-2xl">{c.tagline}</h1>
        <div className="grid sm:grid-cols-2 gap-4 mt-8">
          {c.points.map(([I, t, d]) => (
            <div key={t} className="flex gap-3"><I size={20} className="shrink-0 mt-0.5 text-brand-300" aria-hidden="true" /><div><p className="font-bold">{t}</p><p className="text-sm opacity-80">{d}</p></div></div>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
};

const ApplyForm = ({ kind, info, onDone }) => {
  const c = COPY[kind];
  const requireGstin = kind === 'AGENCY' ? info?.agency?.requireGstin : info?.corporate?.requireGstin;
  const [f, setF] = useState({ incorporationType: kind === 'AGENCY' ? 'INDIVIDUAL' : 'PVT_LTD' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try { await businessApi.apply({ ...f, kind }); window.scrollTo({ top: 0 }); onDone(); } catch (err) { setMsg({ ok: false, text: err.message }); } finally { setBusy(false); }
  };
  const field = (k, label, props = {}) => <label className="block text-sm font-semibold text-gray-800">{label}<input className={input} value={f[k] || ''} onChange={set(k)} {...props} /></label>;
  return (
    <form onSubmit={submit} className="bg-white border border-gray-200 rounded-2xl p-5 md:p-8 space-y-5" aria-labelledby="apply-h">
      <div>
        <h2 id="apply-h" className="text-xl font-bold text-gray-900">Apply for {c.name}</h2>
        <p className="text-sm text-gray-600 mt-1">Use the {c.who}&apos;s legal details as on its PAN and GST certificate. We review every application, usually within 2 working days.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {field('name', kind === 'AGENCY' ? 'Agency name' : 'Company name', { required: true, autoComplete: 'organization' })}
        {field('legalName', 'Legal name', { required: true, placeholder: 'As on the PAN card' })}
        <label className="block text-sm font-semibold text-gray-800">Type of business
          <select className={input} value={f.incorporationType} onChange={set('incorporationType')}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        {field('pan', 'PAN', { required: true, maxLength: 10, style: { textTransform: 'uppercase' }, placeholder: 'ABCDE1234F' })}
        {field('gstin', `GSTIN${requireGstin ? '' : ' (optional)'}`, { required: Boolean(requireGstin), maxLength: 15, style: { textTransform: 'uppercase' } })}
        {field('billingEmail', 'Email for invoices and statements', { required: true, type: 'email' })}
        {field('phone', 'Phone', { required: true, type: 'tel', autoComplete: 'tel' })}
        {field('website', 'Website (optional)', { type: 'url', placeholder: 'https://' })}
        <div className="md:col-span-2">{field('address', 'Registered address', { required: true, autoComplete: 'street-address' })}</div>
        {field('city', 'City', { required: true })}
        {field('state', 'State', { required: true, placeholder: 'As in the GSTIN' })}
        {field('pincode', 'PIN code', { required: true, inputMode: 'numeric', maxLength: 6 })}
      </div>
      <Note msg={msg} />
      <button type="submit" disabled={busy} className={`${btn} bg-brand-600 hover:bg-brand-700 text-white px-6`}>{busy && <Loader2 size={15} className="animate-spin" />} Submit application</button>
      <p className="text-xs text-gray-500">You become this {c.who}&apos;s admin on ZivoPlus. After approval you can invite your colleagues.</p>
    </form>
  );
};

// ─── Member dashboard ────────────────────────────────────────────────────────
const STATUS = {
  IN_REVIEW: [Clock, 'bg-blue-50 border-blue-200 text-blue-900', 'In review', 'ZivoPlus is reviewing your application. Upload your documents (Documents tab) to speed it up.'],
  ON_HOLD: [AlertTriangle, 'bg-amber-50 border-amber-200 text-amber-950', 'More details needed', 'Update your details or documents as asked below; we\'ll review it again.'],
  ACTIVE: [CheckCircle2, 'bg-green-50 border-green-200 text-green-900', 'Approved', null],
  SUSPENDED: [Ban, 'bg-red-50 border-red-200 text-red-900', 'Suspended', 'Bookings and top-ups are paused. Contact ZivoPlus support.'],
  REJECTED: [Ban, 'bg-red-50 border-red-200 text-red-900', 'Not approved', null],
};

const Overview = ({ org }) => {
  const t = org.terms; const a = org.account;
  const rows = [
    ['Payment', MODE[t.paymentMode]], t.creditAllowed && ['Credit limit', inr(t.creditLimit)], t.creditAllowed && ['Pay credit bookings within', `${t.creditDays} days`],
    ['GST invoices', INVOICE[t.invoiceMode]],
    org.kind === 'AGENCY' && ['Pricing', PRICING[t.pricingModel]], org.kind === 'AGENCY' && ['Default markup', `${t.defaultMarkupPct}%`],
    org.kind === 'AGENCY' && t.extraCommissionPct > 0 && ['Extra commission from ZivoPlus', `${t.extraCommissionPct}%`], org.kind === 'AGENCY' && ['TDS on commission (194H)', `${t.tdsPct}%`],
  ].filter(Boolean);
  return (
    <div className="space-y-5">
      {a && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl p-5 bg-navy-900 text-white"><p className="text-xs uppercase tracking-wider opacity-70 font-bold">Available to spend</p><p className="text-3xl font-black mt-1">{inr(a.available)}</p>{a.creditOnHold && <p className="text-xs mt-2 text-amber-200">Credit on hold: {inr(a.overdueAmount)} overdue</p>}</div>
          <div className="rounded-2xl p-5 bg-white border border-gray-200"><p className="text-xs uppercase tracking-wider text-gray-500 font-bold">Wallet balance</p><p className="text-2xl font-black text-gray-900 mt-1">{inr(a.walletBalance)}</p></div>
          <div className="rounded-2xl p-5 bg-white border border-gray-200"><p className="text-xs uppercase tracking-wider text-gray-500 font-bold">Credit used</p><p className="text-2xl font-black text-gray-900 mt-1">{inr(a.creditUsed)}{a.creditLimit ? <span className="text-sm font-semibold text-gray-500"> of {inr(a.creditLimit)}</span> : null}</p>{a.nextDueAt && <p className="text-xs text-gray-500 mt-1">Next due {day(a.nextDueAt)}</p>}</div>
        </div>
      )}
      <section className="bg-white border border-gray-200 rounded-2xl p-5">
        <h2 className="font-bold text-gray-900">Your terms</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 text-sm">{rows.map(([k, v]) => <div key={k} className="flex justify-between gap-3 border-b border-gray-100 py-1.5"><dt className="text-gray-600">{k}</dt><dd className="font-semibold text-gray-900 text-right">{v}</dd></div>)}</dl>
        <p className="text-xs text-gray-500 mt-3">Set by ZivoPlus for your account. Ask your ZivoPlus contact to change them.</p>
      </section>
      {org.status === 'ACTIVE' && <p className="text-sm text-gray-600 flex items-center gap-2"><ShieldCheck size={16} className="text-brand-700" aria-hidden="true" /> {org.kind === 'AGENCY' ? 'Book hotels at your agent rates in the Book tab; give customers vouchers with your agency\'s name.' : 'Book stays at your company rates in the Book tab.'}</p>}
    </div>
  );
};

const AccountTab = ({ org, user, onChange }) => {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const load = useCallback(() => businessApi.account(org.id, page).then(setData).catch((e) => setMsg({ ok: false, text: e.message })), [org.id, page]);
  useEffect(() => { load(); }, [load]);
  const topup = async (e) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      if (!(await loadRazorpay())) throw new Error('The payment window could not load. Check your connection and try again.');
      const r = await businessApi.startTopup(org.id, Number(amount));
      await new Promise((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: r.keyId || import.meta.env.VITE_RAZORPAY_KEY_ID, amount: r.order.amount, currency: r.order.currency, order_id: r.order.id,
          name: 'ZivoPlus', description: `Top-up · ${org.code}`, prefill: { name: user?.name, email: user?.email },
          handler: async (resp) => { try { await businessApi.confirmTopup(org.id, resp); resolve(); } catch (err) { reject(err); } },
          modal: { ondismiss: () => resolve('closed') },
        });
        rzp.on('payment.failed', (x) => reject(new Error(x?.error?.description || 'The payment failed.')));
        rzp.open();
      });
      setAmount(''); await load(); onChange();
      setMsg({ ok: true, text: 'Top-up received. It may take a moment to show if the window was closed early.' });
    } catch (err) { setMsg({ ok: false, text: err.message }); } finally { setBusy(false); }
  };
  if (!data) return <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Loading…</p>;
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  return (
    <div className="space-y-5">
      {org.status === 'ACTIVE' && org.can['account.topup'] && (
        <form onSubmit={topup} className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-end gap-3">
          <label className="text-sm font-semibold text-gray-800 flex-1">Top up your wallet (₹)
            <input className={input} type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 25000" required />
          </label>
          <button type="submit" disabled={busy || !amount} className={`${btn} bg-brand-600 hover:bg-brand-700 text-white`}>{busy ? <Loader2 size={15} className="animate-spin" /> : <IndianRupee size={15} />} Pay online</button>
        </form>
      )}
      {org.status === 'ACTIVE' && <p className="text-xs text-gray-600">Paying by bank transfer? Send it to ZivoPlus with your account number <b>{org.code}</b> in the reference; we add it to your balance when it arrives.</p>}
      <Note msg={msg} />
      <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <h2 className="font-bold text-gray-900 px-5 py-4 border-b border-gray-100">Statement</h2>
        {data.entries.length === 0 ? <p className="p-5 text-sm text-gray-500">No entries yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase"><tr><th className="text-left px-4 py-2">Date</th><th className="text-left px-4 py-2">Entry</th><th className="text-right px-4 py-2">Amount</th><th className="text-right px-4 py-2">Balance</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {data.entries.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">{day(e.createdAt)}</td>
                    <td className="px-4 py-2.5"><span className="font-semibold text-gray-900">{ENTRY[e.type] || e.type}</span><span className="block text-xs text-gray-500">{e.note || e.reference}{e.dueAt ? ` · due ${day(e.dueAt)}` : ''}</span></td>
                    <td className={`px-4 py-2.5 text-right font-semibold whitespace-nowrap ${e.amount > 0 ? 'text-green-700' : 'text-gray-900'}`}>{e.amount > 0 ? '+' : '−'}{inr(Math.abs(e.amount))}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap text-gray-600">{inr(e.balanceAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && <div className="flex justify-end gap-2 p-3 border-t border-gray-100"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className={`${btn} border border-gray-300 py-1.5`}>Newer</button><button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className={`${btn} border border-gray-300 py-1.5`}>Older</button></div>}
      </section>
    </div>
  );
};

const TeamTab = ({ org, roles }) => {
  const [rows, setRows] = useState(null);
  const [f, setF] = useState({ role: 'TRAVELLER' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const manage = org.can['members.manage'];
  const [grades, setGrades] = useState([]);
  const load = useCallback(() => businessApi.members(org.id).then(setRows).catch((e) => setMsg({ ok: false, text: e.message })), [org.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (org.kind === 'CORPORATE') businessApi.policy(org.id).then((p) => setGrades(p.grades || [])).catch(() => {}); }, [org.id, org.kind]);
  const act = async (fn, ok) => { setMsg(null); try { await fn(); await load(); if (ok) setMsg({ ok: true, text: ok }); } catch (e) { setMsg({ ok: false, text: e.message }); } };
  const invite = async (e) => {
    e.preventDefault(); setBusy(true);
    await act(() => businessApi.invite(org.id, f), `Invitation sent to ${f.email}.`);
    setF({ role: f.role }); setBusy(false);
  };
  return (
    <div className="space-y-5">
      {manage && org.status === 'ACTIVE' && (
        <form onSubmit={invite} className="bg-white border border-gray-200 rounded-2xl p-5 grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
          <label className="text-sm font-semibold text-gray-800">Work email<input className={input} type="email" required value={f.email || ''} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
          <label className="text-sm font-semibold text-gray-800">Name<input className={input} value={f.name || ''} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="If they're new to ZivoPlus" /></label>
          <label className="text-sm font-semibold text-gray-800">Role<select className={input} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{Object.keys(ROLE_NAMES).map((r) => <option key={r} value={r}>{ROLE_NAMES[r]}</option>)}</select></label>
          <button type="submit" disabled={busy} className={`${btn} bg-navy-800 text-white`}><Plus size={15} /> Invite</button>
          <p className="md:col-span-4 text-xs text-gray-500">{roles?.[f.role]}</p>
        </form>
      )}
      {manage && org.status !== 'ACTIVE' && <p className="text-sm text-gray-600">You can invite your colleagues once ZivoPlus approves your organisation.</p>}
      <Note msg={msg} />
      <ul className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
        {!rows ? <li className="p-5 text-sm text-gray-500">Loading…</li> : rows.map((m) => (
          <li key={m.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0 space-y-1"><p className="font-semibold text-gray-900">{m.user.name}{m.user.invited && <span className="ml-2 text-xs font-semibold text-amber-700">invited</span>}{m.status === 'PAUSED' && <span className="ml-2 text-xs font-semibold text-gray-500">paused</span>}</p><p className="text-sm text-gray-600 break-all">{m.user.email}</p><MemberPolicyFields org={org} member={m} members={rows} grades={grades} onChange={(body) => act(() => businessApi.updateMember(org.id, m.id, body))} /></div>
            {manage ? (
              <div className="flex flex-wrap items-center gap-2">
                <select aria-label={`Role of ${m.user.name}`} className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm" value={m.role} onChange={(e) => act(() => businessApi.updateMember(org.id, m.id, { role: e.target.value }))}>{Object.keys(ROLE_NAMES).map((r) => <option key={r} value={r}>{ROLE_NAMES[r]}</option>)}</select>
                <button type="button" className="text-sm font-semibold text-gray-700 underline" onClick={() => act(() => businessApi.updateMember(org.id, m.id, { status: m.status === 'PAUSED' ? 'ACTIVE' : 'PAUSED' }))}>{m.status === 'PAUSED' ? 'Resume' : 'Pause'}</button>
                <button type="button" aria-label={`Remove ${m.user.name}`} className="p-1.5 text-gray-500 hover:text-red-600" onClick={() => { if (window.confirm(`Remove ${m.user.name}?`)) act(() => businessApi.removeMember(org.id, m.id)); }}><Trash2 size={15} /></button>
              </div>
            ) : <span className="text-sm font-semibold text-gray-700">{ROLE_NAMES[m.role]}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
};

const DetailsTab = ({ org, onSaved }) => {
  const open = ['IN_REVIEW', 'ON_HOLD'].includes(org.status);
  const editable = org.can['org.edit'] && (open || org.status === 'ACTIVE');
  const [f, setF] = useState(() => ({ ...org }));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const lockedField = (k) => !editable || (!open && !['name', 'billingEmail', 'phone', 'website'].includes(k));
  const field = (k, label, props = {}) => <label className="block text-sm font-semibold text-gray-800">{label}<input className={input} value={f[k] || ''} onChange={set(k)} disabled={lockedField(k)} {...props} /></label>;
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    const keys = open ? ['name', 'legalName', 'incorporationType', 'pan', 'gstin', 'address', 'city', 'state', 'pincode', 'billingEmail', 'phone', 'website'] : ['name', 'billingEmail', 'phone', 'website'];
    try { await businessApi.update(org.id, Object.fromEntries(keys.map((k) => [k, f[k] ?? '']))); setMsg({ ok: true, text: org.status === 'ON_HOLD' ? 'Saved and sent back to ZivoPlus for review.' : 'Saved.' }); onSaved(); } catch (err) { setMsg({ ok: false, text: err.message }); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={save} className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
      {!open && <p className="text-xs text-gray-600">Legal, tax and address details are on your agreement and invoices: to change them, write to ZivoPlus support.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {field('name', 'Name')}{field('legalName', 'Legal name')}
        <label className="block text-sm font-semibold text-gray-800">Type of business<select className={input} value={f.incorporationType || ''} onChange={set('incorporationType')} disabled={lockedField('incorporationType')}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        {field('pan', 'PAN')}{field('gstin', 'GSTIN')}{field('billingEmail', 'Email for invoices', { type: 'email' })}{field('phone', 'Phone', { type: 'tel' })}{field('website', 'Website')}
        <div className="md:col-span-2">{field('address', 'Registered address')}</div>
        {field('city', 'City')}{field('state', 'State')}{field('pincode', 'PIN code')}
      </div>
      <Note msg={msg} />
      {editable && <button type="submit" disabled={busy} className={`${btn} bg-navy-800 text-white`}>{busy && <Loader2 size={15} className="animate-spin" />} Save</button>}
    </form>
  );
};

const DocumentsTab = ({ org, types, onChange }) => {
  const manage = org.can['documents.manage'];
  const [type, setType] = useState('PAN_CARD');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const upload = (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setMsg({ ok: false, text: 'The file is larger than 10 MB.' }); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      setBusy(true); setMsg(null);
      try { await businessApi.addDocument(org.id, { type, fileName: file.name, file: reader.result }); setMsg({ ok: true, text: `${types?.[type] || 'Document'} uploaded.` }); onChange(); } catch (err) { setMsg({ ok: false, text: err.message }); } finally { setBusy(false); }
    };
    reader.readAsDataURL(file);
  };
  return (
    <div className="space-y-5">
      {manage && !['SUSPENDED', 'REJECTED'].includes(org.status) && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-end gap-3">
          <label className="text-sm font-semibold text-gray-800 flex-1">Document<select className={input} value={type} onChange={(e) => setType(e.target.value)}>{Object.entries(types || {}).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className={`${btn} bg-navy-800 text-white cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''}`}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Upload PDF, JPG or PNG<input type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" onChange={upload} /></label>
        </div>
      )}
      <Note msg={msg} />
      <ul className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
        {org.documents.length === 0 ? <li className="p-5 text-sm text-gray-500">No documents yet. Upload your PAN card, GST certificate and proof of business.</li> : org.documents.map((d) => (
          <li key={d.id} className="p-4 flex items-center gap-3">
            <FileText size={18} className="text-gray-400 shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0"><p className="font-semibold text-gray-900 text-sm">{d.label}</p><p className="text-xs text-gray-500 truncate">{d.name} · {day(d.uploadedAt)}</p></div>
            {manage && <button type="button" aria-label={`Open ${d.name}`} className="p-1.5 text-gray-600" onClick={() => openBlob(() => businessApi.documentFile(org.id, d.id), setMsg)}><Download size={15} /></button>}
            {manage && org.status !== 'ACTIVE' && <button type="button" aria-label={`Remove ${d.name}`} className="p-1.5 text-gray-500 hover:text-red-600" onClick={async () => { try { await businessApi.removeDocument(org.id, d.id); onChange(); } catch (e) { setMsg({ ok: false, text: e.message }); } }}><Trash2 size={15} /></button>}
          </li>
        ))}
      </ul>
      <p className="text-xs text-gray-500">Stored encrypted; only your organisation&apos;s admins and ZivoPlus&apos; review team can open them.</p>
    </div>
  );
};

const Dashboard = ({ orgId, info, user }) => {
  const [org, setOrg] = useState(null);
  const [err, setErr] = useState('');
  const [params] = useSearchParams();
  const [tab, setTab] = useState(() => params.get('tab') || 'overview');
  const load = useCallback(() => businessApi.get(orgId).then(setOrg).catch((e) => setErr(e.message)), [orgId]);
  useEffect(() => { load(); }, [load]);
  if (!org) return <p className="text-sm text-gray-500 flex items-center gap-2">{err || <><Loader2 size={16} className="animate-spin" /> Loading…</>}</p>;
  const c = COPY[org.kind]; const Icon = c.icon;
  const [SIcon, scls, slabel, stext] = STATUS[org.status] || STATUS.IN_REVIEW;
  const live = org.status === 'ACTIVE';
  const tabs = [['overview', 'Overview', Building2], live && org.can['bookings.create'] && ['book', 'Book', BedDouble], live && ['bookings', 'Bookings', CalendarCheck], org.can['account.view'] && ['account', 'Account', Wallet], live && org.kind === 'AGENCY' && org.can['account.view'] && ['commission', 'Commission', Percent], live && org.kind === 'CORPORATE' && org.myRole !== 'TRAVELLER' && ['approvals', 'Approvals', CheckCircle2], live && org.kind === 'CORPORATE' && org.can['account.view'] && ['reports', 'Reports', ReceiptText], org.kind === 'CORPORATE' && ['policy', 'Policy', ShieldCheck], org.can['members.view'] && ['team', 'Team', Users], ['details', 'Details', Briefcase], org.can['documents.manage'] && ['documents', 'Documents', FileText]].filter(Boolean);
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <p className="text-brand-700 font-bold uppercase tracking-wider text-sm flex items-center gap-1.5"><Icon size={16} aria-hidden="true" /> {c.name}</p>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight mt-1">{org.name}</h1>
          <p className="text-sm text-gray-600">Account {org.code} · you are {ROLE_NAMES[org.myRole]?.toLowerCase()}</p>
        </div>
      </div>
      <div role="status" className={`rounded-2xl border px-5 py-4 flex gap-3 ${scls}`}>
        <SIcon size={20} className="shrink-0 mt-0.5" aria-hidden="true" />
        <div className="text-sm"><p className="font-bold">{slabel}</p>{stext && <p>{stext}</p>}{org.statusNote && org.status !== 'ACTIVE' && <p className="mt-1"><b>Note from ZivoPlus:</b> {org.statusNote}</p>}</div>
      </div>
      <div role="tablist" aria-label="Sections" className="flex gap-1 overflow-x-auto border-b border-gray-200">
        {tabs.map(([k, l, I]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap ${tab === k ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-600 hover:text-gray-900'}`}><I size={15} aria-hidden="true" /> {l}</button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'overview' && <Overview org={org} />}
        {tab === 'book' && <BookTab org={org} onBooked={load} />}
        {tab === 'bookings' && <BookingsTab org={org} onChange={load} />}
        {tab === 'commission' && <CommissionTab org={org} />}
        {tab === 'approvals' && <ApprovalsTab org={org} onChange={load} />}
        {tab === 'reports' && <ReportsTab org={org} />}
        {tab === 'policy' && <PolicyTab org={org} />}
        {tab === 'account' && <AccountTab org={org} user={user} onChange={load} />}
        {tab === 'team' && <TeamTab org={org} roles={info?.roles} />}
        {tab === 'details' && <div className="space-y-5"><DetailsTab org={org} onSaved={load} />{org.kind === 'AGENCY' && org.can['org.edit'] && <BrandingForm org={org} onSaved={load} />}</div>}
        {tab === 'documents' && <DocumentsTab org={org} types={info?.documentTypes} onChange={load} />}
      </div>
    </div>
  );
};

const BusinessPortal = ({ kind = 'CORPORATE' }) => {
  const c = COPY[kind];
  usePageTitle(c.name);
  const { user } = useAuth();
  const location = useLocation();
  const [info, setInfo] = useState(null);
  const [mine, setMine] = useState(undefined);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    try {
      setInfo(await businessApi.info());
      setMine(user && user.role === 'CUSTOMER' ? await businessApi.mine() : []);
    } catch (e) { setErr(e.message); setMine([]); }
  }, [user]);
  useEffect(() => { load(); }, [load]);

  const membership = (mine || []).find((m) => m.organisation.kind === kind && m.organisation.status !== 'REJECTED') || (mine || []).find((m) => m.organisation.kind === kind);
  const open = kind === 'AGENCY' ? info?.agency?.enabled : info?.corporate?.enabled;

  let body;
  if (mine === undefined) body = <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading…</p>;
  else if (membership && membership.memberStatus === 'ACTIVE') body = <Dashboard orgId={membership.organisation.id} info={info} user={user} />;
  else if (membership) body = <Hero kind={kind}><p className="text-sm text-gray-700">Your access to {membership.organisation.name} is paused. Ask its admin.</p></Hero>;
  else if (!user) {
    body = (
      <Hero kind={kind}>
        <div className="bg-white border border-gray-200 rounded-2xl p-5 md:p-8 flex flex-col md:flex-row md:items-center gap-4 justify-between">
          <div><h2 className="text-xl font-bold text-gray-900">{open ? c.open : 'Opening soon'}</h2><p className="text-sm text-gray-600 mt-1">{open ? 'Sign in or create a ZivoPlus account, then apply with your business details.' : `${c.name} isn't taking applications yet. Already invited? Sign in.`}</p></div>
          <div className="flex gap-2">
            <Link to="/login" state={{ from: location }} className={`${btn} bg-brand-600 hover:bg-brand-700 text-white px-6`}>Sign in</Link>
            {open && <Link to="/signup" state={{ from: location }} className={`${btn} border border-gray-300 bg-white`}>Create account</Link>}
          </div>
        </div>
      </Hero>
    );
  } else if (user.role !== 'CUSTOMER') {
    body = <Hero kind={kind}><p className="text-sm text-gray-700 bg-white border border-gray-200 rounded-2xl p-5">You&apos;re signed in with a hotel or ZivoPlus staff account. Sign in with a separate ZivoPlus guest account (your work email) to apply.</p></Hero>;
  } else if (!open) {
    body = <Hero kind={kind}><p className="text-sm text-gray-700 bg-white border border-gray-200 rounded-2xl p-5">{c.name} isn&apos;t taking applications yet. Please check back soon.</p></Hero>;
  } else {
    body = <Hero kind={kind}><ApplyForm kind={kind} info={info} onDone={load} /></Hero>;
  }

  return (
    <div className="pt-24 pb-20 bg-gray-50 min-h-screen">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {err && <p className="text-sm text-red-700 mb-4">{err}</p>}
        {body}
      </div>
    </div>
  );
};

export default BusinessPortal;
