import { useState, useEffect, useCallback } from 'react';
import { roomsText, bookingRoomsOf, activeRoomsOf, roomGuests } from '../utils/bookingRooms';
import RoomCancel from '../components/booking/RoomCancel';
import { 
  Calendar, MapPin, CreditCard, ChevronRight, XCircle, AlertCircle, 
  RefreshCw, CheckCircle2, FileText, MessageSquare, Phone, Compass, 
  User, Sparkles, ArrowRightLeft, Clock, Printer, Download,
  ExternalLink, Mail, Award, Send, ArrowRight, Star, Lock
} from 'lucide-react';
import PayLaterBanner from '../components/booking/PayLaterBanner';
import { needsPayment } from '../utils/payBooking';
import StayRequests from '../components/booking/StayRequests';
import SupportContacts from '../components/SupportContacts';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { getImageUrl } from '../utils/image';
import { getUserBookings, cancelBooking, getCancelPreview, downloadInvoice, submitReview, updateReview, getMyReviews, getMyRewards } from '../services/api';
import { saveVoucher } from '../utils/voucher';
import usePageTitle from '../hooks/usePageTitle';

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
  // Same window as the server: up to 90 days after check-out
  const closes = new Date(new Date(booking.checkOut).getTime() + 90 * 24 * 60 * 60 * 1000);
  return today() >= dayAfterCheckIn && today() <= closes;
};

/** Shrinks a photo in the browser (longest side 1600px, JPEG) so uploads stay small. */
const shrinkPhoto = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => reject(new Error('That file is not an image we can read'));
    img.src = reader.result;
  };
  reader.onerror = () => reject(new Error('Could not read the photo'));
  reader.readAsDataURL(file);
});

/* ─── Premium Star Rating Widget ─────────────────────────────────────── */
const RATING_META = [
  null,
  { label: 'Very Bad',   sub: "We're really sorry your stay didn't meet expectations.",   color: 'text-red-500',    glow: 'shadow-red-300' },
  { label: 'Bad',        sub: "We're sorry your experience wasn't great. Your feedback helps us improve.", color: 'text-orange-500', glow: 'shadow-orange-300' },
  { label: 'Good',       sub: 'Thanks! Tell us what we can do to make it even better.',    color: 'text-amber-500',  glow: 'shadow-amber-300' },
  { label: 'Great',      sub: 'Glad you had a great stay! What stood out the most?',       color: 'text-lime-600',   glow: 'shadow-lime-300' },
  { label: 'Exceptional',sub: 'Awesome! What made your stay truly memorable?',             color: 'text-emerald-600',glow: 'shadow-emerald-300' },
];

const StarRating = ({ value, onChange }) => {
  const [hovered, setHovered] = useState(0);
  const active = hovered || value;
  return (
    <div>
      <div className="flex gap-3 mb-3">
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            className={`transition-all duration-150 ${
              star <= active
                ? `scale-110 drop-shadow-lg ${RATING_META[Math.floor(active)]?.glow || ''}`
                : 'scale-100 opacity-40'
            }`}
            style={{ filter: star <= active ? 'drop-shadow(0 0 6px rgba(251,191,36,0.6))' : 'none' }}
          >
            <Star
              size={40}
              className={star <= active ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'}
              style={{ transition: 'all 0.15s cubic-bezier(.4,0,.2,1)' }}
            />
          </button>
        ))}
      </div>
      {active > 0 && (
        <div className="mt-1 min-h-[40px]">
          <p className={`font-black text-base ${RATING_META[Math.floor(active)]?.color}`}>{RATING_META[Math.floor(active)]?.label}</p>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{RATING_META[Math.floor(active)]?.sub}</p>
        </div>
      )}
    </div>
  );
};

/* ─── Aspect Mini Stars ───────────────────────────────────────────────── */
const AspectStars = ({ value, onChange }) => {
  const [hov, setHov] = useState(0);
  const active = hov || value;
  return (
    <div className="flex gap-1.5">
      {[1,2,3,4,5].map(s => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          onMouseEnter={() => setHov(s)}
          onMouseLeave={() => setHov(0)}
          className="transition-transform hover:scale-125 active:scale-95"
        >
          <Star
            size={22}
            className={s <= active ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'}
            style={{ transition: 'all 0.12s ease' }}
          />
        </button>
      ))}
      {value > 0 && <span className="ml-1 text-xs font-black text-amber-700 self-center">{value}.0</span>}
    </div>
  );
};

/* ─── Main Component ──────────────────────────────────────────────────── */
// The hotel's front desk number (from the property's contact details)
const hotelPhone = (b) => b?.hotel?.contact?.phone || '';
// WhatsApp needs the number with country code: 10-digit Indian numbers get 91 in front
const whatsappNumber = (b) => {
  const d = hotelPhone(b).replace(/\D/g, '');
  if (!d) return '';
  return d.length === 10 ? `91${d}` : d.replace(/^0+/, '');
};

