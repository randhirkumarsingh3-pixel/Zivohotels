import { useState, useEffect } from 'react';
import { X, Info, Loader2 } from 'lucide-react';
import { fetchSettlementDetails } from '../../services/extranetApi';

/**
 * Payout breakdown of one settlement: what the guest paid and where (online through ZivoHotels or
 * at the hotel), ZivoHotels' commission and the taxes on it, and the result: the amount in the
 * hotel's next payout, or the commission the hotel owes when the guest paid at the hotel.
 */
const inr = (n) => `₹${Math.abs(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const date = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

const ExplainMoneyModal = ({ isOpen, onClose, settlementId }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || !settlementId) return;
    setLoading(true); setError('');
    fetchSettlementDetails(settlementId).then(setData).catch((e) => setError(e.message || 'Could not load the breakdown')).finally(() => setLoading(false));
  }, [isOpen, settlementId]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  const paid = data && ['PAID', 'SETTLED'].includes(data.status);
  const owes = data && data.netPayable < 0;
  const where = data && (data.collectedAtHotel > 0 && data.collectedOnline > 0.5 ? 'Part online, part at the hotel' : data.collectedAtHotel > 0 ? 'Paid at the hotel' : 'Paid online');
  const deductions = (data?.deductions || []).filter((d) => d.type !== 'COLLECTED_AT_HOTEL');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="payout-breakdown-title">
      <div className="absolute inset-0 bg-navy-950/60" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-white w-full max-w-md rounded-card shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-start gap-4">
          <div>
            <h3 id="payout-breakdown-title" className="text-xl font-bold text-gray-900">Payout breakdown</h3>
            {data && <p className="text-sm text-gray-600 mt-0.5">{data.bookingRef} · {data.kindLabel}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-100"><X size={22} /></button>
        </div>

        <div className="p-6">
          {loading ? <div className="flex justify-center py-12"><Loader2 className="animate-spin text-navy-700" size={32} /></div>
            : error ? <p className="text-sm text-red-700">{error}</p>
            : (
            <div className="space-y-6">
              <div className="flex justify-between items-end gap-4 pb-5 border-b border-dashed border-gray-200">
                <div>
                  <p className="text-sm text-gray-600">{data.kind && data.kind !== 'STAY' ? data.kindLabel : 'Booking value (incl. GST)'}</p>
                  <p className="text-3xl font-bold text-gray-900 tabular-nums">{inr(data.grossBooking)}</p>
                </div>
                <span className="px-2.5 py-1 bg-navy-50 text-navy-800 rounded-full text-xs font-semibold">{where}</span>
              </div>

              <dl className="space-y-2.5 text-sm">
                {data.collectedOnline > 0.5 && <div className="flex justify-between gap-4"><dt className="text-gray-700">Collected online by ZivoHotels</dt><dd className="font-semibold tabular-nums">{inr(data.collectedOnline)}</dd></div>}
                {data.collectedAtHotel > 0 && <div className="flex justify-between gap-4"><dt className="text-gray-700">Collected by you at the hotel</dt><dd className="font-semibold tabular-nums">{inr(data.collectedAtHotel)}</dd></div>}
                <div className="pt-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">ZivoHotels&apos; charges</div>
                {deductions.map((d) => (
                  <div key={d.type} className="flex justify-between gap-4"><dt className="text-gray-700">{d.label}</dt><dd className="font-semibold text-red-700 tabular-nums">−{inr(d.amount)}</dd></div>
                ))}
                {(data.info || []).map((d) => (
                  <div key={d.type} className="flex justify-between gap-4 text-xs"><dt className="text-gray-600">{d.label}</dt><dd className="text-gray-600 tabular-nums">{inr(d.amount)}</dd></div>
                ))}
              </dl>

              <div className={`rounded-card p-5 ${owes ? 'bg-orange-50 border border-orange-200' : 'bg-navy-900 text-white'}`}>
                <p className={`text-sm font-semibold ${owes ? 'text-orange-900' : 'text-navy-100'}`}>
                  {owes ? (paid ? 'Commission deducted' : 'You owe ZivoHotels') : paid ? 'Paid to you' : 'You receive'}
                </p>
                <p className={`text-3xl font-bold tabular-nums mt-1 ${owes ? 'text-orange-900' : ''}`}>{inr(data.netPayable)}</p>
                <p className={`text-xs mt-1 ${owes ? 'text-orange-900' : 'text-navy-100'}`}>
                  {owes
                    ? (paid ? 'The guest paid you at the hotel; this commission was deducted from that payout.' : 'The guest paid you at the hotel, so the commission is taken from your next payout.')
                    : 'Collected online, minus ZivoHotels’ commission and taxes.'}
                </p>
              </div>

              <div className="flex items-start gap-3 p-4 bg-navy-50 rounded-lg border border-navy-100 text-sm text-navy-900">
                <Info className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
                <p>
                  {paid
                    ? <>Settled in the payout of <strong>{date(data.payoutDate)}</strong>.</>
                    : owes
                      ? <>Deducted from your payout on <strong>{date(data.payoutEligibility)}</strong> (your next payout date after check-out).</>
                      : <>Included in your payout on <strong>{date(data.payoutEligibility)}</strong> (your next payout date after check-out).</>}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExplainMoneyModal;
