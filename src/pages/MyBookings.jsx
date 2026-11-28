import { useState, useEffect, useCallback } from 'react';
import { isHourly, slotText, lengthText, canAddHours, nightsOf } from '../utils/stay';
import { MEAL_LABELS } from '../components/hotel/ratePlans';
import { roomsText, bookingRoomsOf, activeRoomsOf, roomGuests } from '../utils/bookingRooms';
import RoomCancel from '../components/booking/RoomCancel';
import { 
  Calendar, MapPin, CreditCard, ChevronRight, XCircle, AlertCircle, 
  RefreshCw, CheckCircle2, FileText, Phone, Compass, 
  Sparkles, ArrowRightLeft, Clock, Printer, Download,
  Award, Send, ArrowRight, Star, Lock, BedDouble, Settings2, X, CalendarClock, Users
} from 'lucide-react';
import ChangeDates from '../components/booking/ChangeDates';
import PayLaterBanner from '../components/booking/PayLaterBanner';
import { needsPayment } from '../utils/payBooking';
import AddHoursPanel from '../components/booking/AddHoursPanel';
import StayRequests from '../components/booking/StayRequests';
import SupportContacts from '../components/SupportContacts';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { getImageUrl } from '../utils/image';
import { getUserBookings, cancelBooking, getCancelPreview, downloadInvoice, downloadGuestNote, downloadHotelInvoice, submitReview, updateReview, getMyReviews, getMyRewards } from '../services/api';
import { saveVoucher } from '../utils/voucher';
import usePageTitle from '../hooks/usePageTitle';

