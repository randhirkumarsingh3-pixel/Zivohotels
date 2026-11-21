import { useState } from 'react';
import { Clock, Loader2 } from 'lucide-react';
import { payForBooking, deadlineLabel, needsPayment } from '../../utils/payBooking';

/**
 * A reserved "pay later" booking that isn't paid yet: how much, the deadline, and Pay now.
 * Shown on the booking card and in the booking details. onPaid reloads the bookings.
 */
const PayLaterBanner = ({ booking, onPaid, compact = false }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!needsPayment(booking)) return null;
  const amount = `₹${Math.round(Number(booking.totalAmount) || 0).toLocaleString('en-IN')}`;

  const pay = async (e) => {
    e.stopPropagation();
    setBusy(true); setError('');
    try {
      const r = await payForBooking(booking);
      if (r === 'paid') onPaid?.();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className={`rounded-2xl border border-amber-200 bg-amber-50 ${compact ? 'p-3' : 'p-4'} text-sm`} role="status">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-start gap-2 text-amber-900">
          <Clock size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span><span className="font-bold">Reserved, not confirmed.</span> Pay {amount} by {deadlineLabel(booking.expiresAt)} or the booking is cancelled.</span>
        </p>
        <button type="button" onClick={pay} disabled={busy}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold disabled:opacity-50">
          {busy && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} Pay {amount} now
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
};

export default PayLaterBanner;
