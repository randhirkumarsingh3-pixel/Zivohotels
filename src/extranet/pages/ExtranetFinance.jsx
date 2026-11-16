import { useState, useEffect, useCallback } from 'react';
import { 
  IndianRupee, Clock, 
  AlertCircle, Filter, Download, History,
  ShieldCheck, Loader2, Landmark
} from 'lucide-react';
import { fetchFinanceOverview, fetchPayoutHistory } from '../../services/extranetApi';
import { useExtranet } from '../context/ExtranetContext';
import ExplainMoneyModal from '../components/ExplainMoneyModal';

const STATUS_LABEL = { PENDING: 'On hold', READY: 'Ready to pay', PAID: 'Paid', SETTLED: 'Paid', REVERSED: 'Reversed', CANCELLED: 'Cancelled' };
const KIND_LABEL = { STAY: 'Stay', CANCELLATION: 'Cancellation fee', NO_SHOW: 'No-show' };
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

const ExtranetFinance = () => {
  const [overview, setOverview] = useState(null);
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSettlement, setSelectedSettlement] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const shownSettlements = (overview?.recentSettlements || []).filter((x) => statusFilter === 'ALL' || x.status === statusFilter);
  // CSV of the settlements shown: what each stay earned, ZivoHotels' commission and taxes, and net payable
  const exportCsv = () => {
    const head = ['Booking ID', 'Guest', 'Check-in', 'Check-out', 'Type', 'Status', 'Gross (₹)', 'Commission (₹)', 'GST on commission (₹)', 'TCS (₹)', 'TDS (₹)', 'Net payable (₹)', 'Created', 'Pays on'];
    const rows = shownSettlements.map((x) => [x.booking?.bookingRef, x.booking?.guestName, x.booking?.checkIn?.slice(0, 10), x.booking?.checkOut?.slice(0, 10), KIND_LABEL[x.kind] || x.kind, STATUS_LABEL[x.status] || x.status, x.grossAmount, x.commissionAmount, x.commissionGstAmount, x.tcsAmount, x.tdsAmount, x.netPayable, String(x.createdAt).slice(0, 10), x.holdUntil ? String(x.holdUntil).slice(0, 10) : ''].map(csvCell).join(','));
    const blob = new Blob([String.fromCharCode(0xfeff) + [head.map(csvCell).join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `settlements-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const { addToast, property } = useExtranet();

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [overData, payoutData] = await Promise.all([
        fetchFinanceOverview(),
        fetchPayoutHistory()
      ]);
      setOverview(overData);
      setPayouts(payoutData);
    } catch (error) {
      addToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading && !overview) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-blue-600" size={48} /></div>;
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">Finance Hub</h1>
          <p className="text-slate-500 font-medium mt-1">Track settlements, payouts, and financial health.</p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={exportCsv} disabled={!overview?.recentSettlements?.length} className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50">
            <Download size={16} aria-hidden="true" /> Export settlements (CSV)
          </button>
        </div>
      </div>

      {/* Financial KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <IndianRupee size={80} />
          </div>
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Net Earned (Life-to-Date)</p>
          <h2 className="text-4xl font-black mb-4 tabular-nums">₹{Number(overview?.metrics?.totalEarned || 0).toLocaleString('en-IN')}</h2>
          <div className="flex items-center gap-2 text-navy-100 text-xs font-semibold">
            From {overview?.metrics?.count || 0} settled booking{overview?.metrics?.count === 1 ? '' : 's'}
          </div>
        </div>

        <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Pending Payouts</p>
          <h2 className="text-4xl font-black text-navy-800 mb-4 tabular-nums">₹{Number(overview?.metrics?.pendingAmount || 0).toLocaleString('en-IN')}</h2>
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold">
            <Clock size={14} /> {overview?.metrics?.nextPayoutDate ? `Next payout ${new Date(overview.metrics.nextPayoutDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : 'No payout scheduled yet'}
          </div>
        </div>

        <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Paid Out (Life-to-Date)</p>
          <h2 className="text-4xl font-black text-slate-900 mb-4 tabular-nums">₹{Number(overview?.metrics?.totalPayouts || 0).toLocaleString('en-IN')}</h2>
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold">
            <ShieldCheck size={14} /> Sent to your bank account on file
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Settlement History */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
             <div className="p-8 border-b border-slate-100 flex justify-between items-center">
                <div className="flex items-center gap-3">
                   <History className="text-blue-600" size={20} />
                   <h3 className="text-xl font-black text-slate-900">Settlement Timeline</h3>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                   <Filter size={14} aria-hidden="true" />
                   <span className="sr-only">Show settlements</span>
                   <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Show settlements" className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white">
                      <option value="ALL">All</option>
                      {[...new Set((overview?.recentSettlements || []).map((x) => x.status))].map((st) => <option key={st} value={st}>{STATUS_LABEL[st] || st}</option>)}
                   </select>
                </label>
             </div>
             
             <div className="divide-y divide-slate-50">
                {shownSettlements.map((s, i) => (
                  <div key={i} className="p-6 hover:bg-slate-50 transition-all group">
                     <div className="flex items-center justify-between">
                        <div className="flex items-center gap-5">
                           <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center font-black group-hover:bg-blue-600 group-hover:text-white transition-all">
                              S
                           </div>
                           <div>
                              <p className="text-sm font-bold text-slate-900">{s.booking?.bookingRef || `#${s.id.slice(0, 8)}`}{s.booking?.guestName ? ` · ${s.booking.guestName}` : ''}</p>
                              <p className="text-xs text-slate-600">{KIND_LABEL[s.kind] || s.kind} · {STATUS_LABEL[s.status] || s.status} · {new Date(s.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}{s.holdUntil && ['PENDING', 'READY'].includes(s.status) ? ` · pays on ${new Date(s.holdUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}</p>
                           </div>
                        </div>
                        <div className="text-right">
                           <p className={`text-lg font-bold tabular-nums ${Number(s.netPayable) < 0 ? 'text-orange-800' : 'text-slate-900'}`}>{Number(s.netPayable) < 0 ? '−' : ''}₹{Math.abs(Number(s.netPayable)).toLocaleString('en-IN')}</p>
                           <button 
                             onClick={() => setSelectedSettlement(s)}
                             className="text-sm font-semibold text-navy-700 hover:underline"
                           >
                             View breakdown
                           </button>
                        </div>
                     </div>
                  </div>
                ))}
                {shownSettlements.length === 0 && (
                  <div className="p-12 text-center">
                    <AlertCircle className="mx-auto text-slate-200 mb-2" size={48} />
                    <p className="text-slate-400 font-medium">No settlements found.</p>
                  </div>
                )}
             </div>
          </div>
        </div>

        {/* Right: Payout Tracker & Banking */}
        <div className="space-y-8">
           <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 shadow-sm">
              <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center justify-between">
                 Payouts
                 <Clock className="text-navy-600" size={18} aria-hidden="true" />
              </h3>
              
              <div className="space-y-5">
                {overview?.metrics?.pendingAmount > 0 && overview?.metrics?.nextPayoutDate && (
                  <div className="rounded-lg bg-navy-50 border border-navy-100 p-3 text-sm text-navy-900">
                    Next: <strong>₹{Number(overview.metrics.pendingAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong> on {new Date(overview.metrics.nextPayoutDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </div>
                )}
                {payouts.slice(0, 5).map((p) => (
                  <div key={p.id} className="relative pl-5 border-l-2 border-gray-200">
                    <div className={`absolute -left-[7px] top-1 w-3 h-3 rounded-full ${p.status === 'SUCCESS' ? 'bg-green-600' : p.status === 'FAILED' ? 'bg-red-600' : 'bg-amber-500'}`} aria-hidden="true" />
                    <p className="text-sm font-bold text-gray-900 tabular-nums">₹{Number(p.totalAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                    <p className="text-xs text-gray-600">{new Date(p.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · Ref {p.reference || '—'}</p>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold ${p.status === 'SUCCESS' ? 'bg-green-50 text-green-800' : p.status === 'FAILED' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-900'}`}>
                       {p.status === 'SUCCESS' ? 'Sent to your bank' : p.status === 'FAILED' ? 'Failed' : 'Processing'}
                    </span>
                  </div>
                ))}
                {payouts.length === 0 && (
                  <p className="text-sm text-gray-600 py-2">No payouts yet. Stays are paid on your payout date after check-out.</p>
                )}
              </div>
           </div>

           <div className="bg-navy-900 rounded-[2rem] p-8 text-white shadow-xl">
              <div className="flex items-center gap-4 mb-6">
                 <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center">
                    <Landmark size={24} />
                 </div>
                 <div>
                    <h4 className="text-sm font-bold">Payout account</h4>
                    <p className="text-xs text-navy-200">{property?.bankAccount ? property.bankAccount.bankName : 'Not added yet'}</p>
                 </div>
              </div>
              <div className="p-4 bg-white/10 rounded-2xl border border-white/10 mb-4">
                 <p className="text-xs font-semibold text-navy-200 mb-1">Account ending in</p>
                 <p className="text-lg font-mono font-bold tracking-widest">{property?.bankAccount ? `•••• ${property.bankAccount.last4}` : '—'}</p>
              </div>
              <p className="text-xs text-navy-100 leading-relaxed">To change the account your payouts go to, write to <span className="font-semibold text-white select-all">partners@zivohotels.com</span>.</p>
           </div>
        </div>
      </div>

      {/* Explain Money Modal */}
      {selectedSettlement && (
        <ExplainMoneyModal 
          isOpen={!!selectedSettlement}
          onClose={() => setSelectedSettlement(null)}
          settlementId={selectedSettlement.id}
        />
      )}
    </div>
  );
};

export default ExtranetFinance;
