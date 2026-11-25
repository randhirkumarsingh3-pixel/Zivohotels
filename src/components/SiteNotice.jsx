import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getPublicConfig } from '../services/api';

/**
 * A strip at the top of the guest website when ZivoPlus staff have paused something in
 * Admin → System control: maintenance, new bookings or online payments. Hidden in Admin and
 * Extranet (they have their own view of it). Checks again every 2 minutes.
 */
const on = (v) => v === true || v === 'true';

const SiteNotice = () => {
  const { pathname } = useLocation();
  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => getPublicConfig().then((r) => { if (alive) setCfg(r?.data || null); }).catch(() => {});
    load();
    const t = setInterval(load, 120000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  if (!cfg || /^\/(admin|extranet|master)/.test(pathname)) return null;
  let text = null;
  if (on(cfg.maintenanceMode)) text = cfg.maintenanceMessage || 'ZivoPlus is down for maintenance. Please try again in a few minutes.';
  else if (on(cfg.isBookingDisabled)) text = 'New bookings are paused for a short while. You can still browse hotels and prices.';
  else if (on(cfg.isPaymentDisabled)) text = 'Online payment is paused for a short while. You can book with Pay at hotel, or pay online a little later.';
  if (!text) return null;
  return (
    <div role="status" className="fixed top-16 inset-x-0 z-40 bg-amber-100 border-b border-amber-300 text-amber-950 text-sm text-center px-4 py-2">
      {text}
    </div>
  );
};

export default SiteNotice;
