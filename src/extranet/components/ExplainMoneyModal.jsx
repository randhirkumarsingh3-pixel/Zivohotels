import { useState, useEffect } from 'react';
import { X, IndianRupee, Info, ShieldCheck, Loader2 } from 'lucide-react';
import { fetchSettlementDetails } from '../../services/extranetApi';

const ExplainMoneyModal = ({ isOpen, onClose, settlementId }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && settlementId) {
      setLoading(true);
      fetchSettlementDetails(settlementId)
        .then(res => setData(res))
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
    }
  }, [isOpen, settlementId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in duration-200">
        <div className="p-8 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-xl font-black text-slate-900">Explain Money</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={24} />
          </button>
        </div>

        <div className="p-8">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
          ) : (
            <div className="space-y-8">
              {/* Gross Amount */}
              <div className="flex justify-between items-end pb-6 border-b border-dashed border-slate-200">
                 <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Gross Booking Value</p>
                    <p className="text-3xl font-black text-slate-900">₹ {data.grossBooking.toLocaleString()}</p>
                 </div>
                 <div className="px-3 py-1 bg-green-50 text-green-600 rounded-full text-[10px] font-black uppercase tracking-widest">
                    Captured
                 </div>
              </div>

              {/* Deductions Breakdown */}
              <div className="space-y-4">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Deductions & Fees</p>
                 {data.deductions.map((d, i) => (
                   <div key={i} className="flex justify-between items-center group">
                      <div className="flex items-center gap-2">
                         <span className="text-sm font-bold text-slate-600">{d.label}</span>
                         <Info size={12} className="text-slate-300 group-hover:text-blue-500 transition-colors cursor-help" />
                      </div>
                      <span className="text-sm font-black text-red-500">- ₹ {d.amount.toLocaleString()}</span>
                   </div>
                 ))}
              </div>

              {/* Net Payable */}
              <div className="bg-slate-900 rounded-3xl p-6 text-white shadow-xl">
                 <div className="flex justify-between items-center mb-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Net Payout Amount</p>
                    <ShieldCheck className="text-blue-400" size={18} />
                 </div>
                 <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black">₹ {data.netPayable.toLocaleString()}</span>
                    <span className="text-xs text-slate-400 font-bold">INR</span>
                 </div>
              </div>

              {/* Payout Information */}
              <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-2xl border border-blue-100">
                 <Info className="text-blue-600 mt-0.5" size={16} />
                 <div>
                    <p className="text-xs font-black text-blue-900">Payout Eligibility</p>
                    <p className="text-[10px] text-blue-700 font-medium">
                       Eligible for release on <strong>{new Date(data.payoutEligibility).toLocaleDateString()}</strong> after the {data.status === 'PENDING' ? 'T+2' : 'standard'} hold period.
                    </p>
                 </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExplainMoneyModal;
