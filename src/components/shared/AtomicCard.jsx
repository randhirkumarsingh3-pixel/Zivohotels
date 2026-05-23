import { TrendingUp, TrendingDown, Info, ChevronRight, Activity } from 'lucide-react';

/**
 * AtomicCard
 * Standardized design token for all dashboards.
 */

const AtomicCard = ({ 
  title, 
  value, 
  subtitle, 
  delta, 
  deltaType, // 'up' | 'down' | 'neutral'
  type = 'KPI', // 'KPI' | 'ALERT' | 'INSIGHT' | 'ACTION'
  icon: Icon,
  color = 'brand',
  onClick,
  loading = false
}) => {
  const colorStyles = {
    brand: 'bg-brand-50 text-brand-600 border-brand-100',
    red: 'bg-red-50 text-red-600 border-red-100',
    orange: 'bg-orange-50 text-orange-600 border-orange-100',
    green: 'bg-green-50 text-green-600 border-green-100',
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
  };

  if (loading) return (
    <div className="bg-white rounded-[1.5rem] p-6 border border-gray-100 shadow-sm animate-pulse">
      <div className="flex justify-between items-start mb-4">
        <div className="w-10 h-10 bg-gray-100 rounded-xl"></div>
        <div className="w-12 h-4 bg-gray-50 rounded-lg"></div>
      </div>
      <div className="w-20 h-2 bg-gray-100 rounded-full mb-3"></div>
      <div className="w-32 h-6 bg-gray-100 rounded-xl"></div>
    </div>
  );

  return (
    <div 
      onClick={onClick}
      className={`bg-white rounded-[1.5rem] p-6 border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer group relative overflow-hidden`}
    >
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-xl ${colorStyles[color]} transition-transform group-hover:scale-110`}>
          {Icon ? <Icon size={20} /> : <Activity size={20} />}
        </div>
        
        {delta && (
          <div className={`flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-lg ${deltaType === 'up' ? 'bg-green-50 text-green-600' : deltaType === 'down' ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-400'}`}>
            {deltaType === 'up' ? <TrendingUp size={12} /> : deltaType === 'down' ? <TrendingDown size={12} /> : null}
            {delta}
          </div>
        )}
      </div>

      <div className="space-y-1">
        <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest group-hover:text-brand-500 transition-colors">{title}</p>
        <div className="flex items-baseline gap-2">
           <h3 className="text-2xl font-black text-gray-900 tracking-tight">{value}</h3>
           {subtitle && <span className="text-[10px] text-gray-400 font-bold">{subtitle}</span>}
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-50 flex items-center justify-between">
         <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1">
            <Info size={10} /> Details
         </span>
         <ChevronRight size={14} className="text-gray-300 group-hover:text-brand-500 group-hover:translate-x-1 transition-all" />
      </div>
    </div>
  );
};

export default AtomicCard;
