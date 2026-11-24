import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BadgePercent, Gift, X } from 'lucide-react';
import { offerText } from '../../utils/guestOffers';

/**
 * Hotel page, signed-out visitors: after a short look at the hotel, a pop-up says what signing in
 * saves (the sign-in price) and what a new account adds on its first booking. Both come from the
 * server (getGuestOffers), so they match checkout. Shown at most once every 3 days per browser;
 * sign-in or sign-up brings the guest back to this hotel with the same dates.
 */
const KEY = 'zivo_signin_offer_seen';
const EVERY_MS = 3 * 24 * 60 * 60 * 1000;
const AFTER_MS = 8000;

const seenRecently = () => {
  try { return Date.now() - Number(localStorage.getItem(KEY) || 0) < EVERY_MS; } catch { return false; }
};
const markSeen = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch { /* private mode */ } };


const SignInOfferPopup = ({ offers, hotelName }) => {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const closeRef = useRef(null);
  const worthIt = Boolean(offers?.signIn || offers?.firstBooking);

  useEffect(() => {
    if (!worthIt || seenRecently()) return undefined;
    let shown = false;
    const show = () => { if (!shown) { shown = true; markSeen(); setOpen(true); } };
    const timer = setTimeout(show, AFTER_MS);
    // Or once the visitor has scrolled well into the page (looking at rooms)
    const onScroll = () => { if (window.scrollY > window.innerHeight * 1.5) show(); };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { clearTimeout(timer); window.removeEventListener('scroll', onScroll); };
  }, [worthIt]);

  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;
  // Sign-in / sign-up return here (same hotel, dates and guests)
  const back = { from: { pathname: location.pathname, search: location.search } };
  const { signIn, firstBooking } = offers;

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="signin-offer-title" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-6 relative">
        <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Close" className="absolute top-3 right-3 p-2 rounded-full text-gray-500 hover:bg-gray-100"><X size={18} /></button>
        <h2 id="signin-offer-title" className="text-lg font-bold text-navy-900 pr-8">Save more on {hotelName || 'this stay'}</h2>
        <ul className="mt-4 space-y-3">
          {signIn && (
            <li className="flex gap-3">
              <span className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0"><BadgePercent size={18} aria-hidden="true" /></span>
              <p className="text-sm text-gray-700"><strong className="text-gray-900">{signIn.percent}% off with the sign-in price.</strong> Sign in and every room here is cheaper{signIn.zivoMax ? ` (ZivoPlus part up to ₹${Math.round(signIn.zivoMax).toLocaleString('en-IN')})` : ''}.</p>
            </li>
          )}
          {firstBooking && (
            <li className="flex gap-3">
              <span className="w-9 h-9 rounded-xl bg-green-100 text-green-800 flex items-center justify-center shrink-0"><Gift size={18} aria-hidden="true" /></span>
              <p className="text-sm text-gray-700"><strong className="text-gray-900">New to ZivoPlus? Extra {offerText(firstBooking)} on your first booking.</strong> {signIn ? 'On top of the sign-in price, applied' : 'Applied'} automatically at checkout.</p>
            </li>
          )}
        </ul>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Link to="/signup" state={back} onClick={() => setOpen(false)} className="text-center px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold">Create free account</Link>
          <Link to="/login" state={back} onClick={() => setOpen(false)} className="text-center px-4 py-2.5 rounded-xl border border-gray-300 hover:border-navy-700 text-navy-900 text-sm font-bold">Sign in</Link>
        </div>
        <p className="mt-3 text-xs text-gray-500 text-center">Free to join. Your dates and guests are kept.</p>
      </div>
    </div>
  );
};

export default SignInOfferPopup;
