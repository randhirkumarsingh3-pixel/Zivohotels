const KPIMetric = ({ label, value, delta, deltaType, _color = 'gray' }) => {
  const colorMap = {
    green: 'text-green-700 bg-green-50',
    yellow: 'text-orange-700 bg-orange-50',
    red: 'text-red-600 bg-red-50',
    brand: 'text-brand-700 bg-brand-50',
    gray: 'text-gray-600 bg-gray-50'
  };

  return (
    <div className="flex items-center gap-6 px-8 border-r border-gray-100 last:border-0 group cursor-pointer hover:bg-gray-50 transition-colors h-full">
      <div className="flex flex-col">
        <span className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-0.5">{label}</span>
        <div className="flex items-center gap-3">
           <span className="text-xl font-black text-gray-900 tracking-tight">{value}</span>
           {delta && (
             <span className={`text-xs font-black px-2 py-0.5 rounded-full ${colorMap[deltaType]}`}>
               {delta}
             </span>
           )}
        </div>
      </div>
    </div>
  );
};

const StickyKPIStrip = ({ metrics }) => {
  return (
    <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-100 h-20 shadow-sm flex items-center overflow-x-auto no-scrollbar">
      <div className="flex items-center h-full">
        {metrics.map((m, i) => (
          <KPIMetric key={i} {...m} />
        ))}
      </div>
      
    </div>
  );
};

export default StickyKPIStrip;
