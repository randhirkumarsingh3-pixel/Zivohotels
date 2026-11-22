import { useEffect, useState } from 'react';
import { MapPinned, Loader2 } from 'lucide-react';
import { googleHotelsApi } from '../../services/extranetApi';

/**
 * Extranet: show (or stop showing) the property's ZivoHotels price on Google Search and Maps,
 * and what Google still needs to match it to the property's Google Maps listing.
 */
const GoogleHotelsCard = () => {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { googleHotelsApi.get().then(setData).catch((e) => setError(e.message || 'Could not load')); }, []);
  const toggle = async () => {
    setBusy(true); setError('');
    try { await googleHotelsApi.set(!data.included); setData(await googleHotelsApi.get()); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm" aria-label="Google Hotels">
      <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><MapPinned size={18} className="text-navy-700" /> Show your price on Google</h2>
      <p className="text-sm text-gray-600 mt-1">Guests searching for your hotel on Google Search and Maps can see the ZivoHotels price and book through us. The price is always the one on your ZivoHotels page.</p>
      {!data ? (error ? <p className="mt-3 text-sm text-red-700">{error}</p> : <Loader2 className="mt-3 animate-spin text-gray-400" />) : (
        <>
          <p className="mt-3 text-sm">
            {data.adminExcluded ? <span className="text-gray-700">ZivoHotels has paused Google for this property. Contact support to turn it on.</span>
              : data.included ? <span className="text-green-700 font-semibold">On: your property is in our Google feed{data.live ? '' : ' (Google listings start once ZivoHotels goes live on Google)'}.</span>
                : <span className="text-gray-700 font-semibold">Off: your property is not shown on Google through ZivoHotels.</span>}
          </p>
          {data.problems?.length > 0 && <p className="mt-1 text-sm text-amber-800">For Google to match your property to its Maps listing, add: {data.problems.join(', ')} (Property Info).</p>}
          {!data.adminExcluded && (
            <button type="button" disabled={busy} onClick={toggle} className={`mt-4 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60 ${data.included ? 'border border-gray-300 text-gray-800' : 'bg-brand-600 text-white'}`}>
              {busy ? 'Saving…' : data.included ? 'Stop showing on Google' : 'Show on Google'}
            </button>
          )}
          {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        </>
      )}
    </section>
  );
};

export default GoogleHotelsCard;
