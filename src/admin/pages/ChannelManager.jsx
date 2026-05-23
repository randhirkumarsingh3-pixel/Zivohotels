import { useState } from 'react';
import { Network, RefreshCw, CheckCircle2, XCircle, Link as LinkIcon, Settings2 } from 'lucide-react';
import Modal from '../components/Modal';

const ChannelManager = () => {
  const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Mock Data
  const otaConnections = [
    { name: 'Booking.com', status: 'Connected', lastSync: '10 mins ago', activeRooms: 45, icon: 'B.' },
    { name: 'Goibibo / MakeMyTrip', status: 'Connected', lastSync: '12 mins ago', activeRooms: 45, icon: 'MMT' },
    { name: 'Agoda', status: 'Error', lastSync: '2 hours ago', activeRooms: 0, icon: 'ag' },
    { name: 'Expedia', status: 'Disconnected', lastSync: 'Never', activeRooms: 0, icon: 'ex' },
  ];

  const handleManualSync = () => {
    setIsSyncing(true);
    setTimeout(() => setIsSyncing(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <Network className="mr-2 h-6 w-6 text-brand-600" />
            Channel Manager (OTA Sync)
          </h1>
          <p className="text-gray-500 mt-1">Manage external OTA connections and sync inventory globally.</p>
        </div>
        <button 
          onClick={handleManualSync}
          disabled={isSyncing}
          className="bg-gray-900 hover:bg-black text-white px-5 py-2.5 rounded-lg font-medium text-sm flex items-center transition-colors shadow-sm disabled:opacity-70"
        >
          <RefreshCw size={16} className={`mr-2 ${isSyncing ? 'animate-spin' : ''}`} /> 
          {isSyncing ? 'Syncing...' : 'Force Global Sync'}
        </button>
      </div>

      {/* OTA Connections Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {otaConnections.map((ota, idx) => (
          <div key={idx} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-all">
            <div className="flex justify-between items-start mb-4">
              <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center font-bold text-gray-700">
                {ota.icon}
              </div>
              {ota.status === 'Connected' && <CheckCircle2 className="text-green-500 h-5 w-5" />}
              {ota.status === 'Error' && <XCircle className="text-red-500 h-5 w-5" />}
              {ota.status === 'Disconnected' && <div className="h-3 w-3 rounded-full bg-gray-300 mt-1 mr-1"></div>}
            </div>
            
            <h3 className="text-lg font-bold text-gray-900 mb-1">{ota.name}</h3>
            <p className="text-sm text-gray-500 flex items-center mb-4">
              <span className={`h-2 w-2 rounded-full mr-2 ${
                ota.status === 'Connected' ? 'bg-green-500' : 
                ota.status === 'Error' ? 'bg-red-500' : 'bg-gray-300'
              }`}></span>
              {ota.status}
            </p>

            <div className="pt-4 border-t border-gray-100 flex justify-between items-center text-xs">
              <span className="text-gray-400">Last sync: {ota.lastSync}</span>
              <button 
                onClick={() => setIsMappingModalOpen(true)}
                className="text-brand-600 font-semibold hover:text-brand-700"
              >
                Configure
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Integration Providers Area */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm mt-8">
        <h3 className="text-lg font-bold text-gray-800 mb-4">PMS Integration Providers</h3>
        <p className="text-sm text-gray-600 mb-6">Connect ZivoHotels with industry standard Channel Managers for deep 2-way sync.</p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {['Hotelogix', 'STAAH', 'eZee'].map((provider) => (
            <div key={provider} className="border border-gray-200 rounded-lg p-4 flex items-center justify-between hover:border-brand-300 transition-colors cursor-pointer group">
              <div className="flex items-center">
                <Settings2 className="text-gray-400 group-hover:text-brand-500 mr-3 h-5 w-5" />
                <span className="font-medium text-gray-800">{provider}</span>
              </div>
              <LinkIcon className="text-gray-300 h-4 w-4" />
            </div>
          ))}
        </div>
      </div>

      <Modal 
        isOpen={isMappingModalOpen} 
        onClose={() => setIsMappingModalOpen(false)} 
        title="OTA Room Mapping"
      >
        <div className="space-y-4 text-sm text-gray-600">
          <p>Map your ZivoHotel internal room types to the external OTA room IDs.</p>
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-gray-200">
              <span className="font-semibold text-gray-800">Internal Room Type</span>
              <span className="font-semibold text-gray-800">OTA Room Code</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Deluxe Double Room</span>
              <input type="text" className="border border-gray-300 rounded px-2 py-1 outline-none focus:border-brand-500 text-sm" placeholder="e.g. DBL-01" defaultValue="BKG-DBL-442" />
            </div>
            <div className="flex justify-between items-center">
              <span>Presidential Suite</span>
              <input type="text" className="border border-gray-300 rounded px-2 py-1 outline-none focus:border-brand-500 text-sm" placeholder="e.g. SUI-01" />
            </div>
          </div>
          <div className="flex justify-end pt-4">
            <button onClick={() => setIsMappingModalOpen(false)} className="bg-brand-600 text-white px-4 py-2 rounded-lg font-medium">Save Mapping</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ChannelManager;
