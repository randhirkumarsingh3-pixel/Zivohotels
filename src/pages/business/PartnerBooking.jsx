import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, BedDouble, Download, CheckCircle2, XCircle, IndianRupee, Clock, ArrowLeft, Palette } from 'lucide-react';
import { businessApi, getHotelById } from '../../services/api';

/**
 * ZivoPlus for Business / Partner Hub: booking at business rates (Book), the organisation's
 * bookings (Bookings), commission statement (agents) and voucher branding (agents).
 * Prices come from the server (POST /business/:orgId/quote): the website's price for the stay,
 * then the business rate.
 */
const inr = (n) => `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`;
const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const ymd = (d) => d.toISOString().slice(0, 10);
const plusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const input = 'mt-1 w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base sm:text-sm';
const btn = 'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold disabled:opacity-50';
const MEAL = { EP: 'Room only', CP: 'With breakfast', MAP: 'Breakfast + one meal', AP: 'All meals' };
const STATUS = { PENDING: ['bg-amber-50 text-amber-900', 'Held: pay to confirm'], CONFIRMED: ['bg-green-50 text-green-800', 'Confirmed'], CHECKED_IN: ['bg-blue-50 text-blue-800', 'Checked in'], COMPLETED: ['bg-gray-100 text-gray-700', 'Checked out'], CANCELLED: ['bg-red-50 text-red-700', 'Cancelled'], NO_SHOW: ['bg-red-50 text-red-700', 'No-show'] };
const Note = ({ msg }) => (msg ? <p role={msg.ok ? 'status' : 'alert'} className={`text-sm px-3 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p> : null);
const openBlob = async (fn, setMsg) => {
  try { const b = await fn(); const u = URL.createObjectURL(b); window.open(u, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(u), 60000); } catch (e) { setMsg({ ok: false, text: e.message }); }
};

// ─── Book ────────────────────────────────────────────────────────────────────
export const BookTab = ({ org, onBooked, prefill = null }) => {
  const agency = org.kind === 'AGENCY';
  const [hotels, setHotels] = useState(null);
  const [q, setQ] = useState(prefill?.city || '');
  const [stay, setStay] = useState(() => (prefill
    ? { checkIn: String(prefill.checkIn).slice(0, 10), checkOut: String(prefill.checkOut).slice(0, 10), rooms: prefill.rooms || 1, adults: prefill.adults || 1, children: 0 }
    : { checkIn: plusDays(7), checkOut: plusDays(8), rooms: 1, adults: 2, children: 0 }));
  const [hotel, setHotel] = useState(null);
  const [pick, setPick] = useState(null); // { roomTypeId, ratePlanId }
  const [pricing, setPricing] = useState({ model: '', markupPct: '' });
  const [quote, setQuote] = useState(null);
  const [traveller, setTraveller] = useState({ guestName: prefill?.traveller || '', guestPhone: '', customerEmail: '', clientReference: '', travellerMemberId: prefill?.travellerMemberId || '', policyReason: '' });
  const [colleagues, setColleagues] = useState([]);
  const forOthers = !agency && org.myRole !== 'TRAVELLER';
  useEffect(() => { if (forOthers) businessApi.members(org.id).then((ms) => setColleagues(ms.filter((x) => x.status === 'ACTIVE'))).catch(() => {}); }, [org.id, forOthers]);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const [done, setDone] = useState(null);

  useEffect(() => { businessApi.rates(org.id).then(setHotels).catch((e) => setMsg({ ok: false, text: e.message })); }, [org.id]);
  // Hotels with a rate agreed for the company first
  const shown = useMemo(() => (hotels || []).filter((h) => !q || `${h.hotelName} ${h.city}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => Number(Boolean(b.agreedRates?.length)) - Number(Boolean(a.agreedRates?.length))), [hotels, q]);

  const openHotel = async (h) => {
    setBusy('hotel'); setMsg(null); setQuote(null); setPick(null); setDone(null);
    try {
      const d = await getHotelById(h.hotelId);
      setHotel({ ...d, offer: h.offer });
      setPricing({ model: h.offer.kind === 'AGENCY' ? h.offer.models[0] : '', markupPct: h.offer.defaultMarkupPct ?? '' });
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(''); }
  };
  const body = useCallback(() => ({
    hotelId: hotel.id, checkIn: stay.checkIn, checkOut: stay.checkOut,
    roomLines: Array.from({ length: Number(stay.rooms) || 1 }, () => ({ roomTypeId: pick.roomTypeId, ratePlanId: pick.ratePlanId, adults: Number(stay.adults) || 1, children: Number(stay.children) || 0 })),
    ...(agency ? { model: pricing.model, markupPct: pricing.model === 'NET' && pricing.markupPct !== '' ? Number(pricing.markupPct) : undefined } : {}),
    ...(!agency && traveller.travellerMemberId ? { travellerMemberId: traveller.travellerMemberId } : {}),
    ...(prefill?.id ? { tripRequestId: prefill.id } : {}),
  }), [hotel, stay, pick, pricing, agency, traveller.travellerMemberId, prefill?.id]);

  const getQuote = async () => {
    setBusy('quote'); setMsg(null); setQuote(null);
    try { setQuote(await businessApi.quote(org.id, body())); } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(''); }
  };
  useEffect(() => { if (hotel && pick) getQuote(); }, [pick, pricing.model, traveller.travellerMemberId]); // eslint-disable-line react-hooks/exhaustive-deps

  const book = async (hold) => {
    setBusy(hold ? 'hold' : 'book'); setMsg(null);
    try {
      const { travellerMemberId: _t, ...details } = traveller;
      const b = await businessApi.book(org.id, { ...body(), ...details, hold });
      setDone(b); onBooked?.();
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(''); }
  };

  if (done) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
        <p className="flex items-center gap-2 text-lg font-bold text-gray-900"><CheckCircle2 className="text-green-700" aria-hidden="true" /> {done.business?.approval?.status === 'PENDING' ? 'Sent for approval' : done.status === 'PENDING' ? 'Held' : 'Booked'}: {done.hotel.name}</p>
        <p className="text-sm text-gray-700">{done.bookingRef} · {day(done.checkIn)} to {day(done.checkOut)} · {done.guestName}. {done.business?.approval?.status === 'PENDING' ? `The rooms are held until ${new Date(done.heldUntil).toLocaleString('en-IN')}. It is confirmed and paid when approved; you'll get an email either way.` : done.status === 'PENDING' ? `Pay from your account by ${new Date(done.heldUntil).toLocaleString('en-IN')} (Bookings tab), or the rooms are released.` : `${inr(done.total)} paid from your account. The confirmation was emailed to you.`}</p>
        <div className="flex flex-wrap gap-2">
          {agency && <button type="button" className={`${btn} bg-navy-800 text-white`} onClick={() => openBlob(() => businessApi.voucher(org.id, done.id, 'NONE'), setMsg)}><Download size={15} /> Voucher for your customer</button>}
          {agency && done.business?.sellAmount && <button type="button" className={`${btn} border border-gray-300`} onClick={() => openBlob(() => businessApi.voucher(org.id, done.id, 'SELL'), setMsg)}><Download size={15} /> Voucher with your price ({inr(done.business.sellAmount)})</button>}
          {!agency && <button type="button" className={`${btn} bg-navy-800 text-white`} onClick={() => openBlob(() => businessApi.voucher(org.id, done.id, 'NONE'), setMsg)}><Download size={15} /> Voucher</button>}
          <button type="button" className={`${btn} border border-gray-300`} onClick={() => { setDone(null); setQuote(null); setPick(null); setTraveller({ guestName: '', guestPhone: '', customerEmail: '', clientReference: '' }); }}>Book another</button>
        </div>
        <Note msg={msg} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {prefill && <p className="text-sm px-4 py-3 rounded-xl bg-blue-50 text-blue-900">Booking a trip request: <b>{prefill.traveller}</b>, {prefill.city}, {String(prefill.checkIn).slice(0, 10)} to {String(prefill.checkOut).slice(0, 10)} · {prefill.purpose}{prefill.notes ? ` · ${prefill.notes}` : ''}</p>}
      <section className="bg-white border border-gray-200 rounded-2xl p-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-sm font-semibold text-gray-800">Check-in<input type="date" className={input} min={plusDays(0)} value={stay.checkIn} onChange={(e) => { setStay({ ...stay, checkIn: e.target.value }); setQuote(null); }} /></label>
        <label className="text-sm font-semibold text-gray-800">Check-out<input type="date" className={input} min={stay.checkIn} value={stay.checkOut} onChange={(e) => { setStay({ ...stay, checkOut: e.target.value }); setQuote(null); }} /></label>
        <label className="text-sm font-semibold text-gray-800">Rooms<input type="number" min="1" max="8" className={input} value={stay.rooms} onChange={(e) => { setStay({ ...stay, rooms: e.target.value }); setQuote(null); }} /></label>
        <label className="text-sm font-semibold text-gray-800">Adults per room<input type="number" min="1" max="6" className={input} value={stay.adults} onChange={(e) => { setStay({ ...stay, adults: e.target.value }); setQuote(null); }} /></label>
        <label className="text-sm font-semibold text-gray-800">Children per room<input type="number" min="0" max="4" className={input} value={stay.children} onChange={(e) => { setStay({ ...stay, children: e.target.value }); setQuote(null); }} /></label>
      </section>

      {!hotel ? (
        <section className="space-y-3">
          <label className="relative block"><span className="sr-only">Find a hotel or city</span><Search size={16} className="absolute left-3 top-3 text-gray-400" aria-hidden="true" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hotel or city" className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-base sm:text-sm" /></label>
          {!hotels ? <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Loading hotels…</p>
            : shown.length === 0 ? <p className="text-sm text-gray-600 bg-white border border-gray-200 rounded-2xl p-5">{hotels.length ? 'No hotel matches.' : `No hotel offers ${agency ? 'agent' : 'company'} rates yet. Hotels join from their extranet; check back soon.`}</p>
              : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {shown.map((h) => (
                    <li key={h.hotelId}>
                      <button type="button" onClick={() => openHotel(h)} disabled={busy === 'hotel'} className="w-full text-left bg-white border border-gray-200 rounded-2xl p-4 hover:border-brand-300">
                        <p className="font-bold text-gray-900">{h.hotelName}</p>
                        <p className="text-sm text-gray-600">{h.city}</p>
                        {(h.offer.kind !== 'CORPORATE' || h.offer.discountPct > 0) && <p className="text-sm font-semibold text-brand-700 mt-2">{h.offer.kind === 'CORPORATE' ? `${h.offer.discountPct}% company discount` : h.offer.models.includes('NET') ? `${h.offer.tradeDiscountPct}% off on net rates` : `${(h.offer.tradeDiscountPct + h.offer.extraCommissionPct).toFixed(1).replace(/\.0$/, '')}% commission`}</p>}
                        {(h.agreedRates || []).map((r) => (
                          <p key={r.id} className="mt-2 inline-flex flex-wrap items-center gap-1.5 text-xs font-semibold text-green-800 bg-green-50 rounded px-2 py-1 mr-1">
                            Agreed rate: {r.label} · {r.state === 'UPCOMING' ? 'from' : 'until'} {new Date(`${r.state === 'UPCOMING' ? r.validFrom : r.validTo}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        ))}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
        </section>
      ) : (
        <section className="space-y-4">
          <button type="button" onClick={() => { setHotel(null); setQuote(null); setPick(null); }} className="text-sm font-semibold text-gray-700 inline-flex items-center gap-1"><ArrowLeft size={15} /> All hotels</button>
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <h2 className="text-xl font-bold text-gray-900">{hotel.name}</h2>
            <p className="text-sm text-gray-600">{hotel.location}, {hotel.city} · check-in {hotel.checkInTime || '14:00'}, check-out {hotel.checkOutTime || '11:00'}</p>
            <ul className="mt-4 space-y-2">
              {(hotel.roomTypes || []).filter((rt) => rt.isActive !== false).flatMap((rt) => (rt.ratePlans || []).filter((rp) => rp.isActive !== false).map((rp) => {
                const sel = pick?.ratePlanId === rp.id;
                return (
                  <li key={rp.id}>
                    <button type="button" onClick={() => setPick({ roomTypeId: rt.id, ratePlanId: rp.id })} className={`w-full text-left rounded-xl border p-3 flex items-center gap-3 ${sel ? 'border-brand-600 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <BedDouble size={18} className="text-gray-500 shrink-0" aria-hidden="true" />
                      <span className="flex-1"><span className="block font-semibold text-gray-900">{rt.name} · {rp.name}</span><span className="block text-xs text-gray-600">{MEAL[rp.mealPlan] || 'Room only'} · up to {rt.maxOccupancy || 2} guests</span></span>
                      {sel && busy === 'quote' && <Loader2 size={15} className="animate-spin" />}
                    </button>
                  </li>
                );
              }))}
            </ul>
          </div>

          {agency && pick && (
            <div className="bg-white border border-gray-200 rounded-2xl p-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              {hotel.offer.models.length > 1 && (
                <label className="text-sm font-semibold text-gray-800">Pricing<select className={input} value={pricing.model} onChange={(e) => setPricing({ ...pricing, model: e.target.value })}><option value="NET">Net rate + my markup</option><option value="COMMISSION">Public price + commission</option></select></label>
              )}
              {pricing.model === 'NET' && <label className="text-sm font-semibold text-gray-800">My markup %<input type="number" min="0" max={hotel.offer.maxMarkupPct} step="0.5" className={input} value={pricing.markupPct} onChange={(e) => setPricing({ ...pricing, markupPct: e.target.value })} /></label>}
              {pricing.model === 'NET' && <button type="button" onClick={getQuote} disabled={busy === 'quote'} className={`${btn} border border-gray-300`}>Update price</button>}
            </div>
          )}

          {quote && (
            <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
              <form onSubmit={(e) => { e.preventDefault(); book(false); }} className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
                <h3 className="font-bold text-gray-900">Lead traveller</h3>
                {forOthers && (
                  <label className="block text-sm font-semibold text-gray-800">Travelling<select className={input} value={traveller.travellerMemberId} onChange={(e) => { const m = colleagues.find((x) => x.id === e.target.value); setTraveller({ ...traveller, travellerMemberId: e.target.value, guestName: m ? m.user.name : traveller.guestName }); }}><option value="">Me</option>{colleagues.map((m) => <option key={m.id} value={m.id}>{m.user.name}{m.grade ? ` (${m.grade.toLowerCase()})` : ''}</option>)}</select></label>
                )}
                {quote.policy?.enabled && (
                  <p className={`text-sm px-3 py-2 rounded-lg ${quote.policy.within ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900'}`}>{quote.policy.within ? `Within policy: ${inr(quote.policy.perNight)} a night (limit ${inr(quote.policy.cap)} for ${quote.policy.gradeName}).` : `Over policy: ${inr(quote.policy.perNight)} a night, limit ${inr(quote.policy.cap)} for ${quote.policy.gradeName}${quote.policy.metro ? ' in metro cities' : ''}.`}{quote.needsApproval ? ' This stay needs approval.' : ''}</p>
                )}
                {quote.policy?.enabled && !quote.policy.within && quote.policy.requireReason && (
                  <label className="block text-sm font-semibold text-gray-800">Reason for the exception<input className={input} required value={traveller.policyReason} onChange={(e) => setTraveller({ ...traveller, policyReason: e.target.value })} placeholder="e.g. Client office is next door" /></label>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-semibold text-gray-800">Name (as on ID)<input className={input} required value={traveller.guestName} onChange={(e) => setTraveller({ ...traveller, guestName: e.target.value })} /></label>
                  <label className="text-sm font-semibold text-gray-800">Phone<input type="tel" className={input} required value={traveller.guestPhone} onChange={(e) => setTraveller({ ...traveller, guestPhone: e.target.value })} /></label>
                  <label className="text-sm font-semibold text-gray-800">Email (optional)<input type="email" className={input} value={traveller.customerEmail} onChange={(e) => setTraveller({ ...traveller, customerEmail: e.target.value })} /></label>
                  <label className="text-sm font-semibold text-gray-800">{agency ? 'Your reference (optional)' : 'Cost centre / reference (optional)'}<input className={input} value={traveller.clientReference} onChange={(e) => setTraveller({ ...traveller, clientReference: e.target.value })} /></label>
                </div>
                <p className="text-xs text-gray-500">ZivoPlus sends the confirmation to you, not to the traveller.{agency ? ' Give your customer the voucher with your agency\'s name.' : ''}</p>
                <Note msg={msg} />
                <div className="flex flex-wrap gap-2">
                  {quote.needsApproval ? (
                    <button type="submit" disabled={!!busy} className={`${btn} bg-brand-600 hover:bg-brand-700 text-white px-6`}>{busy === 'book' ? <Loader2 size={15} className="animate-spin" /> : <Clock size={15} />} Send for approval ({inr(quote.price.total)})</button>
                  ) : (
                    <button type="submit" disabled={!!busy || !quote.canPayNow} className={`${btn} bg-brand-600 hover:bg-brand-700 text-white px-6`}>{busy === 'book' ? <Loader2 size={15} className="animate-spin" /> : <IndianRupee size={15} />} Book and pay {inr(quote.price.total)}</button>
                  )}
                  {quote.holdUntil && !quote.needsApproval && <button type="button" disabled={!!busy} onClick={() => book(true)} className={`${btn} border border-gray-300`}>{busy === 'hold' ? <Loader2 size={15} className="animate-spin" /> : <Clock size={15} />} Hold until {new Date(quote.holdUntil).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</button>}
                </div>
                {!quote.canPayNow && !quote.needsApproval && <p className="text-sm text-amber-800">Not enough balance{quote.available != null ? ` (${inr(quote.available)} available)` : ''}. Top up in the Account tab{quote.holdUntil ? ', or hold the rooms and pay later' : ''}.</p>}
              </form>
              <aside className="bg-white border border-gray-200 rounded-2xl p-5 text-sm space-y-2 self-start">
                <h3 className="font-bold text-gray-900">{quote.nights} night{quote.nights > 1 ? 's' : ''} · {quote.rooms.length} room{quote.rooms.length > 1 ? 's' : ''}</h3>
                <div className="flex justify-between"><span className="text-gray-600">Room charges</span><span>{inr(quote.price.roomCharges)}</span></div>
                {quote.price.discount > 0 && <div className="flex justify-between text-green-700"><span>{quote.business.agreedRate ? 'Agreed company rate' : `${quote.business.model === 'CORPORATE' ? 'Company discount' : 'Agent discount'} (${quote.business.discountPct}%)`}</span><span>− {inr(quote.price.discount)}</span></div>}
                {quote.business.agreedRate && <p className="text-xs text-green-800">{[...new Set(quote.business.agreedRate.rooms.map((r) => r.label))].join(' · ')}{quote.business.agreedRate.rooms.length < quote.rooms.length && quote.business.discountPct > 0 ? ` (other rooms: ${quote.business.discountPct}% company discount)` : ''}</p>}
                <div className="flex justify-between"><span className="text-gray-600">GST</span><span>{inr(quote.price.tax)}</span></div>
                <div className="flex justify-between font-bold text-base border-t border-gray-100 pt-2"><span>You pay</span><span>{inr(quote.price.total)}</span></div>
                {quote.business.model === 'NET' && <div className="flex justify-between text-brand-700 font-semibold"><span>Your price to the customer (+{quote.business.markupPct}%)</span><span>{inr(quote.business.sellAmount)}</span></div>}
                {quote.business.model === 'COMMISSION' && <div className="flex justify-between text-brand-700 font-semibold"><span>Your commission ({quote.business.commissionPct}%, after the stay)</span><span>{inr(quote.business.commissionAmount)}</span></div>}
                {quote.business.model === 'COMMISSION' && <p className="text-xs text-gray-500">Credited to your account at check-out, less TDS {quote.business.tdsPct}% ({inr(quote.business.tdsAmount)}).</p>}
                <p className="text-xs text-gray-500">Public price for this stay: {inr(quote.business.publicAmount)}.</p>
              </aside>
            </div>
          )}
          {!quote && <Note msg={msg} />}
        </section>
      )}
    </div>
  );
};

// ─── Bookings ────────────────────────────────────────────────────────────────
export const BookingsTab = ({ org, onChange }) => {
  const agency = org.kind === 'AGENCY';
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const load = useCallback(() => businessApi.bookings(org.id, { status, search }).then(setData).catch((e) => setMsg({ ok: false, text: e.message })), [org.id, status, search]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  const show = async (id) => { setMsg(null); try { setOpen(await businessApi.booking(org.id, id)); } catch (e) { setMsg({ ok: false, text: e.message }); } };
  const act = async (key, fn, ok) => {
    setBusy(key); setMsg(null);
    try { const b = await fn(); setOpen(b); await load(); onChange?.(); setMsg({ ok: true, text: ok }); } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(''); }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Booking number or traveller" aria-label="Search bookings" className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-lg text-base sm:text-sm" />
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm"><option value="">All</option>{Object.entries(STATUS).map(([k, [, l]]) => <option key={k} value={k}>{l}</option>)}</select>
      </div>
      <Note msg={msg} />
      {open && (
        <section className="bg-white border border-brand-200 rounded-2xl p-5 space-y-3">
          <div className="flex justify-between gap-3">
            <div><p className="text-xs text-gray-500">{open.bookingRef}{open.business?.clientReference ? ` · ${open.business.clientReference}` : ''}</p><h3 className="font-bold text-gray-900">{open.hotel.name}</h3><p className="text-sm text-gray-600">{day(open.checkIn)} to {day(open.checkOut)} · {open.rooms} room{open.rooms > 1 ? 's' : ''} · {open.guestName}</p></div>
            <button type="button" onClick={() => setOpen(null)} className="text-sm text-gray-600 underline self-start">Close</button>
          </div>
          <p className="text-sm">Paid {inr(open.paid)} of {inr(open.total)}{open.refund ? ` · refunded ${inr(open.refund)}` : ''}{open.business?.model === 'COMMISSION' ? ` · commission ${inr(open.business.commissionAmount)} after the stay` : ''}</p>
          <div className="flex flex-wrap gap-2">
            {open.status === 'PENDING' && <button type="button" disabled={!!busy} onClick={() => act('pay', () => businessApi.payBooking(org.id, open.id), 'Paid and confirmed.')} className={`${btn} bg-brand-600 text-white`}>{busy === 'pay' && <Loader2 size={14} className="animate-spin" />} Pay {inr(open.total)} from account</button>}
            {open.status !== 'CANCELLED' && <button type="button" onClick={() => openBlob(() => businessApi.voucher(org.id, open.id, 'NONE'), setMsg)} className={`${btn} border border-gray-300`}><Download size={14} /> Voucher</button>}
            {agency && open.status !== 'CANCELLED' && open.business?.sellAmount && <button type="button" onClick={() => openBlob(() => businessApi.voucher(org.id, open.id, 'SELL'), setMsg)} className={`${btn} border border-gray-300`}><Download size={14} /> Voucher with your price</button>}
            {open.cancellation && <button type="button" disabled={!!busy} onClick={() => { if (window.confirm(open.status === 'PENDING' ? 'Release this hold?' : `Cancel? Refund to your account: ${inr(open.cancellation.refundAmount)} (${open.cancellation.policyLabel}).`)) act('cancel', () => businessApi.cancelBooking(org.id, open.id), 'Cancelled.'); }} className={`${btn} border border-gray-300 text-red-700`}><XCircle size={14} /> {open.status === 'PENDING' ? 'Release hold' : `Cancel (refund ${inr(open.cancellation.refundAmount)})`}</button>}
          </div>
          {open.cancellation && open.status !== 'PENDING' && <p className="text-xs text-gray-500">{open.cancellation.policyLabel}. Refunds go back to your account.</p>}
        </section>
      )}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase"><tr><th className="text-left px-4 py-2">Booking</th><th className="text-left px-4 py-2">Stay</th><th className="text-left px-4 py-2">Status</th><th className="text-right px-4 py-2">Amount</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {!data ? <tr><td colSpan={4} className="p-5 text-gray-500">Loading…</td></tr> : data.bookings.length === 0 ? <tr><td colSpan={4} className="p-5 text-gray-500">No bookings yet.</td></tr> : data.bookings.map((b) => {
              const [c, l] = STATUS[b.status] || STATUS.CONFIRMED;
              return (
                <tr key={b.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => show(b.id)}>
                  <td className="px-4 py-2.5"><button type="button" className="font-semibold text-gray-900 hover:underline" onClick={(e) => { e.stopPropagation(); show(b.id); }}>{b.guestName}</button><span className="block text-xs text-gray-500">{b.bookingRef}{b.business?.clientReference ? ` · ${b.business.clientReference}` : ''}</span></td>
                  <td className="px-4 py-2.5"><span className="block text-gray-900">{b.hotel.name}</span><span className="text-xs text-gray-500">{day(b.checkIn)} – {day(b.checkOut)}</span></td>
                  <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${c}`}>{l}</span></td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">{inr(b.total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── Commission (agents) ─────────────────────────────────────────────────────
export const CommissionTab = ({ org }) => {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    const [y, m] = month.split('-').map(Number);
    businessApi.commission(org.id, { from: new Date(y, m - 1, 1).toISOString(), to: new Date(y, m, 0, 23, 59, 59).toISOString() }).then(setData).catch((e) => setErr(e.message));
  }, [org.id, month]);
  return (
    <div className="space-y-4">
      <label className="text-sm font-semibold text-gray-800 block max-w-xs">Month<input type="month" className={input} value={month} onChange={(e) => setMonth(e.target.value)} /></label>
      {err && <p className="text-sm text-red-700">{err}</p>}
      {data && (
        <>
          <div className="grid grid-cols-3 gap-3 text-sm">
            {[['Commission', data.totals.commission], ['TDS (194H)', data.totals.tds], ['Credited to you', data.totals.net]].map(([k, v]) => <div key={k} className="rounded-xl bg-white border border-gray-200 p-3"><p className="text-xs text-gray-500">{k}</p><p className="text-lg font-bold text-gray-900">{inr(v)}</p></div>)}
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase"><tr><th className="text-left px-4 py-2">Stay</th><th className="text-right px-4 py-2">Commission</th><th className="text-right px-4 py-2">TDS</th><th className="text-right px-4 py-2">Net</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {data.rows.length === 0 ? <tr><td colSpan={4} className="p-5 text-gray-500">No commission credited this month. Commission is credited when a stay booked on commission checks out.</td></tr> : data.rows.map((r) => (
                  <tr key={r.bookingRef}><td className="px-4 py-2.5"><span className="font-semibold">{r.guestName}</span><span className="block text-xs text-gray-500">{r.bookingRef} · {r.hotel} · {day(r.checkOut)}</span></td><td className="px-4 py-2.5 text-right">{inr(r.commission)}</td><td className="px-4 py-2.5 text-right">− {inr(r.tds)}</td><td className="px-4 py-2.5 text-right font-semibold">{inr(r.net)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500">TDS is deposited by ZivoPlus against your PAN {data.organisation.pan}; it shows in your Form 26AS.</p>
        </>
      )}
    </div>
  );
};

// ─── Voucher branding (agents) ───────────────────────────────────────────────
export const BrandingForm = ({ org, onSaved }) => {
  const [f, setF] = useState(() => { const { logo: _l, ...rest } = org.branding || {}; return rest; });
  const [logo, setLogo] = useState(org.branding?.logo || null);
  const uploadLogo = (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setMsg({ ok: false, text: 'The logo must be smaller than 2 MB.' }); return; }
    const reader = new FileReader();
    reader.onload = async () => { try { const b = await businessApi.uploadLogo(org.id, reader.result); setLogo(b.logo); setMsg({ ok: true, text: 'Logo saved: it appears on new vouchers.' }); } catch (err) { setMsg({ ok: false, text: err.message }); } };
    reader.readAsDataURL(file);
  };
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try { await businessApi.branding(org.id, f); setMsg({ ok: true, text: 'Saved. New vouchers use these details.' }); onSaved?.(); } catch (err) { setMsg({ ok: false, text: err.message }); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={save} className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
      <h3 className="font-bold text-gray-900 flex items-center gap-2"><Palette size={17} aria-hidden="true" /> Your vouchers</h3>
      <p className="text-xs text-gray-600">Vouchers you give customers show these details instead of ZivoPlus.</p>
      <div className="flex flex-wrap items-center gap-3">
        {logo ? <img src={logo} alt="Your logo" className="h-12 max-w-[150px] object-contain border border-gray-200 rounded-lg p-1 bg-white" /> : <span className="text-xs text-gray-500">No logo yet.</span>}
        <label className={`${btn} border border-gray-300 cursor-pointer`}>Upload logo (PNG or JPG)<input type="file" accept="image/png,image/jpeg" className="sr-only" onChange={uploadLogo} /></label>
        {logo && <button type="button" className="text-sm font-semibold text-gray-700 underline" onClick={async () => { try { const b = await businessApi.removeLogo(org.id); setLogo(b.logo); } catch (err) { setMsg({ ok: false, text: err.message }); } }}>Remove</button>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {[['name', 'Agency name on vouchers'], ['phone', 'Phone'], ['email', 'Email'], ['website', 'Website']].map(([k, l]) => (
          <label key={k} className="text-sm font-semibold text-gray-800">{l}<input className={input} value={f[k] || ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
        ))}
      </div>
      <Note msg={msg} />
      <button type="submit" disabled={busy} className={`${btn} bg-navy-800 text-white`}>{busy && <Loader2 size={14} className="animate-spin" />} Save</button>
    </form>
  );
};
