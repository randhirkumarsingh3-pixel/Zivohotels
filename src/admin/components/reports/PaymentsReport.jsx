import React from 'react';
import DataTable from '../DataTable';

const PaymentsReport = () => {
  const data = [
    { id: 'BK-101', type: 'Prepaid', paid: '₹4,500', pending: '₹0', status: 'Paid', txnId: 'pay_M9aK...' },
    { id: 'BK-102', type: 'Partial', paid: '₹2,000', pending: '₹6,000', status: 'Partial Paid', txnId: 'pay_M9bX...' },
    { id: 'BK-103', type: 'Prepaid', paid: '₹12,000', pending: '₹0', status: 'Refunded', txnId: 'pay_M9cL...' },
    { id: 'BK-104', type: 'Pay@Hotel', paid: '₹0', pending: '₹8,500', status: 'Pending', txnId: '-' },
  ];

  const columns = [
    { header: "Booking ID", accessor: "id", cell: (row) => <span className="font-mono text-xs font-semibold text-gray-600 bg-gray-100 px-2 py-1 rounded">{row.id}</span> },
    { header: "Payment Type", accessor: "type" },
    { header: "Paid Amount", accessor: "paid", cell: (row) => <span className="font-semibold text-green-600">{row.paid}</span> },
    { header: "Pending Amount", accessor: "pending", cell: (row) => <span className="font-semibold text-red-500">{row.pending}</span> },
    { 
      header: "Status", 
      accessor: "status",
      cell: (row) => {
        const colors = {
          'Paid': 'bg-green-50 text-green-700 ring-green-600/20',
          'Partial Paid': 'bg-blue-50 text-blue-700 ring-blue-600/20',
          'Pending': 'bg-orange-50 text-orange-700 ring-orange-600/20',
          'Refunded': 'bg-gray-50 text-gray-700 ring-gray-600/20'
        };
        return <span className={`px-2.5 py-1 rounded-md text-xs font-medium ring-1 ${colors[row.status]}`}>{row.status}</span>;
      }
    },
    { header: "Transaction ID", accessor: "txnId", cell: (row) => <span className="font-mono text-xs text-gray-500">{row.txnId}</span> },
  ];

  return (
    <div className="space-y-6">
      {/* Mock Pie Chart Visualization using SVG and Flexbox */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-center gap-8">
        <div className="w-48 h-48 relative">
          <svg viewBox="0 0 36 36" className="w-full h-full rotate-[-90deg]">
            {/* Background circle */}
            <path className="text-gray-100 stroke-current" strokeWidth="8" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
            {/* Slice 1: Prepaid (60%) */}
            <path className="text-brand-600 stroke-current" strokeWidth="8" strokeDasharray="60, 100" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
            {/* Slice 2: Partial (25%) */}
            <path className="text-blue-500 stroke-current" strokeWidth="8" strokeDasharray="25, 100" strokeDashoffset="-60" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
            {/* Slice 3: Pay@Hotel (15%) */}
            <path className="text-orange-400 stroke-current" strokeWidth="8" strokeDasharray="15, 100" strokeDashoffset="-85" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center flex-col">
            <span className="text-2xl font-bold text-gray-800">₹8.4L</span>
            <span className="text-xs text-gray-500">Total Collected</span>
          </div>
        </div>

        <div className="flex-1 space-y-4">
          <h3 className="font-bold text-gray-800 text-lg border-b pb-2">Payment Distribution</h3>
          <div className="flex items-center justify-between">
            <div className="flex items-center"><span className="w-3 h-3 rounded-full bg-brand-600 mr-2"></span><span className="text-sm font-medium text-gray-700">Prepaid Bookings</span></div>
            <span className="font-bold text-gray-900">60%</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center"><span className="w-3 h-3 rounded-full bg-blue-500 mr-2"></span><span className="text-sm font-medium text-gray-700">Partial Payments</span></div>
            <span className="font-bold text-gray-900">25%</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center"><span className="w-3 h-3 rounded-full bg-orange-400 mr-2"></span><span className="text-sm font-medium text-gray-700">Pay at Hotel</span></div>
            <span className="font-bold text-gray-900">15%</span>
          </div>
        </div>
      </div>

      <DataTable 
        title="Payment Collection Report" 
        data={data} 
        columns={columns} 
      />
    </div>
  );
};

export default PaymentsReport;
