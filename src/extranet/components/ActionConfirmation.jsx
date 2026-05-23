import { AlertTriangle, Loader2 } from 'lucide-react';

const ActionConfirmation = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  impacts = [], 
  confirmText = "Confirm Action",
  isLoading = false,
  variant = "brand" // brand, warning, danger
}) => {
  if (!isOpen) return null;

  const variantStyles = {
    brand: "bg-blue-600 hover:bg-blue-700",
    warning: "bg-orange-500 hover:bg-orange-600",
    danger: "bg-red-600 hover:bg-red-700"
  };

  const iconStyles = {
    brand: "bg-blue-50 text-blue-600",
    warning: "bg-orange-50 text-orange-600",
    danger: "bg-red-50 text-red-600"
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in duration-200">
        <div className="p-8">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 ${iconStyles[variant]}`}>
            <AlertTriangle size={32} />
          </div>
          
          <h3 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">{title}</h3>
          <p className="text-slate-500 font-medium leading-relaxed mb-6">
            {message}
          </p>

          {impacts.length > 0 && (
            <div className="bg-slate-50 rounded-2xl p-6 mb-8 border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Financial & Operational Impact</p>
              <ul className="space-y-3">
                {impacts.map((impact, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm font-bold text-slate-700">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    {impact}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <button 
              onClick={onConfirm}
              disabled={isLoading}
              className={`w-full py-4 rounded-2xl text-white text-xs font-black uppercase tracking-widest shadow-lg transition-all flex items-center justify-center gap-2 ${variantStyles[variant]}`}
            >
              {isLoading && <Loader2 className="animate-spin" size={16} />}
              {confirmText}
            </button>
            <button 
              onClick={onClose}
              disabled={isLoading}
              className="w-full py-4 rounded-2xl text-slate-400 text-xs font-black uppercase tracking-widest hover:text-slate-600 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ActionConfirmation;
