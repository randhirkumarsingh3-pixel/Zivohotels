import DataTable from '../DataTable';

const BookingsReport = () => {
  const data = [
    { id: 'BK-101', guest: 'Rohan Sharma', property: 'Zivo Grand', room: 'Deluxe', dates: '24 Oct - 26 Oct', status: 'Confirmed', source: 'Web', leadTime: '5 days' },
    { id: 'BK-102', guest: 'Priya Singh', property: 'Zivo Resort', room: 'Suite', dates: '25 Oct - 28 Oct', status: 'Tentative', source: 'Direct', leadTime: '1 day' },
    { id: 'BK-103', guest: 'Amit Patel', property: 'Zivo Grand', room: 'Standard', dates: '26 Oct - 27 Oct', status: 'Cancelled', source: 'OTA', leadTime: '12 days' },
    { id: 'BK-104', guest: 'Neha Gupta', property: 'Zivo Premium', room: 'Villa', dates: '30 Oct - 02 Nov', status: 'Confirmed', source: 'Web', leadTime: '20 days' },
  ];

  const columns = [
    { header: "Booking ID", accessor: "id", cell: (row) => <span className="font-mono text-xs font-semibold text-gray-600 bg-gray-100 px-2 py-1 rounded">{row.id}</span> },
    { header: "Guest Name", accessor: "guest", cell: (row) => <span className="font-semibold text-gray-900">{row.guest}</span> },
    { header: "Property", accessor: "property" },
    { header: "Room Type", accessor: "room" },
    { header: "Check In-Out", accessor: "dates", cell: (row) => <span className="text-gray-500 text-xs">{row.dates}</span> },
    { 
      header: "Status", 
      accessor: "status",
      cell: (row) => {
        const colors = {
          'Confirmed': 'bg-green-50 text-green-700 ring-green-600/20',
          'Tentative': 'bg-orange-50 text-orange-700 ring-orange-600/20',
          'Cancelled': 'bg-red-50 text-red-700 ring-red-600/20'
        };
        return <span className={`px-2.5 py-1 rounded-md text-xs font-medium ring-1 ${colors[row.status]}`}>{row.status}</span>;
      }
    },
    { header: "Source", accessor: "source" },
    { header: "Lead Time", accessor: "leadTime" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-sm text-gray-500 font-medium">Total Bookings</p>
          <h3 className="text-2xl font-bold text-gray-900 mt-1">1,248</h3>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-sm text-gray-500 font-medium">Web Bookings (Direct)</p>
          <h3 className="text-2xl font-bold text-green-600 mt-1">68%</h3>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-sm text-gray-500 font-medium">Cancellation Rate</p>
          <h3 className="text-2xl font-bold text-red-500 mt-1">12%</h3>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-sm text-gray-500 font-medium">Avg Lead Time</p>
          <h3 className="text-2xl font-bold text-brand-600 mt-1">14 Days</h3>
        </div>
      </div>

      <DataTable 
        title="Booking Summary Report" 
        data={data} 
        columns={columns} 
      />
    </div>
  );
};

export default BookingsReport;
