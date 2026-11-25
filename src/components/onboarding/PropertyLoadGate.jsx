import { Loader2, AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';

/**
 * Shown instead of the property editor until the property has loaded. If loading fails (the
 * server is busy or restarting), the guest-facing data is never replaced by an empty form: the
 * owner sees what happened and can try again.
 */
const PropertyLoadGate = ({ state, onRetry, onBack }) => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
    <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl p-6 text-center shadow-sm" role={state === 'failed' ? 'alert' : 'status'}>
      {state === 'failed' ? (
        <>
          <AlertTriangle size={28} className="mx-auto text-amber-600" aria-hidden="true" />
          <h1 className="mt-3 text-lg font-bold text-gray-900">We couldn&apos;t load your property</h1>
          <p className="mt-1 text-sm text-gray-600">The server didn&apos;t answer in time. Nothing was changed. Please try again in a moment.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={onRetry} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold"><RefreshCw size={16} aria-hidden="true" /> Try again</button>
            {onBack && <button type="button" onClick={onBack} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-300 text-sm font-bold text-gray-800"><ArrowLeft size={16} aria-hidden="true" /> Back</button>}
          </div>
        </>
      ) : (
        <p className="text-sm text-gray-600 flex items-center justify-center gap-2"><Loader2 size={18} className="animate-spin" aria-hidden="true" /> Loading your property…</p>
      )}
    </div>
  </div>
);

export default PropertyLoadGate;
