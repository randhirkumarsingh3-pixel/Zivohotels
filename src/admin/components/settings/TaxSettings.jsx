import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, IndianRupee, Loader2, Wand2, AlertTriangle } from 'lucide-react';
import { getTaxRules, updateTaxRules } from '../../../services/api';

/**
 * GST slabs used to price every booking (backend: TaxRule, domains/pricingDomain.js).
 * The slab is chosen by the room tariff per night (after discounts); with no matching slab a
 * booking can't be priced at all ("No applicable tax rule found").
 *
 * This screen used to be a read-only table whose Add/Edit/Delete buttons did nothing, so tax rates
 * could not be set from the admin.
 */

// GST on hotel accommodation (from 22 Sept 2025): 5% up to ₹7,500 per night, 18% above
const STANDARD_SLABS = [
  { name: 'GST 5% (up to ₹7,500)', minThreshold: '0', maxThreshold: '7500', percentage: '5', isActive: true },
  { name: 'GST 18% (above ₹7,500)', minThreshold: '7500', maxThreshold: '', percentage: '18', isActive: true },
];

const toRow = (s) => ({
  name: s.name || '',
  minThreshold: s.minThreshold ?? '',
  maxThreshold: s.maxThreshold == null ? '' : String(s.maxThreshold),
  percentage: s.percentage ?? '',
  isActive: s.isActive !== false,
});

/** Same rules the server enforces: active slabs start at 0, touch without gaps, end open-ended. */
const validateSlabs = (rows) => {
  const active = rows.filter((r) => r.isActive);
  if (active.length === 0) return 'Add at least one active slab, or no booking can be priced.';
  for (const r of rows) {
    if (!String(r.name).trim()) return 'Every slab needs a name.';
    const pct = Number(r.percentage);
    if (r.percentage === '' || !Number.isFinite(pct) || pct < 0 || pct > 28) return `"${r.name}": GST % must be between 0 and 28.`;
    if (r.minThreshold === '' || !(Number(r.minThreshold) >= 0)) return `"${r.name}": enter a valid "from" tariff.`;
    if (r.maxThreshold !== '' && !(Number(r.maxThreshold) > Number(r.minThreshold))) return `"${r.name}": "up to" must be more than "from".`;
  }
  const sorted = [...active].sort((a, b) => Number(a.minThreshold) - Number(b.minThreshold));
  if (Number(sorted[0].minThreshold) !== 0) return 'The lowest active slab must start at ₹0.';
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].maxThreshold === '') return `"${sorted[i].name}" has no upper limit but isn't the highest slab.`;
    if (Number(sorted[i + 1].minThreshold) !== Number(sorted[i].maxThreshold)) {
      return `Slabs must follow on without gaps or overlaps: "${sorted[i + 1].name}" should start at ₹${sorted[i].maxThreshold}.`;
    }
  }
  if (sorted[sorted.length - 1].maxThreshold !== '') return 'The highest active slab must have no upper limit (leave "up to" empty).';
  return null;
};

