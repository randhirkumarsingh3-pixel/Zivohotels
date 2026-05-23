import { useState } from 'react';
import { FileDown, Filter, Calendar, MapPin, Building2, ChevronDown, ChevronUp } from 'lucide-react';
import BookingsReport from '../components/reports/BookingsReport';
import PaymentsReport from '../components/reports/PaymentsReport';
import CancellationsReport from '../components/reports/CancellationsReport';
import OccupancyReport from '../components/reports/OccupancyReport';
import RevenueReport from '../components/reports/RevenueReport';
import PayoutsReport from '../components/reports/PayoutsReport';

const Reports = () => {
  const [activeTab, setActiveTab] = useState('bookings');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const tabs = [
    { id: 'bookings', name: 'Bookings' },
    { id: 'payments', name: 'Payments' },
    { id: 'cancellations', name: 'Cancellations' },
    { id: 'occupancy', name: 'Occupancy' },
    { id: 'revenue', name: 'Revenue & Commission' },
    { id: 'payouts', name: 'Owner Payout' },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
          <p className="text-gray-500 mt-1">Generate and export comprehensive performance reports.</p>
        </div>
        <div className="flex space-x-3">
          <button className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg font-medium text-sm transition-colors shadow-sm">
            CSV
          </button>
          <button className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg font-medium text-sm transition-colors shadow-sm">
            Excel
          </button>
          <button className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center transition-colors shadow-sm">
            <FileDown size={16} className="mr-1.5" /> Export PDF
          </button>
        </div>
      </div>

      {/* Filter Panel */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-3">
          <h3 className="font-bold text-gray-800 flex items-center">
            <Filter size={18} className="mr-2 text-gray-500" /> Master Filter
          </h3>
          <button 
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-brand-600 text-sm font-medium hover:underline flex items-center"
          >
            {showAdvanced ? 'Hide Advanced Filters' : 'Show Advanced Filters'}
            {showAdvanced ? <ChevronUp size={16} className="ml-1" /> : <ChevronDown size={16} className="ml-1" />}
          </button>
        </div>

        {/* Global Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">Date Range</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
              <input type="text" placeholder="Select Dates" className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded outline-none focus:border-brand-500 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">Property</label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
              <select className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded outline-none focus:border-brand-500 text-sm appearance-none bg-white">
                <option>All Properties</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">City</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
              <select className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded outline-none focus:border-brand-500 text-sm appearance-none bg-white">
                <option>All Cities</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">Booking Status</label>
            <select className="w-full px-3 py-2 border border-gray-300 rounded outline-none focus:border-brand-500 text-sm appearance-none bg-white">
              <option>Any Status</option>
              <option>Confirmed</option>
              <option>Tentative</option>
              <option>Cancelled</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">Payment Type</label>
            <select className="w-full px-3 py-2 border border-gray-300 rounded outline-none focus:border-brand-500 text-sm appearance-none bg-white">
              <option>Any Payment</option>
              <option>Prepaid</option>
              <option>Partial</option>
              <option>Pay@Hotel</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">Channel</label>
            <select className="w-full px-3 py-2 border border-gray-300 rounded outline-none focus:border-brand-500 text-sm appearance-none bg-white">
              <option>All Channels</option>
              <option>Website</option>
              <option>OTA (MakeMyTrip)</option>
              <option>OTA (Agoda)</option>
            </select>
          </div>
        </div>

        {/* Advanced Filters */}
        {showAdvanced && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-4 pt-4 border-t border-gray-100 animate-fade-in bg-gray-50 p-4 rounded-lg">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">Room Type</label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded outline-none focus:border-brand-500 text-sm appearance-none bg-white"><option>All Rooms</option></select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">Rate Plan</label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded outline-none focus:border-brand-500 text-sm appearance-none bg-white"><option>All Plans</option></select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">Owner</label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded outline-none focus:border-brand-500 text-sm appearance-none bg-white"><option>All Owners</option></select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">Coupon Used</label>
              <input type="text" placeholder="e.g. SUMMER15" className="w-full px-3 py-2 border border-gray-300 rounded outline-none focus:border-brand-500 text-sm bg-white" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">User Type</label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded outline-none focus:border-brand-500 text-sm appearance-none bg-white">
                <option>All Users</option>
                <option>New User</option>
                <option>Returning User</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Tabs Layout */}
      <div>
        <div className="flex overflow-x-auto border-b border-gray-200 hide-scrollbar mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 font-medium text-sm whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.name}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="min-h-[500px]">
          {activeTab === 'bookings' && <BookingsReport />}
          {activeTab === 'payments' && <PaymentsReport />}
          {activeTab === 'cancellations' && <CancellationsReport />}
          {activeTab === 'occupancy' && <OccupancyReport />}
          {activeTab === 'revenue' && <RevenueReport />}
          {activeTab === 'payouts' && <PayoutsReport />}
        </div>
      </div>

    </div>
  );
};

export default Reports;
