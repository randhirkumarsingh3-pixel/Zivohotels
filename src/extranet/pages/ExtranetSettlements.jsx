import { useState } from 'react';
import { Download, Search, 
  ArrowRight,
  HelpCircle
} from 'lucide-react';

const ExtranetSettlements = () => {
  const [activeTab, setActiveTab] = useState('EARNINGS');

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Payments & Settlements</h1>
          <p className="text-gray-500 font-medium mt-1">Track your earnings and payout schedule.</p>
        </div>

        <div className="flex bg-white rounded-2xl border border-gray-100 p-1.5 shadow-sm">
          {['EARNINGS', 'PAYOUTS'].map(tab => (
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

      {/* Financial Pulse */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gray-900 rounded-3xl p-6 text-white shadow-xl shadow-gray-900/10">
          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Total Earnings (MTD)</p>
          <h3 className="text-3xl font-black">₹ 1,42,850</h3>
          <div className="mt-4 pt-4 border-t border-gray-800 flex items-center justify-between">
            <span className="text-[10px] font-black text-green-500 uppercase tracking-widest">+12% vs last month</span>
            <ArrowRight size={14} className="text-gray-600" />
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Next Scheduled Payout</p>
          <div className="flex items-center gap-2 mt-1">
            <h3 className="text-3xl font-black text-gray-900">₹ 42,500</h3>
            <span className="text-[10px] bg-brand-50 text-brand-600 px-2 py-0.5 rounded-full font-black uppercase tracking-tighter">READY</span>
          </div>
          <p className="text-[10px] text-gray-400 mt-2 font-bold uppercase tracking-widest">Expected Date: May 05, 2026</p>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Outstanding Commission</p>
          <h3 className="text-3xl font-black text-gray-900">₹ 21,420</h3>
          <p className="text-[10px] text-gray-400 mt-2 font-medium">To be deducted from current bookings.</p>
        </div>
      </div>

      {/* Main List */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-4 flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input 
                type="text" 
                placeholder="Search bookings or payouts..."
                className="w-full bg-white border-gray-200 border rounded-xl py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all"
              />
            </div>
          </div>
          <button className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-black transition-all">
            <Download size={16} /> Export CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Booking ID / Guest</th>
                <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Gross Amount</th>
                <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Zivo Comm (15%)</th>
                <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Net Payable</th>
                <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {[1, 2, 3, 4, 5].map(i => (
                <tr key={i} className="hover:bg-gray-50/50 transition-all cursor-pointer">
                  <td className="px-8 py-6">
                    <p className="text-sm font-bold text-gray-900">#ZIVO-8271{i}</p>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">Rajesh Kumar · Deluxe Room</p>
                  </td>
                  <td className="px-8 py-6">
                    <p className="text-sm font-bold text-gray-900">₹ 8,000.00</p>
                  </td>
                  <td className="px-8 py-6 text-center">
                    <p className="text-sm font-bold text-red-500">- ₹ 1,200.00</p>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <p className="text-sm font-black text-green-600">₹ 6,800.00</p>
                  </td>
                  <td className="px-8 py-6 text-center">
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${i === 3 ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-green-50 text-green-600 border-green-100'}`}>
                      {i === 3 ? 'PENDING' : 'PAID'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-brand-50 border border-brand-100 rounded-3xl p-8 flex items-start gap-6">
        <div className="p-3 bg-white rounded-2xl text-brand-600 shadow-sm">
          <HelpCircle size={24} />
        </div>
        <div>
          <h3 className="text-sm font-black text-brand-900 uppercase tracking-tight">Need help with payments?</h3>
          <p className="text-sm text-brand-800 leading-relaxed mt-1 font-medium">
            Settlements are processed 24 hours after guest checkout. If you see a discrepancy, please contact our Finance Desk at <strong>finance@zivohotels.com</strong> or raise a ticket in the Settings tab.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ExtranetSettlements;
