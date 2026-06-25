import { useState } from 'react';
import { 
  CheckCircle2, Search,
  Filter, Download, Lock, Unlock, ShieldAlert,
  BarChart3, RefreshCw
} from 'lucide-react';

const StatusBadge = ({ status }) => {
  const styles = {
    SUCCESS: 'bg-green-50 text-green-700 border-green-200',
    PENDING: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    FAILED: 'bg-red-50 text-red-700 border-red-200',
    DISPUTED: 'bg-orange-50 text-orange-700 border-orange-200',
    READY: 'bg-brand-50 text-brand-700 border-brand-200',
  };
  return (
    <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${styles[status] || styles.PENDING}`}>
      {status}
    </span>
  );
};

const FinanceOS = () => {
  const [activeTab, setActiveTab] = useState('LEDGER');
  const [isPeriodLocked, setIsPeriodLocked] = useState(true);

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Finance Operating System</h1>
          <p className="text-gray-500 font-medium mt-1">Multi-ledger accounting with dispute management.</p>
        </div>

        <div className="flex items-center gap-4">
           <div className={`flex items-center gap-3 px-4 py-2 rounded-2xl border transition-all ${isPeriodLocked ? 'bg-orange-50 border-orange-100 text-orange-700' : 'bg-green-50 border-green-100 text-green-700'}`}>
              {isPeriodLocked ? <Lock size={16} /> : <Unlock size={16} />}
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-widest leading-none">April 2026</span>
                <span className="text-xs font-bold">{isPeriodLocked ? 'PERIOD_LOCKED' : 'PERIOD_OPEN'}</span>
              </div>
           </div>
           <div className="flex bg-white rounded-2xl border border-gray-100 p-1.5 shadow-sm">
            {['LEDGER', 'DISPUTES', 'PAYOUTS'].map(tab => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/20' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Advanced Financial Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-gray-900 rounded-3xl p-6 text-white shadow-xl">
          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Ledger Integrity</p>
          <div className="flex items-center gap-2 mt-1">
            <h3 className="text-2xl font-black">₹ 0.00</h3>
            <CheckCircle2 size={16} className="text-green-500" />
          </div>
          <p className="text-[10px] text-gray-500 mt-2 font-bold uppercase tracking-widest">Balanced & Audited</p>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Revenue Per User (RPU)</p>
          <div className="flex items-end gap-2">
            <h3 className="text-2xl font-black text-gray-900 mt-1">₹ 8,420</h3>
            <span className="text-[10px] text-green-600 font-bold mb-1">+4%</span>
          </div>
          <p className="text-[10px] text-gray-400 mt-2 font-medium">Blended B2B/B2C Average</p>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Dispute Exposure</p>
          <h3 className="text-2xl font-black text-orange-600 mt-1">₹ 1.2L</h3>
          <p className="text-[10px] text-gray-400 mt-2 font-medium">Funds held in escrow / disputes.</p>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Tax Provisioning (GST)</p>
          <h3 className="text-2xl font-black text-gray-900 mt-1">₹ 4.8L</h3>
          <p className="text-[10px] text-gray-400 mt-2 font-medium">Calculated liability for Q1.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Data Table */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
            <div className="flex items-center gap-4 flex-1 max-w-md">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input 
                  type="text" 
                  placeholder={`Search ${activeTab.toLowerCase()}...`}
                  className="w-full bg-white border-gray-200 border rounded-xl py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all"
                />
              </div>
              <button className="p-2.5 border border-gray-200 rounded-xl hover:bg-gray-100 transition-all text-gray-500">
                <Filter size={18} />
              </button>
            </div>
            <button className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white rounded-xl text-xs font-black uppercase tracking-widest">
              <Download size={16} /> Export
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">ID / Date</th>
                  <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Description</th>
                  <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Amount</th>
                  <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[1, 2, 3, 4, 5].map(i => (
                  <tr key={i} className="hover:bg-gray-50/50 transition-all">
                    <td className="px-8 py-6">
                      <p className="text-xs font-bold text-gray-900">#TRX-8271{i}</p>
                      <p className="text-[10px] text-gray-400 font-medium">May 02, 2026</p>
                    </td>
                    <td className="px-8 py-6">
                      <p className="text-xs font-bold text-gray-900">
                        {activeTab === 'DISPUTES' ? 'Chargeback: Improper Checkout' : 'Commission Accrual: ZIVO-4829'}
                      </p>
                      <p className="text-[10px] text-brand-600 font-black uppercase tracking-tight">Hotel Palace Delhi</p>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <p className={`text-sm font-black ${i === 3 ? 'text-red-600' : 'text-gray-900'}`}>
                        {i === 3 ? '-' : '+'} ₹ 8,420.00
                      </p>
                    </td>
                    <td className="px-8 py-6 text-center">
                      <StatusBadge status={i === 3 ? 'DISPUTED' : i === 4 ? 'READY' : 'SUCCESS'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Dispute Resolution Center */}
        <div className="space-y-8">
           <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
              <h3 className="text-lg font-black text-gray-900 mb-6 flex items-center gap-3">
                <ShieldAlert className="text-orange-500" size={24} />
                Dispute Resolver
              </h3>
              <div className="space-y-4">
                 <div className="p-5 bg-orange-50 rounded-2xl border border-orange-100">
                    <div className="flex justify-between items-start mb-2">
                       <span className="text-[10px] font-black text-orange-600 uppercase tracking-widest">High Priority</span>
                       <span className="text-[10px] font-black text-orange-400">#D-8271</span>
                    </div>
                    <p className="text-sm font-bold text-gray-900 mb-1">Double Charge Reported</p>
                    <p className="text-xs text-gray-500 leading-relaxed font-medium">User #8271 claims Razorpary deducted twice for same booking.</p>
                    <div className="mt-4 flex gap-2">
                       <button className="flex-1 py-2 bg-white border border-orange-200 rounded-xl text-[10px] font-black text-orange-600 uppercase tracking-widest">Verify Gateway</button>
                       <button className="flex-1 py-2 bg-orange-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest">Refund</button>
                    </div>
                 </div>
              </div>
           </div>

           <div className="bg-gray-900 rounded-3xl p-8 text-white shadow-xl">
              <h3 className="text-lg font-black mb-6 flex items-center gap-3">
                <BarChart3 className="text-brand-500" size={24} />
                Reconciliation Tool
              </h3>
              <div className="space-y-6">
                 <div className="flex justify-between items-center text-sm font-bold">
                    <span className="text-gray-400">Gateway Status</span>
                    <span className="text-green-400">SYNCED</span>
                 </div>
                 <div className="flex justify-between items-center text-sm font-bold">
                    <span className="text-gray-400">Mismatches</span>
                    <span className="text-red-400">02 DETECTED</span>
                 </div>
                 <button className="w-full py-4 bg-white/10 hover:bg-white/20 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3">
                    <RefreshCw size={14} /> Run Deep Reconciliation
                 </button>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default FinanceOS;
