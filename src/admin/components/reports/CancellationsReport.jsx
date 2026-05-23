import React from 'react';
import DataTable from '../DataTable';

const CancellationsReport = () => {
  const data = [
    { id: 'BK-103', date: '2023-10-22', refund: '₹4,500', status: 'Refunded', reason: 'Change in travel plans' },
    { id: 'BK-108', date: '2023-10-23', refund: '₹1,200', status: 'Pending', reason: 'Health emergency' },
    { id: 'BK-112', date: '2023-10-24', refund: '₹0', status: 'No Refund', reason: 'No show' },
  ];

  const columns = [
    { header: "Booking ID", accessor: "id", cell: (row) => <span className="font-mono text-xs font-semibold text-gray-600 bg-gray-100 px-2 py-1 rounded">{row.id}</span> },
    { header: "Cancel Date", accessor: "date" },
    { header: "Refund Amount", accessor: "refund", cell: (row) => <span className="font-semibold text-gray-900">{row.refund}</span> },
    { 
      header: "Refund Status", 
      accessor: "status",
      cell: (row) => {
        const colors = {
          'Refunded': 'bg-green-50 text-green-700 ring-green-600/20',
          'Pending': 'bg-orange-50 text-orange-700 ring-orange-600/20',
          'No Refund': 'bg-red-50 text-red-700 ring-red-600/20'
        };
        return <span className={`px-2.5 py-1 rounded-md text-xs font-medium ring-1 ${colors[row.status]}`}>{row.status}</span>;
      }
    },
    { header: "Reason", accessor: "reason", cell: (row) => <span className="text-gray-500 italic text-sm">{row.reason}</span> },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm border-l-4 border-l-red-500">
          <p className="text-sm text-gray-500 font-medium">Total Cancellations</p>
          <h3 className="text-2xl font-bold text-gray-900 mt-1">42</h3>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm border-l-4 border-l-orange-400">
          <p className="text-sm text-gray-500 font-medium">Pending Refunds</p>
          <h3 className="text-2xl font-bold text-gray-900 mt-1">₹12,400</h3>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm border-l-4 border-l-green-500">
          <p className="text-sm text-gray-500 font-medium">Refunded Successfully</p>
          <h3 className="text-2xl font-bold text-gray-900 mt-1">₹45,800</h3>
        </div>
      </div>

      <DataTable 
        title="Cancellation & Refund Report" 
        data={data} 
        columns={columns} 
      />
    </div>
  );
};

export default CancellationsReport;
