import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2, Search, Briefcase, Handshake, X, Download, CheckCircle2, PauseCircle, Ban, AlertTriangle, Settings2 } from 'lucide-react';
import { adminBusinessApi } from '../../services/api';
import usePageTitle from '../../hooks/usePageTitle';
import useAccess from '../../hooks/useAccess';

/**
 * Admin → Organisations: companies (ZivoPlus for Business) and travel agents (Partner Hub).
 * Review applications with their KYC files, approve / ask for more / reject / suspend, set each
 * one's terms (prepaid or credit, limit, days, invoice issuer; agents' pricing, markup and extra
 * commission), record bank transfers and corrections, and see their team and history.
 */
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const STATUS = { IN_REVIEW: ['bg-blue-50 text-blue-800', 'In review'], ON_HOLD: ['bg-amber-50 text-amber-900', 'More details asked'], ACTIVE: ['bg-green-50 text-green-800', 'Active'], SUSPENDED: ['bg-red-50 text-red-800', 'Suspended'], REJECTED: ['bg-gray-100 text-gray-600', 'Rejected'] };
const KIND = { CORPORATE: ['Company', Briefcase], AGENCY: ['Travel agent', Handshake] };
const input = 'mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50';
const btn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold disabled:opacity-50';
const Pill = ({ s }) => { const [c, l] = STATUS[s] || STATUS.IN_REVIEW; return <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${c}`}>{l}</span>; };
const openBlob = async (fn, setErr) => { try { const b = await fn(); const u = URL.createObjectURL(b); window.open(u, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(u), 60000); } catch (e) { setErr(e.message); } };

const RATE_STATE = { PROPOSED: ['bg-blue-50 text-blue-800', 'Waiting for the hotel'], ACTIVE: ['bg-green-50 text-green-800', 'In place'], UPCOMING: ['bg-green-50 text-green-800', 'Starts later'], EXPIRED: ['bg-gray-100 text-gray-600', 'Ended (dates passed)'], DECLINED: ['bg-red-50 text-red-800', 'Declined by the hotel'], ENDED: ['bg-gray-100 text-gray-600', 'Ended'] };
const blankRate = () => ({ hotelId: '', roomTypeId: '', kind: 'PERCENT', value: '', validFrom: new Date().toISOString().slice(0, 10), validTo: '', notes: '' });

/** Rates agreed between this company and hotels: ZivoPlus enters them, the hotel accepts. */
const AgreedRates = ({ orgId, manage, active }) => {
  const [rates, setRates] = useState(null);
  const [q, setQ] = useState('');
  const [hotels, setHotels] = useState([]);
  const [f, setF] = useState(blankRate);
  const [endNote, setEndNote] = useState({});
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const load = useCallback(() => adminBusinessApi.rates(orgId).then(setRates).catch((e) => setMsg({ ok: false, text: e.message })), [orgId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!manage || !active) return undefined;
    const t = setTimeout(() => { adminBusinessApi.rateHotels(orgId, q).then(setHotels).catch(() => {}); }, 250);
    return () => clearTimeout(t);
  }, [orgId, q, manage, active]);
  const hotel = hotels.find((h) => h.id === f.hotelId);
  const act = async (key, fn, ok) => { setBusy(key); setMsg(null); try { await fn(); await load(); setMsg({ ok: true, text: ok }); return true; } catch (e) { setMsg({ ok: false, text: e.message }); return false; } finally { setBusy(''); } };
  const propose = async () => {
    if (await act('propose', () => adminBusinessApi.proposeRate(orgId, { ...f, roomTypeId: f.roomTypeId || null, value: Number(f.value) }), 'Proposed. The hotel was told; it applies once they accept it in their extranet.')) setF(blankRate());
  };
  return (
    <section className="space-y-3">
      <h3 className="font-bold text-gray-900 text-sm">Agreed hotel rates</h3>
      <p className="text-xs text-gray-600">A rate agreed with a hotel for this company only. It applies after the hotel accepts it in its extranet; the company gets it or the hotel&apos;s general company discount, whichever is better.</p>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm px-3 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}
      {!rates ? <p className="text-sm text-gray-500">Loading…</p> : rates.length === 0 ? <p className="text-sm text-gray-500">None yet.</p> : (
        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg text-sm">
          {rates.map((r) => {
            const [c, l] = RATE_STATE[r.state] || RATE_STATE.ENDED;
            return (
              <li key={r.id} className="p-3 space-y-1.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><p className="font-semibold text-gray-900">{r.hotel.name}, {r.hotel.city}</p><p className="text-gray-700">{r.label} · {day(r.validFrom)} to {day(r.validTo)}</p></div>
                  <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${c}`}>{l}</span>
                </div>
                {r.notes && <p className="text-xs text-gray-500">Note: {r.notes}</p>}
                {r.decisionNote && <p className="text-xs text-gray-500">{r.status === 'DECLINED' ? 'Hotel' : 'Reason'}: {r.decisionNote}</p>}
                {manage && ['PROPOSED', 'ACTIVE'].includes(r.status) && r.state !== 'EXPIRED' && endNote[r.id] === undefined && (
                  <button type="button" onClick={() => setEndNote({ ...endNote, [r.id]: '' })} className="text-xs font-semibold text-red-700 underline">{r.status === 'PROPOSED' ? 'Withdraw…' : 'End early…'}</button>
                )}
                {manage && ['PROPOSED', 'ACTIVE'].includes(r.status) && r.state !== 'EXPIRED' && endNote[r.id] !== undefined && (
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-xs font-semibold text-gray-700 flex-1 min-w-[10rem]">Why it ends (told to the hotel)<input className={input} value={endNote[r.id] || ''} onChange={(e) => setEndNote({ ...endNote, [r.id]: e.target.value })} /></label>
                    <button type="button" disabled={!!busy} onClick={() => act(`end-${r.id}`, () => adminBusinessApi.endRate(orgId, r.id, endNote[r.id]), r.status === 'PROPOSED' ? 'Proposal withdrawn.' : 'Rate ended.')} className={`${btn} border border-gray-300 bg-white text-red-700`}>{r.status === 'PROPOSED' ? 'Withdraw' : 'End now'}</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {manage && active && (
        <div className="rounded-xl bg-gray-50 p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-900">Propose a rate</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-gray-700">Find the hotel<input className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hotel name or city" /></label>
            <label className="text-xs font-semibold text-gray-700">Hotel<select className={input} value={f.hotelId} onChange={(e) => setF({ ...f, hotelId: e.target.value, roomTypeId: '' })}><option value="">Choose…</option>{hotels.map((h) => <option key={h.id} value={h.id}>{h.name}, {h.city}</option>)}</select></label>
            <label className="text-xs font-semibold text-gray-700">Rooms<select className={input} value={f.roomTypeId} onChange={(e) => setF({ ...f, roomTypeId: e.target.value, kind: e.target.value ? f.kind : 'PERCENT' })} disabled={!hotel}><option value="">All room types</option>{(hotel?.roomTypes || []).map((rt) => <option key={rt.id} value={rt.id}>{rt.name}</option>)}</select></label>
            <label className="text-xs font-semibold text-gray-700">Rate<select className={input} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="PERCENT">% off the room charges</option><option value="FIXED" disabled={!f.roomTypeId}>Fixed tariff per night (one room type)</option></select></label>
            <label className="text-xs font-semibold text-gray-700">{f.kind === 'FIXED' ? 'Tariff per night before GST (₹)' : 'Discount %'}<input type="number" min={f.kind === 'FIXED' ? 300 : 1} max={f.kind === 'FIXED' ? 500000 : 60} step={f.kind === 'FIXED' ? 50 : 0.5} className={input} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-semibold text-gray-700">From<input type="date" className={input} value={f.validFrom} onChange={(e) => setF({ ...f, validFrom: e.target.value })} /></label>
              <label className="text-xs font-semibold text-gray-700">To<input type="date" className={input} value={f.validTo} min={f.validFrom} onChange={(e) => setF({ ...f, validTo: e.target.value })} /></label>
            </div>
            <label className="text-xs font-semibold text-gray-700 sm:col-span-2">Note for the hotel (optional)<input className={input} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="e.g. 400 room nights a year expected" /></label>
          </div>
          {f.kind === 'FIXED' && <p className="text-xs text-gray-500">The room&apos;s tariff per night; extra guests and meals are charged as the rate plan says.</p>}
          <button type="button" disabled={!!busy || !f.hotelId || !f.value || !f.validTo} onClick={propose} className={`${btn} bg-navy-800 text-white`}>{busy === 'propose' && <Loader2 size={14} className="animate-spin" />} Send to the hotel</button>
        </div>
      )}
    </section>
  );
};

