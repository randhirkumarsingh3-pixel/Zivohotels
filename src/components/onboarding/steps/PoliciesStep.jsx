import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';

const PoliciesStep = ({ formData, updateForm }) => {
  const policies = formData.policies || [];
  const [newPolicy, setNewPolicy] = useState('');

  const addPolicy = () => {
    if (newPolicy.trim() && !policies.includes(newPolicy.trim())) {
      updateForm('policies', [...policies, newPolicy.trim()]);
      setNewPolicy('');
    }
  };

  const removePolicy = (index) => {
    updateForm('policies', policies.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addPolicy();
    }
  };

  const COMMON_POLICIES = [
    'Unmarried couples allowed',
    'Guests below 18 years of age are not allowed at the property',
    'Passport, Aadhar, Driving License and Govt. ID are accepted as ID proof(s)',
    'Pets are not allowed',
    'Outside food is not allowed'
  ];

  const addCommonPolicy = (policy) => {
    if (!policies.includes(policy)) {
      updateForm('policies', [...policies, policy]);
    }
  };

  return (
    <div className="p-8 animate-fade-in">
      <h2 className="text-xl font-bold text-gray-900 mb-2 border-b pb-4">House Rules & Policies</h2>
      <p className="text-sm text-gray-500 mb-8">Set expectations for guests. Clear rules prevent misunderstandings during check-in.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Check-in Time <span className="text-red-500">*</span></label>
          <input 
            type="time" 
            value={formData.checkInTime || '14:00'} 
            onChange={e => updateForm('checkInTime', e.target.value)} 
            className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900 bg-white" 
          />
        </div>
        
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Check-out Time <span className="text-red-500">*</span></label>
          <input 
            type="time" 
            value={formData.checkOutTime || '11:00'} 
            onChange={e => updateForm('checkOutTime', e.target.value)} 
            className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900 bg-white" 
          />
        </div>
      </div>

      <div className="mb-8 border-t pt-8 border-gray-100">
        <label className="block text-sm font-semibold text-gray-700 mb-4">Custom House Rules</label>
        
        {/* Existing Policies */}
        <div className="space-y-3 mb-4">
          {policies.map((policy, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-md">
              <span className="text-sm text-gray-800">{policy}</span>
              <button 
                onClick={() => removePolicy(idx)}
                className="text-gray-400 hover:text-red-500 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          ))}
          {policies.length === 0 && (
            <p className="text-sm text-gray-400 italic">No custom rules added yet.</p>
          )}
        </div>

        {/* Add Policy Input */}
        <div className="flex gap-2 mb-6">
          <input 
            type="text" 
            value={newPolicy}
            onChange={e => setNewPolicy(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. Quiet hours from 10 PM to 6 AM"
            className="flex-1 px-4 py-3 border border-gray-300 rounded-md text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white"
          />
          <button 
            onClick={addPolicy}
            disabled={!newPolicy.trim()}
            className="px-4 py-3 bg-white border border-gray-300 text-gray-700 font-semibold rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            <Plus size={18} /> Add
          </button>
        </div>

        {/* Common Suggestions */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Popular Rules</p>
          <div className="flex flex-wrap gap-2">
            {COMMON_POLICIES.filter(p => !policies.includes(p)).map((policy, idx) => (
              <button
                key={idx}
                onClick={() => addCommonPolicy(policy)}
                className="text-xs bg-white border border-gray-200 text-gray-600 px-3 py-2 rounded-full hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-colors text-left"
              >
                + {policy}
              </button>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
};

export default PoliciesStep;
