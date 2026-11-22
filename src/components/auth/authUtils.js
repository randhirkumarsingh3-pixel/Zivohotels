import { useEffect, useState } from 'react';
import { getAuthConfig } from '../../services/api';

export const inputClass = 'block w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all';
export const primaryButton = 'w-full flex justify-center items-center py-3.5 px-4 rounded-xl text-sm font-bold text-white bg-brand-700 hover:bg-brand-800 disabled:opacity-70 disabled:cursor-not-allowed transition-colors';

/** What to send for a number typed next to the +91 box. */
/**
 * Where to go after signing in or signing up: the page that asked for it, with its address and
 * what it carried (an hourly checkout carries the chosen room and time), or the home page.
 */
export const returnTo = (location) => {
  const from = location.state?.from;
  return {
    path: from?.pathname ? `${from.pathname}${from.search || ''}` : '/',
    state: from?.state || undefined,
    booking: Boolean(from?.pathname?.startsWith('/checkout')),
  };
};

export const phoneForApi = (typed) => (String(typed).trim().startsWith('+') ? String(typed).trim() : `+91${String(typed).replace(/\D/g, '').replace(/^0/, '')}`);

let configPromise = null;
/** Sign-in settings from the server (Google client id, test modes), fetched once. */
export const useAuthConfig = () => {
  const [config, setConfig] = useState(null);
  useEffect(() => {
    if (!configPromise) configPromise = getAuthConfig().catch(() => ({}));
    let alive = true;
    configPromise.then((c) => { if (alive) setConfig(c || {}); });
    return () => { alive = false; };
  }, []);
  return config;
};