/* ─── Helpers ─────────────────────────────────────────────────────────── */
const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const classifyBooking = (booking) => {
  // Hourly stays: by their actual times (the slot starts and ends on one day)
  if (booking.stayType === 'HOURLY') {
    const t = Date.now();
    if (['CANCELLED', 'NO_SHOW'].includes(booking.status)) return 'cancelled';
    if (new Date(booking.slotEnd || booking.checkOut).getTime() <= t) return 'past';
    return new Date(booking.slotStart || booking.checkIn).getTime() <= t ? 'ongoing' : 'upcoming';
  }
  const now = today();
  const checkIn  = new Date(booking.checkIn);
  const checkOut = new Date(booking.checkOut);
  checkIn.setHours(0, 0, 0, 0);
  checkOut.setHours(0, 0, 0, 0);

  if (['CANCELLED', 'NO_SHOW'].includes(booking.status)) return 'cancelled';
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

/** The status in words. */
const statusLabel = (b) => ({
  PENDING: 'Awaiting payment', CONFIRMED: 'Confirmed', CHECKED_IN: 'Checked in', COMPLETED: 'Completed', CANCELLED: 'Cancelled', NO_SHOW: 'No-show',
}[b.status] || b.status);

const shortDay = (d) => new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' });
/** "Fri 12 Dec → Sun 14 Dec · 2 nights" (hourly: the slot). */
const stayLine = (b) => (isHourly(b) ? slotText(b) : `${shortDay(b.checkIn)} → ${shortDay(b.checkOut)} · ${nightsOf(b)} night${nightsOf(b) === 1 ? '' : 's'}`);

const directionsUrl = (b) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.hotel?.latitude && b.hotel?.longitude ? `${b.hotel.latitude},${b.hotel.longitude}` : `${b.hotel?.name || ''} ${b.hotel?.location || ''} ${b.hotel?.city || ''}`)}`;

/** Days until check-in, in words. */
const untilText = (b) => {
  const start = new Date(isHourly(b) ? b.slotStart || b.checkIn : b.checkIn);
  const days = Math.round((new Date(start.toISOString().slice(0, 10)) - new Date(new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10))) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
};

/** What the guest should do next on a booking, if anything. */
const nextStep = (b) => {
  const cat = classifyBooking(b);
  if (b.status === 'PENDING') return { text: 'Complete payment to confirm this booking', tone: 'amber' };
  if (cat === 'upcoming') return { text: `Check-in ${untilText(b).toLowerCase()}${!isHourly(b) && b.hotel?.checkInTime ? ` from ${clock(b.hotel.checkInTime) || b.hotel.checkInTime}` : ''}`, tone: 'brand' };
  if (cat === 'ongoing') return { text: `Check-out ${!isHourly(b) && b.hotel?.checkOutTime ? `by ${clock(b.hotel.checkOutTime) || b.hotel.checkOutTime}` : 'today'}${b.requestWindow?.open ? ' · requests to the hotel are open' : ''}`, tone: 'brand' };
  if (cat === 'past' && b.requestWindow?.open) return { text: 'Left something behind? Ask the hotel within 72 hours of check-out', tone: 'gray' };
  return null;
};

/** The next trip, with a countdown and the main actions. */
const NextStay = ({ booking: b, onOpen }) => {
  const img = getImageUrl(b.hotel?.media?.[0]?.url, 900);
  return (
    <section aria-label="Your next stay" className="relative overflow-hidden rounded-3xl bg-navy-950 text-white">
      {img && <img src={img} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} className="absolute inset-0 w-full h-full object-cover opacity-35" />}
      <div className="absolute inset-0 bg-gradient-to-r from-navy-950 via-navy-950/85 to-navy-950/30" />
      <div className="relative p-6 md:p-7 flex flex-col md:flex-row md:items-end justify-between gap-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-brand-300">Your next stay · {untilText(b)}</p>
          <h2 className="text-2xl font-black mt-1.5">{b.hotel?.name}</h2>
          <p className="text-sm text-gray-200 mt-1">{b.hotel?.city} · {stayLine(b)}</p>
          <p className="text-xs text-gray-300 mt-1 font-mono">{b.bookingRef}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onOpen(b)} className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 font-bold text-sm px-4 py-2.5 rounded-xl">View booking<ChevronRight size={15} /></button>
          {b.requestWindow?.open && <button type="button" onClick={() => onOpen(b, 'requests')} className="inline-flex items-center gap-1.5 bg-white/10 border border-white/25 hover:bg-white/20 font-bold text-sm px-4 py-2.5 rounded-xl"><Send size={14} />Ask the hotel</button>}
        </div>
      </div>
    </section>
  );
};

/** Check-in and check-out, with the hotel's times (hourly stays: the time slot). */
const IST_DAY = { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
const IST_TIME = { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' };
const clock = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(2000, 0, 1, Number(m[1]), Number(m[2])));
  return d.toLocaleTimeString('en-IN', { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' });
};
const StayDates = ({ booking }) => {
  const hourly = isHourly(booking);
  const inAt = hourly ? booking.slotStart || booking.checkIn : booking.checkIn;
  const outAt = hourly ? booking.slotEnd || booking.checkOut : booking.checkOut;
  const parts = [
    { label: 'Check-in', day: new Date(inAt).toLocaleDateString('en-IN', IST_DAY), time: hourly ? new Date(inAt).toLocaleTimeString('en-IN', IST_TIME) : clock(booking.hotel?.checkInTime), prefix: hourly ? 'at' : 'from' },
    { label: 'Check-out', day: new Date(outAt).toLocaleDateString('en-IN', IST_DAY), time: hourly ? new Date(outAt).toLocaleTimeString('en-IN', IST_TIME) : clock(booking.hotel?.checkOutTime), prefix: hourly ? 'at' : 'by' },
  ];
  return (
    <div className="grid grid-cols-2 gap-4">
      {parts.map((x) => (
        <div key={x.label} className="border border-gray-100 rounded-2xl p-4">
          <p className="text-xs text-gray-500 font-bold uppercase mb-1">{x.label}</p>
          <p className="font-extrabold text-gray-900 text-sm">{x.day}</p>
          {x.time && <p className="text-xs text-gray-600 mt-0.5">{x.prefix} {x.time}</p>}
        </div>
      ))}
    </div>
  );
};

const PAYMENT_METHOD = { PREPAID: 'Paid online', PARTIAL: 'Part online, rest at the hotel', PAY_AT_HOTEL: 'Pay at the hotel' };
const rupees = (v) => `₹${Math.round(Number(v) || 0).toLocaleString('en-IN')}`;

/** What the guest paid and still owes, in plain words (pay-at-hotel stays: nothing paid yet). */
const PaymentSummary = ({ booking }) => {
  const paid = Number(booking.paidAmount) || 0;
  // ZivoPlus's service fee, when one was paid (its own charge, next to the stay)
  const fee = booking.metadata?.serviceFeePaid ? Number(booking.metadata.serviceFee) || 0 : 0;
  const feeBack = Number(booking.metadata?.serviceFeeRefunded) || 0;
  const cancelled = ['CANCELLED', 'NO_SHOW'].includes(booking.status);
  // Not paid yet (pay at the hotel / pay later): the whole balance is still due, even where the
  // booking does not record it as remaining yet
  const unpaid = !['PAID', 'PARTIAL_PAID', 'REFUNDED'].includes(booking.paymentStatus);
  const due = cancelled ? 0 : Math.max(Number(booking.remainingAmount) || 0, unpaid ? (Number(booking.totalAmount) || 0) - paid : 0);
  const refunded = (Number(booking.refundAmount) || 0) + feeBack;
  const pill = cancelled ? (refunded > 0 ? ['Refunded', 'emerald'] : ['Cancelled', 'gray'])
    : due > 0 && paid > 0 ? ['Part paid', 'amber']
      : due > 0 ? ['Pay at the hotel', 'amber']
        : ['Paid', 'emerald'];
  const pillCls = { emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20', amber: 'bg-amber-500/10 text-amber-300 border-amber-500/20', gray: 'bg-white/10 text-gray-300 border-white/20' }[pill[1]];
  return (
    <div className="bg-gray-900 text-white rounded-2xl p-6">
      <div className="flex justify-between items-start mb-4 gap-3">
        <div>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Booking total</p>
          <p className="text-3xl font-black mt-1">{rupees(booking.totalAmount)}</p>
        </div>
        <span className={`text-xs font-black uppercase px-2.5 py-1 rounded-full border ${pillCls}`}>{pill[0]}</span>
      </div>
      <div className="border-t border-white/10 pt-4 grid grid-cols-2 gap-4 text-xs text-gray-400">
        <div><span>Paid online</span><p className="font-bold text-white mt-0.5">{rupees(paid + fee)}</p>{fee > 0 && <p className="mt-0.5">incl. {rupees(fee)} service fee</p>}</div>
        <div><span>{cancelled ? 'Refunded' : 'To pay at the hotel'}</span><p className="font-bold text-white mt-0.5">{rupees(cancelled ? refunded : due)}</p></div>
        <div><span>Payment method</span><p className="font-bold text-white mt-0.5">{PAYMENT_METHOD[booking.paymentType] || booking.paymentType}</p></div>
        <div><span>Reference No.</span><p className="font-mono text-white mt-0.5">{booking.bookingRef}</p></div>
      </div>
    </div>
  );
};

/** Why there is no invoice to download yet. */
const invoiceNote = (booking) => {
  if (['CANCELLED', 'NO_SHOW'].includes(booking.status)) return 'No invoice: this booking was cancelled.';
  if (booking.status === 'PENDING') return 'The invoice is issued once the booking is confirmed.';
  return 'Your invoice is being prepared. Check again in a few minutes.';
};

const MyBookings = () => {
  usePageTitle('My bookings');
  useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeBooking, setActiveBooking] = useState(null);
  const [activeTab, setActiveTab] = useState('stay');
  const [activeSection, setActiveSection] = useState(null); // upcoming | ongoing | past | cancelled (null: pick on load)
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
  const cancelled = bookings.filter(b => classifyBooking(b) === 'cancelled');
  // Open where the guest most likely wants to be: staying now, else the next trip
  const section = activeSection || (ongoing.length ? 'ongoing' : upcoming.length ? 'upcoming' : past.length ? 'past' : 'cancelled');
  const nextStay = [...upcoming].sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn))[0];
  const SECTIONS = [
    { id: 'ongoing', label: 'Staying now', list: ongoing, Icon: MapPin },
    { id: 'upcoming', label: 'Upcoming', list: upcoming, Icon: Calendar },
    { id: 'past', label: 'Completed', list: past, Icon: CheckCircle2 },
    { id: 'cancelled', label: 'Cancelled', list: cancelled, Icon: XCircle },
  ];
  const shown = SECTIONS.find((x) => x.id === section)?.list || [];

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

  const handleHotelInvoice = async (b) => {
    try {
      const blob = await downloadHotelInvoice(b.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `GST-invoice-${String(b.hotelGstInvoice.invoiceNumber).replace(/\//g, '_')}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 30000);
    } catch (err) { setError(err.message); }
  };

  const handleDownloadInvoice = async (invoiceId, refName, note = false) => {
    try {
      const blob = await (note ? downloadGuestNote(invoiceId) : downloadInvoice(invoiceId));
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${note ? 'Note' : 'Invoice'}-${String(refName).replace(/\//g, '_')}.pdf`;
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

  const handleManage = useCallback((booking, tab = 'stay') => {
    setActiveBooking(booking);
    setActiveTab(tab);
  }, []);

  const handleRateStay = useCallback((booking) => {
    setActiveBooking(booking);
    setActiveTab('review');
    setReviewRating(0); setReviewComment(''); setReviewTitle(''); setTripType('');
    setAspectRatings({ cleanliness: 0, staff: 0, comfort: 0, location: 0, value: 0 });
    setSelectedTags([]); setReviewPhotos([]); setReviewError(''); setReviewSuccess(false); setEditingReview(false);
  }, []);

  // From the "Rate your stay" email (/my-bookings?review=<booking id>): open that stay's review
  const reviewParam = new URLSearchParams(window.location.search).get('review');
  useEffect(() => {
    if (!reviewParam || !bookings.length) return;
    const b = bookings.find((x) => x.id === reviewParam);
    if (b) handleRateStay(b);
    const u = new URL(window.location.href); u.searchParams.delete('review');
    window.history.replaceState(null, '', `${u.pathname}${u.search}`);
  }, [reviewParam, bookings, handleRateStay]);

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

      {/* Page header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight">My bookings</h1>
          <p className="text-gray-600 mt-1.5">Your trips, vouchers and invoices, requests to the hotel, and changes, in one place.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/rewards" className="inline-flex items-center gap-2 rounded-full bg-navy-900 text-white pl-2 pr-4 py-1.5 text-sm font-semibold hover:bg-navy-800 transition-colors">
            <span className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-amber-400"><Award size={16} aria-hidden="true" /></span>
            {rewards ? `${rewards.available.toLocaleString('en-IN')} points` : 'Zivo Rewards'}{rewards?.tier?.name ? <span className="text-gray-300 font-normal">· {rewards.tier.name}</span> : null}
          </Link>
          <Link to="/saved" className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm font-semibold text-gray-800 hover:border-brand-500 transition-colors">
            <Star size={15} className="text-brand-600" aria-hidden="true" /> Saved hotels
          </Link>
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-6 flex items-center gap-3 bg-red-50 border border-red-200 text-red-900 p-4 rounded-2xl">
          <AlertCircle className="text-red-600 shrink-0" size={20} />
          <span className="font-semibold text-sm">{error}</span>
        </div>
      )}

      {bookings.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 md:p-16 text-center border border-gray-100 shadow-sm max-w-3xl mx-auto">
          <div className="bg-gray-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 border border-gray-100">
            <Calendar className="h-10 w-10 text-gray-300" />
          </div>
          <h2 className="text-2xl font-black text-gray-900 mb-2">No bookings yet</h2>
          <p className="text-gray-600 mb-8 max-w-sm mx-auto">When you book a stay, it shows up here with your voucher, invoice and the hotel&apos;s contact.</p>
          <Link to="/hotels" className="inline-flex items-center justify-center bg-brand-600 text-white px-8 py-3.5 rounded-full font-bold hover:bg-brand-700 transition-colors gap-2">
            Find a hotel <ArrowRight size={18} />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {/* Next stay, front and centre */}
            {nextStay && section !== 'ongoing' && <NextStay booking={nextStay} onOpen={handleManage} />}

            {/* Sections */}
            <div role="tablist" aria-label="Bookings" className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-gray-100 rounded-2xl">
              {SECTIONS.map(({ id, label, list, Icon }) => (
                <button key={id} type="button" role="tab" aria-selected={section === id} onClick={() => setActiveSection(id)}
                  className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-bold transition-colors ${section === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
                  <Icon size={15} aria-hidden="true" className={section === id ? 'text-brand-600' : ''} />
                  {label}
                  <span className={`text-xs rounded-full px-1.5 min-w-[1.25rem] ${section === id ? 'bg-brand-50 text-brand-700' : 'bg-white/70 text-gray-500'}`}>{list.length}</span>
                  {id === 'ongoing' && list.length > 0 && section !== id && <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" aria-hidden="true" />}
                </button>
              ))}
            </div>

            <div className="space-y-4" role="tabpanel">
              {shown.length === 0
                ? <EmptySection label={SECTIONS.find((x) => x.id === section)?.label.toLowerCase()} />
                : shown.map(b => <BookingCard key={b.id} booking={b} onRateStay={handleRateStay} onManage={handleManage} onPaid={fetchMyBookings} onError={setError} />)}
            </div>
          </div>

          {/* Side panel */}
          <aside className="space-y-5">
            <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
              <h2 className="text-base font-black text-gray-900 mb-3">Need something for your stay?</h2>
              <ul className="space-y-3 text-sm text-gray-600">
                <li className="flex gap-3"><Send size={17} className="text-brand-600 shrink-0 mt-0.5" aria-hidden="true" /><span><b className="text-gray-900">Requests to the hotel</b>: late arrival, early check-in, pickup and more, from booking until 72 hours after check-out (lost items, bills).</span></li>
                <li className="flex gap-3"><Phone size={17} className="text-brand-600 shrink-0 mt-0.5" aria-hidden="true" /><span><b className="text-gray-900">Call the hotel</b> from any booking.</span></li>
                <li className="flex gap-3"><CalendarClock size={17} className="text-brand-600 shrink-0 mt-0.5" aria-hidden="true" /><span><b className="text-gray-900">Change dates or cancel</b> under Manage, while free cancellation applies.</span></li>
              </ul>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mt-5 mb-2">ZivoPlus support</p>
              <div className="mb-3"><SupportContacts compact /></div>
              <Link to="/help" className="w-full flex items-center justify-between p-3 rounded-2xl bg-gray-50 border border-gray-100 hover:border-brand-500 transition-colors text-left text-xs font-bold text-gray-800">
                <span>Help centre: changes, cancellations, refunds</span><ChevronRight size={14} />
              </Link>
            </div>
            <div className="bg-gradient-to-br from-navy-800 to-navy-950 text-white rounded-3xl p-6 shadow-lg">
              <h2 className="text-lg font-bold mb-1">Ready for your next stay?</h2>
              <p className="text-xs text-brand-200 leading-relaxed mb-5">Member prices and Zivo Rewards points apply on every booking.</p>
              <Link to="/hotels" className="w-full bg-white text-brand-950 font-extrabold text-sm py-3 px-4 rounded-xl flex items-center justify-center gap-1.5 hover:bg-brand-50 transition-colors">
                Search hotels<ArrowRight size={16} />
              </Link>
            </div>
          </aside>
        </div>
      )}

      {/* ── BOOKING DETAIL ───────────────────────────────────────── */}
      {activeBooking && (() => {
        const b = activeBooking;
        const phone = hotelPhone(b);
        const reviewOpen = isReviewUnlocked(b) || Boolean(myReviews[b.id]);
        const tabs = [
          { id: 'stay', label: 'Stay & rooms', Icon: BedDouble },
          { id: 'payment', label: 'Payment', Icon: CreditCard },
          { id: 'documents', label: 'Documents', Icon: FileText },
          { id: 'requests', label: 'Requests', Icon: Send, badge: b.requestWindow?.open },
          { id: 'contact', label: 'Contact hotel', Icon: Phone },
          { id: 'manage', label: 'Manage', Icon: Settings2 },
          ...(reviewOpen ? [{ id: 'review', label: 'Review', Icon: Star }] : []),
        ];
        const heroImg = getImageUrl(b.hotel?.media?.[0]?.url, 1000);
        return (
        <>
          <div onClick={() => setActiveBooking(null)} className="fixed inset-0 z-[110] bg-gray-900/60 backdrop-blur-sm" aria-hidden="true" />
          <div role="dialog" aria-modal="true" aria-labelledby="bk-title" className="fixed inset-y-0 right-0 z-[120] w-full max-w-2xl bg-white shadow-2xl flex flex-col h-full animate-slide-in">
            {/* Header with the hotel photo */}
            <div className="relative shrink-0 bg-navy-950 text-white">
              {heroImg && <img src={heroImg} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} className="absolute inset-0 w-full h-full object-cover opacity-40" />}
              <div className="absolute inset-0 bg-gradient-to-t from-navy-950 via-navy-950/70 to-navy-950/20" />
              <div className="relative p-5 md:p-6">
                <div className="flex items-start justify-between gap-3">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider border ${getStatusColor(b.status)}`}>{statusLabel(b)}</span>
                  <button type="button" onClick={() => setActiveBooking(null)} aria-label="Close" className="w-9 h-9 bg-white/10 border border-white/20 rounded-full flex items-center justify-center hover:bg-white/20"><X size={18} /></button>
                </div>
                <h2 id="bk-title" className="text-2xl font-black mt-3">{b.hotel?.name}</h2>
                <p className="text-sm text-gray-200 mt-0.5 flex items-center gap-1"><MapPin size={13} aria-hidden="true" />{[b.hotel?.location, b.hotel?.city].filter(Boolean).join(', ')}</p>
                <p className="text-sm text-gray-200 mt-3">{stayLine(b)} · <span className="font-mono">{b.bookingRef}</span></p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {['CONFIRMED', 'CHECKED_IN', 'COMPLETED'].includes(b.status) && (
                    <button type="button" onClick={async () => { try { await saveVoucher(b.id, b.bookingRef, 'guest'); } catch (err) { setError(err.message || 'Could not download the voucher.'); } }}
                      className="inline-flex items-center gap-1.5 bg-white text-navy-950 font-bold text-xs px-3.5 py-2 rounded-xl hover:bg-brand-50"><Download size={14} />Voucher</button>
                  )}
                  {phone && !['CANCELLED', 'NO_SHOW'].includes(b.status) && (
                    <a href={`tel:${phone}`} className="inline-flex items-center gap-1.5 bg-white/10 border border-white/25 font-bold text-xs px-3.5 py-2 rounded-xl hover:bg-white/20"><Phone size={14} />Call the hotel</a>
                  )}
                  <a href={directionsUrl(b)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 bg-white/10 border border-white/25 font-bold text-xs px-3.5 py-2 rounded-xl hover:bg-white/20"><Compass size={14} />Directions</a>
                </div>
              </div>
            </div>

            {/* Sections */}
            <div role="tablist" aria-label="Booking sections" className="shrink-0 border-b border-gray-100 px-3 md:px-5 flex gap-1 overflow-x-auto whitespace-nowrap scrollbar-none bg-white">
              {tabs.map(({ id, label, Icon, badge }) => (
                <button key={id} type="button" role="tab" aria-selected={activeTab === id} onClick={() => setActiveTab(id)}
                  className={`relative flex items-center gap-1.5 px-3 py-3.5 border-b-2 font-bold text-xs transition-colors ${activeTab === id ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-900'}`}>
                  <Icon size={14} aria-hidden="true" />{label}
                  {badge && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-label="open" />}
                </button>
              ))}
            </div>

            <div className="p-5 md:p-6 flex-1 overflow-y-auto space-y-6">

              {/* STAY & ROOMS */}
              {activeTab === 'stay' && (
                <div className="space-y-5">
                  <PayLaterBanner booking={b} onPaid={fetchMyBookings} />
                  <StayDates booking={b} />
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Guests', value: `${b.guests} guest${b.guests === 1 ? '' : 's'}` },
                      { label: 'Rooms', value: `${b.rooms} room${b.rooms === 1 ? '' : 's'}` },
                      isHourly(b) ? { label: 'Hourly', value: lengthText(b) } : { label: 'Nights', value: `${nightsOf(b)} night${nightsOf(b) === 1 ? '' : 's'}` },
                    ].map(x => (
                      <div key={x.label} className="bg-gray-50 p-3 rounded-2xl text-center">
                        <p className="text-xs text-gray-500 font-bold uppercase mb-0.5">{x.label}</p>
                        <p className="font-extrabold text-gray-900 text-sm">{x.value}</p>
                      </div>
                    ))}
                  </div>
                  <section className="border border-gray-100 rounded-2xl p-5" aria-labelledby="st-rooms">
                    <h3 id="st-rooms" className="font-bold text-gray-900 text-sm mb-3">Rooms and guests</h3>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div><span className="text-gray-500">Booked for</span><p className="font-bold text-gray-800 mt-0.5">{b.guestName}</p></div>
                      <div><span className="text-gray-500">Phone</span><p className="font-bold text-gray-800 mt-0.5">{b.guestPhone || '—'}</p></div>
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
                          <div className="col-span-2"><span className="text-gray-400">Rate Plan</span><p className="font-bold text-gray-800 mt-0.5">{activeBooking.ratePlan?.name} ({MEAL_LABELS[activeBooking.ratePlan?.mealPlan] || 'Room only'})</p></div>
                        </>
                      )}
                    </div>
                  </section>
                  {b.timelineEvents?.length > 0 && (
                    <section aria-labelledby="st-hist">
                      <h3 id="st-hist" className="font-bold text-gray-900 text-sm mb-3">Booking history</h3>
                      <ol className="relative border-l-2 border-gray-100 ml-3 space-y-5">
                        {b.timelineEvents.map(event => (
                          <li key={event.id} className="pl-6 relative">
                            <span className="absolute -left-[13px] top-0 w-6 h-6 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center">{getTimelineIcon(event.status)}</span>
                            <p className="font-bold text-gray-900 text-sm">{event.title}</p>
                            {event.message && <p className="text-xs text-gray-600 mt-0.5">{event.message}</p>}
                            <p className="text-xs text-gray-400 mt-1">{new Date(event.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
                          </li>
                        ))}
                      </ol>
                    </section>
                  )}
                </div>
              )}

              {/* PAYMENT */}
              {activeTab === 'payment' && (
                <div className="space-y-5">
                  <PaymentSummary booking={b} />
                  {b.paymentType === 'PAY_AT_HOTEL' && !['CANCELLED', 'NO_SHOW'].includes(b.status) && (
                    <p className="text-xs text-gray-600 bg-gray-50 rounded-xl p-3">Pay the hotel at check-in. The hotel accepts the payment methods listed on its page.</p>
                  )}
                </div>
              )}

              {/* DOCUMENTS */}
              {activeTab === 'documents' && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-600">Your voucher to show at check-in, your GST invoice, and any credit or debit notes when the booking changed (cancellations, refunds, date changes, hours added).</p>
                  {['CONFIRMED', 'CHECKED_IN', 'COMPLETED'].includes(b.status) && (
                    <button type="button" onClick={async () => { try { await saveVoucher(b.id, b.bookingRef, 'guest'); } catch (err) { setError(err.message || 'Could not download the voucher.'); } }}
                      className="flex items-center justify-between w-full p-3 rounded-xl border border-gray-200 hover:border-brand-500 text-xs font-bold text-gray-800 transition-colors">
                      <span className="flex items-center gap-2"><Printer size={16} className="text-brand-700" />Booking voucher (PDF) · works offline at check-in</span>
                      <Download size={14} className="text-gray-400" />
                    </button>
                  )}
                    {b.invoice?.status === 'GENERATED' ? (
                      <button onClick={() => handleDownloadInvoice(b.invoice.id, b.bookingRef)} className="flex items-center justify-between w-full p-3 rounded-xl border border-gray-200 hover:border-brand-500 text-xs font-bold text-gray-800 transition-colors">
                        <span className="flex items-center gap-2"><FileText size={16} className="text-brand-700" />{b.invoiceIssuer === 'HOTEL' ? 'ZivoPlus Tax Invoice (as facilitator)' : 'Official GST Invoice PDF'} · {b.invoice.invoiceRef}</span>
                        <Download size={14} className="text-gray-400" />
                      </button>
                    ) : (
                      <div className="p-3 rounded-xl bg-gray-50 text-gray-700 text-xs border border-gray-100 flex items-start gap-2">
                        <Clock size={16} className="shrink-0 mt-0.5" />
                        <span>{invoiceNote(b)}</span>
                      </div>
                    )}
                    {b.invoiceIssuer === 'HOTEL' && b.guestCompanyGstin && (b.hotelGstInvoice ? (
                      <button onClick={() => handleHotelInvoice(b)} className="flex items-center justify-between w-full p-3 rounded-xl border border-gray-200 hover:border-brand-500 text-xs font-bold text-gray-800 transition-colors text-left">
                        <span className="flex items-start gap-2"><FileText size={16} className="text-brand-700 shrink-0" /><span>GST invoice from the hotel · {b.hotelGstInvoice.invoiceNumber}<span className="block font-normal text-gray-500">In the name of {b.guestCompanyName} (GSTIN {b.guestCompanyGstin})</span></span></span>
                        <Download size={14} className="text-gray-400 shrink-0" />
                      </button>
                    ) : !['CANCELLED', 'NO_SHOW'].includes(b.status) && (
                      <div className="p-3 rounded-xl bg-gray-50 text-gray-700 text-xs border border-gray-100 flex items-start gap-2">
                        <Clock size={16} className="shrink-0 mt-0.5" />
                        <span>The hotel issues the GST invoice in the name of {b.guestCompanyName} (GSTIN {b.guestCompanyGstin}) and uploads it here after check-out.</span>
                      </div>
                    ))}
                    {b.invoiceIssuer === 'HOTEL' && !b.guestCompanyGstin && <p className="text-[11px] text-gray-500">The hotel gives you the GST invoice for your stay at the property.</p>}
                    {b.invoiceIssuer === 'HOTEL' && <p className="text-[11px] text-gray-500">Input tax credit of GST charged by the original service provider is available only against the invoice issued by the respective service provider. ZivoPlus acts only as a facilitator for these services.</p>}
                    {(b.guestNotes || []).filter((n) => n.status === 'GENERATED').map((n) => (
                      <button key={n.id} onClick={() => handleDownloadInvoice(n.id, n.noteRef, true)} className="flex items-center justify-between w-full p-3 rounded-xl border border-gray-200 hover:border-brand-500 text-xs font-bold text-gray-800 transition-colors text-left">
                        <span className="flex items-start gap-2"><FileText size={16} className="text-brand-700 shrink-0" /><span>{n.kind === 'CREDIT' ? 'Credit note' : 'Debit note'} · {n.noteRef} · ₹{Math.round(Number(n.amount)).toLocaleString('en-IN')}<span className="block font-normal text-gray-500">{n.reason}</span></span></span>
                        <Download size={14} className="text-gray-400 shrink-0" />
                      </button>
                    ))}
                </div>
              )}

              {/* REQUESTS TO THE HOTEL */}
              {activeTab === 'requests' && <StayRequests booking={b} />}

              {/* CONTACT HOTEL: phone only */}
              {activeTab === 'contact' && (
                <div className="space-y-4">
                  {b.metadata?.membership?.prioritySupport && (
                    <p className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">{b.metadata.membership.plan} booking: you get priority support. Mention your booking ID when you call.</p>
                  )}
                  {phone ? (
                    <a href={`tel:${phone}`} className="flex items-center gap-4 p-5 rounded-2xl border border-gray-200 hover:border-brand-500 transition-colors">
                      <span className="w-12 h-12 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center shrink-0"><Phone size={22} aria-hidden="true" /></span>
                      <span>
                        <span className="block text-xs text-gray-500 font-bold uppercase tracking-wider">Call {b.hotel?.name}</span>
                        <span className="block text-xl font-black text-gray-900 font-mono select-all">{phone}</span>
                        <span className="block text-xs text-gray-500 mt-0.5">Mention booking {b.bookingRef}</span>
                      </span>
                    </a>
                  ) : (
                    <>
                      <p className="text-xs text-gray-700 bg-gray-50 border border-gray-100 rounded-xl p-3">The hotel hasn&apos;t added its phone number yet. Send a request in <span className="font-semibold">Requests</span>, or contact ZivoPlus support with your booking ID and we&apos;ll reach the hotel.</p>
                      <SupportContacts bookingRef={b.bookingRef} compact />
                    </>
                  )}
                  <p className="text-xs text-gray-500">For late arrival, early check-in, pickup and the like, a written request under <button type="button" onClick={() => setActiveTab('requests')} className="font-semibold text-brand-700 hover:underline">Requests</button> keeps the hotel&apos;s answer with your booking.</p>
                </div>
              )}

              {/* MANAGE */}
              {activeTab === 'manage' && (
                <div className="space-y-4">
                  {canAddHours(b) && <AddHoursPanel booking={b} onExtended={fetchMyBookings} />}
                  <ChangeDates booking={b} onChanged={fetchMyBookings} />
                  {b.status === 'CONFIRMED' && activeRoomsOf(b).length > 1 && (
                    <p className="text-xs text-gray-600 bg-gray-50 rounded-xl p-3">To cancel one room and keep the others, open <button type="button" onClick={() => setActiveTab('stay')} className="font-semibold text-brand-700 hover:underline">Stay &amp; rooms</button>.</p>
                  )}
                  {['CONFIRMED', 'PENDING'].includes(b.status) ? (
                    <section className="border border-rose-100 bg-rose-50/40 rounded-2xl p-5" aria-labelledby="mg-cancel">
                      <h3 id="mg-cancel" className="font-bold text-rose-950 text-sm">Cancel booking</h3>
                      <p className="text-xs text-rose-800 mt-1 mb-3">You see the refund under the hotel&apos;s policy before you confirm.</p>
                      <button type="button" onClick={() => setCancelTarget(b)} className="bg-white border border-rose-200 hover:border-rose-600 text-rose-700 font-bold py-2.5 px-4 rounded-xl text-xs transition-colors inline-flex items-center gap-1.5">
                        <XCircle size={14} />Cancel booking
                      </button>
                    </section>
                  ) : (
                    <p className="text-xs text-gray-600 bg-gray-50 rounded-xl p-3">{['CANCELLED', 'NO_SHOW'].includes(b.status) ? 'This booking was cancelled.' : 'This stay has started, so it can no longer be cancelled online. Call the hotel or ZivoPlus support for help.'}</p>
                  )}
                  <Link to="/help" className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:border-brand-500 text-xs font-bold text-gray-800">
                    <span>Help: changes, cancellations and refunds</span><ChevronRight size={14} />
                  </Link>
                </div>
              )}

              {/* REVIEW */}
              {activeTab === 'review' && (
                <ReviewTab
                  activeBooking={b}
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
                  existingReview={myReviews[b.id]}
                  editing={editingReview}
                  onEdit={startEditReview}
                  onWriteAnother={resetReviewForm}
                />
              )}
            </div>
          </div>
        </>
        );
      })()}

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
                    {cancelPreview.serviceFeeRefund > 0 && <div className="flex justify-between text-gray-700"><span>Service fee (refunded)</span><span>+ ₹{cancelPreview.serviceFeeRefund.toLocaleString('en-IN')}</span></div>}
                    {cancelPreview.serviceFeeKept > 0 && <p className="text-gray-500">The ₹{cancelPreview.serviceFeeKept.toLocaleString('en-IN')} ZivoPlus service fee isn&apos;t refunded when you cancel.</p>}
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
                    { id: 'WALLET', title: 'Zivo Cash', sub: 'Instant · use it on any ZivoPlus booking' },
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
  <div className="flex items-center gap-3 py-8 px-5 rounded-2xl bg-gray-50 border border-dashed border-gray-200 text-gray-500 text-sm">
    <Calendar size={18} aria-hidden="true" />
    Nothing {label === 'staying now' ? 'right now' : label === 'cancelled' ? 'cancelled' : `here (${label})`}.
  </div>
);

