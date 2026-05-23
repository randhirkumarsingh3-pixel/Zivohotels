import { useState, useEffect } from 'react';
import Modal from './Modal';
import { X, Plus } from 'lucide-react';

const RatePlanModal = ({ isOpen, onClose, onSubmit, initialData = null, parentRoomType }) => {
  const [formData, setFormData] = useState({
    name: 'Standard Rate Plan',
    mealPlan: 'EP',
    cancellationPolicy: '',
    basePrice: '',
    extraAdultPrice: '',
    extraChildPrice: '',
    occupancyPricing: [],
    extraBedPrice: '',
    extraBedIncluded: false,
    mealPriceAdult: '',
    mealPriceChild: '',
    isActive: true
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || 'Standard Rate Plan',
        mealPlan: initialData.mealPlan || 'EP',
        cancellationPolicy: initialData.cancellationPolicy || '',
        basePrice: initialData.basePrice || '',
        extraAdultPrice: initialData.extraAdultPrice || '',
        extraChildPrice: initialData.extraChildPrice || '',
        occupancyPricing: initialData.occupancyPricing || [],
        extraBedPrice: initialData.extraBedPrice || '',
        extraBedIncluded: initialData.extraBedIncluded || false,
        mealPriceAdult: initialData.mealPriceAdult || '',
        mealPriceChild: initialData.mealPriceChild || '',
        isActive: initialData.isActive !== undefined ? initialData.isActive : true
      });
    }
  }, [initialData]);

  const updateForm = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    const cleanNum = (val) => (val === "" || val === null || val === undefined) ? null : parseFloat(val);

    const payload = {
      name: formData.name,
      mealPlan: formData.mealPlan,
      cancellationPolicy: formData.cancellationPolicy,
      basePrice: parseFloat(formData.basePrice),
      extraAdultPrice: cleanNum(formData.extraAdultPrice),
      extraChildPrice: cleanNum(formData.extraChildPrice),
      occupancyPricing: formData.occupancyPricing.map(op => ({
        occupancy: parseInt(op.occupancy, 10),
        price: parseFloat(op.price)
      })),
      extraBedPrice: cleanNum(formData.extraBedPrice),
      extraBedIncluded: formData.extraBedIncluded,
      mealPriceAdult: cleanNum(formData.mealPriceAdult),
      mealPriceChild: cleanNum(formData.mealPriceChild),
      isActive: formData.isActive
    };
    onSubmit(payload);
    onClose();
  };

  const isMealPricingEnabled = formData.mealPlan !== 'NONE' && formData.mealPlan !== 'EP';
  const isExtraBedAllowed = parentRoomType?.extraBedAllowed;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={initialData ? "Edit Rate Plan" : "Add Rate Plan"} maxWidth="max-w-3xl">
      <form onSubmit={handleSubmit} className="space-y-8 max-h-[80vh] overflow-y-auto pr-2 pb-6">
        
        {/* Section 1: Basic Info */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider border-b pb-2">1. Basic Info</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Plan Name *</label>
              <input type="text" value={formData.name} onChange={e => updateForm('name', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" required placeholder="e.g. Bed & Breakfast" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Meal Plan</label>
              <select value={formData.mealPlan} onChange={e => updateForm('mealPlan', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none">
                <option value="EP">Room Only (EP)</option>
                <option value="CP">Bed & Breakfast (CP)</option>
                <option value="MAP">Half Board (MAP)</option>
                <option value="AP">Full Board (AP)</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <div className="flex items-center h-[42px]">
                <div className="relative inline-block w-12 align-middle select-none transition duration-200 ease-in">
                  <input type="checkbox" id="rpStatusToggle" checked={formData.isActive} onChange={(e) => updateForm('isActive', e.target.checked)} className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer" />
                  <label htmlFor="rpStatusToggle" className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer ${formData.isActive ? 'bg-brand-500' : 'bg-gray-300'}`}></label>
                </div>
                <span className="ml-3 font-medium text-gray-700">{formData.isActive ? 'Active' : 'Inactive'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Pricing (Room) */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider border-b pb-2">2. Room Pricing</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Base Price (₹) *</label>
              <input type="number" min="0" value={formData.basePrice} onChange={e => updateForm('basePrice', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Extra Adult (₹)</label>
              <input type="number" min="0" value={formData.extraAdultPrice} onChange={e => updateForm('extraAdultPrice', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Extra Child (₹)</label>
              <input type="number" min="0" value={formData.extraChildPrice} onChange={e => updateForm('extraChildPrice', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 bg-brand-50/50 rounded-lg border border-dashed border-brand-200">
            <div className="w-2 h-2 rounded-full bg-brand-500"></div>
            <p className="text-xs text-brand-700 font-medium italic">Base Price includes up to **{parentRoomType?.baseOccupancy || 2} guests**. Extra guest charges apply beyond this unless overridden.</p>
          </div>
        </div>

        {/* Section 3: Occupancy Overrides */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b pb-2">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">3. Occupancy Overrides</h3>
              {formData.occupancyPricing.length > 0 && (
                <span className="px-2 py-0.5 text-[10px] bg-brand-100 text-brand-700 font-bold rounded-full">Overrides Active</span>
              )}
            </div>
            <button type="button" onClick={() => updateForm('occupancyPricing', [...formData.occupancyPricing, { occupancy: 1, price: '' }])} className="text-xs bg-brand-50 text-brand-600 px-3 py-1.5 rounded-md font-bold border border-brand-100 hover:bg-brand-100 transition-colors">
              <Plus size={14} className="inline mr-1" /> Add Override
            </button>
          </div>
          
          {formData.occupancyPricing.length > 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2 font-bold text-gray-600 w-1/3">Guests</th>
                    <th className="px-4 py-2 font-bold text-gray-600">Fixed Price (₹)</th>
                    <th className="px-4 py-2 text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {formData.occupancyPricing.map((op, idx) => (
                    <tr key={idx} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-2">
                        <input type="number" min="1" value={op.occupancy} onChange={(e) => {
                          const newList = [...formData.occupancyPricing];
                          newList[idx].occupancy = e.target.value;
                          updateForm('occupancyPricing', newList);
                        }} className="w-20 px-2 py-1 border border-gray-200 rounded focus:ring-1 focus:ring-brand-500 outline-none" />
                      </td>
                      <td className="px-4 py-2">
                        <div className="relative">
                          <input type="number" min="0" value={op.price} onChange={(e) => {
                            const newList = [...formData.occupancyPricing];
                            newList[idx].price = e.target.value;
                            updateForm('occupancyPricing', newList);
                          }} className={`w-full px-2 py-1 border rounded focus:ring-1 focus:ring-brand-500 outline-none font-semibold ${parseFloat(op.price) < parseFloat(formData.basePrice) ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-gray-200 text-brand-600'}`} placeholder="Price for this occupancy" />
                          {parseFloat(op.price) < parseFloat(formData.basePrice) && (
                            <div className="absolute -top-6 left-0 bg-amber-600 text-white text-[10px] px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap animate-bounce">Lower than Base!</div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button type="button" onClick={() => updateForm('occupancyPricing', formData.occupancyPricing.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600 p-1"><X size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center p-4 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
              <p className="text-xs text-gray-400">No overrides defined. <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-bold border border-gray-200">FALLBACK FORMULA</span> (Base + Extra) will apply.</p>
            </div>
          )}
        </div>

        {/* Section 4: Extra Bed Pricing */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider border-b pb-2">4. Extra Bed Pricing</h3>
          {!isExtraBedAllowed ? (
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-xs text-gray-500 font-medium">Extra beds are disabled for this Room Type. Pricing cannot be set.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Extra Bed Price (₹)</label>
                <input type="number" min="0" value={formData.extraBedPrice} onChange={e => updateForm('extraBedPrice', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" disabled={formData.extraBedIncluded} />
              </div>
              <div className="pt-6">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" checked={formData.extraBedIncluded} onChange={e => updateForm('extraBedIncluded', e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                  <span className="text-sm font-medium text-gray-700">Included in Base Price</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Section 5: Meal Pricing */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider border-b pb-2">5. Meal Pricing</h3>
          {!isMealPricingEnabled ? (
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-xs text-gray-500 font-medium">Meal Plan is set to Room Only (EP). Meal pricing is disabled.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Adult Meal Price (₹) / Day</label>
                <input type="number" min="0" value={formData.mealPriceAdult} onChange={e => updateForm('mealPriceAdult', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Child Meal Price (₹) / Day</label>
                <input type="number" min="0" value={formData.mealPriceChild} onChange={e => updateForm('mealPriceChild', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 pt-6 flex justify-end space-x-3">
          <button type="button" onClick={onClose} className="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          <button type="submit" className="px-5 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 shadow-sm">Save Rate Plan</button>
        </div>
      </form>
    </Modal>
  );
};

export default RatePlanModal;
