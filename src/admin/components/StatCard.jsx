const StatCard = ({ title, value, icon, trend, trendValue, color = "brand" }) => {
  const colorMap = {
    brand: "bg-brand-50 text-brand-600",
    green: "bg-green-50 text-green-600",
    blue: "bg-blue-50 text-blue-600",
    purple: "bg-purple-50 text-purple-600",
    orange: "bg-orange-50 text-orange-600",
    red: "bg-red-50 text-red-600",
  };

  const trendColor = trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-gray-500';

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
          <h3 className="text-2xl font-bold text-gray-900">{value}</h3>
        </div>
        <div className={`p-3 rounded-xl ${colorMap[color] || colorMap.brand}`}>
          {icon}
        </div>
      </div>
      {(trend || trendValue) && (
        <div className="mt-4 flex items-center text-sm">
          <span className={`font-semibold ${trendColor}`}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : ''} {trendValue}
          </span>
          <span className="text-gray-400 ml-2">vs last month</span>
        </div>
      )}
    </div>
  );
};

export default StatCard;
