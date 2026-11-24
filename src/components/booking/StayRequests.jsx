import { useCallback, useEffect, useState } from 'react';
import { Send, Loader2, CheckCircle2, XCircle, Clock, Ban } from 'lucide-react';
import { getStayRequests, createStayRequest, cancelStayRequest } from '../../services/api';
import { REQUEST_TYPES, requestLabel as labelOf } from '../../constants/stayRequests';

/**
 * Requests to the hotel for one booking: send one (late arrival, early check-in, airport pickup…)
 * and see the hotel's answer. The hotel is told by email and in its extranet, and the guest gets an
 * email when it answers.
 */

const STATUS = {
  PENDING: { label: 'Waiting for the hotel', cls: 'bg-amber-50 text-amber-800 border-amber-200', Icon: Clock },
  CONFIRMED: { label: 'Confirmed by the hotel', cls: 'bg-green-50 text-green-800 border-green-200', Icon: CheckCircle2 },
  DECLINED: { label: 'Not possible', cls: 'bg-red-50 text-red-800 border-red-200', Icon: XCircle },
  CANCELLED: { label: 'Withdrawn', cls: 'bg-gray-50 text-gray-600 border-gray-200', Icon: Ban },
};
const when = (d) => new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

const StayRequests = ({ booking }) => {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ type: '', requestedTime: '', details: '' });
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState(null);
  const active = ['CONFIRMED', 'CHECKED_IN'].includes(booking.status) && new Date(booking.checkOut) > new Date();
  // Requests open once free cancellation has ended (the hotel prepares only for firm stays)
  const opensAt = booking.requestsOpenAt ? new Date(booking.requestsOpenAt) : null;
  const notYet = active && opensAt && opensAt > new Date();
  const canAsk = active && !notYet;
  const type = REQUEST_TYPES.find((t) => t.id === form.type);

  const load = useCallback(() => {
    setLoading(true);
    getStayRequests(booking.id).then(setList).catch(() => setList([])).finally(() => setLoading(false));
  }, [booking.id]);
  useEffect(() => { load(); }, [load]);

  const send = async (e) => {
    e.preventDefault();
    setMsg(null);
    if (!form.type) { setMsg({ ok: false, text: 'Choose what you would like to ask the hotel.' }); return; }
    setSending(true);
    try {
      await createStayRequest(booking.id, { type: form.type, requestedTime: form.requestedTime, details: form.details });
      setForm({ type: '', requestedTime: '', details: '' });
      setMsg({ ok: true, text: 'Sent to the hotel. You will get an email when it answers.' });
      load();
    } catch (err) {
      setMsg({ ok: false, text: err?.message || 'Could not send the request. Please try again.' });
    } finally {
      setSending(false);
    }
  };

  const withdraw = async (id) => {
    try { await cancelStayRequest(booking.id, id); load(); }
    catch (err) { setMsg({ ok: false, text: err?.message || 'Could not withdraw the request.' }); }
  };

  return (
    <div className="space-y-6">
      {canAsk ? (
        <form onSubmit={send} className="border border-gray-100 rounded-2xl p-5 space-y-4">
          <div>
            <h4 className="font-bold text-gray-900 text-sm">Ask the hotel</h4>
            <p className="text-xs text-gray-500 mt-1">The hotel is told by email and in its system. Requests are confirmed by the hotel, not guaranteed; extra services may be charged by the hotel.</p>
          </div>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="What do you need?">
            {REQUEST_TYPES.map((t) => (
              <button key={t.id} type="button" role="radio" aria-checked={form.type === t.id}
                onClick={() => setForm((f) => ({ ...f, type: t.id }))}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${form.type === t.id ? 'bg-navy-800 text-white border-navy-800' : 'bg-white text-gray-700 border-gray-200 hover:border-navy-500'}`}>
                {t.label}
              </button>
            ))}
          </div>
          {type?.time && (
            <div>
              <label htmlFor="req-time" className="block text-xs font-semibold text-gray-700 mb-1">{type.time}</label>
              <input id="req-time" type="text" maxLength={60} value={form.requestedTime} placeholder={type.placeholder}
                onChange={(e) => setForm((f) => ({ ...f, requestedTime: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none" />
            </div>
          )}
          {form.type && (
            <div>
              <label htmlFor="req-details" className="block text-xs font-semibold text-gray-700 mb-1">Details {form.type === 'OTHER' ? '' : <span className="font-normal text-gray-400">(optional)</span>}</label>
              <textarea id="req-details" rows={3} maxLength={500} value={form.details}
                placeholder={form.type === 'PARKING' ? 'e.g. One car, SUV' : form.type === 'SPECIAL_OCCASION' ? 'e.g. Anniversary on 20 Dec, a cake if possible' : 'Anything the hotel should know'}
                onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none" />
            </div>
          )}
          {msg && <p role="status" className={`text-xs px-3 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}
          <button type="submit" disabled={sending || !form.type}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold disabled:opacity-50">
            {sending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />} Send to the hotel
          </button>
        </form>
      ) : (
        <p className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-xl p-3">
          {notYet
            ? <>You can send requests to the hotel (late arrival, early check-in, airport pickup…) from <strong>{when(opensAt)}</strong>, when free cancellation ends.</>
            : 'Requests can be sent for confirmed bookings until check-out.'}
        </p>
      )}

      <div>
        <h4 className="font-bold text-gray-900 text-sm mb-2">Your requests</h4>
        {loading ? <p className="text-xs text-gray-500">Loading…</p> : list.length === 0 ? (
          <p className="text-xs text-gray-500">No requests yet.</p>
        ) : (
          <ul className="space-y-3">
            {list.map((r) => {
              const st = STATUS[r.status] || STATUS.PENDING;
              return (
                <li key={r.id} className="border border-gray-100 rounded-xl p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold text-gray-900">{labelOf(r.type)}</p>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold ${st.cls}`}><st.Icon size={12} aria-hidden="true" />{st.label}</span>
                  </div>
                  {(r.requestedTime || r.details) && <p className="text-gray-600 mt-1 break-words">{[r.requestedTime, r.details].filter(Boolean).join(' · ')}</p>}
                  {r.hotelReply && <p className="mt-2 text-gray-800 bg-gray-50 rounded-lg px-3 py-2"><span className="font-semibold">The hotel: </span>{r.hotelReply}</p>}
                  <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                    <span>Sent {when(r.createdAt)}{r.respondedAt ? ` · answered ${when(r.respondedAt)}` : ''}</span>
                    {r.status === 'PENDING' && <button type="button" onClick={() => withdraw(r.id)} className="font-semibold text-gray-600 hover:text-red-700">Withdraw</button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default StayRequests;
