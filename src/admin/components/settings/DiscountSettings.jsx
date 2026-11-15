import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Save, Loader2 } from 'lucide-react';
import DataTable from '../DataTable';
import { getSystemConfig, updateSystemConfig } from '../../../services/api';

const DiscountSettings = () => {
  const [activeTab, setActiveTab] = useState('global');
  const [discountData, setDiscountData] = useState({
    globalRules: [
      { id: 'R-01', name: 'Summer Special', type: 'Percentage (15%)', minNights: 3, validity: 'Jun 1 - Aug 31', status: 'Active' },
      { id: 'R-02', name: 'Long Stay', type: 'Flat (₹1000)', minNights: 7, validity: 'Always', status: 'Active' },
    ],
    loyaltyTiers: {
      bronze: { min: 0, max: 5000, discount: 5 },
      silver: { min: 5001, max: 15000, discount: 10 },
      gold: { min: 15001, max: null, discount: 15 }
    }
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setLoading(true);
        const config = await getSystemConfig();
        if (config.discount_settings) {
          setDiscountData(config.discount_settings);
        }
      } catch (err) {
        console.error('Failed to fetch discount settings:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateSystemConfig({ discount_settings: discountData });
      alert('Discount settings saved successfully');
    } catch (err) {
      console.error('Failed to save discount settings:', err);
      alert('Failed to save discount settings');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { header: "Rule Name", accessor: "name", cell: (row) => <span className="font-semibold text-gray-900">{row.name}</span> },
    { header: "Discount Type", accessor: "type" },
    { header: "Min Nights", accessor: "minNights" },
    { header: "Validity", accessor: "validity" },
    { header: "Status", accessor: "status", cell: (row) => <span className="bg-green-50 text-green-700 px-2.5 py-1 rounded-md text-xs font-medium">{row.status}</span> },
    { header: "Actions", accessor: "actions", cell: () => (
      <div className="flex space-x-2">
        <button className="text-gray-500 hover:text-brand-600"><Edit2 size={16} /></button>
        <button className="text-gray-500 hover:text-red-600"><Trash2 size={16} /></button>
      </div>
    ) }
  ];

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64">
      <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
      <p className="text-gray-500 text-sm mt-4">Loading discount rules...</p>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold text-gray-800">Discount & Loyalty Management</h3>
          <p className="text-sm text-gray-500">Configure global pricing rules, property overrides, and loyalty tiers.</p>
        </div>
        <button 
          onClick={handleSave}
          disabled={saving}
          className="bg-brand-600 hover:bg-brand-700 text-white px-6 py-2 rounded-lg font-medium shadow-sm flex items-center disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}
          Save All Changes
        </button>
      </div>

      <div className="flex border-b border-gray-200">
        <button onClick={() => setActiveTab('global')} className={`px-4 py-2 font-medium text-sm border-b-2 ${activeTab === 'global' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500'}`}>Global Rules</button>
        <button onClick={() => setActiveTab('loyalty')} className={`px-4 py-2 font-medium text-sm border-b-2 ${activeTab === 'loyalty' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500'}`}>Loyalty Program</button>
        <button onClick={() => setActiveTab('engine')} className={`px-4 py-2 font-medium text-sm border-b-2 ${activeTab === 'engine' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500'}`}>Rule Engine</button>
      </div>

      <div className="pt-2">
        {activeTab === 'global' && (
          <div className="space-y-4">
            <DataTable 
              title="Global Discount Rules"
              data={discountData.globalRules}
              columns={columns}
              actionButton={
                <button className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center"><Plus size={16} className="mr-1.5" /> Add Rule</button>
              }
            />
          </div>
        )}

        {activeTab === 'loyalty' && (
          // These tier discounts were saved but never applied to any booking. The loyalty program
          // (earn rate, point value, tiers, members) now lives in Admin -> Loyalty.
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h4 className="font-bold text-gray-900">Zivo Rewards has its own page</h4>
            <p className="text-sm text-gray-600 mt-1">Set how guests earn and use points, the tiers, bonuses and adjust members&apos; points in Loyalty.</p>
            <a href="/admin/loyalty" className="inline-block mt-3 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-bold">Open Loyalty</a>
          </div>
        )}

        {activeTab === 'engine' && (
          <div className="bg-blue-50 p-6 rounded-xl border border-blue-100">
            <h4 className="font-bold text-blue-900 mb-2">Rule Priority Engine Logic</h4>
            <p className="text-sm text-blue-800 mb-4">How discounts combine on a booking (all on the pre-GST room price; GST is worked out after them):</p>
            <ol className="list-decimal pl-5 text-sm text-blue-800 space-y-2 font-medium">
              <li>Pay-now discount, when the guest pays in full online</li>
              <li>One promotion: the biggest the guest qualifies for (automatic offer or the code entered)</li>
              <li>Zivo Rewards points the guest chooses to use (up to the program&apos;s limit)</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
};

export default DiscountSettings;
