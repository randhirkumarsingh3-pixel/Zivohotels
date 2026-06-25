import { useState } from 'react';
import { ArrowUpRight, ArrowDownLeft,
  Search, Filter, Download, RefreshCw,
  Lock, Building2, Gift, Shield, Zap
} from 'lucide-react';

const walletAccounts = [
  { 
    id: 'W-001', name: 'Master Escrow', type: 'ESCROW', 
    balance: 4850000, currency: 'INR', status: 'ACTIVE',
    lastTransaction: '2 min ago', transactions: 1247
  },
  { 
    id: 'W-002', name: 'Hotel Payouts Pool', type: 'PAYOUT', 
    balance: 1420000, currency: 'INR', status: 'ACTIVE',
    lastTransaction: '15 min ago', transactions: 842
  },
  { 
    id: 'W-003', name: 'Customer Refunds', type: 'REFUND', 
    balance: 328000, currency: 'INR', status: 'ACTIVE',
    lastTransaction: '1 hr ago', transactions: 156
  },
  { 
    id: 'W-004', name: 'Promo & Cashback', type: 'PROMO', 
    balance: 180000, currency: 'INR', status: 'ACTIVE',
    lastTransaction: '3 hrs ago', transactions: 2104
  },
  { 
    id: 'W-005', name: 'Dispute Hold', type: 'HOLD', 
    balance: 95000, currency: 'INR', status: 'LOCKED',
    lastTransaction: '6 hrs ago', transactions: 28
  },
];

const recentTransactions = [
  { id: 'TXN-89421', type: 'CREDIT', desc: 'Booking #ZIVO-92841 — Prepaid Collection', amount: 24000, wallet: 'Master Escrow', time: '2 min ago', status: 'SUCCESS' },
  { id: 'TXN-89420', type: 'DEBIT', desc: 'Payout to Grand Zivo Palace (#PAY-4821)', amount: 42500, wallet: 'Hotel Payouts Pool', time: '15 min ago', status: 'SUCCESS' },
  { id: 'TXN-89419', type: 'DEBIT', desc: 'Refund to Neha Kapoor (#REF-1123)', amount: 5200, wallet: 'Customer Refunds', time: '1 hr ago', status: 'PROCESSING' },
  { id: 'TXN-89418', type: 'CREDIT', desc: 'Booking #ZIVO-92837 — Prepaid Collection', amount: 9000, wallet: 'Master Escrow', time: '2 hrs ago', status: 'SUCCESS' },
  { id: 'TXN-89417', type: 'DEBIT', desc: 'Cashback Credit: EARLYBIRD20 promo', amount: 900, wallet: 'Promo & Cashback', time: '3 hrs ago', status: 'SUCCESS' },
  { id: 'TXN-89416', type: 'DEBIT', desc: 'Dispute Hold: Double Charge #D-8271', amount: 8420, wallet: 'Dispute Hold', time: '6 hrs ago', status: 'HELD' },
];

const walletTypeStyles = {
  ESCROW: { bg: 'bg-blue-600', icon: Shield },
  PAYOUT: { bg: 'bg-green-600', icon: Building2 },
  REFUND: { bg: 'bg-orange-600', icon: ArrowDownLeft },
  PROMO: { bg: 'bg-purple-600', icon: Gift },
  HOLD: { bg: 'bg-red-600', icon: Lock },
};

const statusStyles = {
  SUCCESS: 'bg-green-50 text-green-600 border-green-100',
  PROCESSING: 'bg-blue-50 text-blue-600 border-blue-100',
  HELD: 'bg-orange-50 text-orange-600 border-orange-100',
  FAILED: 'bg-red-50 text-red-600 border-red-100',
};

