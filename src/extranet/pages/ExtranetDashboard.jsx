import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  LogIn, LogOut, BedDouble, Users, CalendarRange, TrendingUp, Star, ChevronRight, Loader2,
  FileSignature, ListChecks, Bell, History, ArrowRight,
} from 'lucide-react';
import { fetchProperty, fetchActivityTimeline, fetchNotifications, extranetGet } from '../../services/extranetApi';
import { useExtranet } from '../context/ExtranetContext';
import { useSocketEvent } from '../../context/SocketContext';

/**
 * Extranet dashboard: today at the property (arrivals, departures, in house, tonight's occupancy),
 * this month and the last 7 days, reviews, a to-do list of setup gaps, the next arrivals, alerts
 * and recent changes. All figures come from GET /extranet/dashboard; nothing is estimated.
 */
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const day = (d) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

const STATUS_INFO = {
  LIVE: { label: 'Live: taking bookings', tone: 'green' },
  ACTIVE: { label: 'Live: taking bookings', tone: 'green' },
  READY_FOR_GO_LIVE: { label: 'Agreement signed: going live shortly', tone: 'amber' },
  PENDING_AGREEMENT: { label: 'Approved: sign the agreement to go live', tone: 'amber' },
  IN_REVIEW: { label: 'Under review by ZivoPlus', tone: 'amber' },
  SUBMITTED: { label: 'Submitted: awaiting review', tone: 'amber' },
  INFORMATION_REQUESTED: { label: 'Action needed: ZivoPlus asked for more information', tone: 'red' },
  PAUSED: { label: 'Paused: not taking bookings', tone: 'red' },
  DRAFT: { label: 'Draft: finish and submit your listing', tone: 'amber' },
};
const TONE = { green: 'bg-green-50 text-green-800 border-green-200', amber: 'bg-amber-50 text-amber-900 border-amber-200', red: 'bg-red-50 text-red-800 border-red-200' };

// Audit actions in plain words for the "Recent changes" list
const ACTION_TEXT = {
  CREATE_PROMOTION: 'Promotion created', UPDATE_PROMOTION: 'Promotion updated', CREATE_ROOM_TYPE: 'Room type added', UPDATE_ROOM: 'Room type updated',
  DELETE_ROOM: 'Room type removed', PROPERTY_INFO_UPDATED: 'Property details updated', BOOKING_STATUS_CHANGED: 'Booking status changed',
  STATUS_AGREEMENT_SIGNED: 'Agreement signed', SIGN_AGREEMENT_ACTIVATE_PROPERTY: 'Agreement signed', SEND_AGREEMENT: 'Agreement sent to you',
  PAYOUT_STATUS_CHANGE: 'Payout updated', SETTLEMENT_CREATED: 'Stay settled', REVIEW_CREATED: 'New guest review', UPDATE: 'Listing updated',
};
const actionText = (a) => ACTION_TEXT[a] || String(a || 'Change').toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

