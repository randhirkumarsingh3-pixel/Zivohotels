import React from 'react';
import { Save, Loader2, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const STEPS = [
  { num: 1, title: 'Basic Info' },
  { num: 2, title: 'Location' },
  { num: 3, title: 'Amenities' },
  { num: 4, title: 'Rooms' },
  { num: 5, title: 'Photos And Videos' },
  { num: 6, title: 'Policies' },
  { num: 7, title: 'Finance & Legal' },
];

const PropertyWizardLayout = ({ 
  title, 
  subtitle, 
  currentStep, 
  setCurrentStep, 
  onSave, 
  isSubmitting, 
  children,
  isEditing = false
}) => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#F4F5F7] font-sans pb-32">
      {/* Top Navigation / Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate('/admin/properties')} 
              className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-600"
              title="Back to Properties"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-lg font-bold text-gray-900">{title}</h1>
              {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
            </div>
          </div>
          <button 
            onClick={onSave}
            disabled={isSubmitting}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded font-medium text-sm transition-colors flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-sm"
          >
            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save & Continue
          </button>
        </div>

        {/* MMT Style Horizontal Tabs */}
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex overflow-x-auto hide-scrollbar">
            {STEPS.map((step) => {
              const isActive = currentStep === step.num;
              const isPast = currentStep > step.num;
              
              return (
                <button
                  key={step.num}
                  onClick={() => setCurrentStep(step.num)}
                  className={`flex items-center gap-2 px-6 py-4 border-b-[3px] transition-all whitespace-nowrap outline-none ${
                    isActive 
                      ? 'border-blue-600 text-blue-600' 
                      : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
                  }`}
                >
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    isActive 
                      ? 'bg-blue-600 text-white' 
                      : isPast 
                        ? 'bg-green-500 text-white' 
                        : 'bg-gray-200 text-gray-600'
                  }`}>
                    {isPast ? '✓' : step.num}
                  </span>
                  <span className={`text-sm font-semibold ${isActive ? 'text-blue-600' : ''}`}>
                    {step.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto mt-8 px-4 sm:px-6 relative">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden min-h-[500px]">
          {children}
        </div>
      </main>

      {/* Bottom Sticky Navigation Bar matching screenshot */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 py-3.5 px-8 flex items-center justify-between z-40 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        <button
          type="button"
          onClick={() => currentStep > 1 && setCurrentStep(prev => prev - 1)}
          disabled={currentStep === 1 || isSubmitting}
          className="text-blue-600 font-bold hover:text-blue-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm cursor-pointer"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={isSubmitting}
          className="bg-[#E05A3E] hover:bg-[#c64f35] text-white px-8 py-2.5 rounded font-bold text-sm transition-colors flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-md cursor-pointer"
        >
          {isSubmitting && <Loader2 size={16} className="animate-spin" />}
          Save And Continue
        </button>
      </div>
    </div>
  );
};

export default PropertyWizardLayout;
