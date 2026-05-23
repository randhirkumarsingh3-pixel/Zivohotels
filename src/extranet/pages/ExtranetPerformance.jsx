import { useState } from 'react';
import { 
  BarChart3, TrendingUp, TrendingDown, Eye, 
  Target, MousePointer2, ChevronRight, Info,
  Zap, Award
} from 'lucide-react';

const PerformanceCard = ({ title, value, trend, trendValue, icon: Icon, color }) => (
  <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
    <div className="flex items-center justify-between mb-4">
      <div className={`p-3 rounded-2xl bg-${color}-50 text-${color}-600`}>
        <Icon size={24} />
      </div>
      {trend && (
        <span className={`flex items-center gap-1 text-sm font-black ${trend === 'up' ? 'text-green-500' : 'text-red-500'}`}>
          {trend === 'up' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          {trendValue}%
        </span>
      )}
    </div>
    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">{title}</p>
    <h3 className="text-3xl font-black text-gray-900 tabular-nums">{value}</h3>
  </div>
);

const ExtranetPerformance = () => {
  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Performance Insights</h1>
          <p className="text-gray-500 font-medium mt-1">See how your property is performing on the Zivo platform.</p>
        </div>

        <div className="flex bg-white rounded-2xl border border-gray-100 p-1.5 shadow-sm">
           <button className="px-6 py-2.5 bg-brand-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-brand-600/20">Last 30 Days</button>
           <button className="px-6 py-2.5 text-gray-400 font-black text-xs uppercase tracking-widest hover:text-gray-600">Last 90 Days</button>
        </div>
      </div>

      {/* Primary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <PerformanceCard 
          title="Search Views" 
          value="4,821" 
          trend="up" 
          trendValue="12.4" 
          icon={Eye} 
          color="blue" 
        />
        <PerformanceCard 
          title="Click-Through (CTR)" 
          value="8.42%" 
          trend="down" 
          trendValue="2.1" 
          icon={MousePointer2} 
          color="purple" 
        />
        <PerformanceCard 
          title="Conversion Rate" 
          value="4.15%" 
          trend="up" 
          trendValue="0.8" 
          icon={Target} 
          color="green" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Ranking Analytics */}
        <div className="lg:col-span-2 bg-white rounded-[2.5rem] border border-gray-100 p-10 shadow-sm">
           <div className="flex items-center justify-between mb-10">
              <h3 className="text-2xl font-black text-gray-900 flex items-center gap-4">
                 <div className="p-3 bg-blue-600 rounded-2xl text-white">
                    <BarChart3 size={24} />
                 </div>
                 Ranking Position Trend
              </h3>
              <div className="bg-brand-50 text-brand-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-brand-100 flex items-center gap-2">
                 <Award size={14} /> Current Rank: #14 in Delhi
              </div>
           </div>

           <div className="h-64 bg-gray-50 rounded-3xl border border-dashed border-gray-200 flex items-center justify-center relative">
              <div className="absolute inset-x-10 bottom-10 flex items-end gap-2 h-40">
                 {[40, 60, 55, 80, 75, 90, 85, 100].map((h, i) => (
                    <div key={i} className="flex-1 bg-blue-100 hover:bg-blue-600 transition-colors rounded-t-lg group relative" style={{ height: `${h}%` }}>
                       <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] font-black px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">Pos: {110 - h}</div>
                    </div>
                 ))}
              </div>
           </div>

           <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-8 pt-10 border-t border-gray-50">
              <div className="space-y-4">
                 <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                    <TrendingDown className="text-red-500" size={16} />
                    Why your ranking dropped?
                 </h4>
                 <div className="space-y-3">
                    <div className="flex items-start gap-3 p-3 bg-red-50 rounded-xl border border-red-100">
                       <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0"></div>
                       <p className="text-xs text-red-900 font-medium leading-relaxed">
                          Low <strong className="font-bold">Image Quality</strong> score detected. High-resolution photos can boost visibility by 15%.
                       </p>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-orange-50 rounded-xl border border-orange-100">
                       <div className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5 shrink-0"></div>
                       <p className="text-xs text-orange-900 font-medium leading-relaxed">
                          Your <strong className="font-bold">Cancellation Rate</strong> (12%) is higher than market average (4%).
                       </p>
                    </div>
                 </div>
              </div>

              <div className="space-y-4">
                 <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                    <TrendingUp className="text-green-500" size={16} />
                    How to improve?
                 </h4>
                 <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-brand-50 rounded-xl border border-brand-100 hover:scale-105 transition-transform cursor-pointer">
                       <p className="text-xs text-brand-900 font-bold">Add "Breakfast Included" rates</p>
                       <ChevronRight size={14} className="text-brand-400" />
                    </div>
                    <div className="flex items-center justify-between p-3 bg-brand-50 rounded-xl border border-brand-100 hover:scale-105 transition-transform cursor-pointer">
                       <p className="text-xs text-brand-900 font-bold">Reply to 4 pending guest reviews</p>
                       <ChevronRight size={14} className="text-brand-400" />
                    </div>
                 </div>
              </div>
           </div>
        </div>

        {/* Visibility Score */}
        <div className="space-y-8">
           <div className="bg-[#0F172A] rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8">
                 <Zap className="text-brand-500 animate-pulse" size={32} fill="currentColor" />
              </div>
              <h3 className="text-xl font-black mb-10">Hotel Health Score</h3>
              
              <div className="flex flex-col items-center justify-center py-6">
                 <div className="relative w-40 h-40 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90">
                       <circle cx="80" cy="80" r="70" className="text-white/5" strokeWidth="12" fill="transparent" stroke="currentColor" />
                       <circle cx="80" cy="80" r="70" className="text-brand-500" strokeWidth="12" fill="transparent" strokeDasharray="440" strokeDashoffset="110" strokeLinecap="round" stroke="currentColor" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                       <span className="text-4xl font-black text-brand-500">72</span>
                       <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">of 100</span>
                    </div>
                 </div>
              </div>

              <div className="mt-8 space-y-4">
                 <div className="flex justify-between items-center text-xs font-bold">
                    <div className="flex items-center gap-2">
                       <span className="text-gray-400 uppercase tracking-widest">Conversion Strength</span>
                       <span className="text-[9px] text-gray-500 font-bold">(30%)</span>
                    </div>
                    <span className="text-brand-400">+24 Impact</span>
                 </div>
                 <div className="flex justify-between items-center text-xs font-bold">
                    <div className="flex items-center gap-2">
                       <span className="text-gray-400 uppercase tracking-widest">Price Competitiveness</span>
                       <span className="text-[9px] text-gray-500 font-bold">(20%)</span>
                    </div>
                    <span className="text-orange-400">-12 Impact</span>
                 </div>
                 <div className="flex justify-between items-center text-xs font-bold">
                    <div className="flex items-center gap-2">
                       <span className="text-gray-400 uppercase tracking-widest">Cancellation Rate</span>
                       <span className="text-[9px] text-gray-500 font-bold">(25%)</span>
                    </div>
                    <span className="text-red-400">-15 Impact</span>
                 </div>
              </div>

              <p className="mt-8 text-[11px] text-gray-500 leading-relaxed italic text-center">
                 Your score is <strong className="text-white">Above Average</strong>. Fix content quality to reach #1 spot in your area.
              </p>
           </div>

           <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
              <h3 className="text-lg font-black text-gray-900 mb-6 flex items-center gap-2">
                 <Info className="text-blue-600" size={20} />
                 Competitor Watch
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed font-medium mb-6">
                 Nearby properties are offering an average discount of <strong className="text-brand-600">12%</strong> for the next week. 
              </p>
              <button className="w-full py-4 bg-gray-50 border border-gray-100 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-900 hover:bg-gray-100 transition-all">
                 View Competitors
              </button>
           </div>
        </div>
      </div>
    </div>
  );
};

export default ExtranetPerformance;
