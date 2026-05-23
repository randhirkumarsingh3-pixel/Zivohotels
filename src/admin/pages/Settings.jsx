import { useState, useEffect } from 'react';
import { Mail, Tag, Globe, Share2, CreditCard, IndianRupee, CalendarDays, Loader2, Save } from 'lucide-react';
import EmailSettings from '../components/settings/EmailSettings';
import DiscountSettings from '../components/settings/DiscountSettings';
import SEOSettings from '../components/settings/SEOSettings';
import SocialSettings from '../components/settings/SocialSettings';
import TaxSettings from '../components/settings/TaxSettings';
import BookingSettings from '../components/settings/BookingSettings';
import { getSystemConfig, updateSystemConfig } from '../../services/api';

const Settings = () => {
  const [activeTab, setActiveTab] = useState('email');
  const [financialData, setFinancialData] = useState({
    baseCurrency: 'INR',
    standardTax: 18,
    provider: 'razorpay',
    apiKey: 'rzp_live_**********'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setLoading(true);
        const config = await getSystemConfig();
        if (config.financial_settings) {
          setFinancialData(config.financial_settings);
        }
      } catch (err) {
        console.error('Failed to fetch financial settings:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const handleSaveFinancial = async () => {
    try {
      setSaving(true);
      await updateSystemConfig({ financial_settings: financialData });
      alert('Financial settings saved successfully');
    } catch (err) {
      console.error('Failed to save financial settings:', err);
      alert('Failed to save financial settings');
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'email', name: 'Email Templates', icon: <Mail size={18} /> },
    { id: 'discount', name: 'Discount & Loyalty', icon: <Tag size={18} /> },
    { id: 'seo', name: 'SEO Settings', icon: <Globe size={18} /> },
    { id: 'social', name: 'Social Media', icon: <Share2 size={18} /> },
    { id: 'tax', name: 'Tax Configuration', icon: <IndianRupee size={18} /> },
    { id: 'booking', name: 'Booking Rules', icon: <CalendarDays size={18} /> },
    { id: 'financial', name: 'Financial & Gateway', icon: <CreditCard size={18} /> },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">System Settings</h1>
        <p className="text-gray-500 mt-1">Configure global platform settings, SEO, and marketing rules.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Settings Sidebar */}
        <div className="w-full lg:w-64 shrink-0">
          <nav className="space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center space-x-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-brand-600 text-white shadow-md shadow-brand-500/20'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                {tab.icon}
                <span>{tab.name}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Settings Content Area */}
        <div className="flex-1 bg-white p-6 md:p-8 rounded-xl border border-gray-200 shadow-sm min-h-[600px]">
          {activeTab === 'email' && <EmailSettings />}
          {activeTab === 'discount' && <DiscountSettings />}
          {activeTab === 'seo' && <SEOSettings />}
          {activeTab === 'social' && <SocialSettings />}
          {activeTab === 'tax' && <TaxSettings />}
          {activeTab === 'booking' && <BookingSettings />}
          
          {activeTab === 'financial' && (
            <div className="space-y-8 animate-fade-in">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-64">
                  <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
                  <p className="text-gray-500 text-sm mt-4">Loading financial settings...</p>
                </div>
              ) : (
                <>
                  <div>
                    <h3 className="text-lg font-bold text-gray-800 border-b pb-4 mb-6">Financial Configuration</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Base Currency</label>
                        <select 
                          value={financialData.baseCurrency}
                          onChange={(e) => setFinancialData(prev => ({ ...prev, baseCurrency: e.target.value }))}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                        >
                          <option value="INR">Indian Rupee (₹)</option>
                          <option value="USD">US Dollar ($)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Standard Tax Rate (GST)</label>
                        <div className="relative">
                          <input 
                            type="number" 
                            value={financialData.standardTax}
                            onChange={(e) => setFinancialData(prev => ({ ...prev, standardTax: parseInt(e.target.value) }))}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" 
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-gray-800 border-b pb-4 mb-6">Payment Gateway</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
                        <select 
                          value={financialData.provider}
                          onChange={(e) => setFinancialData(prev => ({ ...prev, provider: e.target.value }))}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                        >
                          <option value="razorpay">Razorpay</option>
                          <option value="stripe">Stripe</option>
                          <option value="payu">PayU</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">API Key (Public)</label>
                        <input 
                          type="text" 
                          value={financialData.apiKey}
                          onChange={(e) => setFinancialData(prev => ({ ...prev, apiKey: e.target.value }))}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-gray-500 font-mono text-sm" 
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 flex justify-end max-w-3xl border-t border-gray-100 pt-6">
                    <button 
                      onClick={handleSaveFinancial}
                      disabled={saving}
                      className="bg-brand-600 hover:bg-brand-700 text-white px-6 py-2 rounded-lg font-medium shadow-sm flex items-center disabled:opacity-50"
                    >
                      {saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}
                      Save Financial Settings
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
