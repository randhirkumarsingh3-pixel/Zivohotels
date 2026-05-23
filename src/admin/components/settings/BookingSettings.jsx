import { useState, useEffect } from 'react';
import { Save, Wallet, Clock, CreditCard, Loader2 } from 'lucide-react';
import { getSystemConfig, updateSystemConfig } from '../../../services/api';

const BookingSettings = () => {
  const [types, setTypes] = useState({
    payAtHotel: true,
    partial: true,
    prepaid: true,
    expiryHours: 24,
    requiredDeposit: 30
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setLoading(true);
        const config = await getSystemConfig();
        if (config.booking_settings) {
          setTypes(config.booking_settings);
        }
      } catch (err) {
        console.error('Failed to fetch booking settings:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateSystemConfig({ booking_settings: types });
      alert('Booking settings saved successfully');
    } catch (err) {
      console.error('Failed to save booking settings:', err);
      alert('Failed to save booking settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64">
      <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
      <p className="text-gray-500 text-sm mt-4">Loading booking rules...</p>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h3 className="text-lg font-bold text-gray-800">Booking & Payment Engine Configuration</h3>
        <p className="text-sm text-gray-500">Manage allowed payment types and reservation confirmation behaviors.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Pay At Hotel */}
        <div className={`border rounded-xl p-5 relative overflow-hidden transition-colors ${types.payAtHotel ? 'border-brand-500 bg-brand-50/30' : 'border-gray-200 bg-white'}`}>
          <div className="flex justify-between items-start mb-4">
            <div className={`p-2 rounded-lg ${types.payAtHotel ? 'bg-brand-100 text-brand-600' : 'bg-gray-100 text-gray-500'}`}>
              <Clock size={24} />
            </div>
            <div className="relative inline-block w-10 align-middle select-none transition duration-200 ease-in">
              <input type="checkbox" checked={types.payAtHotel} onChange={() => setTypes(p => ({...p, payAtHotel: !p.payAtHotel}))} className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer" />
              <label className={`toggle-label block overflow-hidden h-5 rounded-full cursor-pointer ${types.payAtHotel ? 'bg-brand-500' : 'bg-gray-300'}`}></label>
            </div>
          </div>
          <h4 className="font-bold text-gray-900 mb-1">Pay at Hotel</h4>
          <p className="text-xs text-gray-500 mb-4 h-8">Guests pay nothing upfront. Status remains "Tentative".</p>
          
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Auto-Expiry Window</label>
              <div className="flex items-center">
                <input 
                  type="number" 
                  value={types.expiryHours} 
                  onChange={(e) => setTypes(p => ({...p, expiryHours: parseInt(e.target.value)}))}
                  disabled={!types.payAtHotel} 
                  className="w-16 px-2 py-1 text-sm border border-gray-300 rounded outline-none disabled:bg-gray-100" 
                />
                <span className="ml-2 text-xs text-gray-500">Hours</span>
              </div>
            </div>
          </div>
        </div>

        {/* Partial Payment */}
        <div className={`border rounded-xl p-5 relative overflow-hidden transition-colors ${types.partial ? 'border-brand-500 bg-brand-50/30' : 'border-gray-200 bg-white'}`}>
          <div className="flex justify-between items-start mb-4">
            <div className={`p-2 rounded-lg ${types.partial ? 'bg-brand-100 text-brand-600' : 'bg-gray-100 text-gray-500'}`}>
              <Wallet size={24} />
            </div>
            <div className="relative inline-block w-10 align-middle select-none transition duration-200 ease-in">
              <input type="checkbox" checked={types.partial} onChange={() => setTypes(p => ({...p, partial: !p.partial}))} className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer" />
              <label className={`toggle-label block overflow-hidden h-5 rounded-full cursor-pointer ${types.partial ? 'bg-brand-500' : 'bg-gray-300'}`}></label>
            </div>
          </div>
          <h4 className="font-bold text-gray-900 mb-1">Partial Payment</h4>
          <p className="text-xs text-gray-500 mb-4 h-8">Guests pay a percentage upfront to confirm booking.</p>
          
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Required Deposit</label>
              <div className="flex items-center">
                <input 
                  type="number" 
                  value={types.requiredDeposit} 
                  onChange={(e) => setTypes(p => ({...p, requiredDeposit: parseInt(e.target.value)}))}
                  disabled={!types.partial} 
                  className="w-16 px-2 py-1 text-sm border border-gray-300 rounded outline-none disabled:bg-gray-100" 
                />
                <span className="ml-2 text-xs text-gray-500">% of total</span>
              </div>
            </div>
          </div>
        </div>

        {/* Prepaid */}
        <div className={`border rounded-xl p-5 relative overflow-hidden transition-colors ${types.prepaid ? 'border-brand-500 bg-brand-50/30' : 'border-gray-200 bg-white'}`}>
          <div className="flex justify-between items-start mb-4">
            <div className={`p-2 rounded-lg ${types.prepaid ? 'bg-brand-100 text-brand-600' : 'bg-gray-100 text-gray-500'}`}>
              <CreditCard size={24} />
            </div>
            <div className="relative inline-block w-10 align-middle select-none transition duration-200 ease-in">
              <input type="checkbox" checked={types.prepaid} onChange={() => setTypes(p => ({...p, prepaid: !p.prepaid}))} className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer" />
              <label className={`toggle-label block overflow-hidden h-5 rounded-full cursor-pointer ${types.prepaid ? 'bg-brand-500' : 'bg-gray-300'}`}></label>
            </div>
          </div>
          <h4 className="font-bold text-gray-900 mb-1">100% Prepaid</h4>
          <p className="text-xs text-gray-500 mb-4 h-8">Requires full payment via Razorpay. Instantly confirmed.</p>
          
          <div className="bg-gray-50 p-2 rounded text-xs text-gray-600 flex items-center border border-gray-200">
            <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span> Razorpay Integrated
          </div>
        </div>

      </div>

      <div className="mt-8 flex justify-end pt-6 border-t border-gray-100">
        <button 
          onClick={handleSave}
          disabled={saving}
          className="bg-brand-600 hover:bg-brand-700 text-white px-6 py-2.5 rounded-lg font-medium shadow-sm flex items-center disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}
          Save Booking Settings
        </button>
      </div>
    </div>
  );
};

export default BookingSettings;
