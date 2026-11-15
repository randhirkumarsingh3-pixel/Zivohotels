import { useState, useEffect, useCallback } from 'react';
import { 
  IndianRupee, Clock, 
  AlertCircle, Filter, Download, History,
  ShieldCheck, Loader2, Landmark
} from 'lucide-react';
import { fetchFinanceOverview, fetchPayoutHistory } from '../../services/extranetApi';
import { useExtranet } from '../context/ExtranetContext';
import ExplainMoneyModal from '../components/ExplainMoneyModal';

const ExtranetFinance = () => {
  const [overview, setOverview] = useState(null);
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSettlement, setSelectedSettlement] = useState(null);
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
          <button className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 text-slate-900 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm">
            <Download size={14} /> Export Report
          </button>
        </div>
      </div>

      {/* Financial KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <IndianRupee size={80} />
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Net Earned (Life-to-Date)</p>
          <h2 className="text-4xl font-black mb-4 tabular-nums">₹{Number(overview?.metrics?.totalEarned || 0).toLocaleString('en-IN')}</h2>
          <div className="flex items-center gap-2 text-navy-100 text-xs font-semibold">
            From {overview?.metrics?.count || 0} settled booking{overview?.metrics?.count === 1 ? '' : 's'}
          </div>
        </div>

        <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Pending Payouts</p>
          <h2 className="text-4xl font-black text-navy-800 mb-4 tabular-nums">₹{Number(overview?.metrics?.pendingAmount || 0).toLocaleString('en-IN')}</h2>
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold">
            <Clock size={14} /> {overview?.metrics?.nextPayoutDate ? `Next payout ${new Date(overview.metrics.nextPayoutDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : 'No payout scheduled yet'}
          </div>
        </div>

        <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Paid Out (Life-to-Date)</p>
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
                <button className="text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-2">
                   Filter <Filter size={14} />
                </button>
             </div>
             
             <div className="divide-y divide-slate-50">
                {overview?.recentSettlements?.map((s, i) => (
                  <div key={i} className="p-6 hover:bg-slate-50 transition-all group">
                     <div className="flex items-center justify-between">
                        <div className="flex items-center gap-5">
                           <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center font-black group-hover:bg-blue-600 group-hover:text-white transition-all">
                              S
                           </div>
                           <div>
                              <p className="text-sm font-black text-slate-900">ID: #{s.id.slice(0, 8)}</p>
                              <p className="text-[10px] text-slate-500 font-medium">Generated: {new Date(s.createdAt).toLocaleDateString()}</p>
                           </div>
                        </div>
                        <div className="text-right">
                           <p className="text-lg font-black text-slate-900">₹ {Number(s.netPayable).toLocaleString()}</p>
                           <button 
                             onClick={() => setSelectedSettlement(s)}
                             className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline"
                           >
                             View Breakdown
                           </button>
                        </div>
                     </div>
                  </div>
                ))}
                {overview?.recentSettlements?.length === 0 && (
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
                 Payout Queue
                 <Clock className="text-blue-500" size={18} />
              </h3>
              
              <div className="space-y-6">
                {payouts.slice(0, 3).map((p, i) => (
                  <div key={i} className="relative pl-6 border-l-2 border-slate-100">
                    <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-sm" />
                    <p className="text-xs font-black text-slate-900">₹ {Number(p.totalAmount).toLocaleString()}</p>
                    <p className="text-[10px] text-slate-500 font-medium mb-2">{p.status} • Ref: {p.reference || 'N/A'}</p>
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-[8px] font-black uppercase tracking-widest border border-blue-100">
                       Processing
                    </span>
                  </div>
                ))}
                {payouts.length === 0 && (
                  <p className="text-[10px] text-slate-400 font-medium text-center py-4 italic">No payouts currently in queue.</p>
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