const Detail = ({ id, onClose, onChanged }) => {
  const { can } = useAccess();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [note, setNote] = useState('');
  const [terms, setTerms] = useState(null);
  const [entry, setEntry] = useState({ type: 'PAYMENT', amount: '', note: '', reference: '' });
  const [busy, setBusy] = useState('');
  const load = useCallback(() => adminBusinessApi.get(id).then((x) => { setD(x); setTerms({ ...x.overrides }); }).catch((e) => setErr(e.message)), [id]);
  useEffect(() => { load(); }, [load]);
  const run = async (key, fn, ok) => { setBusy(key); setErr(''); setMsg(''); try { await fn(); await load(); onChanged(); setMsg(ok); } catch (e) { setErr(e.message); } finally { setBusy(''); } };
  if (!d) return <div className="p-6 text-sm text-gray-500">{err || 'Loading…'}</div>;
  const manage = can('business.manage');
  const decide = (status, ok) => run(status, () => adminBusinessApi.decide(id, { status, note }), ok);
  const [kindLabel, KIcon] = KIND[d.kind];
  const val = (v) => (v === null || v === undefined ? '' : v);
  const setT = (k) => (e) => setTerms((t) => ({ ...t, [k]: e.target.value === '' ? null : e.target.value }));
  return (
    <div className="p-5 md:p-6 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-gray-500 flex items-center gap-1.5"><KIcon size={14} aria-hidden="true" /> {kindLabel} · {d.code}</p>
          <h2 className="text-xl font-bold text-gray-900">{d.name}</h2>
          <div className="mt-1"><Pill s={d.status} /></div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-lg hover:bg-gray-100"><X size={18} /></button>
      </div>
      {err && <p role="alert" className="text-sm px-3 py-2 rounded-lg bg-red-50 text-red-700">{err}</p>}
      {msg && <p role="status" className="text-sm px-3 py-2 rounded-lg bg-green-50 text-green-800">{msg}</p>}

      <section>
        <h3 className="font-bold text-gray-900 text-sm">Legal and tax</h3>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {[['Legal name', d.legalName], ['Type', d.incorporationType?.replace('_', ' ').toLowerCase()], ['PAN', d.pan], ['GSTIN', d.gstin || '—'], ['Address', `${d.address}, ${d.city}, ${d.state} ${d.pincode}`], ['Invoices to', d.billingEmail], ['Phone', d.phone], ['Website', d.website || '—'], ['Applied', day(d.createdAt)]].map(([k, v]) => <div key={k} className="contents"><dt className="text-gray-500">{k}</dt><dd className="text-gray-900 break-words">{v}</dd></div>)}
        </dl>
      </section>

      <section>
        <h3 className="font-bold text-gray-900 text-sm">Documents ({d.documents.length})</h3>
        {d.documents.length === 0 ? <p className="text-sm text-gray-500 mt-1">None uploaded yet.</p> : (
          <ul className="mt-2 space-y-1">{d.documents.map((x) => <li key={x.id}><button type="button" className="text-sm text-navy-800 underline inline-flex items-center gap-1" onClick={() => openBlob(() => adminBusinessApi.documentFile(id, x.id), setErr)}><Download size={13} aria-hidden="true" /> {x.label}</button> <span className="text-xs text-gray-500">{x.name} · {day(x.uploadedAt)}</span></li>)}</ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="font-bold text-gray-900 text-sm">Agreement</h3>
        {d.agreement ? (
          <p className="text-sm text-gray-700">{d.agreement.reference} · {d.agreement.status === 'SIGNED' ? `signed by ${d.agreement.signerName} on ${day(d.agreement.signedAt)}${d.agreement.signatureMethod === 'AADHAAR_ESIGN' ? ' (Aadhaar eSign)' : ''}` : `waiting for their signature${d.agreement.leegalityStatus ? ` (Leegality: ${d.agreement.leegalityStatus.toLowerCase()})` : ''}`}</p>
        ) : <p className="text-sm text-gray-500">Not prepared yet (prepared when the organisation is approved).</p>}
        <div className="flex flex-wrap gap-2">
          {d.agreement && <button type="button" onClick={() => openBlob(() => adminBusinessApi.agreementPdf(id), setErr)} className={`${btn} border border-gray-300 bg-white`}><Download size={14} /> PDF</button>}
          {d.agreement?.signatureMethod === 'AADHAAR_ESIGN' && <button type="button" onClick={() => openBlob(() => adminBusinessApi.agreementPdf(id, true), setErr)} className={`${btn} border border-gray-300 bg-white`}><Download size={14} /> Audit trail</button>}
          {manage && d.agreement?.status !== 'SIGNED' && ['ACTIVE', 'SUSPENDED'].includes(d.status) && <button type="button" disabled={!!busy} onClick={() => run('agr', () => adminBusinessApi.prepareAgreement(id), 'Agreement prepared with the current terms and sent to their admins.')} className={`${btn} border border-gray-300 bg-white`}>{d.agreement ? 'Update and resend' : 'Prepare and send'}</button>}
          {manage && d.agreement?.leegalityStatus === 'SENT' && <button type="button" disabled={!!busy} onClick={() => run('agr-r', () => adminBusinessApi.refreshAgreement(id), 'Checked with Leegality.')} className={`${btn} border border-gray-300 bg-white`}>Check Leegality</button>}
        </div>
      </section>

      {manage && (
        <section className="rounded-xl bg-gray-50 p-4 space-y-3">
          <h3 className="font-bold text-gray-900 text-sm">Decision</h3>
          {d.statusNote && <p className="text-xs text-gray-600">Last note: {d.statusNote}</p>}
          <label className="block text-xs font-semibold text-gray-700">Note to the organisation (needed except for approval)<textarea rows={2} className={input} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <div className="flex flex-wrap gap-2">
            {['IN_REVIEW', 'ON_HOLD', 'SUSPENDED'].includes(d.status) && <button type="button" disabled={!!busy} onClick={() => decide('ACTIVE', 'Approved: the organisation\'s admins were emailed.')} className={`${btn} bg-green-700 text-white`}><CheckCircle2 size={15} /> {d.status === 'SUSPENDED' ? 'Reactivate' : 'Approve'}</button>}
            {['IN_REVIEW', 'ACTIVE'].includes(d.status) && <button type="button" disabled={!!busy} onClick={() => decide('ON_HOLD', 'Asked for more details.')} className={`${btn} border border-gray-300 bg-white`}><AlertTriangle size={15} /> Ask for more</button>}
            {['IN_REVIEW', 'ON_HOLD'].includes(d.status) && <button type="button" disabled={!!busy} onClick={() => decide('REJECTED', 'Rejected.')} className={`${btn} border border-gray-300 bg-white text-red-700`}><Ban size={15} /> Reject</button>}
            {d.status === 'ACTIVE' && <button type="button" disabled={!!busy} onClick={() => decide('SUSPENDED', 'Suspended: bookings and top-ups are paused.')} className={`${btn} border border-gray-300 bg-white text-red-700`}><PauseCircle size={15} /> Suspend</button>}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h3 className="font-bold text-gray-900 text-sm">Terms <span className="font-normal text-gray-500">(blank: the default from Business settings)</span></h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-gray-700">Payment<select className={input} disabled={!manage} value={val(terms.paymentMode)} onChange={setT('paymentMode')}><option value="">Default</option><option value="PREPAID">Prepaid wallet only</option><option value="CREDIT">Credit line</option><option value="BOTH">Wallet first, then credit</option></select></label>
          <label className="text-xs font-semibold text-gray-700">Credit limit (₹)<input type="number" min="0" className={input} disabled={!manage} value={val(terms.creditLimit)} onChange={setT('creditLimit')} /></label>
          <label className="text-xs font-semibold text-gray-700">Credit days<input type="number" min="1" max="120" className={input} disabled={!manage} value={val(terms.creditDays)} onChange={setT('creditDays')} placeholder={`Default ${d.terms.creditDays}`} /></label>
          <label className="text-xs font-semibold text-gray-700">GST invoice issued by<select className={input} disabled={!manage} value={val(terms.invoiceMode)} onChange={setT('invoiceMode')}><option value="">Default</option><option value="ON_BEHALF">ZivoPlus, on behalf of the hotel</option><option value="ZIVO_SUPPLIER">ZivoPlus as supplier</option><option value="HOTEL_ISSUES">The hotel</option></select></label>
          {d.kind === 'AGENCY' && <>
            <label className="text-xs font-semibold text-gray-700">Pricing<select className={input} disabled={!manage} value={val(terms.pricingModel)} onChange={setT('pricingModel')}><option value="">Default</option><option value="NET">Net rates + markup</option><option value="COMMISSION">Commission</option><option value="BOTH">Both (agent chooses)</option></select></label>
            <label className="text-xs font-semibold text-gray-700">Default markup %<input type="number" min="0" step="0.5" className={input} disabled={!manage} value={val(terms.defaultMarkupPct)} onChange={setT('defaultMarkupPct')} placeholder={`Default ${d.terms.defaultMarkupPct}`} /></label>
            <label className="text-xs font-semibold text-gray-700">Extra commission from ZivoPlus %<input type="number" min="0" max="30" step="0.5" className={input} disabled={!manage} value={val(terms.extraCommissionPct)} onChange={setT('extraCommissionPct')} placeholder={`Default ${d.terms.extraCommissionPct}`} /></label>
          </>}
          <label className="text-xs font-semibold text-gray-700">Tier<input className={input} disabled={!manage} value={val(terms.tier)} onChange={setT('tier')} /></label>
        </div>
        {manage && <button type="button" disabled={!!busy} onClick={() => run('terms', () => adminBusinessApi.terms(id, { ...terms, creditLimit: terms.creditLimit ?? 0 }), 'Terms saved.')} className={`${btn} bg-navy-800 text-white`}>{busy === 'terms' && <Loader2 size={14} className="animate-spin" />} Save terms</button>}
      </section>

      {d.kind === 'CORPORATE' && <AgreedRates orgId={id} manage={manage} active={d.status === 'ACTIVE'} />}

      <section className="space-y-3">
        <h3 className="font-bold text-gray-900 text-sm">Account</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
          {[['Balance', inr(d.account.summary.balance)], ['Available', inr(d.account.summary.available)], ['Credit used', inr(d.account.summary.creditUsed)], ['Overdue', inr(d.account.summary.overdueAmount)]].map(([k, v]) => <div key={k} className="rounded-lg border border-gray-200 p-2"><p className="text-xs text-gray-500">{k}</p><p className="font-bold text-gray-900">{v}</p></div>)}
        </div>
        {can('finance.manage') && (
          <div className="grid gap-2 sm:grid-cols-[auto_1fr_1fr] sm:items-end">
            <label className="text-xs font-semibold text-gray-700">Entry<select className={input} value={entry.type} onChange={(e) => setEntry({ ...entry, type: e.target.value })}><option value="PAYMENT">Payment received (+)</option><option value="REFUND">Refund of balance (−)</option><option value="ADJUSTMENT">Adjustment (±)</option></select></label>
            <label className="text-xs font-semibold text-gray-700">Amount (₹)<input type="number" step="0.01" className={input} value={entry.amount} onChange={(e) => setEntry({ ...entry, amount: e.target.value })} /></label>
            <label className="text-xs font-semibold text-gray-700">Bank / UTR reference<input className={input} value={entry.reference} onChange={(e) => setEntry({ ...entry, reference: e.target.value })} /></label>
            <label className="text-xs font-semibold text-gray-700 sm:col-span-3">What it is for<input className={input} value={entry.note} onChange={(e) => setEntry({ ...entry, note: e.target.value })} /></label>
            <button type="button" disabled={!!busy || !entry.amount} onClick={() => run('entry', async () => { await adminBusinessApi.entry(id, { ...entry, amount: Number(entry.amount) }); setEntry({ type: 'PAYMENT', amount: '', note: '', reference: '' }); }, 'Recorded.')} className={`${btn} bg-navy-800 text-white sm:col-span-3 justify-self-start`}>Record</button>
          </div>
        )}
        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg max-h-64 overflow-y-auto text-sm">
          {d.account.entries.length === 0 ? <li className="p-3 text-gray-500">No entries yet.</li> : d.account.entries.map((e) => (
            <li key={e.id} className="p-2.5 flex justify-between gap-3"><span><b>{e.type.toLowerCase()}</b> <span className="text-gray-500">{e.note || e.reference} · {day(e.createdAt)}</span></span><span className={e.amount > 0 ? 'text-green-700 font-semibold' : 'font-semibold'}>{e.amount > 0 ? '+' : '−'}{inr(Math.abs(e.amount))}</span></li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="font-bold text-gray-900 text-sm">Team ({d.members.length})</h3>
        <ul className="mt-2 text-sm space-y-1">{d.members.map((m) => <li key={m.id}>{m.user.name} <span className="text-gray-500">{m.user.email} · {m.role.toLowerCase()}{m.status === 'PAUSED' ? ' · paused' : ''}{m.user.invited ? ' · invited' : ''}</span></li>)}</ul>
      </section>

      <section>
        <h3 className="font-bold text-gray-900 text-sm">History</h3>
        <ul className="mt-2 text-xs text-gray-600 space-y-1">{d.history.map((h, i) => <li key={i}>{day(h.createdAt)} · {h.action.replace(/^ORG_/, '').replace(/_/g, ' ').toLowerCase()}{h.details?.note ? `: ${h.details.note}` : ''}</li>)}</ul>
      </section>
    </div>
  );
};

const Organisations = () => {
  usePageTitle('Organisations');
  const [params, setParams] = useSearchParams();
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const openId = params.get('id');
  const load = useCallback(() => adminBusinessApi.list({ kind, status, search }).then(setData).catch((e) => setErr(e.message)), [kind, status, search]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  const count = (k, s) => data?.counts?.[k]?.[s] || 0;

  return (
    <div className="space-y-5 max-w-7xl">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organisations</h1>
          <p className="text-sm text-gray-600 mt-1">Companies on ZivoPlus for Business and travel agents on Partner Hub.{data && (!data.settings.corporateEnabled || !data.settings.agencyEnabled) ? ` Applications are closed for ${[!data.settings.corporateEnabled && 'companies', !data.settings.agencyEnabled && 'travel agents'].filter(Boolean).join(' and ')}.` : ''}</p>
        </div>
        <Link to="/admin/business-settings" className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy-800 underline"><Settings2 size={15} aria-hidden="true" /> Business settings</Link>
      </div>
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[['Companies to review', count('CORPORATE', 'IN_REVIEW'), 'CORPORATE', 'IN_REVIEW'], ['Agents to review', count('AGENCY', 'IN_REVIEW'), 'AGENCY', 'IN_REVIEW'], ['Active companies', count('CORPORATE', 'ACTIVE'), 'CORPORATE', 'ACTIVE'], ['Active agents', count('AGENCY', 'ACTIVE'), 'AGENCY', 'ACTIVE']].map(([l, n, k, s]) => (
            <button key={l} type="button" onClick={() => { setKind(k); setStatus(s); }} className="text-left rounded-xl border border-gray-200 bg-white p-3 hover:border-navy-300"><p className="text-xs text-gray-500">{l}</p><p className="text-2xl font-bold text-gray-900">{n}</p></button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <label className="relative flex-1 min-w-[220px]"><span className="sr-only">Search</span><Search size={15} className="absolute left-3 top-2.5 text-gray-400" aria-hidden="true" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, code, PAN, GSTIN, email" className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm" /></label>
        <select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm"><option value="">Companies and agents</option><option value="CORPORATE">Companies</option><option value="AGENCY">Travel agents</option></select>
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm"><option value="">Any status</option>{Object.entries(STATUS).map(([k, [, l]]) => <option key={k} value={k}>{l}</option>)}</select>
      </div>
      {err && <p className="text-sm text-red-700">{err}</p>}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase"><tr><th className="text-left px-4 py-3">Organisation</th><th className="text-left px-4 py-3">Status</th><th className="text-left px-4 py-3">Terms</th><th className="text-right px-4 py-3">Balance</th><th className="text-right px-4 py-3">Available</th><th className="text-left px-4 py-3">Applied</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {!data ? <tr><td colSpan={6} className="p-6 text-gray-500"><Loader2 size={15} className="inline animate-spin" /> Loading…</td></tr>
              : data.organisations.length === 0 ? <tr><td colSpan={6} className="p-6 text-gray-500">No organisations match.</td></tr>
                : data.organisations.map((o) => {
                  const [kl, KI] = KIND[o.kind];
                  return (
                    <tr key={o.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setParams({ id: o.id })}>
                      <td className="px-4 py-3"><button type="button" className="font-semibold text-gray-900 text-left hover:underline" onClick={(e) => { e.stopPropagation(); setParams({ id: o.id }); }}>{o.name}</button><span className="block text-xs text-gray-500 flex items-center gap-1"><KI size={12} aria-hidden="true" /> {kl} · {o.code} · {o.members} member{o.members === 1 ? '' : 's'}</span></td>
                      <td className="px-4 py-3"><Pill s={o.status} />{o.account.overdueAmount > 0 && <span className="block text-xs text-red-700 mt-1">{inr(o.account.overdueAmount)} overdue</span>}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{o.terms.paymentMode.toLowerCase()}{o.terms.creditAllowed ? ` · ${inr(o.terms.creditLimit)} / ${o.terms.creditDays}d` : ''}{o.kind === 'AGENCY' ? ` · ${o.terms.pricingModel.toLowerCase()}` : ''}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">{inr(o.account.balance)}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">{inr(o.account.available)}</td>
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{day(o.createdAt)}</td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
      {openId && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Organisation">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-navy-950/40" onClick={() => setParams({})} />
          <div className="relative w-full max-w-2xl h-full bg-white overflow-y-auto shadow-2xl"><Detail id={openId} onClose={() => setParams({})} onChanged={load} /></div>
        </div>
      )}
    </div>
  );
};

export default Organisations;
