import React from 'react';
import { Navigation, MapPin } from 'lucide-react';

const LocationStep = ({ formData, updateForm }) => {
  return (
    <div className="p-8 animate-fade-in">
      <h2 className="text-xl font-bold text-gray-900 mb-6 border-b pb-4">Location Details</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Country</label>
          <input 
            type="text" 
            value={formData.country || 'India'} 
            onChange={e => updateForm('country', e.target.value)} 
            className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900" 
          />
        </div>
        
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">State</label>
          <input 
            type="text" 
            value={formData.state || ''} 
            onChange={e => updateForm('state', e.target.value)} 
            className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900" 
            placeholder="e.g. Maharashtra"
          />
        </div>
        
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">City</label>
          <input 
            type="text" 
            value={formData.city || ''} 
            onChange={e => updateForm('city', e.target.value)} 
            className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900" 
            placeholder="e.g. Mumbai"
          />
        </div>
        
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Area / Neighborhood</label>
          <input 
            type="text" 
            value={formData.area || ''} 
            onChange={e => updateForm('area', e.target.value)} 
            className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900" 
            placeholder="e.g. Andheri East"
          />
        </div>
        
        <div className="md:col-span-2">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Full Address <span className="text-red-500">*</span></label>
          <textarea 
            value={formData.address || ''} 
            onChange={e => updateForm('address', e.target.value)} 
            className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900" 
            rows="2"
            placeholder="House/Plot number, Street, Area..."
            required
          ></textarea>
        </div>

        {/* Map Coordinates */}
        <div className="md:col-span-2 mt-4">
          <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <MapPin size={20} className="text-blue-600" />
              <h3 className="font-bold text-gray-900">Map Coordinates</h3>
            </div>
            
            <p className="text-sm text-gray-600 mb-6">
              Precise location helps guests find you easily and powers map-based search results.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wider">Latitude <span className="text-red-500">*</span></label>
                <input 
                  type="number" 
                  step="any"
                  value={formData.latitude || ''} 
                  onChange={e => updateForm('latitude', e.target.value)} 
                  className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900 font-mono text-sm bg-white" 
                  placeholder="e.g. 19.0760"
                />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wider">Longitude <span className="text-red-500">*</span></label>
                <input 
                  type="number" 
                  step="any"
                  value={formData.longitude || ''} 
                  onChange={e => updateForm('longitude', e.target.value)} 
                  className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900 font-mono text-sm bg-white" 
                  placeholder="e.g. 72.8777"
                />
              </div>
            </div>

            {formData.latitude && formData.longitude && (
              <div className="mt-6 flex items-center gap-3 bg-white p-3 rounded-md border border-gray-200">
                <Navigation size={16} className="text-blue-600 shrink-0" />
                <span className="text-sm font-mono text-gray-700">
                  {parseFloat(formData.latitude).toFixed(6)}° N, {parseFloat(formData.longitude).toFixed(6)}° E
                </span>
                <a
                  href={`https://maps.google.com/?q=${formData.latitude},${formData.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto text-xs text-blue-600 font-semibold hover:underline"
                >
                  Verify on Map →
                </a>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default LocationStep;
