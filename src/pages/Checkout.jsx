import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBooking } from '../context/BookingContext';
import { createBooking, cancelBooking, createPaymentOrder, verifyPaymentApi, previewBookingApi, getPublicConfig, trackEvent, getMyProfile, getMyWallet } from '../services/api.js';
import { useAuth } from '../context/AuthContext';
import { saveVoucher } from '../utils/voucher';
import { 
  CheckCircle2, ShieldCheck, CreditCard, Building, 
  PieChart, Clock, AlertTriangle, User, Mail, 
  Phone, BedDouble, CalendarDays, Users, Lock, ChevronRight,
  ArrowLeft, Briefcase, Download, Tag, Award, Wallet, Crown
} from 'lucide-react';
import { useAllExperiments } from '../context/ExperimentContext';
import { getImageUrl } from '../utils/image';

const useCountdown = (expiresAt) => {
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    if (!expiresAt) { setTimeLeft(null); return; }
    const tick = () => {
      const diff = Math.floor((new Date(expiresAt) - Date.now()) / 1000);
      setTimeLeft(diff > 0 ? diff : 0);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  if (timeLeft === null) return null;
  const m = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const s = String(timeLeft % 60).padStart(2, '0');
  return { display: `${m}:${s}`, expired: timeLeft === 0 };
};

const Checkout = () => {
  const navigate = useNavigate();
  const { selectedHotel, searchParams, clearBooking } = useBooking();
  const allExperiments = useAllExperiments();
  
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [bookingRef, setBookingRef] = useState('');
  const [error, setError] = useState('');
  const [paymentType, setPaymentType] = useState('PREPAID');
  const [agreed, setAgreed] = useState(false);

  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const handleForm = (e) => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  // Logged-in users choose whether they are the guest (details filled from their profile) or are
  // booking for someone else (details entered for that guest)
  const { user } = useAuth();
  const [travellerType, setTravellerType] = useState('self');
  const [profile, setProfile] = useState(null);
  const fillFromProfile = useCallback((p) => {
    if (!p) return;
    const [first, ...rest] = String(p.name || '').trim().split(/\s+/);
    setForm({ firstName: first || '', lastName: rest.join(' '), email: p.email || '', phone: p.phone || '' });
  }, []);
  useEffect(() => {
    if (!user) return;
    getMyProfile()
      .then(p => { setProfile(p); fillFromProfile(p); })
      .catch(() => fillFromProfile(user));
  }, [user, fillFromProfile]);
  const chooseTraveller = (type) => {
    setTravellerType(type);
    if (type === 'self') fillFromProfile(profile || user);
    else setForm({ firstName: '', lastName: '', email: '', phone: '' });
  };

  // Optional company details for a GST invoice
  const [withCompany, setWithCompany] = useState(false);
  const [company, setCompany] = useState({ name: '', gstin: '', address: '' });
  const handleCompany = (e) => setCompany(c => ({ ...c, [e.target.name]: e.target.name === 'gstin' ? e.target.value.toUpperCase() : e.target.value }));
  const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
  const [confirmedBookingId, setConfirmedBookingId] = useState(null);
  const [voucherBusy, setVoucherBusy] = useState(false);

  const pendingBookingRef = useRef(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const countdown = useCountdown(expiresAt);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [fetchingPreview, setFetchingPreview] = useState(false);
  const [config, setConfig] = useState({ partialPaymentPercent: 30, prepaidDiscountPercent: 5 });
  // Promo code: sent with the preview (and the booking); the best offer the guest qualifies for is
  // applied by the server, automatic offers included
  const [promoInput, setPromoInput] = useState('');
  const [promoCode, setPromoCode] = useState('');
  // Zivo Rewards: points the guest chose to use (0 = not using)
  const [usePoints, setUsePoints] = useState(0);
  // Zivo Cash: pay what's due now (or part of it) from the guest's wallet
  const [walletBalance, setWalletBalance] = useState(0);
  const [useWallet, setUseWallet] = useState(false);
  useEffect(() => {
    if (user?.role === 'CUSTOMER') getMyWallet().then((w) => setWalletBalance(w?.balance || 0)).catch(() => {});
  }, [user]);

  useEffect(() => {
    getPublicConfig().then(res => setConfig(res.data)).catch(console.error);
  }, []);

  const fetchPreview = useCallback(async () => {
    if (!selectedHotel || !searchParams.checkIn || !searchParams.checkOut) return;
    setFetchingPreview(true);
    try {
      const res = await previewBookingApi({
        hotelId: selectedHotel.id,
        roomTypeId: selectedHotel.selectedRoomType?.id || selectedHotel.defaultRoomTypeId,
        ratePlanId: selectedHotel.selectedRatePlan?.id || selectedHotel.defaultRatePlanId,
        checkIn: searchParams.checkIn,
        checkOut: searchParams.checkOut,
        adults: searchParams.adults || searchParams.guests || 2,
        children: searchParams.children || 0,
        extraBeds: searchParams.extraBeds || 0,
        rooms: searchParams.rooms || 1,
        paymentType,
        ...(promoCode ? { promoCode } : {}),
        ...(usePoints > 0 ? { usePoints } : {})
      });
      setPreview(res.data);
      setPreviewError('');
    } catch (err) {
      console.error('Preview failed:', err);
      // Without a price the page showed ₹0 and still let the guest continue
      setPreview(null);
      setPreviewError(err?.message || 'We could not calculate the price for this stay. Please try again.');
    } finally {
      setFetchingPreview(false);
    }
  }, [selectedHotel, searchParams, paymentType, promoCode, usePoints]);

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  useEffect(() => {
    return () => {
      if (pendingBookingRef.current && !success) {
        cancelBooking(pendingBookingRef.current).catch(() => {});
      }
    };
  }, [success]);

  useEffect(() => {
    if (!selectedHotel) navigate('/');
    window.scrollTo(0, 0);
  }, [selectedHotel, navigate]);

  if (!selectedHotel) return null;

  // Fiscal values from Backend Preview
  const total = preview?.totalAmount || 0;
  const roomPrice = preview?.roomPrice || 0;
  const extraGuestCharges = preview?.extraGuestCharges || 0;
  const extraBedCharges = preview?.extraBedCharges || 0;
  const mealCharges = preview?.mealCharges || 0;
  const rawSubtotal = roomPrice + extraGuestCharges + extraBedCharges + mealCharges;
  const discount = preview?.discountAmount || 0;
  const promotion = preview?.promotion || null;
  const promotionOff = preview?.promotionDiscountAmount || 0;
  const prepaidOff = preview?.prepaidDiscountAmount ?? Math.max(0, discount - promotionOff - (preview?.loyaltyDiscountAmount || 0) - (preview?.memberDiscountAmount || 0));
  const promoStatus = preview?.promoCodeStatus || null;
  const rewards = preview?.loyalty || null;
  const member = preview?.membership || null;
  const pointsOff = preview?.loyaltyDiscountAmount || 0;
  const taxes = preview?.taxAmount || 0;
  const taxPercentage = preview?.taxPercentage;
  const pricingSource = preview?.pricingType;

  let payableNow = total;
  if (paymentType === 'PAY_AT_HOTEL') payableNow = 0;
  if (paymentType === 'PARTIAL') payableNow = Math.round(total * (config.partialPaymentPercent / 100) * 100) / 100;
  const walletUse = useWallet && paymentType !== 'PAY_AT_HOTEL' ? Math.min(walletBalance, payableNow) : 0;
  const payOnline = Math.round((payableNow - walletUse) * 100) / 100;

  const loadRazorpay = () => new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

  const handleCheckout = async (e) => {
    e.preventDefault();
    if (!agreed) {
      setError('Please agree to the Terms & Conditions and Cancellation Policy.');
      return;
    }
    if (withCompany) {
      if (!company.name.trim()) { setError('Enter the company name for the GST invoice, or untick "Add company / GST details".'); return; }
      if (company.gstin && !GSTIN_RE.test(company.gstin.trim())) { setError('Enter a valid 15-character GSTIN (for example 27ABCDE1234F1Z5).'); return; }
    }
    setLoading(true);
    setError('');
    
    trackEvent('BOOKING_STARTED', { paymentType, hotelId: selectedHotel.id }, selectedHotel.id, selectedHotel.city, allExperiments);
    
    try {
      const bookingPayload = {
        hotelId: selectedHotel.id,
        roomTypeId: selectedHotel.selectedRoomType?.id || selectedHotel.defaultRoomTypeId,
        ratePlanId: selectedHotel.selectedRatePlan?.id || selectedHotel.defaultRatePlanId,
        guestName: `${form.firstName} ${form.lastName}`.trim(),
        guestEmail: form.email,
        guestPhone: form.phone,
        checkIn: searchParams.checkIn,
        checkOut: searchParams.checkOut,
        adults: searchParams.adults || searchParams.guests || 2,
        children: searchParams.children || 0,
        extraBeds: searchParams.extraBeds || 0,
        rooms: searchParams.rooms || 1,
        paymentType,
        ...(promoCode && promoStatus?.ok ? { promoCode } : {}),
        ...(rewards?.pointsApplied ? { usePoints: rewards.pointsApplied } : {}),
        ...(walletUse > 0 ? { useWallet: true } : {}),
        ...(withCompany && company.name.trim() ? {
          companyName: company.name.trim(),
          ...(company.gstin.trim() ? { companyGstin: company.gstin.trim() } : {}),
          ...(company.address.trim() ? { companyAddress: company.address.trim() } : {}),
        } : {})
      };
      
      const bookingRes = await createBooking(bookingPayload);
      const booking = bookingRes.data;
      const bookingId = booking.id;
      const ref = booking.bookingRef;
      
      pendingBookingRef.current = bookingId;
      if (booking?.expiresAt) setExpiresAt(booking.expiresAt);
      
      // Pay at hotel, or fully paid with Zivo Cash: confirmed without an online payment
      if (paymentType === 'PAY_AT_HOTEL' || booking.status === 'CONFIRMED') {
        pendingBookingRef.current = null;
        setConfirmedBookingId(bookingId);
        setSuccess(true);
        setBookingRef(ref);
        setLoading(false);
        trackEvent('BOOKING_COMPLETED', { bookingId, paymentType }, selectedHotel.id, selectedHotel.city, allExperiments);
        return;
      }

      const sdkLoaded = await loadRazorpay();
      if (!sdkLoaded) {
        throw new Error('Razorpay SDK failed to load.');
      }

      const orderRes = await createPaymentOrder(bookingId);
      const order = orderRes.data;

      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: order.currency,
        name: 'ZivoHotels',
        description: `Booking ${ref}`,
        order_id: order.id,
        handler: async function (response) {
          try {
            await verifyPaymentApi({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              bookingId
            });
            pendingBookingRef.current = null;
            setConfirmedBookingId(bookingId);
            setSuccess(true);
            setBookingRef(ref);
            trackEvent('BOOKING_COMPLETED', { bookingId, paymentType }, selectedHotel.id, selectedHotel.city, allExperiments);
          } catch (err) {
            setError('Payment verification failed.');
            await cancelBooking(bookingId).catch(() => {});
            pendingBookingRef.current = null;
            setLoading(false);
          }
        },
        prefill: { name: bookingPayload.guestName, email: bookingPayload.guestEmail, contact: bookingPayload.guestPhone },
        theme: { color: '#1a56db' },
        modal: {
          ondismiss: async () => {
            if (pendingBookingRef.current) {
              await cancelBooking(pendingBookingRef.current).catch(() => {});
              pendingBookingRef.current = null;
              setError('Payment cancelled. Reservation released.');
              setLoading(false);
            }
          }
        }
      };

      const paymentObject = new window.Razorpay(options);
      paymentObject.on('payment.failed', async (response) => {
        setError(response.error.description || 'Payment failed.');
        await cancelBooking(bookingId).catch(() => {});
        pendingBookingRef.current = null;
        setLoading(false);
      });
      paymentObject.open();

    } catch (err) {
      // If the booking was created but payment couldn't start (e.g. the payment gateway is down),
      // release it: otherwise it held the room for 30 minutes and each retry made another one
      if (pendingBookingRef.current) {
        await cancelBooking(pendingBookingRef.current).catch(() => {});
        pendingBookingRef.current = null;
      }
      setError(err.message || 'Booking failed.');
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-20 px-4 bg-white">
        <div className="max-w-md w-full text-center">
          <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-8 border border-green-100">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
          </div>
          <h2 className="text-4xl font-black text-gray-900 mb-4">Confirmed!</h2>
          <p className="text-gray-500 mb-10 leading-relaxed">Your stay at <span className="font-bold text-gray-800">{selectedHotel.name}</span> is secured. A confirmation email has been sent to <span className="font-medium text-brand-700">{form.email}</span>.</p>
          
          <div className="bg-gray-50 p-8 rounded-3xl mb-10 text-left border border-gray-100 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/5 rounded-full -mr-16 -mt-16" />
            <p className="text-xs text-gray-400 uppercase font-black tracking-widest mb-2">Booking Reference</p>
            <p className="text-4xl font-mono font-black text-brand-700">{bookingRef}</p>
          </div>
          
          {confirmedBookingId && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              <button
                onClick={async () => {
                  setVoucherBusy(true);
                  try { await saveVoucher(confirmedBookingId, bookingRef, 'guest'); }
                  catch (err) { setError(err.message || 'Could not download the voucher.'); }
                  finally { setVoucherBusy(false); }
                }}
                disabled={voucherBusy}
                className="flex items-center justify-center gap-2 border-2 border-gray-900 text-gray-900 font-bold py-4 rounded-2xl hover:bg-gray-50 disabled:opacity-50"
              >
                <Download size={18} /> {voucherBusy ? 'Preparing…' : 'Download voucher'}
              </button>
              <button
                onClick={() => { clearBooking(); navigate('/my-bookings'); }}
                className="flex items-center justify-center gap-2 border-2 border-gray-200 text-gray-700 font-bold py-4 rounded-2xl hover:bg-gray-50"
              >
                My Bookings
              </button>
            </div>
          )}
          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
          <button 
            onClick={() => { clearBooking(); navigate('/'); }}
            className="group relative w-full bg-gray-900 text-white font-bold py-5 rounded-2xl overflow-hidden transition-all hover:scale-[1.02] active:scale-95"
          >
            <span className="relative z-10 flex items-center justify-center gap-2">
              Back to Home <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-24 pb-20 bg-[#fcfcfd] min-h-screen">
      {loading && (
        <div className="fixed inset-0 z-[100] bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center">
          <div className="w-16 h-16 border-4 border-brand-700 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-lg font-bold text-gray-900">Processing your secure booking...</p>
          <p className="text-sm text-gray-500">Please do not refresh or close this window.</p>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <header className="mb-10">
          <button
            type="button"
            onClick={() => {
              const q = new URLSearchParams({ checkin: searchParams.checkIn || '', checkout: searchParams.checkOut || '', guests: String(searchParams.guests || 2), rooms: String(searchParams.rooms || 1) });
              navigate(`/hotel/${selectedHotel.id}?${q}`);
            }}
            className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-brand-700"
          >
            <ArrowLeft size={16} /> Change room or meal plan
          </button>
          <div className="flex items-center gap-2 text-brand-700 font-bold text-sm uppercase tracking-widest mb-2">
            <Lock size={14} /> Secure Encryption Active
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-gray-900">Review & Payout</h1>
        </header>

        {previewError && !fetchingPreview && (
          <div role="alert" className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm font-medium">
            We couldn&apos;t price this stay: {previewError}
          </div>
        )}
        {error && (
          <div className="mb-8 flex items-center gap-4 bg-red-50 border-l-4 border-red-500 text-red-900 p-5 rounded-r-xl shadow-sm animate-shake">
            <AlertTriangle className="text-red-500 shrink-0" size={24} />
            <span className="font-semibold">{error}</span>
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-10">
          <div className="flex-1 space-y-8">
            {/* Step 1: Guest Information */}
            <section className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-gray-900 text-white rounded-2xl flex items-center justify-center font-black text-xl">1</div>
                <h2 className="text-2xl font-black text-gray-900">Guest Information</h2>
              </div>

              {user && (
                <div className="grid grid-cols-2 gap-3 mb-6" role="radiogroup" aria-label="Who is travelling?">
                  {[
                    { id: 'self', title: "I'm the guest", desc: 'Use my profile details' },
                    { id: 'other', title: 'Someone else', desc: "Enter the guest's details" },
                  ].map(opt => (
                    <button key={opt.id} type="button" role="radio" aria-checked={travellerType === opt.id}
                      onClick={() => chooseTraveller(opt.id)}
                      className={`text-left p-4 rounded-2xl border-2 transition-all ${travellerType === opt.id ? 'border-brand-700 bg-brand-50/40' : 'border-gray-100 hover:border-gray-200'}`}>
                      <p className="font-black text-gray-900 text-sm">{opt.title}</p>
                      <p className="text-xs text-gray-500">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              )}
              {user && travellerType === 'self' && !form.phone && (
                <p className="text-xs text-amber-700 mb-4">Your profile has no phone number. Add it below so the hotel can reach you.</p>
              )}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="relative group">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-brand-700 transition-colors" size={18} />
                  <input required type="text" name="firstName" value={form.firstName} onChange={handleForm}
                    className="w-full bg-gray-50 border-transparent border-b-2 border-b-gray-200 rounded-t-xl px-12 py-4 focus:bg-white focus:border-b-brand-700 outline-none transition-all font-medium" placeholder="First Name" />
                </div>
                <div className="relative group">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-brand-700 transition-colors" size={18} />
                  <input required type="text" name="lastName" value={form.lastName} onChange={handleForm}
                    className="w-full bg-gray-50 border-transparent border-b-2 border-b-gray-200 rounded-t-xl px-12 py-4 focus:bg-white focus:border-b-brand-700 outline-none transition-all font-medium" placeholder="Last Name" />
                </div>
                <div className="relative group md:col-span-2">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-brand-700 transition-colors" size={18} />
                  <input required type="email" name="email" value={form.email} onChange={handleForm}
                    className="w-full bg-gray-50 border-transparent border-b-2 border-b-gray-200 rounded-t-xl px-12 py-4 focus:bg-white focus:border-b-brand-700 outline-none transition-all font-medium" placeholder="Email Address" />
                </div>
                <div className="relative group md:col-span-2">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-brand-700 transition-colors" size={18} />
                  <input required type="tel" name="phone" value={form.phone} onChange={handleForm}
                    className="w-full bg-gray-50 border-transparent border-b-2 border-b-gray-200 rounded-t-xl px-12 py-4 focus:bg-white focus:border-b-brand-700 outline-none transition-all font-medium" placeholder="Phone Number" />
                </div>
              </div>

              {/* Optional: GST invoice in a company's name */}
              <label className="mt-6 flex items-center gap-3 cursor-pointer select-none">
                <input type="checkbox" checked={withCompany} onChange={e => setWithCompany(e.target.checked)} className="w-4 h-4 accent-brand-700" />
                <span className="text-sm font-bold text-gray-800 flex items-center gap-2"><Briefcase size={16} className="text-gray-500" /> Add company / GST details <span className="font-medium text-gray-400">(optional)</span></span>
              </label>
              {withCompany && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input type="text" name="name" value={company.name} onChange={handleCompany} placeholder="Company name"
                    className="w-full bg-gray-50 border-b-2 border-b-gray-200 rounded-t-xl px-4 py-3 focus:bg-white focus:border-b-brand-700 outline-none font-medium" />
                  <input type="text" name="gstin" value={company.gstin} onChange={handleCompany} placeholder="GSTIN (15 characters)" maxLength={15}
                    className="w-full bg-gray-50 border-b-2 border-b-gray-200 rounded-t-xl px-4 py-3 focus:bg-white focus:border-b-brand-700 outline-none font-medium uppercase" />
                  <input type="text" name="address" value={company.address} onChange={handleCompany} placeholder="Company address (as registered for GST)"
                    className="md:col-span-2 w-full bg-gray-50 border-b-2 border-b-gray-200 rounded-t-xl px-4 py-3 focus:bg-white focus:border-b-brand-700 outline-none font-medium" />
                  <p className="md:col-span-2 text-xs text-gray-500">The property issues the tax invoice in this company&apos;s name and GSTIN.</p>
                </div>
              )}
            </section>

            {/* Step 2: Payment Strategy */}
            <section className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-gray-900 text-white rounded-2xl flex items-center justify-center font-black text-xl">2</div>
                <h2 className="text-2xl font-black text-gray-900">Payment Strategy</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { id: 'PREPAID', label: 'Full Prepaid', desc: 'Secure best rate', icon: <CreditCard />, tag: `Save ${config.prepaidDiscountPercent}%` },
                  { id: 'PARTIAL', label: `Book with ${config.partialPaymentPercent}%`, desc: 'Pay rest later', icon: <PieChart /> },
                  { id: 'PAY_AT_HOTEL', label: 'Pay @ Hotel', desc: 'Confirm without pay', icon: <Building /> }
                ].map((opt) => (
                  <div 
                    key={opt.id}
                    onClick={() => setPaymentType(opt.id)}
                    className={`relative cursor-pointer p-6 rounded-2xl border-2 transition-all group ${paymentType === opt.id ? 'border-brand-700 bg-brand-50/50' : 'border-gray-100 hover:border-gray-200 bg-white'}`}
                  >
                    {opt.tag && <span className="absolute -top-3 right-4 bg-green-500 text-white text-[10px] font-black px-2 py-1 rounded-full uppercase">{opt.tag}</span>}
                    <div className={`mb-4 w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${paymentType === opt.id ? 'bg-brand-700 text-white' : 'bg-gray-100 text-gray-400'}`}>
                      {opt.icon}
                    </div>
                    <p className="font-black text-gray-900 text-sm leading-tight mb-1">{opt.label}</p>
                    <p className="text-xs text-gray-500 font-medium">{opt.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Consent */}
            <section className="p-4 bg-gray-100/50 rounded-2xl border border-gray-200/50">
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative mt-1">
                  <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="sr-only" />
                  <div className={`w-5 h-5 rounded border-2 transition-all flex items-center justify-center ${agreed ? 'bg-brand-700 border-brand-700' : 'bg-white border-gray-300 group-hover:border-brand-500'}`}>
                    {agreed && <CheckCircle2 size={12} className="text-white" />}
                  </div>
                </div>
                <p className="text-xs text-gray-500 font-medium leading-relaxed">
                  I agree to the <span className="text-brand-700 font-bold hover:underline">Terms of Service</span>, <span className="text-brand-700 font-bold hover:underline">Privacy Policy</span>, and <span className="text-brand-700 font-bold hover:underline">Cancellation Rules</span>. I understand that fraudulent bookings will be reported.
                </p>
              </label>
            </section>

            <button 
              onClick={handleCheckout}
              disabled={loading || (countdown && countdown.expired) || fetchingPreview || !preview}
              className="w-full bg-brand-700 hover:bg-brand-800 text-white font-black py-6 rounded-2xl shadow-xl shadow-brand-500/20 transition-all transform hover:-translate-y-1 active:scale-95 text-xl disabled:opacity-50 disabled:grayscale disabled:transform-none"
            >
              {fetchingPreview ? 'Calculating...' : paymentType === 'PAY_AT_HOTEL' ? 'Confirm Reservation' : payOnline <= 0 ? `Pay ₹${walletUse.toLocaleString('en-IN')} with Zivo Cash` : `Secure Payment: ₹${payOnline.toLocaleString('en-IN')}${walletUse > 0 ? ` + ₹${walletUse.toLocaleString('en-IN')} Zivo Cash` : ''}`}
            </button>
          </div>

          {/* Checkout Ledger */}
          <aside className="w-full lg:w-[420px]">
            <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden sticky top-24">
              <div className="p-8 bg-gray-900 text-white">
                <div className="flex justify-between items-start mb-6">
                  <div className="w-16 h-16 rounded-2xl overflow-hidden bg-white/10 border border-white/10">
                    {(selectedHotel.media?.[0]?.url || selectedHotel.image) ? (
                      <img src={getImageUrl(selectedHotel.media?.[0]?.url || selectedHotel.image)} alt={selectedHotel.name}
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        className="w-full h-full object-cover opacity-80" />
                    ) : <Building className="w-full h-full p-4 text-white/40" />}
                  </div>
                  {countdown && (
                    <div className={`px-4 py-2 rounded-xl flex items-center gap-2 border ${countdown.expired ? 'bg-red-500/20 border-red-500 text-red-100' : 'bg-white/10 border-white/20 text-white'}`}>
                      <Clock size={16} className={!countdown.expired ? 'animate-pulse' : ''} />
                      <span className="font-black font-mono text-sm">{countdown.display}</span>
                    </div>
                  )}
                </div>
                <h3 className="text-2xl font-black truncate">{selectedHotel.name}</h3>
                <p className="text-white/50 text-sm font-medium flex items-center gap-1 mt-1">
                  <Building size={14} /> {selectedHotel.city}
                </p>
              </div>

              <div className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                    <p className="text-[10px] text-gray-400 font-black uppercase mb-1 flex items-center gap-1">
                      <CalendarDays size={10} /> Check-in
                    </p>
                    <p className="font-bold text-gray-900 text-sm">{new Date(searchParams.checkIn).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                    <p className="text-[10px] text-gray-400 font-black uppercase mb-1 flex items-center gap-1">
                      <CalendarDays size={10} /> Check-out
                    </p>
                    <p className="font-bold text-gray-900 text-sm">{new Date(searchParams.checkOut).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</p>
                  </div>
                </div>

                <div className="space-y-4 py-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-brand-50 rounded-lg flex items-center justify-center text-brand-700">
                      <BedDouble size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{selectedHotel.selectedRoomType?.name}</p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase">{selectedHotel.selectedRatePlan?.name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-brand-50 rounded-lg flex items-center justify-center text-brand-700">
                      <Users size={16} />
                    </div>
                    <p className="text-sm font-bold text-gray-900">{preview?.rooms || searchParams.rooms} Room, {searchParams.guests} Guests</p>
                  </div>
                </div>

                <div className="pt-6 border-t border-dashed border-gray-200 space-y-3">
                  {pricingSource && (
                    <div className="mb-2">
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${pricingSource === 'OVERRIDE' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                        {pricingSource === 'OVERRIDE' ? 'Override Applied' : 'Standard Pricing'}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-gray-500 font-medium">
                    <span>Room Price</span>
                    <span className="text-gray-900">₹{roomPrice.toLocaleString()}</span>
                  </div>
                  {extraGuestCharges > 0 && (
                    <div className="flex justify-between text-gray-500 font-medium">
                      <span>Extra Guest Charges</span>
                      <span className="text-gray-900">₹{extraGuestCharges.toLocaleString()}</span>
                    </div>
                  )}
                  {extraBedCharges > 0 && (
                    <div className="flex justify-between text-gray-500 font-medium">
                      <span>Extra Bed Charges</span>
                      <span className="text-gray-900">₹{extraBedCharges.toLocaleString()}</span>
                    </div>
                  )}
                  {mealCharges > 0 && (
                    <div className="flex justify-between text-gray-500 font-medium">
                      <span>Meal Charges</span>
                      <span className="text-gray-900">₹{mealCharges.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-gray-800 font-bold border-t border-dashed border-gray-200 pt-2">
                    <span>Stay Subtotal</span>
                    <span>₹{rawSubtotal.toLocaleString()}</span>
                  </div>
                  {promotionOff > 0 && promotion && (
                    <div className="flex justify-between text-green-700 font-bold text-sm bg-green-50 px-3 py-2 rounded-xl border border-green-100">
                      <span className="flex items-center gap-1"><Tag size={14} /> {promotion.name}{promotion.code ? ` (${promotion.code})` : ''}</span>
                      <span>-₹{promotionOff.toLocaleString()}</span>
                    </div>
                  )}
                  {prepaidOff > 0 && (
                    <div className="flex justify-between text-green-600 font-bold text-sm bg-green-50 px-3 py-2 rounded-xl border border-green-100">
                      <span className="flex items-center gap-1"><ShieldCheck size={14} /> You save (Prepaid)</span>
                      <span>-₹{prepaidOff.toLocaleString()}</span>
                    </div>
                  )}

                  {member?.hotelDiscount > 0 && (
                    <div className="flex justify-between text-amber-700 font-bold text-sm bg-amber-50 px-3 py-2 rounded-xl border border-amber-100">
                      <span className="flex items-center gap-1"><Crown size={14} /> Member price ({member.hotelMemberPercent}%)</span>
                      <span>-₹{member.hotelDiscount.toLocaleString()}</span>
                    </div>
                  )}
                  {member?.zivoDiscount > 0 && (
                    <div className="flex justify-between text-amber-700 font-bold text-sm bg-amber-50 px-3 py-2 rounded-xl border border-amber-100">
                      <span className="flex items-center gap-1"><Crown size={14} /> {member.plan} extra</span>
                      <span>-₹{member.zivoDiscount.toLocaleString()}</span>
                    </div>
                  )}
                  {member && !member.isPaid && (
                    <a href="/membership" className="block text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                      <Crown size={12} className="inline mr-1" />Get extra savings, 2× points and longer free cancellation with Zivo Prime →
                    </a>
                  )}
                  {member?.isPaid && member.freeCancelExtraHours > 0 && (
                    <p className="text-[11px] text-amber-800">{member.plan}: free cancellation {member.freeCancelExtraHours} hours longer than the hotel&apos;s policy{member.prioritySupport ? ' · priority support' : ''}</p>
                  )}
                  {pointsOff > 0 && (
                    <div className="flex justify-between text-green-700 font-bold text-sm bg-green-50 px-3 py-2 rounded-xl border border-green-100">
                      <span className="flex items-center gap-1"><Award size={14} /> Zivo Rewards ({rewards.pointsApplied.toLocaleString('en-IN')} pts)</span>
                      <span>-₹{pointsOff.toLocaleString()}</span>
                    </div>
                  )}

                  {/* Zivo Rewards */}
                  {rewards && (
                    <div className="rounded-xl border border-gray-200 p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-gray-800 flex items-center gap-1"><Award size={14} className="text-brand-600" /> Zivo Rewards · {rewards.tier?.name}</span>
                        <span className="text-gray-500">{rewards.available.toLocaleString('en-IN')} pts available</span>
                      </div>
                      {rewards.maxPoints > 0 ? (
                        <>
                          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                            <input type="checkbox" className="rounded border-gray-300" checked={usePoints > 0}
                              onChange={(e) => setUsePoints(e.target.checked ? rewards.maxPoints : 0)} />
                            Use my points (up to {rewards.maxPoints.toLocaleString('en-IN')} = ₹{Math.round(rewards.maxPoints * rewards.pointValue).toLocaleString('en-IN')})
                          </label>
                          {usePoints > 0 && (
                            <div className="flex items-center gap-2">
                              <input type="range" aria-label="Points to use" min={rewards.minRedeemPoints} max={rewards.maxPoints} step={1}
                                value={Math.min(usePoints, rewards.maxPoints)} onChange={(e) => setUsePoints(Number(e.target.value))} className="flex-1 accent-brand-600" />
                              <span className="text-xs font-bold text-gray-700 w-20 text-right">{Math.min(usePoints, rewards.maxPoints).toLocaleString('en-IN')} pts</span>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-[11px] text-gray-500">{rewards.available > 0 ? `Use points from ${rewards.minRedeemPoints} points (up to ${rewards.maxRedeemPercent}% of the room price).` : 'Points from your stays can be used on future bookings.'}</p>
                      )}
                      {rewards.reason && <p role="alert" className="text-[11px] text-red-600">{rewards.reason}</p>}
                      {rewards.earn > 0 && <p className="text-[11px] text-green-700 font-semibold">You&apos;ll earn {rewards.earn.toLocaleString('en-IN')} points after this stay</p>}
                    </div>
                  )}

                  {/* Zivo Cash */}
                  {walletBalance > 0 && paymentType !== 'PAY_AT_HOTEL' && (
                    <label className="flex items-start gap-2 rounded-xl border border-gray-200 p-3 cursor-pointer">
                      <input type="checkbox" className="mt-0.5 rounded border-gray-300" checked={useWallet} onChange={(e) => setUseWallet(e.target.checked)} />
                      <span className="text-sm text-gray-700 flex-1">
                        <span className="font-bold text-gray-900 flex items-center gap-1"><Wallet size={14} className="text-brand-600" /> Pay with Zivo Cash</span>
                        <span className="text-xs text-gray-500">₹{walletBalance.toLocaleString('en-IN')} available{useWallet ? ` · ₹${walletUse.toLocaleString('en-IN')} will be used` : ''}</span>
                      </span>
                    </label>
                  )}

                  {/* Promo code */}
                  <div className="pt-1">
                    {promoCode && promoStatus?.ok ? (
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-green-700">Code {promoCode} applied</span>
                        <button type="button" onClick={() => { setPromoCode(''); setPromoInput(''); }} className="font-semibold text-gray-500 hover:text-red-600">Remove</button>
                      </div>
                    ) : (
                      <form onSubmit={(e) => { e.preventDefault(); setPromoCode(promoInput.trim().toUpperCase()); }} className="flex gap-2">
                        <input aria-label="Promo code" value={promoInput} onChange={(e) => setPromoInput(e.target.value.toUpperCase())} placeholder="Promo code"
                          className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-lg text-sm uppercase font-mono focus:ring-2 focus:ring-brand-500 outline-none" />
                        <button type="submit" disabled={!promoInput.trim() || fetchingPreview} className="px-3 py-2 rounded-lg text-sm font-bold bg-gray-900 text-white disabled:opacity-40">Apply</button>
                      </form>
                    )}
                    {promoCode && promoStatus && !promoStatus.ok && (
                      <p role="alert" className="text-xs text-red-600 mt-1">{promoStatus.message}</p>
                    )}
                  </div>
                  <div className="flex justify-between text-gray-500 font-medium">
                    <span>GST{taxPercentage != null ? ` (${taxPercentage}%)` : ''}</span>
                    <span className="text-gray-900">₹{taxes.toLocaleString()}</span>
                  </div>
                </div>

                <div className="pt-6 border-t border-gray-200">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-black text-gray-900 uppercase tracking-tighter">Grand Total</span>
                    <span className="text-3xl font-black text-brand-700 tracking-tighter">₹{total.toLocaleString()}</span>
                  </div>
                  {paymentType === 'PARTIAL' && (
                    <div className="mt-4 p-4 bg-brand-900 rounded-2xl text-white">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-bold opacity-60">Amount Payable Now</span>
                        <span className="text-xl font-black">₹{payableNow.toLocaleString()}</span>
                      </div>
                      <p className="text-[10px] font-medium opacity-40 italic">Balance ₹{(total - payableNow).toLocaleString()} payable at reception.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
