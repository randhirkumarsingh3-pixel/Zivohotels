import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Save, IndianRupee, Loader2 } from 'lucide-react';
import DataTable from '../DataTable';
import { getTaxRules, updateTaxRules } from '../../../services/api';

const TaxSettings = () => {
  const [slabs, setSlabs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchSlabs = async () => {
      try {
        setLoading(true);
        const data = await getTaxRules();
        setSlabs(data.map(s => ({
          ...s,
          status: s.isActive ? 'Active' : 'Inactive'
        })));
      } catch (err) {
        console.error('Failed to fetch tax rules:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchSlabs();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateTaxRules(slabs);
      alert('Tax rules saved successfully');
    } catch (err) {
      console.error('Failed to save tax rules:', err);
      alert('Failed to save tax rules');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { header: "Slab Name", accessor: "name", cell: (row) => <span className="font-semibold text-gray-900">{row.name}</span> },
    { header: "Min Tariff", accessor: "minThreshold", cell: (row) => `₹${row.minThreshold}` },
    { header: "Max Tariff", accessor: "maxThreshold", cell: (row) => row.maxThreshold === null ? 'No Limit' : `₹${row.maxThreshold}` },
    { header: "GST %", accessor: "percentage", cell: (row) => <span className="font-bold text-brand-600">{row.percentage}%</span> },
    { header: "Status", accessor: "status", cell: (row) => <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${row.status === 'Active' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{row.status}</span> },
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
      <p className="text-gray-500 text-sm mt-4">Loading tax slabs...</p>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h3 className="text-lg font-bold text-gray-800">Tax & GST Configuration</h3>
        <p className="text-sm text-gray-500">Configure dynamic tax rules based on room tariff slabs (India GST Logic).</p>
      </div>

      <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg flex items-start">
        <IndianRupee className="text-blue-600 mt-0.5 mr-3 shrink-0" size={20} />
        <div className="text-sm text-blue-800">
          <span className="font-bold block mb-1">Dynamic Tax Engine Logic</span>
          Taxes are automatically calculated <strong>per night, per room</strong> based on the base price. 
          If a booking crosses multiple nights with dynamic pricing, the engine evaluates the tax slab for <i>each specific night's tariff</i> to calculate the final <code>taxAmount</code>.
        </div>
      </div>

      <DataTable 
        title="Active Tax Slabs"
        data={slabs}
        columns={columns}
        actionButton={
          <button className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center shadow-sm">
            <Plus size={16} className="mr-1.5" /> Add New Slab
          </button>
        }
      />

      <div className="mt-8 flex justify-end pt-6 border-t border-gray-100">
        <button 
          onClick={handleSave}
          disabled={saving}
          className="bg-brand-600 hover:bg-brand-700 text-white px-6 py-2.5 rounded-lg font-medium shadow-sm flex items-center disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}
          Save Configurations
        </button>
      </div>
    </div>
  );
};

export default TaxSettings;