const BookingCard = ({ booking: b, onRateStay, onManage, onPaid, onError }) => {
  const img = getImageUrl(b.hotel?.media?.[0]?.url, 800);
  const reviewReady = isReviewUnlocked(b);
  const cat = classifyBooking(b);
  const step = nextStep(b);
  const phone = hotelPhone(b);
  const live = ['CONFIRMED', 'CHECKED_IN'].includes(b.status);
  const dim = cat === 'cancelled';
  return (
    <article className={`bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow flex flex-col sm:flex-row ${dim ? 'opacity-80' : ''}`}>
      <button type="button" onClick={() => onManage(b)} className="sm:w-48 h-40 sm:h-auto relative overflow-hidden shrink-0 bg-gray-100" aria-label={`Open booking at ${b.hotel?.name}`}>
        {img ? <img src={img} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} className="w-full h-full object-cover" loading="lazy" /> : <span className="absolute inset-0 flex items-center justify-center text-gray-300"><BedDouble size={36} /></span>}
        {cat === 'ongoing' && <span className="absolute top-3 left-3 px-2.5 py-0.5 rounded-full text-xs font-black bg-brand-600 text-white shadow">Staying now</span>}
      </button>
      <div className="p-5 flex-1 flex flex-col gap-3 min-w-0">
        {needsPayment(b) && <PayLaterBanner booking={b} onPaid={onPaid} compact />}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-gray-900 truncate">{b.hotel?.name}</h3>
            <p className="text-gray-500 text-xs flex items-center gap-1 mt-0.5"><MapPin size={12} aria-hidden="true" />{b.hotel?.city} · {roomsText(b)}</p>
          </div>
          <span className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs font-black border ${getStatusColor(b.status)}`}>{statusLabel(b)}</span>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-gray-800">
          <span className="flex items-center gap-1.5 font-semibold"><Calendar size={15} className="text-gray-400" aria-hidden="true" />{stayLine(b)}</span>
          <span className="flex items-center gap-1.5"><Users size={15} className="text-gray-400" aria-hidden="true" />{b.guests} guest{b.guests === 1 ? '' : 's'}</span>
        </div>

        {step && (
          <p className={`text-xs font-semibold rounded-xl px-3 py-2 ${step.tone === 'amber' ? 'bg-amber-50 text-amber-900' : step.tone === 'brand' ? 'bg-brand-50 text-brand-800' : 'bg-gray-50 text-gray-700'}`}>{step.text}</p>
        )}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-500">Ref <span className="font-mono font-bold text-gray-700">{b.bookingRef}</span> · {rupees(b.totalAmount)}</p>
          <div className="flex flex-wrap gap-2">
            {live && (
              <button type="button" onClick={async () => { try { await saveVoucher(b.id, b.bookingRef, 'guest'); } catch (err) { onError?.(err.message || 'Could not download the voucher.'); } }}
                className="inline-flex items-center gap-1 border border-gray-200 hover:border-brand-500 text-gray-800 px-3 py-2 rounded-xl font-bold text-xs"><Download size={13} />Voucher</button>
            )}
            {live && phone && (
              <a href={`tel:${phone}`} className="inline-flex items-center gap-1 border border-gray-200 hover:border-brand-500 text-gray-800 px-3 py-2 rounded-xl font-bold text-xs"><Phone size={13} />Call hotel</a>
            )}
            {reviewReady && (
              <button type="button" onClick={() => onRateStay(b)} className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 px-3 py-2 rounded-xl font-bold text-xs">
                <Star size={12} className="fill-amber-500 text-amber-500" />Rate stay
              </button>
            )}
            <button type="button" onClick={() => onManage(b)} className="inline-flex items-center gap-1 bg-gray-900 text-white hover:bg-brand-600 px-4 py-2 rounded-xl font-bold text-xs">
              View booking<ChevronRight size={13} />
            </button>
          </div>
        </div>
      </div>
    </article>
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
            <div className="flex gap-2 flex-wrap">{existingReview.photos.map((p) => <img key={p.url} src={getImageUrl(p.url, 400)} alt="" className="w-20 h-20 rounded-xl object-cover border border-gray-100" />)}</div>
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
            Your review helps the ZivoPlus community make smarter travel decisions.
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
  const hotelImg = getImageUrl(activeBooking.hotel?.media?.[0]?.url, 800) || null;

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
                <img src={ph.saved ? getImageUrl(ph.url, 400) : ph.url} alt={ph.name || 'Review photo'} className="w-full h-full object-cover" />
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
