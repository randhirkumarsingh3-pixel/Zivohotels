import { useState } from 'react';
import { X, Layers } from 'lucide-react';

/**
 * Bulk update for the rates & availability calendar: one change for several room types and rate
 * plans over a date range, optionally only on some weekdays. Saved all-or-nothing by
 * POST /admin/ari/bulk.
 */
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ymd = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

const Choice = ({ value, options, onChange, label }) => (
  <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
    {options.map((o) => (
      <button key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${value === o.id ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'}`}>
        {o.label}
      </button>
    ))}
  </div>
);

const BulkUpdatePanel = ({ api, headers, hotelId, roomTypes, defaultStart, onClose, onSaved }) => {
  const today = ymd(new Date());
  const [start, setStart] = useState(ymd(defaultStart) < today ? today : ymd(defaultStart));
  const [end, setEnd] = useState(() => { const d = new Date(defaultStart); d.setDate(d.getDate() + 29); return ymd(d) < today ? today : ymd(d); });
  const [weekdays, setWeekdays] = useState([]);
  const [roomTypeIds, setRoomTypeIds] = useState([]);
  const [roomsMode, setRoomsMode] = useState('keep'); // keep | all | set
  const [roomsValue, setRoomsValue] = useState('');
  const [saleMode, setSaleMode] = useState('keep'); // keep | open | close
  const [ratePlanIds, setRatePlanIds] = useState([]);
  const [priceMode, setPriceMode] = useState('keep'); // keep | set | percent | reset
  const [priceValue, setPriceValue] = useState('');
  const [percentValue, setPercentValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const allPlans = roomTypes.flatMap((rt) => rt.ratePlans.map((rp) => ({ ...rp, roomTypeName: rt.name })));
  const toggle = (list, setList, id) => setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const changesInventory = roomsMode !== 'keep' || saleMode !== 'keep';
  const changesRates = priceMode !== 'keep';

  const submit = async () => {
    setError('');
    if (!changesInventory && !changesRates) return setError('Choose what to change: rooms to sell, sale status or price.');
    if (changesInventory && roomTypeIds.length === 0) return setError('Choose the room types whose availability should change.');
    if (changesRates && ratePlanIds.length === 0) return setError('Choose the rate plans whose price should change.');
    if (roomsMode === 'set' && (roomsValue === '' || Number(roomsValue) < 0)) return setError('Enter the number of rooms to sell.');
    if (priceMode === 'set' && !(Number(priceValue) > 0)) return setError('Enter a price above ₹0.');
    if (priceMode === 'percent' && (percentValue === '' || Number(percentValue) === 0)) return setError('Enter the % change, e.g. 10 or -15.');

    const body = { hotelId, start, end, weekdays };
    if (changesInventory) {
      body.inventory = {
        roomTypeIds,
        ...(roomsMode === 'all' ? { totalRooms: 'ALL' } : roomsMode === 'set' ? { totalRooms: Number(roomsValue) } : {}),
        ...(saleMode !== 'keep' ? { stopSell: saleMode === 'close' } : {}),
      };
    }
    if (changesRates) {
      body.rates = {
        ratePlanIds,
        ...(priceMode === 'set' ? { price: Number(priceValue) } : priceMode === 'reset' ? { price: null } : { adjustPercent: Number(percentValue) }),
      };
    }
    setSaving(true);
    try {
      const res = await fetch(`${api}/bulk`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Could not save the bulk update');
      const d = json.data;
      const parts = [];
      if (d.roomTypes) parts.push(`${d.roomTypes} room type${d.roomTypes === 1 ? '' : 's'}`);
      if (d.ratePlans) parts.push(`${d.ratePlans} rate plan${d.ratePlans === 1 ? '' : 's'}`);
      onSaved(`Bulk update saved: ${parts.join(' and ')} across ${d.days} day${d.days === 1 ? '' : 's'}.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/30 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Bulk update">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between p-6 pb-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1"><Layers size={13} /> Bulk update</p>
            <h3 className="text-lg font-bold text-gray-900">Change many dates, rooms and rate plans at once</h3>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>

        <div className="px-6 overflow-y-auto space-y-6 pb-4">
          {/* Dates */}
          <section className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-semibold text-gray-600">From
                <input type="date" value={start} min={today} onChange={(e) => setStart(e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-lg text-sm" />
              </label>
              <label className="text-xs font-semibold text-gray-600">To
                <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-lg text-sm" />
              </label>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1">Only on (leave empty for every day)</p>
              <div className="flex gap-1 flex-wrap">
                {WEEKDAYS.map((w, i) => (
                  <button key={w} type="button" aria-pressed={weekdays.includes(i)} onClick={() => toggle(weekdays, setWeekdays, i)}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${weekdays.includes(i) ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200'}`}>{w}</button>
                ))}
                <button type="button" onClick={() => setWeekdays([5, 6])} className="px-2.5 py-1 rounded-md text-xs font-semibold text-brand-700 hover:underline">Weekends</button>
                <button type="button" onClick={() => setWeekdays([1, 2, 3, 4])} className="px-2.5 py-1 rounded-md text-xs font-semibold text-brand-700 hover:underline">Mon–Thu</button>
              </div>
            </div>
          </section>

          {/* Availability */}
          <section className="space-y-3 border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-gray-800">Availability</h4>
              <button type="button" className="text-xs font-semibold text-brand-700 hover:underline" onClick={() => setRoomTypeIds(roomTypeIds.length === roomTypes.length ? [] : roomTypes.map((r) => r.id))}>
                {roomTypeIds.length === roomTypes.length ? 'Clear' : 'Select all'}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {roomTypes.map((rt) => (
                <label key={rt.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer ${roomTypeIds.includes(rt.id) ? 'border-brand-300 bg-brand-50' : 'border-gray-200'}`}>
                  <input type="checkbox" checked={roomTypeIds.includes(rt.id)} onChange={() => toggle(roomTypeIds, setRoomTypeIds, rt.id)} className="rounded border-gray-300" />
                  <span className="font-medium text-gray-800">{rt.name}</span>
                  <span className="ml-auto text-xs text-gray-400">{rt.physicalRooms} rooms</span>
                </label>
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-600">Rooms to sell</p>
              <div className="flex flex-wrap items-center gap-2">
                <Choice label="Rooms to sell" value={roomsMode} onChange={setRoomsMode} options={[{ id: 'keep', label: 'No change' }, { id: 'all', label: 'All rooms' }, { id: 'set', label: 'Set to' }]} />
                {roomsMode === 'set' && (
                  <input type="number" min="0" aria-label="Rooms to sell" value={roomsValue} onChange={(e) => setRoomsValue(e.target.value)} className="w-24 px-3 py-1.5 border rounded-lg text-sm" placeholder="e.g. 5" />
                )}
              </div>
              <p className="text-xs font-semibold text-gray-600 pt-1">Sale status</p>
              <Choice label="Sale status" value={saleMode} onChange={setSaleMode} options={[{ id: 'keep', label: 'No change' }, { id: 'open', label: 'Open for sale' }, { id: 'close', label: 'Stop sell' }]} />
            </div>
          </section>

          {/* Prices */}
          <section className="space-y-3 border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-gray-800">Prices</h4>
              <button type="button" className="text-xs font-semibold text-brand-700 hover:underline" onClick={() => setRatePlanIds(ratePlanIds.length === allPlans.length ? [] : allPlans.map((p) => p.id))}>
                {ratePlanIds.length === allPlans.length ? 'Clear' : 'Select all'}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {allPlans.map((rp) => (
                <label key={rp.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer ${ratePlanIds.includes(rp.id) ? 'border-brand-300 bg-brand-50' : 'border-gray-200'}`}>
                  <input type="checkbox" checked={ratePlanIds.includes(rp.id)} onChange={() => toggle(ratePlanIds, setRatePlanIds, rp.id)} className="rounded border-gray-300" />
                  <span className="text-gray-800"><span className="font-medium">{rp.roomTypeName}</span> · {rp.name}</span>
                  <span className="ml-auto text-xs text-gray-400">base ₹{Number(rp.basePrice).toLocaleString('en-IN')}</span>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Choice label="Price change" value={priceMode} onChange={setPriceMode} options={[{ id: 'keep', label: 'No change' }, { id: 'set', label: 'Set price' }, { id: 'percent', label: 'Change by %' }, { id: 'reset', label: 'Reset to base price' }]} />
              {priceMode === 'set' && (
                <input type="number" min="1" aria-label="Price per night" value={priceValue} onChange={(e) => setPriceValue(e.target.value)} className="w-32 px-3 py-1.5 border rounded-lg text-sm" placeholder="₹ per night" />
              )}
              {priceMode === 'percent' && (
                <span className="flex items-center gap-1">
                  <input type="number" aria-label="Percent change" value={percentValue} onChange={(e) => setPercentValue(e.target.value)} className="w-24 px-3 py-1.5 border rounded-lg text-sm" placeholder="10 or -15" />
                  <span className="text-sm text-gray-500">%</span>
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500">Price per night for base occupancy, before GST. &ldquo;Change by %&rdquo; applies to each day&apos;s current price.</p>
          </section>
        </div>

        <div className="border-t border-gray-100 p-4 px-6 flex items-center justify-end gap-2">
          {error && <p role="alert" className="mr-auto text-sm font-medium text-red-600">{error}</p>}
          <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg text-sm font-semibold">Cancel</button>
          <button type="button" disabled={saving} onClick={submit} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-bold disabled:opacity-50">{saving ? 'Saving…' : 'Apply bulk update'}</button>
        </div>
      </div>
    </div>
  );
};

export default BulkUpdatePanel;
