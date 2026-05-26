import React from 'react';
import { Landmark, FileText } from 'lucide-react';

const FinanceStep = ({ formData, updateForm }) => {
  return (
    <div className="p-8 animate-fade-in">
      <h2 className="text-xl font-bold text-gray-900 mb-2 border-b pb-4">Finance & Legal</h2>
      <p className="text-sm text-gray-500 mb-8">Securely provide your banking and legal information for fast, automated payouts.</p>

      {/* Legal Information */}
      <div className="mb-10">
        <h3 className="text-md font-bold text-gray-800 mb-4 flex items-center gap-2">
          <FileText size={20} className="text-blue-600" /> Legal Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Legal Entity Name (As per PAN/GST) <span className="text-red-500">*</span></label>
            <input 
              type="text" 
              value={formData.legalName || ''} 
              onChange={e => updateForm('legalName', e.target.value)} 
              className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900 bg-white" 
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">PAN Number <span className="text-red-500">*</span></label>
            <input 
              type="text" 
              value={formData.pan || ''} 
              onChange={e => updateForm('pan', e.target.value)} 
              className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900 bg-white font-mono uppercase" 
              placeholder="ABCDE1234F"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">GSTIN (Optional)</label>
            <input 
              type="text" 
              value={formData.gstin || ''} 
              onChange={e => updateForm('gstin', e.target.value)} 
              className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900 bg-white font-mono uppercase" 
              placeholder="15 Digit GST Number"
            />
          </div>
        </div>
      </div>

      {/* Bank Details */}
      <div className="mb-10">
        <h3 className="text-md font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Landmark size={20} className="text-blue-600" /> Bank Details
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-6 rounded-lg border border-gray-200">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Account Holder Name <span className="text-red-500">*</span></label>
            <input 
              type="text" 
              value={formData.accountName || ''} 
              onChange={e => updateForm('accountName', e.target.value)} 
              className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900 bg-white" 
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Bank Name <span className="text-red-500">*</span></label>
            <input 
              type="text" 
              value={formData.bankName || ''} 
              onChange={e => updateForm('bankName', e.target.value)} 
              className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900 bg-white" 
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Account Number <span className="text-red-500">*</span></label>
            <input 
              type="password" 
              value={formData.accountNumber || ''} 
              onChange={e => updateForm('accountNumber', e.target.value)} 
              className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900 bg-white font-mono" 
              placeholder="••••••••••••"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">IFSC Code <span className="text-red-500">*</span></label>
            <input 
              type="text" 
              value={formData.ifscCode || ''} 
              onChange={e => updateForm('ifscCode', e.target.value)} 
              className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900 bg-white font-mono uppercase" 
              placeholder="SBIN0000123"
            />
          </div>
        </div>
      </div>

      {/* Commercial Terms */}
      <div>
        <h3 className="text-md font-bold text-gray-800 mb-4">Commercial Terms</h3>
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Platform Commission (%) <span className="text-red-500">*</span></label>
              <div className="relative">
                <input 
                  type="number" 
                  min="0" 
                  max="100" 
                  value={formData.commission || ''} 
                  onChange={e => updateForm('commission', e.target.value)} 
                  className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900 bg-white pr-10 font-bold" 
                  placeholder="e.g. 15"
                />
                <span className="absolute right-4 top-3 text-gray-500 font-bold">%</span>
              </div>
            </div>
            <div>
              <p className="text-sm text-blue-800 mt-2 font-medium">
                This commission rate will be automatically deducted from all prepaid bookings before payouts are processed.
              </p>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default FinanceStep;
