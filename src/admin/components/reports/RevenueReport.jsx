import DataTable from '../DataTable';

const RevenueReport = () => {
  const data = [
    { property: 'Zivo Grand Palace', value: '₹1,50,000', commissionPercent: '15%', commission: '₹22,500', gst: '₹18,000', net: '₹1,09,500' },
    { property: 'Zivo Premium Resort', value: '₹80,000', commissionPercent: '18%', commission: '₹14,400', gst: '₹9,600', net: '₹56,000' },
    { property: 'Zivo Tech Retreat', value: '₹3,20,000', commissionPercent: '12%', commission: '₹38,400', gst: '₹38,400', net: '₹2,43,200' },
  ];

  const columns = [
    { header: "Property", accessor: "property", cell: (row) => <span className="font-semibold text-gray-900">{row.property}</span> },
    { header: "Gross Booking Value", accessor: "value", cell: (row) => <span className="font-medium text-gray-700">{row.value}</span> },
    { header: "Comm. %", accessor: "commissionPercent", cell: (row) => <span className="text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded text-xs">{row.commissionPercent}</span> },
    { header: "Platform Commission", accessor: "commission", cell: (row) => <span className="font-bold text-green-600">{row.commission}</span> },
    { header: "GST Amount", accessor: "gst", cell: (row) => <span className="text-gray-500">{row.gst}</span> },
    { header: "Net Payout", accessor: "net", cell: (row) => <span className="font-bold text-gray-900">{row.net}</span> },
  ];

  return (
    <div className="space-y-6">
      {/* Mock Line Chart Visualization */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
        <h3 className="font-bold text-gray-800 text-lg mb-6 flex justify-between">
          Revenue vs Commission Trends
          <div className="flex space-x-4 text-sm font-normal">
            <span className="flex items-center"><div className="w-3 h-3 bg-blue-500 rounded-full mr-2"></div> Gross Revenue</span>
            <span className="flex items-center"><div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div> Commission</span>
          </div>
        </h3>
        <div className="relative h-48 w-full border-b border-l border-gray-200">
          {/* Simulated Line Graph using SVG */}
          <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
            {/* Grid lines */}
            <line x1="0" y1="25" x2="100" y2="25" stroke="#f3f4f6" strokeWidth="0.5" />
            <line x1="0" y1="50" x2="100" y2="50" stroke="#f3f4f6" strokeWidth="0.5" />
            <line x1="0" y1="75" x2="100" y2="75" stroke="#f3f4f6" strokeWidth="0.5" />
            
            {/* Gross Revenue Line */}
            <polyline 
              fill="none" 
              stroke="#3b82f6" 
              strokeWidth="2" 
              points="0,80 15,60 30,70 45,40 60,30 75,45 90,20 100,10" 
            />
            
            {/* Commission Line */}
            <polyline 
              fill="none" 
              stroke="#22c55e" 
              strokeWidth="2" 
              points="0,95 15,90 30,92 45,85 60,82 75,85 90,75 100,70" 
            />
          </svg>
        </div>
      </div>

      <DataTable 
        title="Commission & Revenue Report" 
        data={data} 
        columns={columns} 
      />
    </div>
  );
};

export default RevenueReport;
