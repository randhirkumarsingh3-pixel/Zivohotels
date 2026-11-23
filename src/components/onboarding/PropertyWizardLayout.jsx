import { Save, Loader2, ArrowLeft } from 'lucide-react';
import { LogoMark } from '../brand/Logo';
import { useNavigate, useLocation } from 'react-router-dom';

const STEPS = [
  { num: 1, title: 'Basic Info' },
  { num: 2, title: 'Location' },
  { num: 3, title: 'Amenities' },
  { num: 4, title: 'Rooms' },
  { num: 5, title: 'Photos And Videos' },
  { num: 6, title: 'Policies' },
  { num: 7, title: 'Finance & Legal' },
  { num: 8, title: 'Documents' },
];

const PropertyWizardLayout = ({ 
  title, 
  subtitle: _subtitle, 
  currentStep, 
  setCurrentStep, 
  onSave,
  onSaveDraft,
  isSubmitting, 
  children,
  isEditing = false,
  // Editing a listed property: every section is a tab, "Save changes" saves and stays
  sectionMode = false,
  onJump = null,
  onBackToProperty = null,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBackNavigation = () => {
    if (sectionMode && onBackToProperty) {
      onBackToProperty();
    } else if (location.pathname.startsWith('/admin')) {
      navigate('/admin/properties');
    } else {
      navigate('/extranet');
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
              <h1 className="text-lg font-bold text-navy-900 flex items-center gap-2">
                <LogoMark size="sm" />
                ZivoPlus <span className="font-normal text-slate-400 mx-1" aria-hidden="true">|</span> <span className="font-semibold text-slate-700">{title}</span>
              </h1>
            </div>
            <div className="sm:hidden flex items-center gap-2 font-bold text-navy-900"><LogoMark size="sm" /> {title}</div>
          </div>
          
          <div className="flex items-center gap-6">
            {!sectionMode && (
              <div className="text-sm font-medium text-slate-500 hidden sm:block">
                Step {currentStep} of {STEPS.length}: <span className="text-slate-900">{currentStepData.title}</span>
              </div>
            )}
            <button 
              onClick={onSaveDraft || onSave}
              disabled={isSubmitting}
              aria-label="Save draft"
              className="text-slate-600 hover:text-blue-600 px-3 py-2 font-semibold text-sm transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              <span className="hidden sm:inline">{sectionMode ? 'Save changes' : 'Save Draft'}</span>
            </button>
          </div>
        </div>

        {sectionMode ? (
          <nav aria-label="Listing sections" className="border-t border-slate-100">
            <div className="max-w-5xl mx-auto px-2 sm:px-6 flex gap-1 overflow-x-auto">
              {STEPS.map((st) => (
                <button key={st.num} type="button" onClick={() => onJump?.(st.num)} aria-current={st.num === currentStep ? 'page' : undefined}
                  className={`shrink-0 px-3 py-3 text-sm font-semibold border-b-2 transition-colors ${st.num === currentStep ? 'border-navy-800 text-navy-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                  {st.title}
                </button>
              ))}
            </div>
          </nav>
        ) : (
        <div className="w-full h-1 bg-slate-100">
          <div 
            className="h-full bg-blue-600 transition-all duration-500 ease-out"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
        )}
      </div>

      {/* Main Content Area - Centered Focused Card */}
      <main className="max-w-3xl mx-auto mt-8 sm:mt-12 px-4 sm:px-6 relative">
        {/* Step Indicator for Mobile */}
        {!sectionMode && (
          <div className="sm:hidden text-xs font-semibold text-blue-600 uppercase tracking-wider mb-4">
            Step {currentStep} of {STEPS.length} — {currentStepData.title}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200 overflow-hidden min-h-[500px] mb-8 transition-all">
          <div className="p-6 sm:p-10">
            {children}
          </div>
        </div>
      </main>

      {/* Floating Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-slate-200 py-4 px-6 flex items-center justify-center z-40">
        <div className="w-full max-w-3xl flex items-center justify-between">
          {sectionMode ? (
            <button type="button" onClick={handleBackNavigation} disabled={isSubmitting}
              className="font-semibold text-sm px-6 py-3 rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900">
              Back to property
            </button>
          ) : (
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
          )}
          
          <button
            type="button"
            onClick={onSave}
            disabled={isSubmitting}
            className="bg-slate-900 hover:bg-blue-600 text-white px-8 py-3 rounded-xl font-semibold text-sm transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-lg shadow-slate-900/20 hover:shadow-blue-600/30 active:scale-95"
          >
            {isSubmitting && <Loader2 size={16} className="animate-spin" />}
            {sectionMode ? 'Save changes' : currentStep === STEPS.length ? (isEditing ? 'Save Property Info' : 'Submit Property') : 'Next Step'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PropertyWizardLayout;
