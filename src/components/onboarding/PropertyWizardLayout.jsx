import { Save, Loader2, ArrowLeft, Building } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

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
  onSaveDraft,
  isSubmitting, 
  children,
  isEditing = false
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBackNavigation = () => {
    if (location.pathname.startsWith('/admin')) {
      navigate('/admin/properties');
    } else {
      navigate('/extranet/dashboard');
    }
  };

  const progressPercentage = (currentStep / STEPS.length) * 100;
  const currentStepData = STEPS.find(s => s.num === currentStep) || STEPS[0];

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans pb-32">
      {/* Top Navigation / Header */}
      <div className="bg-white sticky top-0 z-40 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={handleBackNavigation} 
              className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-600"
              title="Save & Exit"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Building size={18} className="text-blue-600" />
                ZivoHotels <span className="font-normal text-slate-400 mx-2">|</span> {title}
              </h1>
            </div>
            <div className="sm:hidden font-bold text-slate-900">ZivoHotels</div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="text-sm font-medium text-slate-500 hidden sm:block">
              Step {currentStep} of {STEPS.length}: <span className="text-slate-900">{currentStepData.title}</span>
            </div>
            <button 
              onClick={onSaveDraft || onSave}
              disabled={isSubmitting}
              className="text-slate-600 hover:text-blue-600 px-3 py-2 font-semibold text-sm transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              <span className="hidden sm:inline">Save Draft</span>
            </button>
          </div>
        </div>

        {/* Thin Progressive Progress Bar */}
        <div className="w-full h-1 bg-slate-100">
          <div 
            className="h-full bg-blue-600 transition-all duration-500 ease-out"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Main Content Area - Centered Focused Card */}
      <main className="max-w-3xl mx-auto mt-8 sm:mt-12 px-4 sm:px-6 relative">
        {/* Step Indicator for Mobile */}
        <div className="sm:hidden text-xs font-semibold text-blue-600 uppercase tracking-wider mb-4">
          Step {currentStep} of {STEPS.length} — {currentStepData.title}
        </div>

        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200 overflow-hidden min-h-[500px] mb-8 transition-all">
          <div className="p-6 sm:p-10">
            {children}
          </div>
        </div>
      </main>

      {/* Floating Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-slate-200 py-4 px-6 flex items-center justify-center z-40">
        <div className="w-full max-w-3xl flex items-center justify-between">
          <button
            type="button"
            onClick={() => currentStep > 1 && setCurrentStep(prev => prev - 1)}
            disabled={currentStep === 1 || isSubmitting}
            className={`font-semibold transition-colors text-sm px-6 py-3 rounded-xl ${
              currentStep === 1 
                ? 'text-slate-300 cursor-not-allowed' 
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            Back
          </button>
          
          <button
            type="button"
            onClick={onSave}
            disabled={isSubmitting}
            className="bg-slate-900 hover:bg-blue-600 text-white px-8 py-3 rounded-xl font-semibold text-sm transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-lg shadow-slate-900/20 hover:shadow-blue-600/30 active:scale-95"
          >
            {isSubmitting && <Loader2 size={16} className="animate-spin" />}
            {currentStep === STEPS.length ? (isEditing ? 'Save Property Info' : 'Submit Property') : 'Next Step'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PropertyWizardLayout;