const TaxSettings = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'error' | 'success', text }

  useEffect(() => {
    (async () => {
      try {
        const data = await getTaxRules();
        setRows((data || []).map(toRow));
      } catch (err) {
        setMessage({ type: 'error', text: err.message || 'Failed to load tax slabs.' });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const update = (i, field, value) => {
    setMessage(null);
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  };

  const addRow = () => {
    setMessage(null);
    setRows((prev) => {
      const last = prev[prev.length - 1];
      return [...prev, { name: '', minThreshold: last?.maxThreshold || '0', maxThreshold: '', percentage: '', isActive: true }];
    });
  };

  const removeRow = (i) => { setMessage(null); setRows((prev) => prev.filter((_, idx) => idx !== i)); };

  const handleSave = async () => {
    const problem = validateSlabs(rows);
    if (problem) { setMessage({ type: 'error', text: problem }); return; }
    try {
      setSaving(true);
      await updateTaxRules(rows.map((r) => ({
        name: r.name.trim(),
        minThreshold: Number(r.minThreshold),
        maxThreshold: r.maxThreshold === '' ? null : Number(r.maxThreshold),
        percentage: Number(r.percentage),
        isActive: r.isActive,
      })));
      setMessage({ type: 'success', text: 'Tax slabs saved. New bookings are priced with them straight away.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to save tax slabs.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64">
      <Loader2 className="w-8 h-8 text-brand-700 animate-spin" />
      <p className="text-gray-500 text-sm mt-4">Loading tax slabs...</p>
    </div>
  );

  const input = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none';

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h3 className="text-lg font-bold text-gray-800">Tax & GST Configuration</h3>
        <p className="text-sm text-gray-500">GST charged on room bookings, by room tariff per night.</p>
      </div>

      <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg flex items-start">
        <IndianRupee className="text-blue-600 mt-0.5 mr-3 shrink-0" size={20} />
        <div className="text-sm text-blue-800">
          <span className="font-bold block mb-1">How a slab is chosen</span>
          The booking&apos;s room tariff per night (after discounts) picks the slab; that GST % applies to the whole
          stay. A tariff equal to a slab&apos;s &quot;up to&quot; value belongs to that slab. Without any active slab, no
          booking can be priced.
        </div>
      </div>

      {rows.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg flex items-start gap-3 text-sm text-amber-900">
          <AlertTriangle size={18} className="text-amber-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">No tax slabs yet, so checkout can&apos;t price any stay.</p>
            <p className="mt-1">Start from the standard hotel GST slabs (5% up to ₹7,500 per night, 18% above), check them, then save.</p>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h4 className="font-bold text-gray-900">Tax slabs</h4>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setMessage(null); setRows(STANDARD_SLABS.map((s) => ({ ...s }))); }}
              className="border border-gray-200 hover:border-brand-500 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium flex items-center">
              <Wand2 size={15} className="mr-1.5" /> Use standard GST slabs
            </button>
            <button type="button" onClick={addRow}
              className="bg-brand-600 hover:bg-brand-700 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center">
              <Plus size={15} className="mr-1.5" /> Add slab
            </button>
          </div>
        </div>

        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">Name</th>
                  <th className="text-left px-4 py-2 font-semibold">From (₹/night)</th>
                  <th className="text-left px-4 py-2 font-semibold">Up to (₹/night)</th>
                  <th className="text-left px-4 py-2 font-semibold">GST %</th>
                  <th className="text-left px-4 py-2 font-semibold">Active</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 min-w-[180px]"><input aria-label="Slab name" className={input} value={r.name} onChange={(e) => update(i, 'name', e.target.value)} placeholder="e.g. GST 5%" /></td>
                    <td className="px-4 py-2 w-36"><input aria-label="From tariff" type="number" min="0" className={input} value={r.minThreshold} onChange={(e) => update(i, 'minThreshold', e.target.value)} /></td>
                    <td className="px-4 py-2 w-36"><input aria-label="Up to tariff" type="number" min="0" className={input} value={r.maxThreshold} onChange={(e) => update(i, 'maxThreshold', e.target.value)} placeholder="No limit" /></td>
                    <td className="px-4 py-2 w-28"><input aria-label="GST percent" type="number" min="0" max="28" step="0.01" className={input} value={r.percentage} onChange={(e) => update(i, 'percentage', e.target.value)} /></td>
                    <td className="px-4 py-2"><input aria-label="Active" type="checkbox" checked={r.isActive} onChange={(e) => update(i, 'isActive', e.target.checked)} /></td>
                    <td className="px-4 py-2 text-right">
                      <button type="button" onClick={() => removeRow(i)} aria-label={`Delete ${r.name || 'slab'}`} className="text-gray-400 hover:text-red-600"><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {message && (
        <div role={message.type === 'error' ? 'alert' : 'status'}
          className={`p-3 rounded-lg text-sm font-medium ${message.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
          {message.text}
        </div>
      )}

      <div className="flex justify-end pt-6 border-t border-gray-100">
        <button onClick={handleSave} disabled={saving}
          className="bg-brand-600 hover:bg-brand-700 text-white px-6 py-2.5 rounded-lg font-medium shadow-sm flex items-center disabled:opacity-50">
          {saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}
          Save tax slabs
        </button>
      </div>
    </div>
  );
};

export default TaxSettings;
