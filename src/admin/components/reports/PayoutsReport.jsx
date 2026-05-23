import React from 'react';
import DataTable from '../DataTable';

const PayoutsReport = () => {
  const data = [
    { property: 'Zivo Grand Palace', revenue: '₹1,50,000', deducted: '₹40,500', net: '₹1,09,500', status: 'Paid' },
    { property: 'Zivo Premium Resort', revenue: '₹80,000', deducted: '₹24,000', net: '₹56,000', status: 'Pending' },
    { property: 'Zivo Tech Retreat', revenue: '₹3,20,000', deducted: '₹76,800', net: '₹2,43,200', status: 'Paid' },
  ];

  const columns = [
    { header: "Property", accessor: "property", cell: (row) => <span className="font-semibold text-gray-900">{row.property}</span> },
    { header: "Total Revenue", accessor: "revenue" },
    { header: "Deductions (Comm + GST)", accessor: "deducted", cell: (row) => <span className="text-red-500 font-medium">-{row.deducted}</span> },
    { header: "Net Payout", accessor: "net", cell: (row) => <span className="font-bold text-gray-900 text-lg">{row.net}</span> },
    { 
      header: "Payment Status", 
      accessor: "status",
      cell: (row) => {
        const colors = {
          'Paid': 'bg-green-50 text-green-700 ring-green-600/20',
          'Pending': 'bg-orange-50 text-orange-700 ring-orange-600/20',
        };
        return <span className={`px-2.5 py-1 rounded-md text-xs font-medium ring-1 ${colors[row.status]}`}>{row.status}</span>;
      }
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500 font-medium">Total Pending Payouts</p>
            <h3 className="text-3xl font-bold text-orange-500 mt-2">₹56,000</h3>
            <p className="text-xs text-gray-400 mt-1">Across 1 property</p>
          </div>
          <button className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm">
            Process Payouts
          </button>
        </div>
        
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-sm text-gray-500 font-medium">Total Paid (This Month)</p>
          <h3 className="text-3xl font-bold text-green-600 mt-2">₹3,52,700</h3>
          <p className="text-xs text-gray-400 mt-1">Across 2 properties</p>
        </div>
      </div>

      <DataTable 
        title="Owner Payout Summary" 
        data={data} 
        columns={columns} 
      />
    </div>
  );
};

export default PayoutsReport;
