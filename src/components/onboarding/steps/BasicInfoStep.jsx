import React from 'react';

const BasicInfoStep = ({ formData, updateForm }) => {
  return (
    <div className="p-8 animate-fade-in">
      <h2 className="text-xl font-bold text-gray-900 mb-6 border-b pb-4">Basic Information</h2>
      
      <div className="space-y-8">
        {/* Core Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Property Name <span className="text-red-500">*</span>
            </label>
            <input 
              type="text" 
              value={formData.name || ''} 
              onChange={e => updateForm('name', e.target.value)} 
              className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow text-gray-900" 
              placeholder="e.g. Grand Plaza Hotel" 
              required 
            />
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Property Type</label>
            <select 
              value={formData.type || 'Hotel'} 
              onChange={e => updateForm('type', e.target.value)} 
              className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white text-gray-900"
            >
              <option>Hotel</option>
              <option>Resort</option>
              <option>Villa</option>
              <option>Apartment</option>
              <option>Hostel</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Star Rating</label>
            <select 
              value={formData.rating || '3'} 
              onChange={e => updateForm('rating', e.target.value)} 
              className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white text-gray-900"
            >
              <option value="5">5 Star</option>
              <option value="4">4 Star</option>
              <option value="3">3 Star</option>
              <option value="2">2 Star</option>
              <option value="1">1 Star</option>
              <option value="0">Unrated</option>
            </select>
          </div>
          
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
            <textarea 
              value={formData.description || ''} 
              onChange={e => updateForm('description', e.target.value)} 
              className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow text-gray-900" 
              rows="4" 
              placeholder="Describe what makes your property unique..."
            ></textarea>
            <p className="text-xs text-gray-500 mt-2">Maximum 1000 characters. This will be displayed on your property page.</p>
          </div>
        </div>

        {/* Contact Info Grouped */}
        <div>
          <h3 className="text-lg font-bold text-gray-900 mb-4 border-b pb-2">Contact Details</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-6 rounded-lg border border-gray-200">
            {/* Front Desk */}
            <div className="md:col-span-2">
              <h4 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider">Property / Front Desk</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Phone Number</label>
                  <input type="tel" value={formData.receptionPhone || ''} onChange={e => updateForm('receptionPhone', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder="+91 XXXXX XXXXX" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Email Address</label>
                  <input type="email" value={formData.receptionEmail || ''} onChange={e => updateForm('receptionEmail', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder="frontdesk@property.com" />
                </div>
              </div>
            </div>

            {/* Manager */}
            <div>
              <h4 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider">Manager</h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Name</label>
                  <input type="text" value={formData.managerName || ''} onChange={e => updateForm('managerName', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Phone</label>
                  <input type="tel" value={formData.managerPhone || ''} onChange={e => updateForm('managerPhone', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Email</label>
                  <input type="email" value={formData.managerEmail || ''} onChange={e => updateForm('managerEmail', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                </div>
              </div>
            </div>

            {/* Owner */}
            <div>
              <h4 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider">Owner</h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Name</label>
                  <input type="text" value={formData.ownerName || ''} onChange={e => updateForm('ownerName', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Phone</label>
                  <input type="tel" value={formData.ownerPhone || ''} onChange={e => updateForm('ownerPhone', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Email</label>
                  <input type="email" value={formData.ownerEmail || ''} onChange={e => updateForm('ownerEmail', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default BasicInfoStep;
