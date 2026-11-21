import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellOff, CheckCheck, X } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import { getMyNotifications, markMyNotificationsRead } from '../../services/api';
import { fetchNotifications as fetchHotelNotifications, markNotificationsRead as markHotelRead } from '../../services/extranetApi';

/**
 * The bell: notifications with an unread count, updated live over the socket.
 *  - source "me":    the signed-in person's own (guests, admins)
 *  - source "hotel": the current property's alerts (extranet)
 * Opening it marks what's shown as read.
 */
const timeAgo = (d) => {
  const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

const hotelLink = (n) => {
  const t = String(n.type || '');
  if (/BOOK|CANCEL|GUEST_REQUEST/.test(t)) return '/extranet/bookings';
  if (/REVIEW/.test(t)) return '/extranet/reviews';
  if (/PAYOUT|SETTLEMENT/.test(t)) return '/extranet/finance';
  return null;
};

const NotificationBell = ({ source = 'me', tone = 'light' }) => {
  const navigate = useNavigate();
  const { socket } = useSocket();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef(null);

  const load = useCallback(async () => {
    try {
      if (source === 'hotel') {
        const list = await fetchHotelNotifications();
        const arr = Array.isArray(list) ? list : list?.data || [];
        setItems(arr);
        setUnread(arr.filter((n) => !n.isRead).length);
      } else {
        const r = await getMyNotifications();
        setItems(r.items || []);
        setUnread(r.unread || 0);
      }
    } catch { /* offline or signed out: keep what we have */ }
    setLoaded(true);
  }, [source]);

  useEffect(() => { load(); }, [load]);

  // Live: a new notification arrives over the socket
  useEffect(() => {
    if (!socket) return undefined;
    const onNew = (n) => {
      if (!n) return;
      setItems((prev) => [{ ...n, id: n.id || `live-${Date.now()}`, isRead: false, createdAt: n.createdAt || new Date().toISOString() }, ...prev].slice(0, 50));
      setUnread((u) => u + 1);
    };
    socket.on('notification', onNew);
    return () => socket.off('notification', onNew);
  }, [socket]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const markRead = async (ids) => {
    const real = ids.filter((id) => !String(id).startsWith('live-'));
    setItems((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, isRead: true } : n)));
    setUnread((u) => Math.max(0, u - ids.length));
    try {
      if (source === 'hotel') { if (real.length) await markHotelRead(real); } else await markMyNotificationsRead(real.length ? real : undefined);
    } catch { /* will show unread again on next load */ }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) load();
  };

  const openItem = (n) => {
    if (!n.isRead) markRead([n.id]);
    const to = n.link || (source === 'hotel' ? hotelLink(n) : null);
    if (to) { setOpen(false); navigate(to); }
  };

  const unreadIds = items.filter((n) => !n.isRead).map((n) => n.id);
  const btn = tone === 'dark' ? 'text-white/80 hover:text-white hover:bg-white/10' : 'text-gray-500 hover:bg-gray-100 hover:text-navy-800';

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={toggle} aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} aria-expanded={open}
        className={`p-2.5 rounded-xl transition-colors relative ${btn}`}>
        <Bell size={20} aria-hidden="true" />
        {unread > 0 && <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 bg-brand-600 text-white text-[11px] font-bold rounded-full flex items-center justify-center">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[min(24rem,calc(100vw-2rem))] bg-white rounded-card shadow-xl border border-gray-200 overflow-hidden z-50 text-left">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-gray-900">Notifications</h3>
            <div className="flex items-center gap-1">
              {unreadIds.length > 0 && (
                <button type="button" onClick={() => markRead(unreadIds)} className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-navy-700 hover:bg-gray-50 rounded-md">
                  <CheckCheck size={14} aria-hidden="true" /> Mark all read
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="p-1 text-gray-400 hover:text-gray-700 rounded-md"><X size={16} /></button>
            </div>
          </div>
          <ul className="max-h-[420px] overflow-y-auto divide-y divide-gray-100">
            {loaded && items.length === 0 && (
              <li className="py-10 px-6 text-center">
                <BellOff className="mx-auto text-gray-300 mb-2" size={28} aria-hidden="true" />
                <p className="text-sm text-gray-500">{source === 'hotel' ? 'No alerts yet. New bookings, cancellations, guest requests and payouts show up here.' : 'No notifications yet. Booking updates and messages show up here.'}</p>
              </li>
            )}
            {items.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => openItem(n)} className={`w-full text-left px-4 py-3 hover:bg-gray-50 flex gap-3 ${n.isRead ? '' : 'bg-brand-50/40'}`}>
                  <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${n.isRead ? 'bg-transparent' : 'bg-brand-600'}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="flex justify-between gap-2">
                      <span className="text-sm font-semibold text-gray-900">{n.title}</span>
                      <span className="text-[11px] text-gray-400 shrink-0 tabular-nums">{timeAgo(n.createdAt)}</span>
                    </span>
                    <span className="block text-sm text-gray-600 mt-0.5 break-words">{n.message}</span>
                    {!n.isRead && <span className="sr-only">Unread</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
