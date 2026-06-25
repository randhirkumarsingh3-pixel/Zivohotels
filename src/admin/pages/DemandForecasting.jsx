import { useState } from 'react';
import { 
  TrendingUp, BarChart3, 
  Zap, Target, RefreshCw,
  ArrowRight, MapPin,
  Sun, Cloud, CloudRain
} from 'lucide-react';

const forecastData = [
  { date: 'May 16', day: 'Fri', demand: 92, price: 5800, event: 'Weekend', weather: Sun },
  { date: 'May 17', day: 'Sat', demand: 98, price: 6400, event: 'Weekend Peak', weather: Sun },
  { date: 'May 18', day: 'Sun', demand: 85, price: 5200, event: null, weather: Cloud },
  { date: 'May 19', day: 'Mon', demand: 62, price: 4200, event: null, weather: Cloud },
  { date: 'May 20', day: 'Tue', demand: 58, price: 4000, event: null, weather: CloudRain },
  { date: 'May 21', day: 'Wed', demand: 65, price: 4300, event: null, weather: Cloud },
  { date: 'May 22', day: 'Thu', demand: 72, price: 4600, event: 'Corp Season', weather: Sun },
  { date: 'May 23', day: 'Fri', demand: 88, price: 5500, event: 'Weekend', weather: Sun },
  { date: 'May 24', day: 'Sat', demand: 95, price: 6200, event: 'Weekend Peak', weather: Sun },
  { date: 'May 25', day: 'Sun', demand: 78, price: 4800, event: null, weather: Cloud },
];

const cityDemand = [
  { city: 'New Delhi', demand: 'HIGH', score: 92, change: '+8%', events: ['IPL Finals', 'Tech Summit'] },
  { city: 'Mumbai', demand: 'HIGH', score: 88, change: '+5%', events: ['Film Festival'] },
  { city: 'Bangalore', demand: 'MEDIUM', score: 72, change: '+2%', events: [] },
  { city: 'Goa', demand: 'LOW', score: 45, change: '-12%', events: ['Off-Season'] },
  { city: 'Jaipur', demand: 'MEDIUM', score: 68, change: '+15%', events: ['Heritage Week'] },
];

