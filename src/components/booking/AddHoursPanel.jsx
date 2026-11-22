import { useEffect, useState } from 'react';
import { Clock, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { getExtensionOptionsApi } from '../../services/api';
import { payForExtension } from '../../utils/payBooking';

const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const time = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

/**
 * "Add hours" for a booked hourly stay (My Bookings): the extra hours the room is free for, each
 * with what's left to pay, and pay online. The stay is extended once the payment is confirmed.
 */
const AddHoursPanel = ({ booking, onExtended }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const [done, setDone] = useState('');

  useEffect(() => {
    let live = true;
    setData(null); setError('');
    getExtensionOptionsApi(booking.id).then((d) => live && setData(d)).catch((e) => live && setError(e.message || 'Could not load the extra hours.'));
    return () => { live = false; };
  }, [booking.id, booking.hours]);

  const buy = async (o) => {
    setError(''); setBusy(o.hours);
    try {
      const r = await payForExtension(booking, o.hours);
      if (r === 'paid') { setDone(`Done: your stay now ends at ${time(o.endsAt)}.`); onExtended?.(); }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="border border-gray-100 rounded-2xl p-5" aria-label="Add hours">
      <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2"><Clock size={16} className="text-navy-700" aria-hidden="true" /> Need more time?</h4>
      {done && <p className="mt-2 text-sm text-green-700 flex items-center gap-1.5"><CheckCircle2 size={16} aria-hidden="true" /> {done}</p>}
      {!data && !error && <div className="mt-3 h-12 bg-gray-50 rounded-xl animate-pulse" />}
      {data && !data.available && <p className="mt-2 text-sm text-gray-600">{data.reason}</p>}
      {data?.available && (
        <>
          <p className="mt-1 text-xs text-gray-500">{inr(data.perHour)} an hour + GST. Your stay currently ends at {time(booking.slotEnd)}.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {data.options.map((o) => (
              <button key={o.hours} type="button" disabled={busy !== null} onClick={() => buy(o)}
                className="text-left rounded-xl border-2 border-navy-200 hover:border-navy-600 px-3 py-2.5 disabled:opacity-60">
                <span className="block font-bold text-gray-900">+{o.hours} hour{o.hours === 1 ? '' : 's'}</span>
                <span className="block text-xs text-gray-500">until {time(o.endsAt)}</span>
                <span className="block mt-1 font-semibold text-brand-700 tabular-nums">
                  {busy === o.hours ? <span className="inline-flex items-center gap-1"><Loader2 size={14} className="animate-spin" /> Opening…</span> : `Pay ${inr(o.extraAmount)}`}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-400">Offers and member prices don&apos;t apply to extra hours. The room is held for you only once the payment goes through.</p>
        </>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-700 flex items-start gap-1.5"><AlertCircle size={16} className="shrink-0" aria-hidden="true" /> {error}</p>}
    </section>
  );
};

export default AddHoursPanel;