const MyBookings = () => {
  usePageTitle('My bookings');
  useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeBooking, setActiveBooking] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [activeSection, setActiveSection] = useState('upcoming'); // upcoming | ongoing | past
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  // Real refund under the property's policy, fetched when the dialog opens (it used to always
  // promise a full refund, even for non-refundable stays and pay-at-hotel bookings)
  const [cancelPreview, setCancelPreview] = useState(null);
  const [cancelPreviewError, setCancelPreviewError] = useState('');
  const [refundTo, setRefundTo] = useState('SOURCE'); // the guest's choice; never defaults to the wallet
  useEffect(() => {
    setRefundTo('SOURCE');
    if (!cancelTarget) { setCancelPreview(null); setCancelPreviewError(''); return; }
    let active = true;
    getCancelPreview(cancelTarget.id)
      .then(res => { if (active) setCancelPreview(res.data); })
      .catch(err => { if (active) setCancelPreviewError(err.message || 'Could not load the refund details.'); });
    return () => { active = false; };
  }, [cancelTarget]);

  // Review state
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewSuccess, setReviewSuccess] = useState(false);
  const [aspectRatings, setAspectRatings] = useState({ cleanliness: 0, staff: 0, comfort: 0, location: 0, value: 0 });
  const [selectedTags, setSelectedTags] = useState([]);
  const [reviewPhotos, setReviewPhotos] = useState([]);
  const [photoDragOver, setPhotoDragOver] = useState(false);
  const [reviewTitle, setReviewTitle] = useState('');
  const [tripType, setTripType] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [myReviews, setMyReviews] = useState({}); // bookingId -> the guest's review
  const [editingReview, setEditingReview] = useState(false);
  const loadMyReviews = useCallback(() => {
    getMyReviews().then((list) => setMyReviews(Object.fromEntries(list.map((r) => [r.bookingId, r])))).catch(() => {});
  }, []);
  useEffect(() => { loadMyReviews(); }, [loadMyReviews]);
  const [rewards, setRewards] = useState(null);
  useEffect(() => { getMyRewards().then(setRewards).catch(() => {}); }, []);

  /* ── Data fetching ── */
  const fetchMyBookings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getUserBookings();
      setBookings(data || []);
      setActiveBooking(prevActive => {
        if (!prevActive) return null;
        const updated = (data || []).find(b => b.id === prevActive.id);
        return updated || prevActive;
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMyBookings(); }, [fetchMyBookings]);

  /* ── Section buckets ── */
  const upcoming = bookings.filter(b => classifyBooking(b) === 'upcoming');
  const ongoing  = bookings.filter(b => classifyBooking(b) === 'ongoing');
  const past     = bookings.filter(b => classifyBooking(b) === 'past');

  /* ── Actions ── */
  const handleCancelBooking = async (id) => {
    setCancelling(true);
    try {
      const res = await cancelBooking(id, refundTo);
      setBookings(prev => prev.map(b => b.id === id ? res.data.booking : b));
      setCancelTarget(null);
      fetchMyBookings();
    } catch (err) {
      setError(err.message);
    } finally {
      setCancelling(false);
    }
  };

  const handleDownloadInvoice = async (invoiceId, refName) => {
    try {
      const blob = await downloadInvoice(invoiceId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Invoice-${refName}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      setError(err.message);
    }
  };


  const resetReviewForm = () => {
    setReviewRating(0); setReviewComment(''); setReviewTitle(''); setTripType('');
    setAspectRatings({ cleanliness: 0, staff: 0, comfort: 0, location: 0, value: 0 });
    setSelectedTags([]); setReviewPhotos([]); setReviewError(''); setReviewSuccess(false); setEditingReview(false);
  };

  const startEditReview = (review) => {
    setReviewRating(review.rating);
    setReviewComment(review.comment || '');
    setReviewTitle(review.title || '');
    setTripType(review.tripType || '');
    setAspectRatings({ cleanliness: 0, staff: 0, comfort: 0, location: 0, value: 0, ...(review.aspectRatings || {}) });
    setSelectedTags(review.tags || []);
    setReviewPhotos((review.photos || []).map((p) => ({ url: p.url, saved: true })));
    setReviewError('');
    setReviewSuccess(false);
    setEditingReview(true);
  };

  const handleSubmitReview = async () => {
    if (reviewRating === 0) { setReviewError('Please choose an overall rating first.'); return; }
    setReviewSubmitting(true);
    setReviewError('');
    const existing = myReviews[activeBooking.id];
    const payload = {
      rating: reviewRating,
      title: reviewTitle.trim() || null,
      comment: reviewComment.trim() || null,
      aspectRatings: Object.fromEntries(Object.entries(aspectRatings).filter(([, v]) => v > 0)),
      tags: selectedTags,
      tripType: tripType || null,
      photos: reviewPhotos.map((p) => p.url),
    };
    try {
      if (existing) await updateReview(existing.id, payload);
      else await submitReview({ bookingId: activeBooking.id, ...payload });
      setReviewSuccess(true);
      setEditingReview(false);
      loadMyReviews();
    } catch (err) {
      setReviewError(err.message || 'Your review could not be saved. Please try again.');
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleManage = useCallback((booking) => {
    setActiveBooking(booking);
    setActiveTab('overview');
  }, []);

  const handleRateStay = useCallback((booking) => {
    setActiveBooking(booking);
    setActiveTab('review');
    setReviewRating(0); setReviewComment(''); setReviewTitle(''); setTripType('');
    setAspectRatings({ cleanliness: 0, staff: 0, comfort: 0, location: 0, value: 0 });
    setSelectedTags([]); setReviewPhotos([]); setReviewError(''); setReviewSuccess(false); setEditingReview(false);
  }, []);

  /* ── Loading screen ── */
  if (loading && bookings.length === 0) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-24 flex flex-col items-center justify-center">
        <RefreshCw className="h-12 w-12 text-brand-700 animate-spin mb-6" />
        <p className="text-gray-600 font-semibold text-lg">Loading your bookings…</p>
      </div>
    );
  }

  /* ──────────────────────────────────────────────── */
  return (
    <div className="max-w-6xl mx-auto px-4 pt-24 pb-12">

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <div>
          <span className="text-brand-700 font-bold uppercase tracking-wider text-sm">Zivo Premium</span>
          <h1 className="text-4xl font-black text-gray-900 tracking-tight mt-1">My bookings</h1>
          <p className="text-gray-500 mt-2 text-lg">See your trips, download vouchers and invoices, and cancel if your plans change.</p>
        </div>

        {/* Zivo Rewards balance (this showed a made-up "240 Zivo Points") */}
        <Link to="/rewards" className="bg-gradient-to-r from-navy-950 via-navy-900 to-navy-800 text-white rounded-3xl p-6 shadow-xl shadow-gray-950/20 flex items-center gap-6 border border-gray-800 shrink-0 hover:border-brand-500 transition-colors">
          <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-amber-400">
            <Award size={28} />
          </div>
          <div>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Zivo Rewards{rewards ? ` · ${rewards.tier.name}` : ''}</p>
            <p className="text-2xl font-black text-white mt-0.5">{rewards ? `${rewards.available.toLocaleString('en-IN')} points` : '—'}</p>
            <p className="text-xs text-gray-400 font-medium mt-1">
              {rewards?.pending ? `${rewards.pending.toLocaleString('en-IN')} pending · ` : ''}{Object.keys(myReviews).length} review{Object.keys(myReviews).length === 1 ? '' : 's'} written · View rewards →
            </p>
          </div>
        </Link>
      </div>

      {error && (
        <div className="mb-8 flex items-center gap-4 bg-red-50 border-l-4 border-red-500 text-red-900 p-5 rounded-r-xl shadow-sm animate-fade-in">
          <AlertCircle className="text-red-500 shrink-0" size={24} />
          <span className="font-semibold">{error}</span>
        </div>
      )}

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
                    : 'bg-white text-gray-600 border-gray-200 hover:border-brand-400 hover:text-brand-700'
                }`}
              >
                <Calendar size={15} />
                Upcoming Bookings
                <span className={`text-xs font-black rounded-full px-2 py-0.5 ml-0.5 ${
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
                  <span className={`text-xs font-black rounded-full px-2 py-0.5 ml-0.5 ${
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
                <span className={`text-xs font-black rounded-full px-2 py-0.5 ml-0.5 ${
                  activeSection === 'past' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                }`}>{past.length}</span>
              </button>
            </div>

            {/* ── Active Section Content ───────────────────── */}
            <div className="space-y-5">
              {activeSection === 'upcoming' && (
                upcoming.length === 0
                  ? <EmptySection label="upcoming" />
                  : upcoming.map(b => <BookingCard key={b.id} booking={b} onRateStay={handleRateStay} onManage={handleManage} onPaid={fetchMyBookings} />)
              )}
              {activeSection === 'ongoing' && (
                ongoing.length === 0
                  ? <EmptySection label="ongoing" />
                  : ongoing.map(b => <BookingCard key={b.id} booking={b} onRateStay={handleRateStay} onManage={handleManage} onPaid={fetchMyBookings} />)
              )}
              {activeSection === 'past' && (
                past.length === 0
                  ? <EmptySection label="past" />
                  : <div className="opacity-90 space-y-5">{past.map(b => <BookingCard key={b.id} booking={b} onRateStay={handleRateStay} onManage={handleManage} onPaid={fetchMyBookings} />)}</div>
              )}
            </div>

          </div>

          {/* Side panel (1/3) */}
          <div className="space-y-6">
            {/* Help (the old "AI Trip Assistant" showed success but sent nothing) */}
            <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
              <h3 className="text-lg font-black text-gray-900 mb-2 flex items-center gap-2">
                <Phone size={20} className="text-brand-700" />
                Need something for your stay?
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed mb-4">
                For a late arrival, early check-in, airport pickup or parking, open a booking (<span className="font-semibold text-gray-700">Manage</span>) and choose <span className="font-semibold text-gray-700">Requests to hotel</span>. The hotel answers there and by email.
              </p>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">ZivoHotels support</p>
              <div className="mb-3"><SupportContacts compact /></div>
              <Link to="/help" className="w-full flex items-center justify-between p-3 rounded-2xl bg-gray-50 border border-gray-100 hover:border-brand-500 transition-colors text-left text-xs font-bold text-gray-800">
                <span>Help centre: changes, cancellations, refunds</span><ChevronRight size={14} />
              </Link>
            </div>

            {/* Next stay (no made-up discount: member prices and rewards are real) */}
            <div className="bg-gradient-to-br from-navy-800 to-navy-950 text-white rounded-3xl p-6 shadow-lg border border-navy-700/50 relative overflow-hidden">
              <div className="absolute -right-10 -bottom-10 opacity-10"><ArrowRightLeft size={200} /></div>
              <h3 className="text-xl font-bold text-white mb-2">Ready for your next stay?</h3>
              <p className="text-xs text-brand-200 leading-relaxed mb-6">Member prices and Zivo Rewards points apply on every booking.</p>
              <Link to="/hotels" className="w-full bg-white text-brand-950 font-extrabold text-sm py-3 px-4 rounded-xl flex items-center justify-center gap-1.5 hover:bg-brand-50 transition-colors">
                Search hotels<ArrowRight size={16} />
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
                <span className="text-xs text-gray-400 font-bold uppercase tracking-widest">Booking Hub Workspace</span>
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
                { id: 'requests',  label: 'Requests to hotel', icon: <Send size={14} /> },
                { id: 'billing',   label: 'Financials',  icon: <FileText size={14} /> },
                { id: 'review',    label: 'Rate & Review',icon: <Star size={14} /> },
                { id: 'support',   label: 'Contact hotel', icon: <Phone size={14} /> }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 py-4 border-b-2 font-bold text-xs transition-colors ${activeTab === tab.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
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
                  <PayLaterBanner booking={activeBooking} onPaid={fetchMyBookings} />
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: 'Guests', value: `${activeBooking.guests} pax` },
                      { label: 'Rooms',  value: `${activeBooking.rooms} room${activeBooking.rooms === 1 ? '' : 's'}` },
                      { label: 'Nights', value: `${Math.ceil(Math.abs(new Date(activeBooking.checkOut) - new Date(activeBooking.checkIn)) / 86400000)} Nights` }
                    ].map(s => (
                      <div key={s.label} className="bg-gray-50 p-4 rounded-2xl border border-gray-100/50 text-center">
                        <p className="text-xs text-gray-400 font-bold uppercase mb-1">{s.label}</p>
                        <p className="font-extrabold text-gray-900 text-sm">{s.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="border border-gray-100 rounded-2xl p-5 space-y-4">
                    <h4 className="font-bold text-gray-900 text-sm">Stay Parameters</h4>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div><span className="text-gray-400">Guest Name</span><p className="font-bold text-gray-800 mt-0.5">{activeBooking.guestName}</p></div>
                      <div><span className="text-gray-400">Contact</span><p className="font-bold text-gray-800 mt-0.5">{activeBooking.guestPhone}</p></div>
                      {bookingRoomsOf(activeBooking).length > 1 ? (
                        <div className="col-span-2"><span className="text-gray-400">Rooms</span>
                          <ul className="mt-0.5 space-y-1">
                            {bookingRoomsOf(activeBooking).map((r) => (
                              <li key={r.roomNumber} className={`font-bold ${r.cancelledAt ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <span>Room {r.roomNumber}: {r.roomType?.name} · {r.ratePlan?.name} <span className="font-medium text-gray-500">· {roomGuests(r)} · {r.guestName}</span>{r.cancelledAt && <span className="ml-1 no-underline font-semibold text-red-700">(cancelled)</span>}</span>
                                  {/* One room can be cancelled while at least one other stays */}
                                  {!r.cancelledAt && ['CONFIRMED', 'PENDING'].includes(activeBooking.status) && activeRoomsOf(activeBooking).length > 1 && (
                                    <RoomCancel booking={activeBooking} room={r} onDone={fetchMyBookings} />
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <>
                          <div className="col-span-2"><span className="text-gray-400">Room Type</span><p className="font-bold text-gray-800 mt-0.5">{activeBooking.roomType?.name}</p></div>
                          <div className="col-span-2"><span className="text-gray-400">Rate Plan</span><p className="font-bold text-gray-800 mt-0.5">{activeBooking.ratePlan?.name} ({activeBooking.ratePlan?.mealPlan || 'No Meal'})</p></div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-5 flex items-start gap-4">
                    <div className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center shrink-0">
                      <Printer size={20} />
                    </div>
                    <div className="text-xs">
                      <h4 className="font-bold text-emerald-900 mb-1">Booking Voucher</h4>
                      <p className="text-emerald-700 leading-relaxed mb-3">Download the PDF to show at check-in, even without internet.</p>
                      <button
                        onClick={async () => {
                          try { await saveVoucher(activeBooking.id, activeBooking.bookingRef, 'guest'); }
                          catch (err) { setError(err.message || 'Could not download the voucher.'); }
                        }}
                        className="inline-flex items-center gap-1.5 bg-emerald-600 text-white font-bold px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors">
                        Download voucher (PDF)<ExternalLink size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Cancelling was only reachable under the Financials tab */}
                  {activeBooking.status === 'CONFIRMED' && (
                    <button onClick={() => setCancelTarget(activeBooking)} className="w-full border border-rose-200 hover:border-rose-600 text-rose-700 font-bold py-3 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5">
                      <XCircle size={14} />Cancel booking
                    </button>
                  )}
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
                        <span className="text-xs text-gray-400 font-bold block mt-2">
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

              {/* REQUESTS TO THE HOTEL (concierge) */}
              {activeTab === 'requests' && <StayRequests booking={activeBooking} />}

              {/* BILLING */}
              {activeTab === 'billing' && (
                <div className="space-y-6">
                  <div className="bg-gray-900 text-white rounded-2xl p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Total Paid</p>
                        <p className="text-3xl font-black mt-1">₹{activeBooking.paidAmount?.toLocaleString('en-IN')}</p>
                      </div>
                      <span className="bg-emerald-500/10 text-emerald-400 text-xs font-black uppercase px-2.5 py-1 rounded-full border border-emerald-500/20">Payment Captured</span>
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
                        <span className="flex items-center gap-2"><FileText size={16} className="text-brand-700" />Official GST Invoice PDF</span>
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

              {/* ── REVIEW TAB ─── PREMIUM OTA GRADE ──────── */}
              {activeTab === 'review' && (
                <ReviewTab
                  activeBooking={activeBooking}
                  reviewRating={reviewRating}
                  setReviewRating={setReviewRating}
                  reviewComment={reviewComment}
                  setReviewComment={setReviewComment}
                  aspectRatings={aspectRatings}
                  setAspectRatings={setAspectRatings}
                  selectedTags={selectedTags}
                  setSelectedTags={setSelectedTags}
                  reviewPhotos={reviewPhotos}
                  setReviewPhotos={setReviewPhotos}
                  photoDragOver={photoDragOver}
                  setPhotoDragOver={setPhotoDragOver}
                  reviewSubmitting={reviewSubmitting}
                  reviewSuccess={reviewSuccess}
                  onSubmit={handleSubmitReview}
                  reviewTitle={reviewTitle}
                  setReviewTitle={setReviewTitle}
                  tripType={tripType}
                  setTripType={setTripType}
                  reviewError={reviewError}
                  existingReview={myReviews[activeBooking.id]}
                  editing={editingReview}
                  onEdit={startEditReview}
                  onWriteAnother={resetReviewForm}
                />
              )}

              {/* SUPPORT */}
              {activeTab === 'support' && (
                <div className="space-y-6">
                  <div className="border border-gray-100 rounded-2xl p-5 space-y-4">
                    <h4 className="font-bold text-gray-900 text-sm">Contact Support & Property</h4>
                    {activeBooking.metadata?.membership?.prioritySupport && (
                      <p className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">{activeBooking.metadata.membership.plan} booking: you get priority support. Mention your booking ID when you call.</p>
                    )}
                    <p className="text-xs text-gray-500">For a late arrival, early check-in, airport pickup, parking or other requests, contact the hotel. Requests are confirmed by the hotel, not guaranteed.</p>
                    {hotelPhone(activeBooking) || activeBooking.hotel?.contact?.email ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-bold text-gray-800">
                        {hotelPhone(activeBooking) && (
                          <a href={`tel:${hotelPhone(activeBooking)}`} className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-100 rounded-xl hover:border-brand-500 transition-colors">
                            <Phone size={16} className="text-gray-500" /><span>Call the hotel <span className="block font-mono font-semibold text-gray-600 select-all">{hotelPhone(activeBooking)}</span></span>
                          </a>
                        )}
                        {whatsappNumber(activeBooking) && (
                          <a href={`https://wa.me/${whatsappNumber(activeBooking)}?text=${encodeURIComponent(`Hi, I have booking ${activeBooking.bookingRef}`)}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-3 bg-emerald-50/40 border border-emerald-100 rounded-xl hover:border-emerald-500 transition-colors text-emerald-800">
                            <MessageSquare size={16} className="text-emerald-500" />WhatsApp the hotel
                          </a>
                        )}
                        {activeBooking.hotel?.contact?.email && (
                          <a href={`mailto:${activeBooking.hotel.contact.email}?subject=${encodeURIComponent(`Booking ${activeBooking.bookingRef}`)}`} className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-100 rounded-xl hover:border-brand-500 transition-colors md:col-span-2">
                            <Mail size={16} className="text-gray-500" /><span className="break-all">{activeBooking.hotel.contact.email}</span>
                          </a>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-700 bg-gray-50 border border-gray-100 rounded-xl p-3">The hotel hasn&apos;t added its contact details yet. Send a request in <span className="font-semibold">Requests to hotel</span>, or contact ZivoHotels support with your booking ID and we&apos;ll reach the hotel.</p>
                    )}
                    {!(hotelPhone(activeBooking) || activeBooking.hotel?.contact?.email) && (
                      <SupportContacts bookingRef={activeBooking.bookingRef} compact />
                    )}
                    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activeBooking.hotel?.latitude && activeBooking.hotel?.longitude ? `${activeBooking.hotel.latitude},${activeBooking.hotel.longitude}` : `${activeBooking.hotel?.name || ''} ${activeBooking.hotel?.location || ''} ${activeBooking.hotel?.city || ''}`)}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 p-3 bg-blue-50/30 border border-blue-100 rounded-xl hover:border-blue-500 transition-colors text-blue-700 text-xs font-bold">
                      <Compass size={16} className="text-blue-500" />Directions in Google Maps
                    </a>
                  </div>
                  <div className="bg-navy-900 text-white rounded-2xl p-5 space-y-3">
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
                {cancelPreviewError ? (
                  <p className="text-rose-600 font-semibold">{cancelPreviewError}</p>
                ) : !cancelPreview ? (
                  <p className="text-gray-400">Calculating your refund…</p>
                ) : cancelPreview.paidAmount === 0 ? (
                  <p className="text-gray-700">Nothing was paid online for this booking, so there is no refund. Cancelling releases your reservation.</p>
                ) : (
                  <>
                    <div className="flex justify-between pb-2 border-b border-gray-100 text-gray-500 font-semibold"><span>Cancellation policy</span><span className="text-right">{cancelPreview.policyLabel}</span></div>
                    <div className="flex justify-between text-gray-700"><span>Paid online</span><span>₹{cancelPreview.paidAmount.toLocaleString('en-IN')}</span></div>
                    <div className="flex justify-between text-rose-600 font-bold"><span>Cancellation charge</span><span>- ₹{cancelPreview.retainedAmount.toLocaleString('en-IN')}</span></div>
                    <div className="flex justify-between text-emerald-600 font-black text-sm pt-2 border-t border-gray-100"><span>Refund</span><span>₹{cancelPreview.refundAmount.toLocaleString('en-IN')}</span></div>
                    {cancelPreview.walletRefund > 0 && (
                      <p className="text-gray-500">₹{cancelPreview.walletRefund.toLocaleString('en-IN')} you paid with Zivo Cash goes back to your Zivo Cash.</p>
                    )}
                  </>
                )}
              </div>

              {cancelPreview?.choosableRefund > 0 ? (
                <div className="mb-8 space-y-2" role="radiogroup" aria-label="Where should the refund go">
                  <p className="text-xs font-bold text-gray-700">Where should ₹{cancelPreview.choosableRefund.toLocaleString('en-IN')} go?</p>
                  {[
                    { id: 'SOURCE', title: 'Original payment method', sub: 'Card / UPI / net banking · 5-7 working days' },
                    { id: 'WALLET', title: 'Zivo Cash', sub: 'Instant · use it on any ZivoHotels booking' },
                  ].map((o) => (
                    <button key={o.id} type="button" role="radio" aria-checked={refundTo === o.id} onClick={() => setRefundTo(o.id)}
                      className={`w-full text-left rounded-2xl border p-3 text-xs ${refundTo === o.id ? 'border-brand-500 bg-brand-50' : 'border-gray-200'}`}>
                      <span className="font-bold text-gray-900 block">{o.title}</span>
                      <span className="text-gray-500">{o.sub}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="bg-amber-50 rounded-2xl p-4 text-xs flex items-start gap-2.5 mb-8 border border-amber-100">
                  <AlertCircle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
                  <div className="text-amber-800"><p className="font-bold mb-0.5">Refund Notice</p><p>Refunds to your card or UPI take 5-7 working days. Zivo Cash refunds are instant.</p></div>
                </div>
              )}

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


/* ─── UI helpers (pure functions) ─────────────────────────────────────── */
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

/* ─── Sub-components ─────────────────────────────────────────────────── */
const EmptySection = ({ label }) => (
  <div className="flex items-center gap-3 py-5 px-5 rounded-2xl bg-gray-50 border border-dashed border-gray-200 text-gray-400 text-xs font-medium">
    <Calendar size={16} />
    No {label} stays
  </div>
);

const BookingCard = ({ booking, onRateStay, onManage, onPaid }) => {
  const mainImageUrl = getImageUrl(booking.hotel?.media?.[0]?.url) || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80';

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
          <span className="absolute bottom-3 left-3 px-2.5 py-0.5 rounded-full text-xs font-black bg-violet-600 text-white shadow-sm">
            Staying now
          </span>
        )}
      </div>

      {/* Card body */}
      <div className="p-5 md:p-7 flex-1 flex flex-col justify-between">
        <div>
          {needsPayment(booking) && <div className="mb-3"><PayLaterBanner booking={booking} onPaid={onPaid} compact /></div>}
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider border ${getStatusColor(booking.status)}`}>
              {booking.status === 'PENDING' ? 'Awaiting payment' : booking.status.replace('_', ' ')}
            </span>
            {booking.paymentStatus === 'REFUNDED' && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase bg-purple-50 text-purple-600 border border-purple-100">
                Refunded
              </span>
            )}
            {reviewReady && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                <Star size={9} className="fill-amber-500 text-amber-500" />
                Review ready
              </span>
            )}
          </div>

          <h3 className="text-xl font-bold text-gray-900 group-hover:text-brand-700 transition-colors mb-0.5">{booking.hotel?.name}</h3>
          <p className="text-gray-500 text-xs flex items-center gap-1 mb-3">
            <MapPin size={12} className="text-gray-400" />
            {booking.hotel?.city} · {roomsText(booking)}
          </p>

          <div className="grid grid-cols-2 gap-3 bg-gray-50/70 rounded-2xl p-3 mb-3 border border-gray-50">
            <div>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-0.5">Check-in</p>
              <p className="font-extrabold text-gray-800 text-xs">
                {new Date(booking.checkIn).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-0.5">Check-out</p>
              <p className="font-extrabold text-gray-800 text-xs">
                {new Date(booking.checkOut).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-gray-100 gap-3">
          <div>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Ref ID</p>
            <p className="font-mono text-xs font-bold text-gray-700">{booking.bookingRef}</p>
          </div>
          <div className="flex gap-2">
            {reviewReady && (
              <button
                onClick={() => onRateStay(booking)}
                className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 px-4 py-2 rounded-xl font-bold text-xs transition-all"
              >
                <Star size={12} className="fill-amber-500 text-amber-500" />
                Rate Stay
              </button>
            )}
            <button
              onClick={() => onManage(booking)}
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

const ReviewTab = ({
  activeBooking,
  reviewRating,
  setReviewRating,
  reviewComment,
  setReviewComment,
  aspectRatings,
  setAspectRatings,
  selectedTags,
  setSelectedTags,
  reviewPhotos,
  setReviewPhotos,
  photoDragOver,
  setPhotoDragOver,
  reviewSubmitting,
  reviewSuccess,
  onSubmit,
  reviewTitle,
  setReviewTitle,
  tripType,
  setTripType,
  reviewError,
  existingReview,
  editing,
  onEdit,
}) => {
  // Already reviewed: show the review, its status and the hotel's reply (editable for 48 hours)
  if (existingReview && !editing && !reviewSuccess) {
    const status = {
      APPROVED: { label: 'Published', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', note: 'Visible on the hotel page.' },
      PENDING: { label: 'Being checked', cls: 'bg-amber-50 text-amber-700 border-amber-200', note: 'Our team checks reviews that mention contact details, links or strong language. This usually takes under 24 hours.' },
      REJECTED: { label: 'Not published', cls: 'bg-rose-50 text-rose-700 border-rose-200', note: existingReview.rejectionReason ? `Reason: ${existingReview.rejectionReason}` : 'It did not meet our review guidelines.' },
    }[existingReview.status] || { label: existingReview.status, cls: 'bg-gray-50 text-gray-600 border-gray-200', note: '' };
    return (
      <div className="space-y-5 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Your review</p>
            <h4 className="font-black text-gray-900 text-lg">{activeBooking.hotel?.name}</h4>
          </div>
          <span className={`px-3 py-1 rounded-full border text-xs font-bold ${status.cls}`}>{status.label}</span>
        </div>
        <p className="text-xs text-gray-500">{status.note}</p>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={20} className={n <= existingReview.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'} />)}
          </div>
          {existingReview.title && <p className="font-black text-gray-900">{existingReview.title}</p>}
          {existingReview.comment && <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{existingReview.comment}</p>}
          {existingReview.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">{existingReview.tags.map((t) => <span key={t} className="px-2 py-0.5 rounded-full bg-gray-100 text-xs font-semibold text-gray-600">{t}</span>)}</div>
          )}
          {existingReview.photos?.length > 0 && (
            <div className="flex gap-2 flex-wrap">{existingReview.photos.map((p) => <img key={p.url} src={getImageUrl(p.url)} alt="" className="w-20 h-20 rounded-xl object-cover border border-gray-100" />)}</div>
          )}
        </div>
        {existingReview.reply && (
          <div className="bg-brand-50/60 border border-brand-100 rounded-2xl p-4">
            <p className="text-xs font-black text-brand-700 uppercase tracking-widest mb-1">Response from the property</p>
            <p className="text-sm text-gray-800 whitespace-pre-line">{existingReview.reply.text}</p>
          </div>
        )}
        {existingReview.canEdit ? (
          <button type="button" onClick={() => onEdit(existingReview)} className="w-full border-2 border-gray-200 hover:border-brand-400 text-gray-800 font-black py-3 rounded-2xl text-sm">
            Edit my review
            <span className="block text-xs font-semibold text-gray-400">until {new Date(existingReview.editableUntil).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
          </button>
        ) : (
          <p className="text-center text-xs text-gray-400">Reviews can be edited for 48 hours after posting.</p>
        )}
      </div>
    );
  }

  if (!isReviewUnlocked(activeBooking)) {
    const dayAfterCheckIn = new Date(activeBooking.checkIn);
    dayAfterCheckIn.setDate(dayAfterCheckIn.getDate() + 1);
    
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center gap-5">
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center shadow-inner">
            <Lock size={32} className="text-gray-300" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-amber-400 rounded-full flex items-center justify-center shadow-md">
            <Clock size={13} className="text-white" />
          </div>
        </div>
        <div>
          {today() > dayAfterCheckIn ? (
            <>
              <h4 className="text-xl font-black text-gray-900 mb-2">Reviews are closed for this stay</h4>
              <p className="text-sm text-gray-500 leading-relaxed max-w-[260px] mx-auto">
                {['CANCELLED', 'NO_SHOW', 'PENDING'].includes(activeBooking.status) ? 'Only completed stays can be reviewed.' : 'Stays can be reviewed up to 90 days after check-out.'}
              </p>
            </>
          ) : (
            <>
              <h4 className="text-xl font-black text-gray-900 mb-2">Review Unlocks Soon</h4>
              <p className="text-sm text-gray-500 leading-relaxed max-w-[260px] mx-auto">
                Your verified review becomes available on{' '}
                <span className="font-black text-brand-700">
                  {dayAfterCheckIn.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>{' '}— the day after check-in.
              </p>
            </>
          )}
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-xs text-amber-800 max-w-[280px] w-full flex items-start gap-2.5">
          <AlertCircle size={15} className="shrink-0 mt-0.5 text-amber-500" />
          <p className="leading-relaxed">Only checked-in guests can post verified reviews — this keeps our community trustworthy.</p>
        </div>
      </div>
    );
  }

  if (reviewSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center gap-5">
        <div className="relative">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-xl shadow-emerald-300/40">
            <CheckCircle2 size={44} className="text-white" />
          </div>
          <div className="absolute -top-1 -right-1">
            <span className="text-2xl">🎉</span>
          </div>
        </div>
        <div>
          <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-1">{existingReview ? 'Review Saved' : 'Review Submitted'}</p>
          <h4 className="text-2xl font-black text-gray-900 mb-2">Thank You!</h4>
          <p className="text-sm text-gray-500 max-w-[260px] mx-auto leading-relaxed">
            Your review helps the ZivoHotels community make smarter travel decisions.
          </p>
        </div>
        <div className="flex gap-1 my-1">
          {[1,2,3,4,5].map(s => (
            <Star key={s} size={26} className={s <= reviewRating ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'} />
          ))}
        </div>
        <p className="text-xs text-gray-400">Most reviews appear on the hotel page right away. You can edit yours for 48 hours from My Bookings.</p>
      </div>
    );
  }

  const ASPECTS = [
    { key: 'cleanliness', icon: '🧼', title: 'Cleanliness',      hint: 'How clean was the property?' },
    { key: 'staff',       icon: '👨‍💼', title: 'Staff & Service',  hint: 'How was the hospitality experience?' },
    { key: 'comfort',     icon: '🛏',  title: 'Room Comfort',     hint: 'How comfortable was your room?' },
    { key: 'location',    icon: '📍',  title: 'Location',         hint: 'How convenient was the property location?' },
    { key: 'value',       icon: '💰',  title: 'Value for Money',  hint: 'Was the stay worth the amount paid?' },
  ];
  const POS_TAGS = ['Clean Rooms','Friendly Staff','Great Location','Comfortable Stay','Fast Check-in','Good Food','Value for Money'];
  const NEG_TAGS = ['Noise Issue','Slow Service','Poor Cleanliness','AC Issue','Maintenance Issue','Check-in Delay'];
  const TRIP_TYPES = [['BUSINESS', 'Business'], ['COUPLE', 'Couple'], ['FAMILY', 'Family'], ['FRIENDS', 'Friends'], ['SOLO', 'Solo']];
  const toggleTag = (t) => setSelectedTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  const hotelImg = getImageUrl(activeBooking.hotel?.media?.[0]?.url) || null;

  const handlePhotoFiles = (files) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/')).slice(0, 5 - reviewPhotos.length);
    arr.forEach((f) => {
      shrinkPhoto(f).then((url) => setReviewPhotos((prev) => (prev.length >= 5 ? prev : [...prev, { url, name: f.name }]))).catch(() => {});
    });
  };

  return (
    <div className="space-y-8 pb-2">
      {/* Property context banner */}
      <div className="relative rounded-2xl overflow-hidden">
        {hotelImg ? (
          <img src={hotelImg} alt="Hotel" className="w-full h-32 object-cover" />
        ) : (
          <div className="w-full h-32 bg-gradient-to-r from-navy-700 to-navy-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
        <div className="absolute bottom-0 left-0 p-4">
          <p className="text-xs font-bold text-white/60 uppercase tracking-widest mb-0.5">Reviewing your stay at</p>
          <h4 className="font-black text-white text-base leading-tight">{activeBooking.hotel?.name}</h4>
          <p className="text-xs text-white/70 flex items-center gap-1 mt-0.5">
            <MapPin size={10} />{activeBooking.hotel?.city} · {new Date(activeBooking.checkIn).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})} – {new Date(activeBooking.checkOut).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}
          </p>
        </div>
        <div className="absolute top-3 right-3 bg-white/10 backdrop-blur-sm border border-white/20 text-white text-xs font-bold px-2.5 py-1 rounded-full">
          Verified Stay
        </div>
      </div>

      {/* Step 1: Overall rating */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-0.5">Step 1</p>
            <h4 className="font-black text-gray-900 text-base">Overall Experience</h4>
          </div>
          {reviewRating > 0 && (
            <span className="text-2xl">{['','😞','😕','🙂','😃','🤩'][reviewRating]}</span>
          )}
        </div>
        <StarRating value={reviewRating} onChange={setReviewRating} />
        {reviewRating === 0 && (
          <p className="text-xs text-gray-400">Tap a star to rate your overall stay experience</p>
        )}
      </div>

      {/* Step 2: Aspect cards */}
      <div className="space-y-3">
        <div>
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-0.5">Step 2</p>
          <h4 className="font-black text-gray-900 text-base">Rate Specific Aspects</h4>
          <p className="text-xs text-gray-500 mt-0.5">Help future travelers with detailed ratings</p>
        </div>
        {ASPECTS.map(asp => (
          <div key={asp.key} className={`bg-white rounded-2xl border shadow-sm p-4 flex items-center justify-between gap-4 transition-all ${
            aspectRatings[asp.key] > 0 ? 'border-amber-200 bg-amber-50/30' : 'border-gray-100'
          }`}>
            <div className="flex items-center gap-3">
              <span className="text-2xl w-8 text-center">{asp.icon}</span>
              <div>
                <p className="font-black text-gray-900 text-sm">{asp.title}</p>
                <p className="text-xs text-gray-400 leading-tight mt-0.5">{asp.hint}</p>
              </div>
            </div>
            <div className="shrink-0">
              <AspectStars
                value={aspectRatings[asp.key]}
                onChange={v => setAspectRatings(prev => ({ ...prev, [asp.key]: v }))}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Step 3: Experience tags */}
      <div className="space-y-3">
        <div>
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-0.5">Step 3 · Optional</p>
          <h4 className="font-black text-gray-900 text-base">Quick Experience Tags</h4>
          <p className="text-xs text-gray-500 mt-0.5">Select all that apply to your stay</p>
        </div>
        <div>
          <p className="text-xs text-emerald-600 font-bold uppercase tracking-wider mb-2">Positive Highlights</p>
          <div className="flex flex-wrap gap-2">
            {POS_TAGS.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => toggleTag(t)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                  selectedTags.includes(t)
                    ? 'bg-emerald-500 text-white border-emerald-500 shadow-md shadow-emerald-200 scale-105'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-400 hover:text-emerald-600'
                }`}
              >
                {selectedTags.includes(t) ? '✓ ' : ''}{t}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-rose-500 font-bold uppercase tracking-wider mb-2">Areas for Improvement</p>
          <div className="flex flex-wrap gap-2">
            {NEG_TAGS.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => toggleTag(t)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                  selectedTags.includes(t)
                    ? 'bg-rose-500 text-white border-rose-500 shadow-md shadow-rose-200 scale-105'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-rose-400 hover:text-rose-600'
                }`}
              >
                {selectedTags.includes(t) ? '✓ ' : ''}{t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Step 4: Written review */}
      <div className="space-y-2">
        <div>
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-0.5">Step 4 · Optional</p>
          <h4 className="font-black text-gray-900 text-base">Share Your Story</h4>
        </div>
        <input
          value={reviewTitle}
          maxLength={100}
          onChange={(e) => setReviewTitle(e.target.value)}
          placeholder="Give your review a title, e.g. Great stay for a work trip"
          aria-label="Review title"
          className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm font-semibold text-gray-800 focus:outline-none focus:border-brand-400"
        />
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Type of trip">
          {TRIP_TYPES.map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={tripType === id} onClick={() => setTripType(tripType === id ? '' : id)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${tripType === id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
              {label} trip
            </button>
          ))}
        </div>
        <div className={`relative border rounded-2xl transition-all ${
          reviewComment.length > 0 ? 'border-brand-400 shadow-sm shadow-brand-100' : 'border-gray-200'
        }`}>
          <textarea
            rows={5}
            value={reviewComment}
            maxLength={2000}
            onChange={e => setReviewComment(e.target.value)}
            placeholder="What did you enjoy most during your stay? Share details about the service, ambience, room, or location..."
            className="w-full bg-transparent p-4 text-sm text-gray-800 resize-none focus:outline-none placeholder-gray-400 leading-relaxed rounded-2xl"
          />
          <div className="flex items-center justify-between px-4 pb-3">
            <p className="text-xs text-gray-400">
              {reviewComment.length >= 50
                ? <span className="text-emerald-600 font-bold">✓ Great detail!</span>
                : <span>A few sentences help other travellers most</span>}
            </p>
            <p className={`text-xs font-bold ${
              reviewComment.length > 1900 ? 'text-rose-500' : 'text-gray-400'
            }`}>{reviewComment.length}/2000</p>
          </div>
        </div>
      </div>

      {/* Step 5: Photo upload */}
      <div className="space-y-3">
        <div>
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-0.5">Step 5 · Optional</p>
          <h4 className="font-black text-gray-900 text-base">Add Photos</h4>
          <p className="text-xs text-gray-500 mt-0.5">Show other travellers your room and the property</p>
        </div>
        {reviewPhotos.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {reviewPhotos.map((ph, i) => (
              <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-gray-100 shadow-sm group">
                <img src={ph.saved ? getImageUrl(ph.url) : ph.url} alt={ph.name || 'Review photo'} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setReviewPhotos(prev => prev.filter((_,j) => j !== i))}
                  className="absolute top-1.5 right-1.5 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >✕</button>
              </div>
            ))}
            {reviewPhotos.length < 5 && (
              <label className="aspect-square rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center cursor-pointer hover:border-brand-400 transition-colors bg-gray-50">
                <input type="file" accept="image/*" multiple className="hidden" onChange={e => handlePhotoFiles(e.target.files)} />
                <span className="text-2xl text-gray-300">+</span>
                <span className="text-xs text-gray-400 mt-0.5">Add</span>
              </label>
            )}
          </div>
        )}
        {reviewPhotos.length === 0 && (
          <label
            onDragOver={e => { e.preventDefault(); setPhotoDragOver(true); }}
            onDragLeave={() => setPhotoDragOver(false)}
            onDrop={e => { e.preventDefault(); setPhotoDragOver(false); handlePhotoFiles(e.dataTransfer.files); }}
            className={`flex flex-col items-center justify-center gap-3 p-8 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${
              photoDragOver ? 'border-brand-500 bg-brand-50' : 'border-gray-200 bg-gray-50 hover:border-brand-300'
            }`}
          >
            <input type="file" accept="image/*" multiple className="hidden" onChange={e => handlePhotoFiles(e.target.files)} />
            <div className="w-12 h-12 bg-white rounded-xl border border-gray-200 flex items-center justify-center shadow-sm text-xl">📷</div>
            <div className="text-center">
              <p className="text-sm font-bold text-gray-700">Drag photos here or tap to upload</p>
              <p className="text-xs text-gray-400 mt-0.5">Up to 5 photos · JPG or PNG</p>
            </div>
          </label>
        )}
        <p className="text-xs text-gray-400 flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-emerald-400 inline-block" />
          {"Reviews with photos help other travelers make better decisions."}
        </p>
      </div>

      {reviewError && <p role="alert" className="text-sm font-semibold text-rose-600 text-center">{reviewError}</p>}
      <p className="text-xs text-gray-400 text-center">Your first name and last initial are shown with your review. Please don&apos;t include phone numbers, emails or links.</p>

      {/* Submit button */}
      <button
        onClick={onSubmit}
        disabled={reviewRating === 0 || reviewSubmitting}
        className="w-full bg-gradient-to-r from-brand-600 to-brand-700 text-white font-black py-4 rounded-2xl hover:from-brand-700 hover:to-brand-800 transition-all shadow-xl shadow-brand-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 text-sm"
      >
        {reviewSubmitting
          ? <><RefreshCw size={18} className="animate-spin" />Submitting...</>
          : <><Star size={18} className="fill-white" />{existingReview ? 'Save Changes' : 'Submit My Review'}</>}
      </button>
      {reviewRating === 0 && (
        <p className="text-center text-xs text-gray-400">Please rate your overall experience to continue</p>
      )}
    </div>
  );
};


export default MyBookings;