const Stat = ({ icon: Icon, label, value, note, to }) => {
  const body = (
    <>
      <p className="flex items-center gap-2 text-sm font-medium text-gray-600"><Icon size={16} className="text-navy-700" aria-hidden="true" /> {label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1 tabular-nums">{value}</p>
      {note && <p className="text-xs text-gray-500 mt-1">{note}</p>}
    </>
  );
  return to
    ? <Link to={to} className="bg-white rounded-card border border-gray-200 p-5 hover:border-navy-300 hover:shadow-sm transition">{body}</Link>
    : <div className="bg-white rounded-card border border-gray-200 p-5">{body}</div>;
};

const GuestRow = ({ b, kind }) => (
  <li className="flex items-center justify-between gap-3 py-3">
    <div className="min-w-0">
      <p className="font-semibold text-gray-900 truncate">{b.guestName}</p>
      <p className="text-xs text-gray-500 truncate">{b.bookingRef} · {b.roomsLabel || `${b.roomType}${b.rooms > 1 ? ` × ${b.rooms}` : ''}`} · {b.nights} night{b.nights === 1 ? '' : 's'}{kind === 'upcoming' ? ` · ${day(b.checkIn)}` : ''}</p>
    </div>
    <div className="text-right shrink-0">
      {b.dueAtHotel > 0 && b.status !== 'COMPLETED'
        ? <p className="text-sm font-semibold text-orange-800 tabular-nums">{inr(b.dueAtHotel)} at hotel</p>
        : b.dueAtHotel > 0 ? <p className="text-sm font-semibold text-green-800">Collected at hotel</p>
        : <p className="text-sm font-semibold text-green-800">Paid online</p>}
      <p className="text-xs text-gray-500">{b.status === 'CHECKED_IN' ? 'Checked in' : b.status === 'COMPLETED' ? 'Checked out' : 'Confirmed'}</p>
    </div>
  </li>
);

const ExtranetDashboard = () => {
  const { addToast, hotelId } = useExtranet();
  const [property, setProperty] = useState(null);
  const [dash, setDash] = useState(null);
  const [activities, setActivities] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [prop, summary, acts, notes] = await Promise.all([fetchProperty(), extranetGet('/dashboard'), fetchActivityTimeline().catch(() => []), fetchNotifications().catch(() => [])]);
      setProperty(prop); setDash(summary); setActivities(acts || []); setNotifications(notes || []);
    } catch (e) { addToast(e.message, 'error'); } finally { setLoading(false); }
  }, [addToast]);
  useEffect(() => { if (hotelId) load(); }, [load, hotelId]);
  // New bookings, cancellations and settlements refresh the figures. The callback must be stable:
  // the socket hook re-runs whenever it changes, which would reload in a loop.
  const lastEvent = useRef(null);
  const onLiveEvent = useCallback((e) => {
    if (!e || lastEvent.current === e) return;
    lastEvent.current = e;
    if (['BOOKING_CREATED', 'BOOKING_UPDATED', 'BOOKING_CANCELLED', 'SETTLEMENT_CREATED', 'GUEST_REQUEST'].includes(e.event)) load();
  }, [load]);
  useSocketEvent('*', onLiveEvent);

  if (loading && !dash) return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-navy-700" size={36} /></div>;
  if (!dash || !property) return <p className="text-gray-600">Couldn&apos;t load the dashboard. Refresh to try again.</p>;

  const status = STATUS_INFO[property.status] || { label: property.status, tone: 'amber' };
  const { today, upcoming, month, week, reviews, todo } = dash;
  const occ = today.tonightTotal ? Math.round((today.tonightSold / today.tonightTotal) * 100) : 0;
  const editListing = `/extranet/onboarding/${property.id}`;
  const unread = notifications.filter((n) => !n.isRead);

  return (
    <div className="space-y-6 pb-12">
      {property.status === 'PENDING_AGREEMENT' && (
        <div className="rounded-card border border-amber-300 bg-amber-50 p-5 flex flex-col md:flex-row md:items-center gap-4">
          <FileSignature className="text-amber-800 shrink-0" size={32} aria-hidden="true" />
          <div className="flex-1">
            <h2 className="font-bold text-gray-900">Your property is approved. Sign the agreement to go live.</h2>
            <p className="text-sm text-gray-700 mt-1">{property.agreement?.commissionRate != null ? <>Commission: <strong>{property.agreement.commissionRate}%</strong> of the room price before GST, plus GST on the commission. </> : null}Read the agreement and sign it online with a code we email you.</p>
          </div>
          <Link to={`/extranet/agreement/${property.id}`} className="px-5 py-3 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold text-center">Read and sign</Link>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })}</p>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">{property.name}</h1>
          <span className={`inline-flex mt-2 items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${TONE[status.tone]}`}>{status.label}</span>
        </div>
        <Link to="/extranet/bookings" className="self-start md:self-auto inline-flex items-center gap-1 text-sm font-semibold text-navy-700 hover:underline">All bookings <ArrowRight size={16} aria-hidden="true" /></Link>
      </div>

      <section aria-label="Today" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={LogIn} label="Arrivals today" value={today.arrivals.length} note={today.arrivals.filter((b) => b.status === 'CHECKED_IN').length ? `${today.arrivals.filter((b) => b.status === 'CHECKED_IN').length} checked in` : 'Expected today'} to="/extranet/bookings" />
        <Stat icon={LogOut} label="Departures today" value={today.departures.length} to="/extranet/bookings" />
        <Stat icon={Users} label="In house" value={today.inHouse} note="Checked-in bookings" />
        <Stat icon={BedDouble} label="Tonight" value={`${occ}%`} note={`${today.tonightSold} of ${today.tonightTotal} rooms sold`} to="/extranet/inventory" />
      </section>

      <section className="grid gap-4 lg:grid-cols-3" aria-label="Bookings and reviews">
        <Stat icon={CalendarRange} label="This month" value={inr(month.revenue)} note={`${month.bookings} booking${month.bookings === 1 ? '' : 's'} · ${month.roomNights} room night${month.roomNights === 1 ? '' : 's'} (stays checking in this month)`} to="/extranet/performance" />
        <Stat icon={TrendingUp} label="Last 7 days" value={`${week.newBookings} booked`} note={`${week.cancellations} cancelled`} to="/extranet/bookings" />
        <Stat icon={Star} label="Guest reviews" value={reviews.count ? `${reviews.score}/5` : '—'} note={reviews.count ? `${reviews.count} review${reviews.count === 1 ? '' : 's'} · ${reviews.awaitingReply} awaiting reply` : 'No reviews yet'} to="/extranet/reviews" />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white rounded-card border border-gray-200 p-5" aria-labelledby="arrivals-h">
            <h2 id="arrivals-h" className="font-bold text-gray-900 flex items-center gap-2"><LogIn size={18} className="text-navy-700" aria-hidden="true" /> Arriving today</h2>
            {today.arrivals.length ? <ul className="divide-y divide-gray-100">{today.arrivals.map((b) => <GuestRow key={b.id} b={b} />)}</ul> : <p className="text-sm text-gray-500 py-4">No arrivals today.</p>}
          </section>
          <section className="bg-white rounded-card border border-gray-200 p-5" aria-labelledby="upcoming-h">
            <h2 id="upcoming-h" className="font-bold text-gray-900 flex items-center gap-2"><CalendarRange size={18} className="text-navy-700" aria-hidden="true" /> Next 7 days</h2>
            {upcoming.length ? <ul className="divide-y divide-gray-100">{upcoming.map((b) => <GuestRow key={b.id} b={b} kind="upcoming" />)}</ul> : <p className="text-sm text-gray-500 py-4">No arrivals booked for the next 7 days.</p>}
          </section>
        </div>

        <div className="space-y-6">
          {todo.length > 0 && (
            <section className="bg-white rounded-card border border-gray-200 p-5" aria-labelledby="todo-h">
              <h2 id="todo-h" className="font-bold text-gray-900 flex items-center gap-2"><ListChecks size={18} className="text-brand-600" aria-hidden="true" /> To do</h2>
              <ul className="mt-2 space-y-1">
                {todo.map((t) => (
                  <li key={t.key}>
                    <Link to={t.link === 'EDIT_LISTING' ? editListing : t.link} className="flex items-center justify-between gap-3 py-2 text-sm text-gray-700 hover:text-navy-800">
                      {t.text} <ChevronRight size={16} className="shrink-0 text-gray-400" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="bg-white rounded-card border border-gray-200 p-5" aria-labelledby="alerts-h">
            <h2 id="alerts-h" className="font-bold text-gray-900 flex items-center gap-2"><Bell size={18} className="text-navy-700" aria-hidden="true" /> Alerts {unread.length > 0 && <span className="text-xs font-bold bg-brand-600 text-white rounded-full px-2 py-0.5">{unread.length}</span>}</h2>
            {notifications.length ? (
              <ul className="mt-2 space-y-3">
                {notifications.slice(0, 5).map((n) => (
                  <li key={n.id} className={`text-sm ${n.isRead ? 'text-gray-600' : 'text-gray-900'}`}>
                    <p className="font-semibold">{n.title}</p>
                    <p className="text-gray-600">{n.message}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{new Date(n.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-gray-500 py-3">No alerts.</p>}
          </section>
          {activities.length > 0 && (
            <section className="bg-white rounded-card border border-gray-200 p-5" aria-labelledby="changes-h">
              <h2 id="changes-h" className="font-bold text-gray-900 flex items-center gap-2"><History size={18} className="text-navy-700" aria-hidden="true" /> Recent changes</h2>
              <ul className="mt-2 space-y-2">
                {activities.slice(0, 6).map((a) => (
                  <li key={a.id} className="flex justify-between gap-3 text-sm">
                    <span className="text-gray-700">{actionText(a.action)}</span>
                    <span className="text-xs text-gray-500 whitespace-nowrap">{new Date(a.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="bg-navy-900 text-white rounded-card p-5">
            <h2 className="font-bold">Need help?</h2>
            <p className="text-sm text-navy-100 mt-1">Write to <span className="font-semibold text-white select-all">partners@zivoplus.com</span></p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default ExtranetDashboard;