const DemandForecasting = () => {
  const [forecastRange, setForecastRange] = useState('10D');

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Demand Forecasting</h1>
          <p className="text-gray-500 font-medium mt-1">AI-powered demand predictions and pricing recommendations.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-xl border border-green-100">
            <Zap size={14} fill="currentColor" />
            <span className="text-[10px] font-black uppercase tracking-widest">AI Model v3.2 — Last trained: 2hrs ago</span>
          </div>
          <div className="flex bg-white rounded-2xl border border-gray-100 p-1 shadow-sm">
            {['10D', '30D', '90D'].map(r => (
              <button 
                key={r}
                onClick={() => setForecastRange(r)}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${forecastRange === r ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/20' : 'text-gray-400 hover:text-gray-600'}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-gray-900 rounded-3xl p-6 text-white shadow-xl">
          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Predicted Occupancy (7D)</p>
          <div className="flex items-end gap-2 mt-1">
            <h3 className="text-3xl font-black">78%</h3>
            <span className="text-green-400 text-sm font-black mb-1 flex items-center gap-1"><TrendingUp size={14} /> +6%</span>
          </div>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Optimal ADR</p>
          <div className="flex items-end gap-2 mt-1">
            <h3 className="text-3xl font-black text-gray-900">₹ 5,240</h3>
            <span className="text-green-600 text-sm font-black mb-1">+₹ 340</span>
          </div>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Revenue Opportunity</p>
          <h3 className="text-3xl font-black text-brand-600 mt-1">₹ 2.4L</h3>
          <p className="text-[10px] text-gray-400 mt-1 font-medium">If pricing recommendations applied.</p>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Forecast Accuracy</p>
          <h3 className="text-3xl font-black text-green-600 mt-1">94.2%</h3>
          <p className="text-[10px] text-gray-400 mt-1 font-medium">MAPE over last 30 days.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Daily Forecast Grid */}
        <div className="lg:col-span-2 bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-8 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-xl font-black text-gray-900 flex items-center gap-3">
              <BarChart3 className="text-brand-600" size={20} />
              Daily Demand Forecast
            </h3>
            <button className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-500 hover:bg-gray-50">
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
          <div className="p-4">
            <div className="space-y-1">
              {/* Header Row */}
              <div className="grid grid-cols-6 gap-4 px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                <span>Date</span>
                <span>Demand</span>
                <span>Demand Level</span>
                <span>Suggested Rate</span>
                <span>Event</span>
                <span className="text-center">Action</span>
              </div>
              {forecastData.map((d, i) => {
                const WeatherIcon = d.weather;
                return (
                  <div key={i} className="grid grid-cols-6 gap-4 items-center px-5 py-4 rounded-2xl hover:bg-gray-50 transition-all border border-transparent hover:border-gray-100">
                    <div className="flex items-center gap-3">
                      <WeatherIcon size={16} className="text-gray-400" />
                      <div>
                        <p className="text-sm font-black text-gray-900">{d.date}</p>
                        <p className="text-[10px] text-gray-400 font-medium">{d.day}</p>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${d.demand >= 90 ? 'bg-red-500' : d.demand >= 70 ? 'bg-orange-500' : 'bg-brand-500'}`} 
                            style={{ width: `${d.demand}%` }} 
                          />
                        </div>
                        <span className="text-xs font-black text-gray-900 w-8">{d.demand}%</span>
                      </div>
                    </div>
                    <div>
                      <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${d.demand >= 90 ? 'bg-red-50 text-red-600 border-red-100' : d.demand >= 70 ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                        {d.demand >= 90 ? 'SURGE' : d.demand >= 70 ? 'HIGH' : 'NORMAL'}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-black text-green-600">₹ {d.price.toLocaleString()}</p>
                    </div>
                    <div>
                      {d.event ? (
                        <span className="px-2 py-1 bg-purple-50 text-purple-600 border border-purple-100 rounded-lg text-[9px] font-black uppercase tracking-widest">{d.event}</span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </div>
                    <div className="text-center">
                      <button className="px-3 py-1.5 bg-brand-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-brand-700 transition-all">
                        Apply
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="p-6 bg-gray-50/50 border-t border-gray-100 text-center">
            <button className="text-xs font-black text-brand-600 uppercase tracking-widest hover:underline flex items-center gap-2 mx-auto">
              Apply All Recommendations <ArrowRight size={14} />
            </button>
          </div>
        </div>

        {/* Right: City Demand + Insights */}
        <div className="space-y-8">
          <div className="bg-white rounded-[2.5rem] border border-gray-100 p-8 shadow-sm">
            <h3 className="text-lg font-black text-gray-900 mb-6 flex items-center gap-2">
              <MapPin className="text-red-500" size={20} />
              City Demand Map
            </h3>
            <div className="space-y-4">
              {cityDemand.map((c, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-all">
                  <div>
                    <p className="text-sm font-bold text-gray-900">{c.city}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {c.events.map((e, j) => (
                        <span key={j} className="text-[8px] font-black text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded uppercase">{e}</span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-3">
                    <span className={`text-xs font-black ${c.change.startsWith('+') ? 'text-green-600' : 'text-red-500'}`}>{c.change}</span>
                    <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${c.demand === 'HIGH' ? 'bg-red-50 text-red-600 border-red-100' : c.demand === 'MEDIUM' ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                      {c.demand}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-700 to-blue-900 rounded-[2.5rem] p-8 text-white shadow-xl relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-3xl" />
            <h3 className="text-lg font-black mb-4 flex items-center gap-3 relative z-10">
              <Target className="text-blue-300" size={20} />
              AI Insights
            </h3>
            <div className="space-y-4 relative z-10">
              <div className="p-4 bg-white/10 rounded-2xl border border-white/10">
                <p className="text-[10px] font-black text-blue-300 uppercase tracking-widest mb-1">Revenue Opportunity</p>
                <p className="text-sm font-medium text-blue-100 leading-relaxed">
                  Increase weekend rates by <strong className="text-white">15%</strong> — demand consistently exceeds supply on Fri-Sat.
                </p>
              </div>
              <div className="p-4 bg-white/10 rounded-2xl border border-white/10">
                <p className="text-[10px] font-black text-orange-300 uppercase tracking-widest mb-1">Risk Alert</p>
                <p className="text-sm font-medium text-blue-100 leading-relaxed">
                  Midweek demand is <strong className="text-white">dropping 8%</strong> — consider a Tuesday-Thursday promotion.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DemandForecasting;
