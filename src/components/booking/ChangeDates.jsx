import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Loader2, AlertCircle, CheckCircle2, Clock, XCircle, ArrowRight } from 'lucide-react';
import { getDateChangeApi, quoteDateChangeApi, requestDateChangeApi, withdrawDateChangeApi } from '../../services/api';
import { payForDateChange } from '../../utils/payBooking';
import { isHourly } from '../../utils/stay';

/**
 * Change dates (My Bookings → Manage): same rooms on other dates at today's rates, while free
 * cancellation applies. The guest sees the new price, sends the request, and the hotel approves or
 * declines it; a prepaid stay that costs more pays the difference once approved.
 */
const inr = (n) => `₹${Math.round(Math.abs(Number(n) || 0)).toLocaleString('en-IN')}`;
const day = (d) => new Date(`${String(d).slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const when = (d) => new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const todayIst = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const addDays = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const STATUS = {
  PENDING: { text: 'Waiting for the hotel', cls: 'bg-amber-50 text-amber-900 border-amber-200', Icon: Clock },
  AWAITING_PAYMENT: { text: 'Approved: pay the difference to confirm', cls: 'bg-brand-50 text-brand-900 border-brand-200', Icon: Clock },
  APPLIED: { text: 'Dates changed', cls: 'bg-green-50 text-green-800 border-green-200', Icon: CheckCircle2 },
  DECLINED: { text: 'Declined by the hotel', cls: 'bg-red-50 text-red-800 border-red-200', Icon: XCircle },
  WITHDRAWN: { text: 'Withdrawn', cls: 'bg-gray-50 text-gray-600 border-gray-200', Icon: XCircle },
  EXPIRED: { text: 'Expired', cls: 'bg-gray-50 text-gray-600 border-gray-200', Icon: XCircle },
  FAILED: { text: 'Not possible (dates sold out)', cls: 'bg-red-50 text-red-800 border-red-200', Icon: XCircle },
};

const Money = ({ q, paidOnline }) => {
  if (!q.difference) return <p className="text-sm text-gray-700">Same price as now.</p>;
  if (q.difference > 0) return <p className="text-sm text-gray-800">{inr(q.difference)} more than now{paidOnline ? ', paid online once the hotel approves.' : q.atHotel ? `: ${inr(q.atHotel)} to pay at the hotel.` : '.'}</p>;
  return <p className="text-sm text-gray-800">{inr(q.difference)} less than now{q.refund > 0 ? `: ${inr(q.refund)} refunded to you once the hotel approves.` : q.atHotel ? `: ${inr(q.atHotel)} to pay at the hotel.` : '.'}</p>;
};

const ChangeDates = ({ booking, onChanged }) => {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ checkIn: '', checkOut: '', note: '' });
  const [q, setQ] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    getDateChangeApi(booking.id).then(setState).catch((e) => setError(e.message || 'Could not load date changes.'));
  }, [booking.id]);
  useEffect(() => { if (!isHourly(booking)) load(); }, [load, booking]);

  if (isHourly(booking) || booking.organisationId) return null;

  const getQuote = async (e) => {
    e.preventDefault();
    setError(''); setQ(null); setBusy('quote');
    try { setQ(await quoteDateChangeApi(booking.id, { checkIn: form.checkIn, checkOut: form.checkOut })); } catch (err) { setError(err.message); } finally { setBusy(''); }
  };
  const send = async () => {
    setError(''); setBusy('send');
    try {
      await requestDateChangeApi(booking.id, { checkIn: q.checkIn, checkOut: q.checkOut, note: form.note });
      setMsg('Sent to the hotel. We\'ll email you when it answers; your booking stays on its current dates until then.');
      setOpen(false); setQ(null); load();
    } catch (err) { setError(err.message); } finally { setBusy(''); }
  };
  const withdraw = async () => {
    setBusy('withdraw');
    try { await withdrawDateChangeApi(booking.id, state.open.id); setMsg(''); load(); } catch (err) { setError(err.message); } finally { setBusy(''); }
  };
  const pay = async () => {
    setError(''); setBusy('pay');
    try {
      if (await payForDateChange(booking, state.open.id) === 'paid') { setMsg('Paid. Your booking is on the new dates; download the updated voucher.'); load(); onChanged?.(); }
    } catch (err) { setError(err.message); load(); } finally { setBusy(''); }
  };

  const o = state?.open;
  const st = o && STATUS[o.status];
  const minIn = todayIst();
  return (
    <section className="border border-gray-100 rounded-2xl p-5" aria-labelledby="cd-h">
      <h3 id="cd-h" className="font-bold text-gray-900 text-sm flex items-center gap-2"><CalendarClock size={16} className="text-brand-600" aria-hidden="true" /> Change dates</h3>
      {!state && !error && <div className="mt-3 h-10 bg-gray-50 rounded-xl animate-pulse" />}
      {msg && <p role="status" className="mt-2 text-sm text-green-800 bg-green-50 rounded-lg px-3 py-2">{msg}</p>}

      {o && (
        <div className={`mt-3 rounded-xl border p-4 ${st.cls}`}>
          <p className="text-sm font-bold flex items-center gap-1.5"><st.Icon size={15} aria-hidden="true" />{st.text}</p>
          <p className="text-sm mt-1">{day(o.oldCheckIn)} → {day(o.oldCheckOut)} <ArrowRight size={13} className="inline" aria-hidden="true" /> <b>{day(o.newCheckIn)} → {day(o.newCheckOut)}</b></p>
          <p className="text-xs mt-1">New total {inr(o.newTotal)} (now {inr(o.oldTotal)}). {o.status === 'PENDING' ? `The hotel answers by ${when(o.expiresAt)}.` : `Pay by ${when(o.expiresAt)}.`}</p>
          {o.hotelReply && <p className="text-xs mt-1"><b>The hotel:</b> {o.hotelReply}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {o.status === 'AWAITING_PAYMENT' && (
              <button type="button" onClick={pay} disabled={Boolean(busy)} className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs px-4 py-2 rounded-xl disabled:opacity-60">
                {busy === 'pay' && <Loader2 size={14} className="animate-spin" />}Pay {inr(o.toPay)}
              </button>
            )}
            <button type="button" onClick={withdraw} disabled={Boolean(busy)} className="text-xs font-bold px-3 py-2 rounded-xl border border-current/20 bg-white/70 hover:bg-white disabled:opacity-60">Withdraw request</button>
          </div>
        </div>
      )}

      {state && !o && !state.canRequest && state.reason && <p className="mt-2 text-sm text-gray-600">{state.reason}</p>}

      {state?.canRequest && !open && (
        <div className="mt-2">
          <p className="text-xs text-gray-600">Move this stay to other dates, with the same rooms, at today&apos;s rates. The hotel confirms the change{state.freeChangeUntil ? `; possible until ${when(state.freeChangeUntil)}, while free cancellation applies` : ''}.</p>
          <button type="button" onClick={() => { setOpen(true); setMsg(''); setForm({ checkIn: String(booking.checkIn).slice(0, 10), checkOut: String(booking.checkOut).slice(0, 10), note: '' }); }}
            className="mt-3 inline-flex items-center gap-1.5 bg-gray-900 hover:bg-brand-600 text-white font-bold text-xs px-4 py-2.5 rounded-xl"><CalendarClock size={14} />Choose new dates</button>
        </div>
      )}

      {open && (
        <form onSubmit={getQuote} className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-semibold text-gray-700">New check-in
              <input type="date" required min={minIn} value={form.checkIn} onChange={(e) => { const v = e.target.value; setQ(null); setForm((f) => ({ ...f, checkIn: v, checkOut: f.checkOut > v ? f.checkOut : addDays(v, 1) })); }}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-semibold text-gray-700">New check-out
              <input type="date" required min={form.checkIn ? addDays(form.checkIn, 1) : minIn} value={form.checkOut} onChange={(e) => { setQ(null); setForm((f) => ({ ...f, checkOut: e.target.value })); }}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </label>
          </div>
          {!q && (
            <div className="flex gap-2">
              <button type="submit" disabled={busy === 'quote'} className="inline-flex items-center gap-1.5 bg-gray-900 hover:bg-brand-600 text-white font-bold text-xs px-4 py-2.5 rounded-xl disabled:opacity-60">{busy === 'quote' && <Loader2 size={14} className="animate-spin" />}See the price</button>
              <button type="button" onClick={() => { setOpen(false); setError(''); }} className="text-xs font-bold px-3 py-2 text-gray-600">Cancel</button>
            </div>
          )}
          {q && (
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 space-y-2">
              {q.available ? (
                <>
                  <p className="text-sm text-gray-900"><b>{day(q.checkIn)} → {day(q.checkOut)}</b> · {q.nights} night{q.nights === 1 ? '' : 's'}</p>
                  <p className="text-sm text-gray-900">New total <b>{inr(q.newTotal)}</b> <span className="text-gray-500">(now {inr(q.oldTotal)}, GST included)</span></p>
                  <Money q={q} paidOnline={state.paidOnline} />
                  <label className="block text-xs font-semibold text-gray-700">Note to the hotel <span className="font-normal text-gray-400">(optional)</span>
                    <input type="text" maxLength={300} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="e.g. My flight moved" className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  </label>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button type="button" onClick={send} disabled={busy === 'send'} className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl disabled:opacity-60">{busy === 'send' && <Loader2 size={14} className="animate-spin" />}Ask the hotel</button>
                    <button type="button" onClick={() => setQ(null)} className="text-xs font-bold px-3 py-2 text-gray-600">Other dates</button>
                  </div>
                  <p className="text-xs text-gray-500">Your booking stays on its current dates until the hotel approves.</p>
                </>
              ) : (
                <p className="text-sm text-red-800">Your rooms are sold out for {day(q.checkIn)} → {day(q.checkOut)}. Try other dates.</p>
              )}
            </div>
          )}
        </form>
      )}

      {state?.history?.length > 0 && (
        <details className="mt-3">
          <summary className="text-xs font-semibold text-gray-600 cursor-pointer">Earlier date change requests ({state.history.length})</summary>
          <ul className="mt-2 space-y-1.5">
            {state.history.map((h) => (
              <li key={h.id} className="text-xs text-gray-700">{day(h.newCheckIn)} → {day(h.newCheckOut)} · <b>{STATUS[h.status]?.text || h.status}</b>{h.hotelReply ? ` · "${h.hotelReply}"` : ''}{h.refund?.amount ? ` · ${inr(h.refund.amount)} refund${h.refund.status === 'FAILED' ? ' (being processed by support)' : ''}` : ''}</li>
            ))}
          </ul>
        </details>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-700 flex items-start gap-1.5"><AlertCircle size={16} className="shrink-0" aria-hidden="true" /> {error}</p>}
    </section>
  );
};

export default ChangeDates;
