import { useState, useEffect } from 'react';
import { 
  Calendar, MapPin, CreditCard, ChevronRight, XCircle, AlertCircle, 
  RefreshCw, CheckCircle2, FileText, MessageSquare, Phone, Compass, 
  User, Sparkles, Gift, ArrowRightLeft, Clock, Printer, Download,
  ExternalLink, Wifi, ShieldAlert, Award, ArrowRight, Star, Lock
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';
const API_URL = `${BASE_URL}/bookings`;

/* ─── Helpers ─────────────────────────────────────────────────────────── */
const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const classifyBooking = (booking) => {
  const now = today();
  const checkIn  = new Date(booking.checkIn);
  const checkOut = new Date(booking.checkOut);
  checkIn.setHours(0, 0, 0, 0);
  checkOut.setHours(0, 0, 0, 0);

  if (['CANCELLED'].includes(booking.status)) return 'past';
  if (checkOut <= now) return 'past';        // checked-out / completed
  if (checkIn <= now && checkOut > now) return 'ongoing'; // currently staying
  return 'upcoming';                          // future reservation
};

/** Review becomes available the day AFTER check-in */
const isReviewUnlocked = (booking) => {
  if (!['COMPLETED', 'CONFIRMED', 'CHECKED_IN'].includes(booking.status)) return false;
  const dayAfterCheckIn = new Date(booking.checkIn);
  dayAfterCheckIn.setDate(dayAfterCheckIn.getDate() + 1);
  dayAfterCheckIn.setHours(0, 0, 0, 0);
  return today() >= dayAfterCheckIn;
};

/* ─── Star Rating Widget ──────────────────────────────────────────────── */
const StarRating = ({ value, onChange }) => (
  <div className="flex gap-1.5">
    {[1, 2, 3, 4, 5].map((star) => (
      <button
        key={star}
        type="button"
        onClick={() => onChange(star)}
        className="transition-transform hover:scale-110"
      >
        <Star
          size={28}
          className={star <= value ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'}
        />
      </button>
    ))}
  </div>
);

/* ─── Section Header ──────────────────────────────────────────────────── */
const SectionHeader = ({ icon, title, count, accent }) => (
  <div className={`flex items-center gap-3 mb-5 pb-3 border-b ${accent}`}>
    <div className="text-current">{icon}</div>
    <h2 className="text-base font-black text-gray-900">{title}</h2>
    {count > 0 && (
      <span className="ml-auto text-[11px] font-black text-gray-400 bg-gray-100 rounded-full px-2.5 py-0.5">
        {count} {count === 1 ? 'stay' : 'stays'}
      </span>
    )}
  </div>
);

/* ─── Main Component ──────────────────────────────────────────────────── */
const MyBookings = () => {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeBooking, setActiveBooking] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [activeSection, setActiveSection] = useState('upcoming'); // upcoming | ongoing | past
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [conciergeActionLoading, setConciergeActionLoading] = useState('');
  const [conciergeSuccess, setConciergeSuccess] = useState('');

  // Review state
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewSuccess, setReviewSuccess] = useState(false);

  /* ── Data fetching ── */
  const fetchMyBookings = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('jwt_token');
      const res = await fetch(`${API_URL}/my-bookings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to fetch bookings');
      setBookings(data.data || []);
      if (activeBooking) {
        const updated = (data.data || []).find(b => b.id === activeBooking.id);
        if (updated) setActiveBooking(updated);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMyBookings(); }, []);

  /* ── Section buckets ── */
  const upcoming = bookings.filter(b => classifyBooking(b) === 'upcoming');
  const ongoing  = bookings.filter(b => classifyBooking(b) === 'ongoing');
  const past     = bookings.filter(b => classifyBooking(b) === 'past');

  /* ── Actions ── */
  const handleCancelBooking = async (id) => {
    setCancelling(true);
    try {
      const token = localStorage.getItem('jwt_token');
      const res = await fetch(`${API_URL}/${id}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Cancellation failed');
      setBookings(prev => prev.map(b => b.id === id ? data.data.booking : b));
      setCancelTarget(null);
      fetchMyBookings();
    } catch (err) {
      alert(err.message);
    } finally {
      setCancelling(false);
    }
  };

  const handleDownloadInvoice = async (invoiceId, refName) => {
    try {
      const token = localStorage.getItem('jwt_token');
      const res = await fetch(`${BASE_URL}/invoices/${invoiceId}/download`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Invoice PDF is not generated yet or missing on server.');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Invoice-${refName}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleConciergeRequest = (type) => {
    setConciergeActionLoading(type);
    setTimeout(() => {
      setConciergeActionLoading('');
      setConciergeSuccess(type);
      setTimeout(() => setConciergeSuccess(''), 4000);
    }, 1500);
  };

  const handleSubmitReview = async () => {
    if (reviewRating === 0) { alert('Please select a rating before submitting.'); return; }
    setReviewSubmitting(true);
    try {
      const token = localStorage.getItem('jwt_token');
      const res = await fetch(`${BASE_URL}/reviews`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId:  activeBooking.id,
          hotelId:    activeBooking.hotelId,
          rating:     reviewRating,
          comment:    reviewComment
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Review submission failed');
      setReviewSuccess(true);
    } catch (err) {
      alert(err.message);
    } finally {
      setReviewSubmitting(false);
    }
  };

  /* ── UI helpers ── */
  const getStatusColor = (status) => {
    switch (status) {
      case 'CONFIRMED':  return 'text-emerald-700 bg-emerald-50 border-emerald-100';
      case 'PENDING':    return 'text-amber-700 bg-amber-50 border-amber-100';
      case 'CANCELLED':  return 'text-rose-700 bg-rose-50 border-rose-100';
      case 'REFUNDED':   return 'text-sky-700 bg-sky-50 border-sky-100';
      case 'CHECKED_IN': return 'text-violet-700 bg-violet-50 border-violet-100';
      case 'COMPLETED':  return 'text-gray-700 bg-gray-100 border-gray-200';
      default:           return 'text-gray-600 bg-gray-50 border-gray-100';
    }
  };

  const getTimelineIcon = (status) => {
    switch (status) {
      case 'BOOKING_INITIATED': return <Clock size={16} className="text-gray-500" />;
      case 'PENDING_PAYMENT':   return <CreditCard size={16} className="text-amber-500" />;
      case 'CONFIRMED':         return <CheckCircle2 size={16} className="text-emerald-500" />;
      case 'INVOICE_GENERATED': return <FileText size={16} className="text-blue-500" />;
      case 'CHECKED_IN':        return <MapPin size={16} className="text-violet-500" />;
      case 'CANCELLED':         return <XCircle size={16} className="text-rose-500" />;
      case 'REFUNDED':          return <ArrowRightLeft size={16} className="text-sky-500" />;
      default:                  return <Sparkles size={16} className="text-brand-500" />;
    }
  };

  /* ── Booking card renderer ── */
  const BookingCard = ({ booking }) => {
    const mainImageUrl = booking.hotel?.media?.[0]?.url
      ? (booking.hotel.media[0].url.startsWith('http')
          ? booking.hotel.media[0].url
          : `${BASE_URL.replace('/api/v1', '')}${booking.hotel.media[0].url}`)
      : 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80';

    const reviewReady = isReviewUnlocked(booking);
    const cat = classifyBooking(booking);

    return (
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow group flex flex-col md:flex-row">
        {/* Hotel image */}
        <div className="md:w-56 h-44 md:h-auto relative overflow-hidden shrink-0">
          <img
            src={mainImageUrl}
            alt={booking.hotel?.name || 'Hotel'}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none md:hidden" />
          <span className="absolute top-3 left-3 md:hidden px-2.5 py-0.5 rounded-full text-xs font-black bg-white/95 text-gray-900 shadow-md">
            ₹{(booking.paidAmount || booking.totalAmount)?.toLocaleString('en-IN')}
          </span>
          {/* Section accent badge on image */}
          {cat === 'ongoing' && (
            <span className="absolute bottom-3 left-3 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-violet-600 text-white shadow-sm">
              Staying now
            </span>
          )}
        </div>

        {/* Card body */}
        <div className="p-5 md:p-7 flex-1 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${getStatusColor(booking.status)}`}>
                {booking.status}
              </span>
              {booking.paymentStatus === 'REFUNDED' && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-purple-50 text-purple-600 border border-purple-100">
                  Refunded
                </span>
              )}
              {booking.intelligence?.aiTags?.slice(0, 1).map((tag, i) => (
                <span key={i} className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-gray-50 text-gray-500 border border-gray-100 flex items-center gap-0.5">
                  <Sparkles size={8} className="text-brand-500" />{tag}
                </span>
              ))}
              {reviewReady && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-600 border border-amber-200 flex items-center gap-1">
                  <Star size={9} className="fill-amber-500 text-amber-500" />
                  Review ready
                </span>
              )}
            </div>

            <h3 className="text-xl font-bold text-gray-900 group-hover:text-brand-600 transition-colors mb-0.5">{booking.hotel?.name}</h3>
            <p className="text-gray-500 text-xs flex items-center gap-1 mb-3">
              <MapPin size={12} className="text-gray-400" />
              {booking.hotel?.city} · {booking.roomType?.name}
            </p>

            <div className="grid grid-cols-2 gap-3 bg-gray-50/70 rounded-2xl p-3 mb-3 border border-gray-50">
              <div>
                <p className="text-[8px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Check-in</p>
                <p className="font-extrabold text-gray-800 text-xs">
                  {new Date(booking.checkIn).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div>
                <p className="text-[8px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Check-out</p>
                <p className="font-extrabold text-gray-800 text-xs">
                  {new Date(booking.checkOut).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-gray-100 gap-3">
            <div>
              <p className="text-[8px] text-gray-400 font-bold uppercase tracking-wider">Ref ID</p>
              <p className="font-mono text-xs font-bold text-gray-700">{booking.bookingRef}</p>
            </div>
            <div className="flex gap-2">
              {reviewReady && (
                <button
                  onClick={() => { setActiveBooking(booking); setActiveTab('review'); setReviewSuccess(false); setReviewRating(0); setReviewComment(''); }}
                  className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 px-4 py-2 rounded-xl font-bold text-xs transition-all"
                >
                  <Star size={12} className="fill-amber-500 text-amber-500" />
                  Rate Stay
                </button>
              )}
              <button
                onClick={() => { setActiveBooking(booking); setActiveTab('overview'); }}
                className="inline-flex items-center gap-1 bg-gray-900 text-white hover:bg-brand-600 px-4 py-2 rounded-xl font-bold text-xs shadow-sm transition-all"
              >
                Manage
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const EmptySection = ({ label }) => (
    <div className="flex items-center gap-3 py-5 px-5 rounded-2xl bg-gray-50 border border-dashed border-gray-200 text-gray-400 text-xs font-medium">
      <Calendar size={16} />
      No {label} stays
    </div>
  );

  /* ── Loading screen ── */
  if (loading && bookings.length === 0) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-24 flex flex-col items-center justify-center">
        <RefreshCw className="h-12 w-12 text-brand-600 animate-spin mb-6" />
        <p className="text-gray-600 font-semibold text-lg">Accessing Guest Travel Hub...</p>
      </div>
    );
  }

  /* ──────────────────────────────────────────────── */
  return (
    <div className="max-w-6xl mx-auto px-4 py-12">

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <div>
          <span className="text-brand-600 font-bold uppercase tracking-wider text-sm">Zivo Premium</span>
          <h1 className="text-4xl font-black text-gray-900 tracking-tight mt-1">Guest Travel Hub</h1>
          <p className="text-gray-500 mt-2 text-lg">Manage stay parameters, access digital invoices, and coordinate trip assistance.</p>
        </div>

        {/* Loyalty Card */}
        <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-brand-950 text-white rounded-3xl p-6 shadow-xl shadow-gray-950/20 flex items-center gap-6 border border-gray-800 shrink-0">
          <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-amber-400">
            <Award size={28} />
          </div>
          <div>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Points Balance</p>
            <p className="text-2xl font-black text-white mt-0.5">240 Zivo Points</p>
            <p className="text-[10px] text-emerald-400 font-medium flex items-center gap-1 mt-1">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
              Wallet cashback credited
            </p>
          </div>
        </div>
      </div>

      {bookings.length === 0 ? (
        <div className="bg-white rounded-3xl p-16 text-center border border-gray-100 shadow-sm max-w-3xl mx-auto">
          <div className="bg-gray-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8 border border-gray-100">
            <Calendar className="h-12 w-12 text-gray-300" />
          </div>
          <h3 className="text-2xl font-black text-gray-900 mb-3">No active travel reservations</h3>
          <p className="text-gray-500 mb-8 max-w-sm mx-auto leading-relaxed">Your Travel Hub is currently empty. Explore premium accommodations and reserve your next escape.</p>
          <Link to="/hotels" className="inline-flex items-center justify-center bg-brand-600 text-white px-8 py-4 rounded-full font-bold shadow-lg shadow-brand-500/20 hover:bg-brand-700 transition-all gap-2 group">
            Explore Hotels
            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Main Sections (2/3) */}
          <div className="lg:col-span-2">

            {/* ── Pill Tab Switcher ───────────────────────── */}
            <div className="flex gap-3 mb-8 flex-wrap">
              {/* Upcoming */}
              <button
                onClick={() => setActiveSection('upcoming')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-sm border transition-all ${
                  activeSection === 'upcoming'
                    ? 'bg-brand-600 text-white border-brand-600 shadow-md shadow-brand-500/25'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-brand-400 hover:text-brand-600'
                }`}
              >
                <Calendar size={15} />
                Upcoming Bookings
                <span className={`text-[11px] font-black rounded-full px-2 py-0.5 ml-0.5 ${
                  activeSection === 'upcoming' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                }`}>{upcoming.length}</span>
              </button>

              {/* Ongoing */}
              <button
                onClick={() => setActiveSection('ongoing')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-sm border transition-all ${
                  activeSection === 'ongoing'
                    ? 'bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-500/25'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-violet-400 hover:text-violet-600'
                }`}
              >
                <MapPin size={15} />
                Ongoing Stays
                {ongoing.length > 0 && (
                  <span className={`text-[11px] font-black rounded-full px-2 py-0.5 ml-0.5 ${
                    activeSection === 'ongoing' ? 'bg-white/20 text-white' : 'bg-violet-100 text-violet-600'
                  }`}>{ongoing.length}</span>
                )}
                {ongoing.length > 0 && activeSection !== 'ongoing' && (
                  <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
                )}
              </button>

              {/* Past */}
              <button
                onClick={() => setActiveSection('past')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-sm border transition-all ${
                  activeSection === 'past'
                    ? 'bg-gray-700 text-white border-gray-700 shadow-md shadow-gray-500/20'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-700'
                }`}
              >
                <Clock size={15} />
                Past Bookings
                <span className={`text-[11px] font-black rounded-full px-2 py-0.5 ml-0.5 ${
                  activeSection === 'past' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                }`}>{past.length}</span>
              </button>
            </div>

            {/* ── Active Section Content ───────────────────── */}
            <div className="space-y-5">
              {activeSection === 'upcoming' && (
                upcoming.length === 0
                  ? <EmptySection label="upcoming" />
                  : upcoming.map(b => <BookingCard key={b.id} booking={b} />)
              )}
              {activeSection === 'ongoing' && (
                ongoing.length === 0
                  ? <EmptySection label="ongoing" />
                  : ongoing.map(b => <BookingCard key={b.id} booking={b} />)
              )}
              {activeSection === 'past' && (
                past.length === 0
                  ? <EmptySection label="past" />
                  : <div className="opacity-90 space-y-5">{past.map(b => <BookingCard key={b.id} booking={b} />)}</div>
              )}
            </div>

          </div>

          {/* Side panel (1/3) */}
          <div className="space-y-6">
            {/* AI Trip Assistant */}
            <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
              <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
                <Sparkles size={20} className="text-brand-600" />
                AI Trip Assistant
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed mb-4">
                Need immediate help? Tell Zivo AI to notify the hotel of a late check-in or request amenities.
              </p>
              <div className="space-y-3">
                <button onClick={() => handleConciergeRequest('general')} className="w-full flex items-center justify-between p-3 rounded-2xl bg-gray-50 border border-gray-100 hover:border-brand-500 transition-colors text-left text-xs font-bold text-gray-800">
                  <span>Request Airport Transfer Setup</span><ChevronRight size={14} />
                </button>
                <button onClick={() => handleConciergeRequest('general')} className="w-full flex items-center justify-between p-3 rounded-2xl bg-gray-50 border border-gray-100 hover:border-brand-500 transition-colors text-left text-xs font-bold text-gray-800">
                  <span>Inquire about Parking Availability</span><ChevronRight size={14} />
                </button>
              </div>
            </div>

            {/* Rebook card */}
            <div className="bg-gradient-to-br from-brand-900 to-brand-950 text-white rounded-3xl p-6 shadow-lg border border-brand-800/50 relative overflow-hidden">
              <div className="absolute -right-10 -bottom-10 opacity-10"><ArrowRightLeft size={200} /></div>
              <span className="bg-white/10 text-white/90 text-[10px] font-black uppercase px-2.5 py-1 rounded-full border border-white/10">Loyalty Perk</span>
              <h3 className="text-xl font-bold text-white mt-4 mb-2">Ready for your next stay?</h3>
              <p className="text-xs text-brand-200 leading-relaxed mb-6">Enjoy a flat 10% loyalty discount at any Zivo partner property when you rebook today.</p>
              <Link to="/hotels" className="w-full bg-white text-brand-950 font-extrabold text-sm py-3 px-4 rounded-xl flex items-center justify-center gap-1.5 hover:bg-brand-50 transition-colors">
                Apply Rebook Discount<ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── SIDE DRAWER ───────────────────────────────────────── */}
      {activeBooking && (
        <>
          <div onClick={() => setActiveBooking(null)} className="fixed inset-0 z-[110] bg-gray-900/60 backdrop-blur-sm" />

          <div className="fixed inset-y-0 right-0 z-[120] w-full max-w-xl bg-white shadow-2xl overflow-y-auto flex flex-col h-full animate-slide-in">
            {/* Header */}
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div>
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Booking Hub Workspace</span>
                <h3 className="text-xl font-black text-gray-900 mt-0.5">{activeBooking.hotel?.name}</h3>
                <p className="text-xs text-gray-500 font-mono mt-1">Ref ID: {activeBooking.bookingRef}</p>
              </div>
              <button onClick={() => setActiveBooking(null)} className="w-10 h-10 bg-white border border-gray-200 rounded-full flex items-center justify-center hover:bg-gray-100 text-gray-500 transition-colors">✕</button>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-100 px-6 flex gap-4 overflow-x-auto whitespace-nowrap scrollbar-none">
              {[
                { id: 'overview',  label: 'Overview',    icon: <User size={14} /> },
                { id: 'timeline',  label: 'Timeline',    icon: <Clock size={14} /> },
                { id: 'concierge', label: 'AI Concierge',icon: <Sparkles size={14} /> },
                { id: 'billing',   label: 'Financials',  icon: <FileText size={14} /> },
                { id: 'review',    label: 'Rate & Review',icon: <Star size={14} /> },
                { id: 'support',   label: 'Support',     icon: <Phone size={14} /> }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 py-4 border-b-2 font-bold text-xs transition-colors ${activeTab === tab.id ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
                >
                  {tab.icon}{tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="p-6 flex-1 overflow-y-auto space-y-6">

              {/* OVERVIEW */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: 'Guests', value: `${activeBooking.guests} pax` },
                      { label: 'Rooms',  value: `${activeBooking.rooms} Unit` },
                      { label: 'Nights', value: `${Math.ceil(Math.abs(new Date(activeBooking.checkOut) - new Date(activeBooking.checkIn)) / 86400000)} Nights` }
                    ].map(s => (
                      <div key={s.label} className="bg-gray-50 p-4 rounded-2xl border border-gray-100/50 text-center">
                        <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">{s.label}</p>
                        <p className="font-extrabold text-gray-900 text-sm">{s.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="border border-gray-100 rounded-2xl p-5 space-y-4">
                    <h4 className="font-bold text-gray-900 text-sm">Stay Parameters</h4>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div><span className="text-gray-400">Guest Name</span><p className="font-bold text-gray-800 mt-0.5">{activeBooking.guestName}</p></div>
                      <div><span className="text-gray-400">Contact</span><p className="font-bold text-gray-800 mt-0.5">{activeBooking.guestPhone}</p></div>
                      <div className="col-span-2"><span className="text-gray-400">Room Type</span><p className="font-bold text-gray-800 mt-0.5">{activeBooking.roomType?.name}</p></div>
                      <div className="col-span-2"><span className="text-gray-400">Rate Plan</span><p className="font-bold text-gray-800 mt-0.5">{activeBooking.ratePlan?.name} ({activeBooking.ratePlan?.mealPlan || 'No Meal'})</p></div>
                    </div>
                  </div>

                  <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-5 flex items-start gap-4">
                    <div className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center shrink-0">
                      <Printer size={20} />
                    </div>
                    <div className="text-xs">
                      <h4 className="font-bold text-emerald-900 mb-1">Offline Travel Voucher</h4>
                      <p className="text-emerald-700 leading-relaxed mb-3">Save booking details locally for low-reception travel.</p>
                      <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 bg-emerald-600 text-white font-bold px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors">
                        Print/Save Voucher<ExternalLink size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TIMELINE */}
              {activeTab === 'timeline' && (
                <div className="space-y-6">
                  <h4 className="font-bold text-gray-900 text-sm">Live Operational Timeline</h4>
                  <div className="relative pl-8 border-l-2 border-gray-100 space-y-8 py-2 ml-4">
                    {activeBooking.timelineEvents?.map(event => (
                      <div key={event.id} className="relative">
                        <div className="absolute -left-12 top-0.5 w-8 h-8 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center shadow-sm">
                          {getTimelineIcon(event.status)}
                        </div>
                        <h5 className="font-extrabold text-gray-900 text-sm">{event.title}</h5>
                        <p className="text-xs text-gray-500 mt-1 leading-relaxed">{event.message}</p>
                        <span className="text-[10px] text-gray-400 font-bold block mt-2">
                          {new Date(event.createdAt).toLocaleDateString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
                        </span>
                      </div>
                    ))}
                    {activeBooking.status === 'CONFIRMED' && (
                      <div className="relative opacity-60">
                        <div className="absolute -left-12 top-0.5 w-8 h-8 rounded-full bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center">
                          <Clock size={14} className="text-gray-400" />
                        </div>
                        <h5 className="font-bold text-gray-500 text-sm">Hotel Acknowledge Arrival</h5>
                        <p className="text-xs text-gray-400 mt-0.5">Awaiting check-in process verification.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* AI CONCIERGE */}
              {activeTab === 'concierge' && (
                <div className="space-y-6">
                  {conciergeSuccess && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-emerald-800 flex items-start gap-2.5 text-xs">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                      <div><p className="font-bold">Request Transmitted</p><p className="text-emerald-700 mt-0.5">Property manager alerted via Extranet.</p></div>
                    </div>
                  )}
                  <div className="bg-brand-50 border border-brand-100 rounded-2xl p-5 flex gap-4">
                    <Sparkles className="text-brand-600 mt-0.5 shrink-0" size={24} />
                    <div className="text-xs">
                      <h4 className="font-bold text-brand-900 mb-1">AI Concierge Services</h4>
                      <p className="text-brand-700 leading-relaxed mb-4">Send check-in requests or stay modifications directly to reception.</p>
                      <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => handleConciergeRequest('late')} disabled={conciergeActionLoading === 'late' || activeBooking.status !== 'CONFIRMED'} className="bg-white border border-brand-200 hover:border-brand-600 text-brand-950 font-bold p-3 rounded-xl transition-all flex items-center justify-center gap-1.5 text-[11px] disabled:opacity-50">
                          {conciergeActionLoading === 'late' ? <RefreshCw size={12} className="animate-spin" /> : <Clock size={12} />}Alert Late Arrival
                        </button>
                        <button onClick={() => handleConciergeRequest('early')} disabled={conciergeActionLoading === 'early' || activeBooking.status !== 'CONFIRMED'} className="bg-white border border-brand-200 hover:border-brand-600 text-brand-950 font-bold p-3 rounded-xl transition-all flex items-center justify-center gap-1.5 text-[11px] disabled:opacity-50">
                          {conciergeActionLoading === 'early' ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}Early Check-in
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="border border-gray-100 rounded-2xl p-5 space-y-4">
                    <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2"><ExternalLink size={16} className="text-brand-600" />Stay Intelligence</h4>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      {[
                        { icon: <Clock size={16} className="text-brand-500" />, label: 'Peak Check-in', val: activeBooking.intelligence?.peakCheckIn || '12 PM - 2 PM' },
                        { icon: <Wifi size={16} className="text-emerald-500" />,label: 'WiFi Score', val: activeBooking.intelligence?.wifiRating || 'Excellent' },
                        { icon: <Compass size={16} className="text-blue-500" />, label: 'Airport Distance', val: activeBooking.intelligence?.airportDistance || '18 mins' },
                        { icon: <ShieldAlert size={16} className="text-amber-500" />, label: 'Traffic / Access', val: activeBooking.intelligence?.trafficAlert || 'Clear Route' }
                      ].map(item => (
                        <div key={item.label} className="bg-gray-50/70 p-3 rounded-xl border border-gray-50 flex items-start gap-2">
                          {item.icon}
                          <div><span className="text-gray-400 font-medium">{item.label}</span><p className="font-bold text-gray-800 mt-0.5">{item.val}</p></div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* BILLING */}
              {activeTab === 'billing' && (
                <div className="space-y-6">
                  <div className="bg-gray-900 text-white rounded-2xl p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Total Paid</p>
                        <p className="text-3xl font-black mt-1">₹{activeBooking.paidAmount?.toLocaleString('en-IN')}</p>
                      </div>
                      <span className="bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase px-2.5 py-1 rounded-full border border-emerald-500/20">Payment Captured</span>
                    </div>
                    <div className="border-t border-white/10 pt-4 grid grid-cols-2 gap-4 text-xs text-gray-400">
                      <div><span>Payment Method</span><p className="font-bold text-white mt-0.5">{activeBooking.paymentType}</p></div>
                      <div><span>Reference No.</span><p className="font-mono text-white mt-0.5">{activeBooking.bookingRef}</p></div>
                    </div>
                  </div>

                  <div className="border border-gray-100 rounded-2xl p-5 space-y-4">
                    <h4 className="font-bold text-gray-900 text-sm">Invoice & Billing Center</h4>
                    <p className="text-xs text-gray-500">Download official billing receipts for tax declarations.</p>
                    {activeBooking.invoice ? (
                      <button onClick={() => handleDownloadInvoice(activeBooking.invoice.id, activeBooking.bookingRef)} className="flex items-center justify-between w-full p-3 rounded-xl border border-gray-200 hover:border-brand-500 text-xs font-bold text-gray-800 transition-colors">
                        <span className="flex items-center gap-2"><FileText size={16} className="text-brand-600" />Official GST Invoice PDF</span>
                        <Download size={14} className="text-gray-400" />
                      </button>
                    ) : (
                      <div className="p-3 rounded-xl bg-amber-50 text-amber-700 text-xs border border-amber-100 flex items-start gap-2">
                        <AlertCircle size={16} className="shrink-0 mt-0.5" />
                        <span>No invoice found. It may still be generating.</span>
                      </div>
                    )}
                  </div>

                  {activeBooking.status === 'CONFIRMED' && (
                    <div className="bg-rose-50/50 border border-rose-100 rounded-2xl p-5 space-y-3">
                      <h4 className="font-bold text-rose-950 text-sm">Cancel Booking</h4>
                      <p className="text-xs text-rose-700 leading-relaxed">You will be shown a refund preview before confirming.</p>
                      <button onClick={() => setCancelTarget(activeBooking)} className="bg-white border border-rose-200 hover:border-rose-600 text-rose-700 font-bold py-2.5 px-4 rounded-xl text-xs transition-colors flex items-center gap-1.5">
                        <XCircle size={14} />Request Cancellation
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── REVIEW TAB ───────────────────────────────── */}
              {activeTab === 'review' && (
                <div className="space-y-6">
                  {!isReviewUnlocked(activeBooking) ? (
                    /* Locked state */
                    <div className="flex flex-col items-center justify-center py-12 text-center gap-4">
                      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                        <Lock size={28} className="text-gray-300" />
                      </div>
                      <div>
                        <h4 className="text-lg font-black text-gray-900 mb-2">Review Not Yet Available</h4>
                        <p className="text-sm text-gray-500 leading-relaxed max-w-xs mx-auto">
                          Your review option unlocks the <span className="font-bold text-gray-700">day after check-in</span> on{' '}
                          <span className="font-bold text-brand-600">
                            {new Date(new Date(activeBooking.checkIn).setDate(new Date(activeBooking.checkIn).getDate() + 1)).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>.
                        </p>
                      </div>
                      <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-xs text-amber-800 max-w-xs w-full">
                        <div className="flex items-start gap-2">
                          <AlertCircle size={14} className="shrink-0 mt-0.5 text-amber-600" />
                          <p className="leading-relaxed">Only guests who have checked in can submit verified reviews. This ensures authentic feedback on ZivoHotels.</p>
                        </div>
                      </div>
                    </div>
                  ) : reviewSuccess ? (
                    /* Success state */
                    <div className="flex flex-col items-center justify-center py-12 text-center gap-4">
                      <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
                        <CheckCircle2 size={32} className="text-emerald-600" />
                      </div>
                      <div>
                        <h4 className="text-xl font-black text-gray-900 mb-2">Thank You for Your Review!</h4>
                        <p className="text-sm text-gray-500 max-w-xs mx-auto">Your review has been submitted and will be published after moderation. You earned <span className="font-bold text-brand-600">+50 Zivo Points</span>!</p>
                      </div>
                      <div className="flex items-center gap-1 mt-2">
                        {[1,2,3,4,5].map(s => (
                          <Star key={s} size={22} className={s <= reviewRating ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'} />
                        ))}
                      </div>
                    </div>
                  ) : (
                    /* Active review form */
                    <div className="space-y-6">
                      {/* Hotel summary */}
                      <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                        <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-gray-200">
                          {activeBooking.hotel?.media?.[0]?.url ? (
                            <img src={activeBooking.hotel.media[0].url.startsWith('http') ? activeBooking.hotel.media[0].url : `${BASE_URL.replace('/api/v1', '')}${activeBooking.hotel.media[0].url}`}
                              alt="Hotel" className="w-full h-full object-cover" />
                          ) : <div className="w-full h-full flex items-center justify-center text-gray-400"><Calendar size={20} /></div>}
                        </div>
                        <div>
                          <h4 className="font-bold text-gray-900 text-sm">{activeBooking.hotel?.name}</h4>
                          <p className="text-xs text-gray-500 flex items-center gap-1"><MapPin size={10} />{activeBooking.hotel?.city} · {activeBooking.roomType?.name}</p>
                          <p className="text-[10px] text-gray-400 font-mono mt-1">{activeBooking.bookingRef}</p>
                        </div>
                      </div>

                      {/* Star rating input */}
                      <div className="space-y-3">
                        <label className="block text-sm font-black text-gray-900">Overall Experience</label>
                        <StarRating value={reviewRating} onChange={setReviewRating} />
                        {reviewRating > 0 && (
                          <p className="text-xs font-bold text-amber-600">
                            {['', 'Very Poor', 'Poor', 'Average', 'Good', 'Excellent'][reviewRating]}
                          </p>
                        )}
                      </div>

                      {/* Category quick ratings */}
                      <div className="border border-gray-100 rounded-2xl p-4 space-y-3">
                        <h4 className="text-xs font-black text-gray-700 uppercase tracking-wider">Rate Specific Aspects</h4>
                        {['Cleanliness', 'Comfort', 'Location', 'Value for Money', 'Staff Service'].map(cat => (
                          <div key={cat} className="flex items-center justify-between">
                            <span className="text-xs text-gray-600 font-medium">{cat}</span>
                            <div className="flex gap-1">
                              {[1,2,3,4,5].map(s => (
                                <Star key={s} size={14} className="text-amber-300 fill-amber-300 cursor-default" />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Written review */}
                      <div className="space-y-2">
                        <label className="block text-sm font-black text-gray-900">
                          Share Your Experience <span className="text-gray-400 font-normal text-xs">(Optional)</span>
                        </label>
                        <textarea
                          rows={4}
                          value={reviewComment}
                          onChange={e => setReviewComment(e.target.value)}
                          placeholder="Tell others about your stay — the service, ambience, food, or anything that stood out..."
                          className="w-full border border-gray-200 rounded-2xl p-4 text-sm text-gray-800 resize-none focus:outline-none focus:border-brand-500 placeholder-gray-400 leading-relaxed"
                        />
                        <p className="text-[10px] text-gray-400 text-right">{reviewComment.length}/500 characters</p>
                      </div>

                      {/* Loyalty incentive notice */}
                      <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-2xl p-4 text-xs">
                        <Gift size={16} className="text-amber-500 shrink-0 mt-0.5" />
                        <div className="text-amber-800">
                          <p className="font-bold mb-0.5">Earn Loyalty Points</p>
                          <p className="leading-relaxed">Submitting a verified review credits your account with <span className="font-bold">50 Zivo Points</span> instantly.</p>
                        </div>
                      </div>

                      {/* Submit button */}
                      <button
                        onClick={handleSubmitReview}
                        disabled={reviewRating === 0 || reviewSubmitting}
                        className="w-full bg-brand-600 text-white font-black py-4 rounded-2xl hover:bg-brand-700 transition-all shadow-lg shadow-brand-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {reviewSubmitting ? <RefreshCw size={18} className="animate-spin" /> : <><Star size={18} className="fill-white" />Submit Review</>}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* SUPPORT */}
              {activeTab === 'support' && (
                <div className="space-y-6">
                  <div className="border border-gray-100 rounded-2xl p-5 space-y-4">
                    <h4 className="font-bold text-gray-900 text-sm">Contact Support & Property</h4>
                    <p className="text-xs text-gray-500">Connect directly with the team or navigate to the property.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-bold text-gray-800">
                      <a href={`tel:${activeBooking.guestPhone}`} className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-100 rounded-xl hover:border-brand-500 transition-colors">
                        <Phone size={16} className="text-gray-500" />Call Property Desk
                      </a>
                      <a href={`https://wa.me/${activeBooking.guestPhone}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-3 bg-emerald-50/40 border border-emerald-100 rounded-xl hover:border-emerald-500 transition-colors text-emerald-800">
                        <MessageSquare size={16} className="text-emerald-500" />WhatsApp Concierge
                      </a>
                      <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((activeBooking.hotel?.name || '') + ' ' + (activeBooking.hotel?.city || ''))}`} target="_blank" rel="noreferrer" className="col-span-1 md:col-span-2 flex items-center justify-center gap-2 p-3 bg-blue-50/30 border border-blue-100 rounded-xl hover:border-blue-500 transition-colors text-blue-700">
                        <Compass size={16} className="text-blue-500" />Launch Google Maps Navigation
                      </a>
                    </div>
                  </div>
                  <div className="bg-brand-900 text-white rounded-2xl p-5 space-y-3">
                    <h4 className="font-bold text-white text-sm">Recommended Stays Nearby</h4>
                    <p className="text-xs text-brand-200 leading-relaxed">Loved {activeBooking.hotel?.name}? Book similar stays with loyalty perks.</p>
                    <Link to="/hotels" className="inline-flex items-center gap-1.5 text-xs text-white bg-white/10 border border-white/10 font-bold px-4 py-2.5 rounded-xl hover:bg-white/20 transition-all">
                      Browse Similar Properties<ArrowRight size={14} />
                    </Link>
                  </div>
                </div>
              )}

            </div>
          </div>
        </>
      )}

      {/* Cancellation Modal */}
      {cancelTarget && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="p-8">
              <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-6"><XCircle size={32} /></div>
              <h3 className="text-2xl font-black text-gray-900 text-center mb-2">Cancel Stay Reservation?</h3>
              <p className="text-gray-500 text-center text-sm mb-6">You are initiating cancellation for <span className="font-bold text-gray-900">{cancelTarget.hotel?.name}</span>.</p>
              
              <div className="border border-gray-100 rounded-2xl p-4 mb-6 space-y-3 text-xs">
                <div className="flex justify-between pb-2 border-b border-gray-100 text-gray-500 font-semibold"><span>Price Component</span><span>Amount (INR)</span></div>
                <div className="flex justify-between text-gray-700"><span>Total Amount Paid</span><span>₹{(cancelTarget.paidAmount || cancelTarget.totalAmount)?.toLocaleString('en-IN')}</span></div>
                <div className="flex justify-between text-rose-600 font-bold"><span>Cancellation Penalty</span><span>- ₹0</span></div>
                <div className="flex justify-between text-emerald-600 font-black text-sm pt-2 border-t border-gray-100"><span>Estimated Refund</span><span>₹{(cancelTarget.paidAmount || cancelTarget.totalAmount)?.toLocaleString('en-IN')}</span></div>
              </div>

              <div className="bg-amber-50 rounded-2xl p-4 text-xs flex items-start gap-2.5 mb-8 border border-amber-100">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-amber-800"><p className="font-bold mb-0.5">Refund Notice</p><p>Refunds settle within 5-7 business days back to original payment method.</p></div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => setCancelTarget(null)} disabled={cancelling} className="px-6 py-4 border border-gray-200 text-gray-700 rounded-2xl font-bold hover:bg-gray-50 transition-colors disabled:opacity-50 text-xs">Keep Booking</button>
                <button onClick={() => handleCancelBooking(cancelTarget.id)} disabled={cancelling} className="px-6 py-4 bg-rose-600 text-white rounded-2xl font-bold hover:bg-rose-700 transition-all shadow-lg shadow-rose-200 disabled:opacity-50 flex items-center justify-center text-xs">
                  {cancelling ? <RefreshCw className="h-5 w-5 animate-spin" /> : 'Confirm Cancel'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyBookings;
