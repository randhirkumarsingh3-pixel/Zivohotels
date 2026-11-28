import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2, Search, Briefcase, Handshake, X, Download, CheckCircle2, PauseCircle, Ban, AlertTriangle, Settings2, Plus } from 'lucide-react';
import { adminBusinessApi } from '../../services/api';
import usePageTitle from '../../hooks/usePageTitle';
import useAccess from '../../hooks/useAccess';
import AddOrganisation, { ProfileFields } from '../components/business/AddOrganisation';
import { ROLE_OPTIONS, PROFILE_FIELDS } from '../components/business/orgFields';

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

const BOOKING_STATUS = { PENDING: 'Waiting', CONFIRMED: 'Confirmed', CHECKED_IN: 'Checked in', COMPLETED: 'Completed', CANCELLED: 'Cancelled', NO_SHOW: 'No-show' };
const OrgBookings = ({ id }) => {
  const [q, setQ] = useState({ status: '', search: '', page: 1 });
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { const t = setTimeout(() => adminBusinessApi.bookings(id, q).then(setD).catch((e) => setErr(e.message)), 200); return () => clearTimeout(t); }, [id, q]);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input value={q.search} onChange={(e) => setQ({ ...q, search: e.target.value, page: 1 })} placeholder="Booking ID or guest" aria-label="Search bookings" className="flex-1 min-w-[10rem] px-3 py-2 border border-gray-200 rounded-lg text-sm" />
        <select aria-label="Booking status" value={q.status} onChange={(e) => setQ({ ...q, status: e.target.value, page: 1 })} className="px-3 py-2 border border-gray-200 rounded-lg text-sm"><option value="">Any status</option>{Object.entries(BOOKING_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </div>
      {err && <p className="text-sm text-red-700">{err}</p>}
      {!d ? <p className="text-sm text-gray-500">Loading…</p> : d.bookings.length === 0 ? <p className="text-sm text-gray-500">No bookings{q.status || q.search ? ' match' : ' yet'}.</p> : (
        <>
          <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg text-sm">
            {d.bookings.map((b) => (
              <li key={b.id} className="p-3 flex flex-wrap justify-between gap-2">
                <span><span className="font-mono font-semibold">{b.bookingRef}</span> · {b.guestName}<span className="block text-xs text-gray-500">{b.hotel?.name}, {b.hotel?.city} · {day(b.checkIn)} → {day(b.checkOut)} · {b.rooms} room{b.rooms === 1 ? '' : 's'}{b.bookedBy ? ` · booked by ${b.bookedBy}` : ''}</span></span>
                <span className="text-right"><b>{inr(b.totalAmount)}</b><span className="block text-xs text-gray-500">{BOOKING_STATUS[b.status] || b.status}{b.commission ? ` · commission ${inr(b.commission)}` : ''}</span></span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between text-xs text-gray-600">
            <span>{d.total} booking{d.total === 1 ? '' : 's'}</span>
            <span className="flex gap-2">
              <button type="button" disabled={q.page <= 1} onClick={() => setQ({ ...q, page: q.page - 1 })} className="px-2 py-1 border rounded disabled:opacity-40">Previous</button>
              <button type="button" disabled={q.page * d.pageSize >= d.total} onClick={() => setQ({ ...q, page: q.page + 1 })} className="px-2 py-1 border rounded disabled:opacity-40">Next</button>
            </span>
          </div>
        </>
      )}
    </section>
  );
};

const ymd = (dt) => dt.toISOString().slice(0, 10);
const OrgReport = ({ id, kind }) => {
  const now = new Date();
  const [range, setRange] = useState({ from: ymd(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1))), to: ymd(now) });
  const [r, setR] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { setR(null); adminBusinessApi.report(id, range).then(setR).catch((e) => setErr(e.message)); }, [id, range]);
  const csv = async () => {
    try { const b = await adminBusinessApi.reportCsv(id, range); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `report-${range.from}-to-${range.to}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(u), 30000); } catch (e) { setErr(e.message); }
  };
  const maxV = Math.max(1, ...(r?.trend || []).map((m) => m.value));
  const Table = ({ title, rows }) => (rows?.length ? (
    <div>
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{title}</p>
      <table className="w-full text-sm"><tbody className="divide-y divide-gray-100">{rows.slice(0, 8).map((g) => <tr key={g.key}><td className="py-1.5 text-gray-800">{g.key}</td><td className="py-1.5 text-right text-gray-500">{g.bookings} · {g.roomNights} nights</td><td className="py-1.5 text-right font-semibold">{inr(g.spend)}</td></tr>)}</tbody></table>
    </div>
  ) : null);
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-gray-700">From<input type="date" className={input} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
        <label className="text-xs font-semibold text-gray-700">To<input type="date" className={input} value={range.to} min={range.from} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
        <button type="button" onClick={csv} className={`${btn} border border-gray-300 bg-white`}><Download size={14} /> CSV with GST details</button>
      </div>
      <p className="text-xs text-gray-500">Stays checking in during the period (cancelled ones left out).</p>
      {err && <p className="text-sm text-red-700">{err}</p>}
      {!r ? <p className="text-sm text-gray-500">Loading…</p> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[['Bookings', r.totals.bookings], ['Room nights', r.totals.roomNights], [kind === 'AGENCY' ? 'Sales' : 'Spend', inr(r.totals.spend)], kind === 'AGENCY' ? ['Commission (net of TDS)', inr(r.commission?.totals.net)] : ['Saved vs public price', inr(r.totals.savings)]].map(([k, v]) => <div key={k} className="rounded-lg border border-gray-200 p-2"><p className="text-xs text-gray-500">{k}</p><p className="font-bold text-gray-900">{v}</p></div>)}
          </div>
          {kind === 'CORPORATE' && r.totals.checkedAgainstPolicy > 0 && <p className="text-sm text-gray-700">{r.totals.outOfPolicy} of {r.totals.checkedAgainstPolicy} trips were outside the travel policy.</p>}
          <figure>
            <figcaption className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Booked by month (last 6 months)</figcaption>
            <div className="flex items-end gap-2 h-28" role="img" aria-label="Value booked by month">
              {r.trend.map((m) => (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] text-gray-500 tabular-nums">{m.bookings}</span>
                  <span className="w-full rounded-t bg-navy-600" style={{ height: `${Math.max(m.value ? 6 : 0, (m.value / maxV) * 80)}px` }} title={`${m.month}: ${inr(m.value)}`} />
                  <span className="text-[10px] text-gray-600">{new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' })}</span>
                </div>
              ))}
            </div>
          </figure>
          <div className="grid gap-4 sm:grid-cols-2">
            <Table title="By hotel" rows={r.byHotel} />
            <Table title="By city" rows={r.byCity} />
            <Table title={kind === 'AGENCY' ? 'By guest' : 'By traveller'} rows={r.byTraveller} />
            {kind === 'CORPORATE' && <Table title="By cost centre" rows={r.byCostCenter} />}
          </div>
        </>
      )}
    </section>
  );
};

const TABS = [['profile', 'Profile'], ['documents', 'Documents'], ['terms', 'Terms & rates'], ['account', 'Account'], ['team', 'Team'], ['bookings', 'Bookings'], ['reports', 'Reports'], ['history', 'History']];

const Detail = ({ id, onClose, onChanged }) => {
  const { can } = useAccess();
  const [d, setD] = useState(null);
  const [tab, setTab] = useState('profile');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [note, setNote] = useState('');
  const [terms, setTerms] = useState(null);
  const [entry, setEntry] = useState({ type: 'PAYMENT', amount: '', note: '', reference: '' });
  const [edit, setEdit] = useState(null);
  const [docNote, setDocNote] = useState({});
  const [member, setMember] = useState({ email: '', name: '', role: 'BOOKER' });
  const [busy, setBusy] = useState('');
  const apply = (x) => { setD(x); setTerms({ ...x.overrides }); };
  const load = useCallback(() => adminBusinessApi.get(id).then(apply).catch((e) => setErr(e.message)), [id]);
  useEffect(() => { load(); }, [load]);
  const run = async (key, fn, ok) => { setBusy(key); setErr(''); setMsg(''); try { const out = await fn(); if (out?.id === id && out.history) apply(out); else await load(); onChanged(); setMsg(ok); return true; } catch (e) { setErr(e.message); return false; } finally { setBusy(''); } };
  if (!d) return <div className="p-6 text-sm text-gray-500">{err || 'Loading…'}</div>;
  const manage = can('business.manage');
  const decide = (status, ok) => run(status, () => adminBusinessApi.decide(id, { status, note }), ok);
  const [kindLabel, KIcon] = KIND[d.kind];
  const val = (v) => (v === null || v === undefined ? '' : v);
  const setT = (k) => (e) => setTerms((t) => ({ ...t, [k]: e.target.value === '' ? null : e.target.value }));
  const toCheck = d.documents.filter((x) => !x.review).length;
  return (
    <div className="flex flex-col h-full">
      <div className="p-5 md:p-6 pb-0 space-y-3 border-b border-gray-100">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-gray-500 flex items-center gap-1.5"><KIcon size={14} aria-hidden="true" /> {kindLabel} · {d.code}</p>
            <h2 className="text-xl font-bold text-gray-900">{d.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2"><Pill s={d.status} /><span className="text-xs text-gray-500">Balance {inr(d.account.summary.balance)} · available {inr(d.account.summary.available)}{d.account.summary.overdueAmount > 0 ? ` · ${inr(d.account.summary.overdueAmount)} overdue` : ''}</span></div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div role="tablist" aria-label="Organisation" className="flex gap-1 overflow-x-auto -mx-1 px-1">
          {TABS.map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setMsg(''); setErr(''); }} className={`shrink-0 px-3 py-2.5 text-sm font-semibold border-b-2 ${tab === k ? 'border-navy-800 text-navy-900' : 'border-transparent text-gray-500 hover:text-gray-900'}`}>
              {l}{k === 'documents' && toCheck > 0 && <span className="ml-1 px-1.5 rounded-full bg-amber-100 text-amber-900 text-xs">{toCheck}</span>}{k === 'team' && <span className="ml-1 text-xs text-gray-400">{d.members.length}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="p-5 md:p-6 space-y-6 overflow-y-auto flex-1">
        {err && <p role="alert" className="text-sm px-3 py-2 rounded-lg bg-red-50 text-red-700">{err}</p>}
        {msg && <p role="status" className="text-sm px-3 py-2 rounded-lg bg-green-50 text-green-800">{msg}</p>}

        {tab === 'profile' && (<>
          <section>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold text-gray-900 text-sm">Legal, tax and contact</h3>
              {manage && !edit && <button type="button" onClick={() => setEdit(Object.fromEntries(PROFILE_FIELDS.map((k) => [k, d[k] ?? ''])))} className="text-sm font-semibold text-navy-800 underline">Edit</button>}
            </div>
            {edit ? (
              <div className="mt-3 space-y-3">
                <ProfileFields f={edit} set={(k, v) => setEdit((x) => ({ ...x, [k]: v }))} />
                <p className="text-xs text-gray-500">Changes to legal and tax details are kept in the history. Update the agreement afterwards if they changed.</p>
                <div className="flex gap-2">
                  <button type="button" disabled={!!busy} onClick={async () => { if (await run('profile', () => adminBusinessApi.profile(id, edit), 'Details saved.')) setEdit(null); }} className={`${btn} bg-navy-800 text-white`}>{busy === 'profile' && <Loader2 size={14} className="animate-spin" />} Save</button>
                  <button type="button" onClick={() => setEdit(null)} className={`${btn} border border-gray-300 bg-white`}>Cancel</button>
                </div>
              </div>
            ) : (
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                {[['Legal name', d.legalName], ['Type', d.incorporationType?.replace('_', ' ').toLowerCase()], ['PAN', d.pan], ['GSTIN', d.gstin || '—'], ['Address', `${d.address}, ${d.city}, ${d.state} ${d.pincode}`], ['Invoices to', d.billingEmail], ['Phone', d.phone], ['Website', d.website || '—'], ['Joined', day(d.createdAt)]].map(([k, v]) => <div key={k} className="contents"><dt className="text-gray-500">{k}</dt><dd className="text-gray-900 break-words">{v}</dd></div>)}
              </dl>
            )}
          </section>
          {manage && (
            <section className="rounded-xl bg-gray-50 p-4 space-y-3">
              <h3 className="font-bold text-gray-900 text-sm">Decision</h3>
              {d.statusNote && <p className="text-xs text-gray-600">Last note: {d.statusNote}</p>}
              {toCheck > 0 && ['IN_REVIEW', 'ON_HOLD'].includes(d.status) && <p className="text-xs text-amber-900 bg-amber-50 rounded px-2 py-1">{toCheck} document{toCheck === 1 ? '' : 's'} not checked yet (Documents tab).</p>}
              <label className="block text-xs font-semibold text-gray-700">Note to the organisation (needed except for approval)<textarea rows={2} className={input} value={note} onChange={(e) => setNote(e.target.value)} /></label>
              <div className="flex flex-wrap gap-2">
                {['IN_REVIEW', 'ON_HOLD', 'SUSPENDED'].includes(d.status) && <button type="button" disabled={!!busy} onClick={() => decide('ACTIVE', 'Approved: the organisation\'s admins were emailed.')} className={`${btn} bg-green-700 text-white`}><CheckCircle2 size={15} /> {d.status === 'SUSPENDED' ? 'Reactivate' : 'Approve'}</button>}
                {['IN_REVIEW', 'ACTIVE'].includes(d.status) && <button type="button" disabled={!!busy} onClick={() => decide('ON_HOLD', 'Asked for more details.')} className={`${btn} border border-gray-300 bg-white`}><AlertTriangle size={15} /> Ask for more</button>}
                {['IN_REVIEW', 'ON_HOLD'].includes(d.status) && <button type="button" disabled={!!busy} onClick={() => decide('REJECTED', 'Rejected.')} className={`${btn} border border-gray-300 bg-white text-red-700`}><Ban size={15} /> Reject</button>}
                {d.status === 'ACTIVE' && <button type="button" disabled={!!busy} onClick={() => decide('SUSPENDED', 'Suspended: bookings and top-ups are paused.')} className={`${btn} border border-gray-300 bg-white text-red-700`}><PauseCircle size={15} /> Suspend</button>}
              </div>
            </section>
          )}
        </>)}

        {tab === 'documents' && (
          <section className="space-y-3">
            <p className="text-xs text-gray-600">Open each file and mark it checked, or not acceptable with a note (their admins are told to upload it again).</p>
            {d.documents.length === 0 ? <p className="text-sm text-gray-500">None uploaded yet.</p> : (
              <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
                {d.documents.map((x) => (
                  <li key={x.id} className="p-3 space-y-2 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <button type="button" className="font-semibold text-navy-800 underline inline-flex items-center gap-1" onClick={() => openBlob(() => adminBusinessApi.documentFile(id, x.id), setErr)}><Download size={13} aria-hidden="true" /> {x.label}</button>
                        <p className="text-xs text-gray-500">{x.name} · {day(x.uploadedAt)}</p>
                      </div>
                      {x.review ? <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${x.review.status === 'VERIFIED' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>{x.review.status === 'VERIFIED' ? 'Checked' : 'Not acceptable'}{x.review.byName ? ` · ${x.review.byName}` : ''}</span> : <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-amber-50 text-amber-900">To check</span>}
                    </div>
                    {x.review?.note && <p className="text-xs text-gray-600">Note: {x.review.note}</p>}
                    {manage && (
                      <div className="flex flex-wrap items-end gap-2">
                        <button type="button" disabled={!!busy} onClick={() => run(`v-${x.id}`, () => adminBusinessApi.reviewDocument(id, x.id, { status: 'VERIFIED' }), 'Marked as checked.')} className={`${btn} border border-green-300 text-green-800 bg-white`}><CheckCircle2 size={14} /> Checked</button>
                        <input aria-label="What is wrong with it" placeholder="What is wrong (for a rejection)" value={docNote[x.id] || ''} onChange={(e) => setDocNote({ ...docNote, [x.id]: e.target.value })} className="flex-1 min-w-[10rem] px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                        <button type="button" disabled={!!busy} onClick={() => run(`r-${x.id}`, () => adminBusinessApi.reviewDocument(id, x.id, { status: 'REJECTED', note: docNote[x.id] }), 'Marked not acceptable; their admins were told.')} className={`${btn} border border-gray-300 bg-white text-red-700`}><Ban size={14} /> Not acceptable</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === 'terms' && (<>
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
          {d.kind === 'CORPORATE' && <AgreedRates orgId={id} manage={manage} active={d.status === 'ACTIVE'} />}
        </>)}

        {tab === 'account' && (
          <section className="space-y-3">
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
            <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg max-h-80 overflow-y-auto text-sm">
              {d.account.entries.length === 0 ? <li className="p-3 text-gray-500">No entries yet.</li> : d.account.entries.map((e) => (
                <li key={e.id} className="p-2.5 flex justify-between gap-3"><span><b>{e.type.toLowerCase()}</b> <span className="text-gray-500">{e.note || e.reference} · {day(e.createdAt)}</span></span><span className={e.amount > 0 ? 'text-green-700 font-semibold' : 'font-semibold'}>{e.amount > 0 ? '+' : '−'}{inr(Math.abs(e.amount))}</span></li>
              ))}
            </ul>
          </section>
        )}

        {tab === 'team' && (
          <section className="space-y-3">
            <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg text-sm">
              {d.members.map((m) => <li key={m.id} className="p-3 flex flex-wrap justify-between gap-2"><span><b>{m.user.name}</b><span className="block text-xs text-gray-500">{m.user.email}</span></span><span className="text-xs text-gray-600">{m.role.toLowerCase()}{m.status === 'PAUSED' ? ' · paused' : ''}{m.user.invited ? ' · invite not accepted yet' : ''}</span></li>)}
            </ul>
            {manage && ['ACTIVE', 'IN_REVIEW', 'ON_HOLD'].includes(d.status) && (
              <div className="rounded-xl bg-gray-50 p-4 space-y-3">
                <p className="text-sm font-semibold text-gray-900">Add someone</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <label className="text-xs font-semibold text-gray-700">Email<input type="email" className={input} value={member.email} onChange={(e) => setMember({ ...member, email: e.target.value })} /></label>
                  <label className="text-xs font-semibold text-gray-700">Name (new accounts)<input className={input} value={member.name} onChange={(e) => setMember({ ...member, name: e.target.value })} /></label>
                  <label className="text-xs font-semibold text-gray-700">Role<select className={input} value={member.role} onChange={(e) => setMember({ ...member, role: e.target.value })}>{ROLE_OPTIONS.filter(([k]) => d.kind === 'CORPORATE' || !['APPROVER', 'TRAVELLER'].includes(k)).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                </div>
                <button type="button" disabled={!!busy || !member.email} onClick={async () => { if (await run('member', () => adminBusinessApi.addMember(id, member), 'Added and emailed.')) setMember({ email: '', name: '', role: 'BOOKER' }); }} className={`${btn} bg-navy-800 text-white`}>{busy === 'member' && <Loader2 size={14} className="animate-spin" />} Add and email</button>
              </div>
            )}
          </section>
        )}

        {tab === 'bookings' && <OrgBookings id={id} />}
        {tab === 'reports' && <OrgReport id={id} kind={d.kind} />}

        {tab === 'history' && (
          <ul className="text-sm text-gray-700 space-y-1.5">{d.history.length === 0 ? <li className="text-gray-500">Nothing yet.</li> : d.history.map((h, i) => <li key={i}><span className="text-gray-500">{day(h.createdAt)}</span> · {h.action.replace(/^ORG_/, '').replace(/_/g, ' ').toLowerCase()}{h.details?.note ? `: ${h.details.note}` : ''}</li>)}</ul>
        )}
      </div>
    </div>
  );
};

const TITLES = {
  '': ['Organisations', 'Companies on ZivoPlus for Business and travel agents on ZivoPlus Partner Hub.', 'Add company or agent'],
  CORPORATE: ['ZivoPlus for Business: companies', 'Companies booking work travel: applications, KYC, terms, team, bookings and reports.', 'Add a company'],
  AGENCY: ['ZivoPlus Partner Hub: travel agents', 'Travel agents booking for their customers: applications, KYC, terms, team, bookings, commission and reports.', 'Add a travel agent'],
};

const Organisations = ({ kind: fixedKind = '' }) => {
  const [title, sub, addLabel] = TITLES[fixedKind] || TITLES[''];
  usePageTitle(title);
  const { can } = useAccess();
  const [params, setParams] = useSearchParams();
  const [kind, setKind] = useState(fixedKind);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [adding, setAdding] = useState(false);
  useEffect(() => { setKind(fixedKind); setStatus(''); }, [fixedKind]);
  const openId = params.get('id');
  const load = useCallback(() => adminBusinessApi.list({ kind, status, search }).then(setData).catch((e) => setErr(e.message)), [kind, status, search]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  const count = (k, s) => data?.counts?.[k]?.[s] || 0;
  const tiles = fixedKind
    ? [['To review', count(fixedKind, 'IN_REVIEW'), 'IN_REVIEW'], ['More details asked', count(fixedKind, 'ON_HOLD'), 'ON_HOLD'], ['Active', count(fixedKind, 'ACTIVE'), 'ACTIVE'], ['Suspended', count(fixedKind, 'SUSPENDED'), 'SUSPENDED']].map(([l, n, s]) => [l, n, fixedKind, s])
    : [['Companies to review', count('CORPORATE', 'IN_REVIEW'), 'CORPORATE', 'IN_REVIEW'], ['Agents to review', count('AGENCY', 'IN_REVIEW'), 'AGENCY', 'IN_REVIEW'], ['Active companies', count('CORPORATE', 'ACTIVE'), 'CORPORATE', 'ACTIVE'], ['Active agents', count('AGENCY', 'ACTIVE'), 'AGENCY', 'ACTIVE']];

  return (
    <div className="space-y-5 max-w-7xl">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="text-sm text-gray-600 mt-1">{sub}{data && (!data.settings.corporateEnabled || !data.settings.agencyEnabled) ? ` Online applications are closed for ${[!data.settings.corporateEnabled && 'companies', !data.settings.agencyEnabled && 'travel agents'].filter(Boolean).join(' and ')} (Business settings); you can still add them here.` : ''}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/admin/business" className="text-sm font-semibold text-navy-800 underline">Overview</Link>
          <Link to="/admin/business-settings" className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy-800 underline"><Settings2 size={15} aria-hidden="true" /> Business settings</Link>
          {can('business.manage') && <button type="button" onClick={() => setAdding(true)} className={`${btn} bg-navy-800 text-white`}><Plus size={15} aria-hidden="true" /> {addLabel}</button>}
        </div>
      </div>
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {tiles.map(([l, n, k, s]) => (
            <button key={l} type="button" onClick={() => { setKind(k); setStatus(s); }} className="text-left rounded-xl border border-gray-200 bg-white p-3 hover:border-navy-300"><p className="text-xs text-gray-500">{l}</p><p className="text-2xl font-bold text-gray-900">{n}</p></button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <label className="relative flex-1 min-w-[220px]"><span className="sr-only">Search</span><Search size={15} className="absolute left-3 top-2.5 text-gray-400" aria-hidden="true" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, code, PAN, GSTIN, email" className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm" /></label>
        {!fixedKind && <select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm"><option value="">Companies and agents</option><option value="CORPORATE">Companies</option><option value="AGENCY">Travel agents</option></select>}
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
          <div className="relative w-full max-w-3xl h-full bg-white shadow-2xl"><Detail key={openId} id={openId} onClose={() => setParams({})} onChanged={load} /></div>
        </div>
      )}
      {adding && <AddOrganisation kind={fixedKind} onClose={() => setAdding(false)} onCreated={(o) => { setAdding(false); load(); setParams({ id: o.id }); }} />}
    </div>
  );
};

export default Organisations;
