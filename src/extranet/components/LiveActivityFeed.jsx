import { useState, useEffect, useRef } from 'react';
import { Bell, Activity, X } from 'lucide-react';
import { useSocketEvent } from '../../context/SocketContext';

/**
 * Extranet header bell: live activity for this property (new bookings, cancellations, payouts...)
 * as it happens. It used to be a panel fixed over the bottom-right of every page; it now opens
 * from the bell and shows a count of events the owner hasn't seen.
 */
const LiveActivityFeed = ({ hotelId }) => {
  const [activities, setActivities] = useState([]);
  const [unseen, setUnseen] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useSocketEvent('*', (event) => {
    if (event.hotelId === hotelId || !event.hotelId) {
      setActivities((prev) => [{ id: Math.random().toString(36).slice(2, 11), ...event }, ...prev].slice(0, 20));
      setUnseen((n) => n + 1);
    }
  });

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const toggle = () => { setOpen((o) => !o); setUnseen(0); };

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={toggle} aria-label={unseen ? `Live activity, ${unseen} new` : 'Live activity'} aria-expanded={open}
        className="p-2.5 text-gray-500 hover:bg-gray-100 hover:text-navy-800 rounded-xl transition-colors relative">
        <Bell size={20} />
        {unseen > 0 && <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 bg-brand-600 text-white text-xs font-bold rounded-full flex items-center justify-center">{unseen > 9 ? '9+' : unseen}</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[min(22rem,calc(100vw-2rem))] bg-white rounded-card shadow-xl border border-gray-200 overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">Live activity</h3>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="p-1 text-gray-400 hover:text-gray-700 rounded-md"><X size={16} /></button>
          </div>
          <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-100">
            {activities.length === 0 && (
              <div className="py-10 px-6 text-center">
                <Activity className="mx-auto text-gray-300 mb-2" size={28} />
                <p className="text-sm text-gray-500">Nothing yet. New bookings, cancellations and payouts show up here as they happen.</p>
              </div>
            )}
            {activities.map((act) => (
              <div key={act.id} className="px-4 py-3">
                <div className="flex justify-between items-center gap-3 mb-1">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    act.severity === 'CRITICAL' ? 'bg-red-50 text-red-700' : act.severity === 'WARNING' ? 'bg-amber-50 text-amber-800' : 'bg-navy-50 text-navy-700'
                  }`}>
                    {String(act.event || 'Update').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
                  </span>
                  <span className="text-xs text-gray-500 tabular-nums">{new Date(act.timestamp || Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p className="text-sm text-gray-700">{act.data?.message || act.data?.bookingRef || act.data?.payoutId || 'Property update'}</p>
                {act.data?.amount ? <p className="text-sm font-semibold text-gray-900 mt-0.5 tabular-nums">₹{Number(act.data.amount).toLocaleString('en-IN')}</p> : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveActivityFeed;
