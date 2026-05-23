import React, { useState } from 'react';
import { X, Shield, Building2 } from 'lucide-react';

const UserEditModal = ({ user, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    role: user?.role || 'CUSTOMER',
    // Mock assignments for demo since property search API would be needed
    ownerProperties: user?.ownerProperties || [],
    permissions: user?.permissions || []
  });

  const handleSave = () => {
    // Determine the payload based on role
    const payload = { ...formData };
    onSave(user.id, payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-scale-in">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Edit {formData.role.charAt(0) + formData.role.slice(1).toLowerCase()}</h2>
            <p className="text-sm text-gray-500 mt-1">Manage user details and system access</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:bg-gray-100 p-2 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input 
                type="text" 
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <input 
                type="email" 
                value={formData.email}
                disabled
                className="w-full px-4 py-2 border border-gray-200 bg-gray-50 rounded-lg text-gray-500 outline-none" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
              <input 
                type="text" 
                value={formData.phone}
                onChange={e => setFormData({...formData, phone: e.target.value})}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500" 
              />
            </div>
          </div>

          {/* Role Specific Settings */}
          {formData.role === 'OWNER' && (
            <div className="border-t border-gray-100 pt-6">
              <h3 className="font-bold text-gray-800 flex items-center mb-4"><Building2 size={18} className="mr-2 text-brand-600"/> Property Assignments & Commission</h3>
              <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                {formData.ownerProperties.length > 0 ? formData.ownerProperties.map((op, idx) => (
                  <div key={idx} className="flex items-center gap-4 bg-white p-3 rounded border border-gray-200">
                    <span className="flex-1 font-medium text-sm">{op.hotel?.name || 'Property'}</span>
                    <div className="flex items-center w-32">
                      <span className="text-sm text-gray-500 mr-2">Comm:</span>
                      <input 
                        type="number" 
                        value={op.commission}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded outline-none focus:border-brand-500" 
                      />
                      <span className="text-sm text-gray-500 ml-1">%</span>
                    </div>
                  </div>
                )) : (
                  <p className="text-sm text-gray-500 italic">No properties assigned yet. (Use property selector tool to assign)</p>
                )}
                <button className="text-sm font-medium text-brand-600 hover:text-brand-700">+ Add Property Assignment</button>
              </div>
            </div>
          )}

          {formData.role === 'ADMIN' && (
            <div className="border-t border-gray-100 pt-6">
              <h3 className="font-bold text-gray-800 flex items-center mb-4"><Shield size={18} className="mr-2 text-brand-600"/> Module Permissions</h3>
              <div className="grid grid-cols-2 gap-3">
                {['USERS', 'REPORTS', 'SETTINGS', 'PROPERTIES', 'AGREEMENTS'].map(module => {
                  const hasPerm = formData.permissions.find(p => p.module === module);
                  return (
                    <div key={module} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-100">
                      <span className="text-sm font-medium text-gray-700">{module}</span>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center text-xs text-gray-600 cursor-pointer">
                          <input type="checkbox" checked={!!hasPerm} className="mr-1.5 rounded text-brand-600" onChange={() => {}}/>
                          Read
                        </label>
                        <label className="flex items-center text-xs text-gray-600 cursor-pointer">
                          <input type="checkbox" checked={hasPerm?.canWrite || false} className="mr-1.5 rounded text-brand-600" onChange={() => {}}/>
                          Write
                        </label>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 rounded-b-xl">
          <button onClick={onClose} className="px-5 py-2 font-medium text-gray-600 hover:bg-gray-200 bg-gray-100 rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} className="px-5 py-2 font-medium text-white bg-gray-900 hover:bg-black rounded-lg transition-colors shadow-sm">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserEditModal;
