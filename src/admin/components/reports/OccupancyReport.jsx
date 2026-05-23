import React from 'react';
import DataTable from '../DataTable';

const OccupancyReport = () => {
  const data = [
    { property: 'Zivo Grand Palace', rooms: 50, booked: 42, alos: '2.5 Nights', occupancy: '84%' },
    { property: 'Zivo Premium Resort', rooms: 30, booked: 12, alos: '4.1 Nights', occupancy: '40%' },
    { property: 'Zivo Tech Retreat', rooms: 100, booked: 95, alos: '1.2 Nights', occupancy: '95%' },
  ];

  const columns = [
    { header: "Property Name", accessor: "property", cell: (row) => <span className="font-semibold text-gray-900">{row.property}</span> },
    { header: "Total Rooms", accessor: "rooms" },
    { header: "Booked Rooms", accessor: "booked" },
    { header: "ALOS", accessor: "alos" },
    { header: "Occupancy %", accessor: "occupancy", cell: (row) => (
      <div className="flex items-center">
        <span className="font-bold text-brand-600 w-12">{row.occupancy}</span>
        <div className="w-24 h-2 bg-gray-200 rounded-full ml-2 overflow-hidden">
          <div className="h-full bg-brand-500 rounded-full" style={{ width: row.occupancy }}></div>
        </div>
      </div>
    ) },
  ];

  return (
    <div className="space-y-6">
      {/* Mock Bar Chart Visualization */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <h3 className="font-bold text-gray-800 text-lg mb-6">Occupancy Trends (Last 7 Days)</h3>
        <div className="flex items-end space-x-2 h-48 border-b border-l border-gray-200 p-2 pb-0 pt-6">
          {/* Bars */}
          {[40, 55, 70, 85, 95, 80, 60].map((val, idx) => (
            <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full group relative">
              <div 
                className="w-full bg-brand-500 rounded-t-sm hover:bg-brand-600 transition-all duration-300 relative group"
                style={{ height: `${val}%` }}
              >
                <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity bg-white px-2 py-1 shadow rounded">{val}%</span>
              </div>
              <span className="text-xs text-gray-400 mt-2 rotate-45 origin-top-left -ml-2">Day {idx+1}</span>
            </div>
          ))}
        </div>
      </div>

      <DataTable 
        title="Property Occupancy Report" 
        data={data} 
        columns={columns} 
      />
    </div>
  );
};

export default OccupancyReport;
