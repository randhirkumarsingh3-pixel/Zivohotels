import { useState } from 'react';
import { Heart } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSavedHotels } from '../../hooks/useSavedHotels';

/**
 * The heart: saves a hotel (with the dates being looked at, for price-drop alerts) to My saved
 * hotels. Signed-out guests are asked to sign in first. Hotel and ZivoPlus staff accounts don't
 * see it.
 */
const SaveButton = ({ hotelId, hotelName, stay = {}, className = '', size = 18, onLight = false }) => {
  const { canSave, signedIn, isSaved, toggle } = useSavedHotels();
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  if (signedIn && !canSave) return null;
  const saved = isSaved(hotelId);
  const click = async (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!signedIn) { navigate('/login', { state: { from: { pathname: location.pathname, search: location.search }, notice: 'Sign in to save hotels and get price-drop alerts.' } }); return; }
    setBusy(true);
    try {
      const now = await toggle(hotelId, stay);
      setNote(now ? (stay.checkIn ? 'Saved. We\'ll email you if the price for your dates drops.' : 'Saved to My saved hotels.') : 'Removed from My saved hotels.');
      setTimeout(() => setNote(''), 3500);
    } catch (err) { setNote(err.message || 'Could not save. Try again.'); setTimeout(() => setNote(''), 3500); } finally { setBusy(false); }
  };
  return (
    <span className={`relative inline-flex ${className}`}>
      <button type="button" onClick={click} disabled={busy} aria-pressed={saved} aria-label={saved ? `Remove ${hotelName || 'this hotel'} from saved hotels` : `Save ${hotelName || 'this hotel'}`}
        className={`inline-flex items-center justify-center rounded-full p-2 transition-colors ${onLight ? 'bg-white border border-gray-200 hover:border-gray-300' : 'bg-white/90 hover:bg-white shadow'} disabled:opacity-60`}>
        <Heart size={size} className={saved ? 'fill-brand-600 text-brand-600' : 'text-gray-700'} aria-hidden="true" />
      </button>
      <span role="status" className={`absolute right-0 top-full mt-1 z-30 w-56 rounded-lg bg-gray-900 text-white text-xs px-2.5 py-1.5 shadow ${note ? '' : 'sr-only'}`}>{note}</span>
    </span>
  );
};

export default SaveButton;
