import { createContext, useState, useContext, useCallback, useEffect } from 'react';
import { fetchProperty } from '../../services/extranetApi';

const ExtranetContext = createContext();

export const ExtranetProvider = ({ children }) => {
  // Global Toasts
  const [toasts, setToasts] = useState([]);
  
  // System Status Strip (e.g., SAFE_MODE, CM_SYNC_FAILED)
  const [systemStatus, setSystemStatus] = useState(null); 
  
  // Dirty State Registry (to prevent unsaved changes loss)
  const [dirtyRegistry, setDirtyRegistry] = useState({});
  
  // Active Property Info
  const [property, setProperty] = useState(null);
  const [hotelId, setHotelId] = useState(null);

  const addToast = useCallback((message, type = 'info') => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const registerDirtyState = useCallback((moduleId, isDirty) => {
    setDirtyRegistry((prev) => {
      if (prev[moduleId] === isDirty) return prev;
      return { ...prev, [moduleId]: isDirty };
    });
  }, []);

  const isAnyDirty = Object.values(dirtyRegistry).some((dirty) => dirty);

  // Warn on tab close if dirty
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isAnyDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isAnyDirty]);

  // Fetch property info on mount
  useEffect(() => {
    // Only fetch if we are NOT already on the onboarding page
    if (window.location.pathname.startsWith('/extranet/onboarding')) return;

    fetchProperty()
      .then(res => {
        setProperty(res);
        setHotelId(res.id);
      })
      .catch(err => {
        console.error('Failed to fetch extranet property:', err);
        // If 403 (Forbidden) or 404, the user likely has no properties yet.
        // Redirect to onboarding to initialize supply acquisition.
        if (err.status === 403 || err.status === 404) {
          window.location.href = '/extranet/onboarding';
        }
      });
  }, []);

  return (
    <ExtranetContext.Provider
      value={{
        addToast,
        systemStatus,
        setSystemStatus,
        registerDirtyState,
        isAnyDirty,
        property,
        hotelId
      }}
    >
      {children}
      {/* Global Toast Container */}
      <div className="fixed bottom-8 right-8 z-50 flex flex-col gap-3">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`min-w-[300px] p-4 rounded-xl shadow-xl flex items-center justify-between text-sm font-medium border ${
              toast.type === 'error'
                ? 'bg-red-50 text-red-700 border-red-100'
                : toast.type === 'success'
                ? 'bg-green-50 text-green-700 border-green-100'
                : toast.type === 'warning'
                ? 'bg-orange-50 text-orange-700 border-orange-100'
                : 'bg-white text-gray-800 border-gray-100'
            }`}
          >
            {toast.message}
            <button onClick={() => removeToast(toast.id)} className="opacity-50 hover:opacity-100">×</button>
          </div>
        ))}
      </div>
    </ExtranetContext.Provider>
  );
};

export const useExtranet = () => useContext(ExtranetContext);
