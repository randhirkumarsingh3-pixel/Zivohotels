import { useState } from 'react';
import { 
  ShieldAlert, AlertTriangle, UserX, CheckCircle, 
  Search, Filter, ShieldCheck, Activity, Eye,
  Lock, Unlock, Zap
} from 'lucide-react';

const RiskMeter = ({ score }) => {
  const color = score > 80 ? 'bg-red-500' : score > 50 ? 'bg-orange-500' : 'bg-green-500';
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-gray-100 h-2 rounded-full overflow-hidden">
        <div className={`${color} h-full transition-all duration-1000`} style={{ width: `${score}%` }}></div>
      </div>
      <span className="text-xs font-black text-gray-900 w-8">{score}</span>
    </div>
  );
};

const FraudRiskCenter = () => {
  const [view, setView] = useState('QUEUE');

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Fraud & Risk Center</h1>
          <p className="text-gray-500 font-medium mt-1">Multi-factor weighted risk scoring and threat prevention.</p>
        </div>

        <div className="flex bg-white rounded-2xl border border-gray-100 p-1.5 shadow-sm">
          {['QUEUE', 'BLOCKED', 'ANALYTICS'].map(tab => (
            <button 
              key={tab}
              onClick={() => setView(tab)}
              className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${view === tab ? 'bg-red-600 text-white shadow-lg shadow-red-600/20' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Risk Pulse */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-red-50 border border-red-100 rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4">
            <AlertTriangle className="text-red-600" size={24} />
            <span className="text-[10px] font-black text-red-400 uppercase tracking-widest">Immediate Action</span>
          </div>
          <h3 className="text-3xl font-black text-red-900">12</h3>
          <p className="text-xs font-bold text-red-700 mt-1 uppercase tracking-tighter">Flagged Transactions</p>
        </div>

        <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Blocked Users</p>
          <h3 className="text-3xl font-black text-gray-900">1,242</h3>
          <p className="text-xs font-medium text-gray-400 mt-1">All-time prevention</p>
        </div>

        <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Platform Risk Score</p>
          <div className="flex items-end gap-2 mt-1">
            <h3 className="text-3xl font-black text-green-600">14</h3>
            <span className="text-[10px] text-gray-400 font-bold mb-1">/ 100</span>
          </div>
          <p className="text-xs font-medium text-gray-400 mt-1">LOW RISK (HEALTHY)</p>
        </div>

        <div className="bg-gray-900 rounded-3xl p-6 text-white shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <Zap className="text-brand-500" size={20} fill="currentColor" />
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Active Guard</span>
          </div>
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Auto-Throttle</p>
          <h3 className="text-xl font-black text-brand-500 uppercase">STANDBY</h3>
          <p className="text-[10px] text-gray-500 mt-2 font-medium">Ready to engage on spike.</p>
        </div>
      </div>

      {/* Verification Queue */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-xl font-black text-gray-900">Verification Queue</h3>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
              <input type="text" placeholder="Search..." className="pl-9 pr-4 py-2 bg-gray-50 border-gray-100 border rounded-xl text-xs outline-none focus:ring-2 focus:ring-brand-500/20" />
            </div>
            <button className="px-4 py-2 bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl">Bulk Approve</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Entity / User</th>
                <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Risk Signal</th>
                <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Exposure</th>
                <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Risk Score</th>
                <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {[1, 2, 3].map(i => (
                <tr key={i} className="hover:bg-gray-50/50 transition-all">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-red-600 border border-red-50">
                        <UserX size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900">Arjun Sharma</p>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">IP: 103.21.XX.XX · New Delhi</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="space-y-1">
                      <span className="px-2 py-0.5 bg-red-50 text-red-700 text-[9px] font-black rounded uppercase tracking-widest border border-red-100">VELOCITY_SPIKE</span>
                      <p className="text-xs text-gray-500 font-medium">3 bookings in 2m from same card fingerprint.</p>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <p className="text-sm font-black text-gray-900">₹ 24,500.00</p>
                    <p className="text-[10px] text-gray-400 font-medium italic">Unsettled liability</p>
                  </td>
                  <td className="px-8 py-6 w-48">
                    <RiskMeter score={82 + i * 2} />
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button className="p-2 text-gray-400 hover:bg-gray-100 hover:text-brand-600 rounded-lg transition-all" title="View Details">
                        <Eye size={18} />
                      </button>
                      <button className="p-2 text-gray-400 hover:bg-green-50 hover:text-green-600 rounded-lg transition-all" title="Approve">
                        <ShieldCheck size={18} />
                      </button>
                      <button className="p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all" title="Block User">
                        <Lock size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Intelligence Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
          <h3 className="text-lg font-black text-gray-900 mb-6 flex items-center gap-2">
            <Activity className="text-brand-600" size={20} />
            Fraud Trend (Last 24h)
          </h3>
          <div className="h-48 bg-gray-50 rounded-2xl border border-dashed border-gray-200 flex items-center justify-center">
            <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Risk Velocity Chart</span>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
          <h3 className="text-lg font-black text-gray-900 mb-6 flex items-center gap-2">
            <ShieldAlert className="text-orange-500" size={20} />
            Risk Factors Breakdown
          </h3>
          <div className="space-y-4">
            {[
              { label: 'Payment Failures', pct: 45, color: 'bg-red-500' },
              { label: 'New Device Logins', pct: 28, color: 'bg-orange-500' },
              { label: 'Unusual Geo-location', pct: 15, color: 'bg-blue-500' },
              { label: 'Email Mismatch', pct: 12, color: 'bg-gray-400' }
            ].map(f => (
              <div key={f.label}>
                <div className="flex justify-between items-end mb-1">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{f.label}</span>
                  <span className="text-xs font-bold text-gray-900">{f.pct}%</span>
                </div>
                <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                  <div className={`${f.color} h-full`} style={{ width: `${f.pct}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FraudRiskCenter;