const WalletControl = () => {
  const [activeWallet, setActiveWallet] = useState('ALL');
  const totalBalance = walletAccounts.reduce((s, w) => s + w.balance, 0);

  const formatAmount = (amount) => {
    if (amount >= 10000000) return `₹ ${(amount / 10000000).toFixed(2)} Cr`;
    if (amount >= 100000) return `₹ ${(amount / 100000).toFixed(1)}L`;
    return `₹ ${amount.toLocaleString()}`;
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Wallet Control Center</h1>
          <p className="text-gray-500 font-medium mt-1">Manage all internal wallets, fund flows, and dispute holds.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-500 hover:bg-gray-50 transition-all">
            <RefreshCw size={14} /> Reconcile
          </button>
          <button className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-black transition-all">
            <Download size={16} /> Export Ledger
          </button>
        </div>
      </div>

      {/* Master Balance */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-60 h-60 bg-brand-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="relative z-10">
          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Total Platform Balance</p>
          <h2 className="text-5xl font-black mb-6">{formatAmount(totalBalance)}</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {walletAccounts.map(w => {
              const style = walletTypeStyles[w.type];
              const WalletIcon = style.icon;
              return (
                <div key={w.id} className="p-4 bg-white/5 rounded-2xl border border-white/10 hover:bg-white/10 transition-all cursor-pointer">
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-8 h-8 ${style.bg} rounded-lg flex items-center justify-center`}>
                      <WalletIcon size={14} className="text-white" />
                    </div>
                    {w.status === 'LOCKED' && <Lock size={10} className="text-red-400" />}
                  </div>
                  <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">{w.name}</p>
                  <p className="text-lg font-black">{formatAmount(w.balance)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Wallet Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <button 
          onClick={() => setActiveWallet('ALL')}
          className={`p-4 rounded-2xl border text-left transition-all ${activeWallet === 'ALL' ? 'bg-brand-50 border-brand-200' : 'bg-white border-gray-100 hover:border-gray-200'}`}
        >
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">All Wallets</p>
          <p className="text-lg font-black text-gray-900">{recentTransactions.length} txns</p>
        </button>
        {walletAccounts.map(w => (
          <button 
            key={w.id}
            onClick={() => setActiveWallet(w.name)}
            className={`p-4 rounded-2xl border text-left transition-all ${activeWallet === w.name ? 'bg-brand-50 border-brand-200' : 'bg-white border-gray-100 hover:border-gray-200'}`}
          >
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{w.name}</p>
            <p className="text-lg font-black text-gray-900">{w.transactions} txns</p>
          </button>
        ))}
      </div>

      {/* Transaction Log */}
      <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <h3 className="text-xl font-black text-gray-900 flex items-center gap-3">
            <Zap className="text-brand-600" size={20} />
            Live Transaction Feed
          </h3>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input 
                type="text" 
                placeholder="Search transactions..."
                className="bg-white border-gray-200 border rounded-xl py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-brand-500/20 outline-none transition-all w-64"
              />
            </div>
            <button className="p-2.5 border border-gray-200 rounded-xl hover:bg-gray-100 transition-all text-gray-500">
              <Filter size={18} />
            </button>
          </div>
        </div>

        <div className="p-4">
          {recentTransactions
            .filter(t => activeWallet === 'ALL' || t.wallet === activeWallet)
            .map((txn, i) => (
            <div key={i} className="flex items-center justify-between p-5 rounded-2xl hover:bg-gray-50 transition-all border border-transparent hover:border-gray-100">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${txn.type === 'CREDIT' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                  {txn.type === 'CREDIT' ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">{txn.desc}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[10px] font-bold text-gray-400">{txn.id}</span>
                    <span className="text-[10px] text-gray-300">•</span>
                    <span className="text-[10px] font-bold text-brand-600">{txn.wallet}</span>
                    <span className="text-[10px] text-gray-300">•</span>
                    <span className="text-[10px] text-gray-400">{txn.time}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-5">
                <p className={`text-lg font-black ${txn.type === 'CREDIT' ? 'text-green-600' : 'text-red-600'}`}>
                  {txn.type === 'CREDIT' ? '+' : '-'} ₹ {txn.amount.toLocaleString()}
                </p>
                <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${statusStyles[txn.status]}`}>
                  {txn.status}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="p-6 bg-gray-50/50 border-t border-gray-100 text-center">
          <button className="text-xs font-black text-brand-600 uppercase tracking-widest hover:underline flex items-center gap-2 mx-auto">
            View Full Transaction History <ArrowDownLeft size={14} className="rotate-180" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default WalletControl;
