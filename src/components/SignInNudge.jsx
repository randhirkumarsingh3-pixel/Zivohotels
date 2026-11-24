import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BadgePercent, Gift, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getGuestOffers } from '../services/api';
import { offerText } from '../utils/guestOffers';

/**
 * A small sign-in / sign-up card for every visitor who is not signed in, on any guest page of the
 * site. It says what signing in saves (the sign-in price) and what a new account adds on its first
 * booking, from the server (Admin → Membership, Admin → Promotions), so it matches checkout.
 * It sits in a corner (a strip at the bottom on phones) without dimming or blocking the page,
 * appears a few seconds after landing, and once closed stays away for 3 days. Sign-in or sign-up
 * brings the visitor back to the page they were on.
 */
const KEY = 'zivo_signin_offer_seen';
const EVERY_MS = 3 * 24 * 60 * 60 * 1000;
const AFTER_MS = 5000;
// Not on sign-in pages, checkout, or the hotel / admin consoles
const HIDDEN = [/^\/login/, /^\/signup/, /^\/forgot-password/, /^\/reset-password/, /^\/set-password/, /^\/accept-invite/, /^\/checkout/, /^\/admin/, /^\/extranet/, /^\/owner/, /^\/list-your-property/];

const seenRecently = () => {
  try { return Date.now() - Number(localStorage.getItem(KEY) || 0) < EVERY_MS; } catch { return false; }
};
const markSeen = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch { /* private mode */ } };

const SignInNudge = () => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const [offers, setOffers] = useState(null);
  const [open, setOpen] = useState(false);
  const hiddenHere = HIDDEN.some((r) => r.test(location.pathname));

  useEffect(() => {
    if (isAuthenticated || seenRecently()) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      getGuestOffers().then((o) => { if (!cancelled && (o?.signIn || o?.firstBooking)) setOffers(o); }).catch(() => {});
    }, AFTER_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [isAuthenticated]);

  // Show once the offers are known, on a page where it belongs
  useEffect(() => {
    if (offers && !isAuthenticated && !hiddenHere && !seenRecently()) setOpen(true);
    if (isAuthenticated || hiddenHere) setOpen(false);
  }, [offers, isAuthenticated, hiddenHere]);

  if (!open || !offers) return null;
  const close = () => { markSeen(); setOpen(false); };
  const back = { from: { pathname: location.pathname, search: location.search } };
  const { signIn, firstBooking } = offers;

  return (
    <aside aria-label="Sign in and save"
      className="fixed z-[80] inset-x-0 bottom-0 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[360px] bg-white border border-gray-200 sm:rounded-2xl rounded-t-2xl shadow-2xl p-4"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}>
      <button type="button" onClick={close} aria-label="Close" className="absolute top-2 right-2 p-2 rounded-full text-gray-500 hover:bg-gray-100"><X size={16} /></button>
      <p className="font-bold text-navy-900 text-sm pr-8">Sign in and save on every stay</p>
      <ul className="mt-2 space-y-1.5 text-xs text-gray-700">
        {signIn && <li className="flex gap-2 items-start"><BadgePercent size={15} className="text-amber-700 shrink-0 mt-px" aria-hidden="true" /><span><strong className="text-gray-900">{signIn.percent}% off</strong> with the sign-in price</span></li>}
        {firstBooking && <li className="flex gap-2 items-start"><Gift size={15} className="text-green-700 shrink-0 mt-px" aria-hidden="true" /><span>New here? <strong className="text-gray-900">Extra {offerText(firstBooking)}</strong> on your first booking</span></li>}
      </ul>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link to="/signup" state={back} onClick={close} className="text-center px-3 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold">Create free account</Link>
        <Link to="/login" state={back} onClick={close} className="text-center px-3 py-2 rounded-xl border border-gray-300 hover:border-navy-700 text-navy-900 text-xs font-bold">Sign in</Link>
      </div>
    </aside>
  );
};

export default SignInNudge;
