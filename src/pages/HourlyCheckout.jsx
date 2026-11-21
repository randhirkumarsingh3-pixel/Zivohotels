import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Clock, ShieldCheck, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { previewHourlyApi, bookHourlyApi } from '../services/api';
import { payForBooking } from '../utils/payBooking';
import usePageTitle from '../hooks/usePageTitle';

/**
 * Checkout for an hourly stay: the slot and price (checked again with the server), the guest
 * checking in, and payment online. The booking holds the room for 30 minutes until paid.
 */
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const inputCls = 'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none';

const HourlyCheckout = () => {
  usePageTitle('Checkout: hourly stay');
  const { state } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const h = state?.hourly;
  const [quote, setQuote] = useState(state?.quote || null);
  const [guest, setGuest] = useState({ name: user?.name || '', email: user?.email || '', phone: (user?.phone || '').replace(/^\+91/, '') });
  const [agree, setAgree] = useState(false);
  const [booking, setBooking] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // The price again, in case it changed since the hotel page (or member prices now apply)
  useEffect(() => {
    if (!h) return;
    previewHourlyApi({ hotelId: h.hotelId, roomTypeId: h.roomTypeId, date: h.date, start: h.start, hours: h.hours, adults: h.adults, children: h.children })
      .then(setQuote).catch((e) => setError(e.message));
  }, [h]);

  if (!h) {
    return (
      <div className="pt-28 pb-20 min-h-screen bg-gray-50 px-4 text-center">
        <p className="text-gray-700">Choose a room and time on a hotel page first.</p>
        <Link to="/hotels?stay=hourly" className="inline-block mt-4 font-semibold text-brand-700">Find an hourly stay</Link>
      </div>
    );
  }

  const pay = async (b) => {
    const result = await payForBooking(b, { name: guest.name, email: guest.email, phone: guest.phone });
    if (result === 'paid') { setDone(true); setTimeout(() => navigate('/my-bookings', { replace: true }), 2500); }
    else setError('Payment was not completed. Your room is held for 30 minutes: pay below to confirm it.');
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!agree) { setError('Please accept the terms to continue.'); return; }
    setBusy(true);
    try {
      let b = booking;
      if (!b) {
        const r = await bookHourlyApi({
          hotelId: h.hotelId, roomTypeId: h.roomTypeId, date: h.date, start: h.start, hours: h.hours, adults: h.adults, children: h.children,
          guestName: guest.name.trim(), guestEmail: guest.email.trim(), guestPhone: guest.phone.trim(),
        });
        b = { ...r.booking, guestName: guest.name, guestEmail: guest.email, guestPhone: guest.phone };
        setBooking(b);
      }
      await pay(b);
    } catch (err) {
      setError(err.message || 'Could not complete the booking.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="pt-28 pb-20 min-h-screen bg-gray-50 px-4">
        <div className="max-w-md mx-auto bg-white rounded-card border border-gray-200 p-8 text-center">
          <CheckCircle2 size={48} className="mx-auto text-green-600" aria-hidden="true" />
          <h1 className="mt-4 text-2xl font-bold text-gray-900">Booking confirmed</h1>
          <p className="mt-2 text-gray-600">{booking?.bookingRef} · {quote?.slot?.label}. We&apos;ve emailed the details.</p>
          <Link to="/my-bookings" className="inline-block mt-6 font-semibold text-brand-700">Go to My Bookings</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-24 pb-20 min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <h1 className="text-2xl md:text-3xl font-bold text-navy-900 mb-6">Confirm your hourly stay</h1>
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <form onSubmit={submit} className="space-y-6">
            <section className="bg-white rounded-card border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900">Guest checking in</h2>
              <p className="text-sm text-gray-500 mb-4">Must be 18 or older and carry a government photo ID. Guests aged 13–17 stay only with an adult.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm sm:col-span-2"><span className="block font-semibold text-gray-700 mb-1">Full name</span>
                  <input required minLength={2} value={guest.name} onChange={(e) => setGuest((g) => ({ ...g, name: e.target.value }))} className={inputCls} autoComplete="name" /></label>
                <label className="text-sm"><span className="block font-semibold text-gray-700 mb-1">Email</span>
                  <input required type="email" value={guest.email} onChange={(e) => setGuest((g) => ({ ...g, email: e.target.value }))} className={inputCls} autoComplete="email" /></label>
                <label className="text-sm"><span className="block font-semibold text-gray-700 mb-1">Mobile number</span>
                  <input required type="tel" value={guest.phone} onChange={(e) => setGuest((g) => ({ ...g, phone: e.target.value }))} className={inputCls} placeholder="98765 43210" autoComplete="tel" /></label>
              </div>
            </section>

            <section className="bg-white rounded-card border border-gray-200 p-6 space-y-3 text-sm text-gray-700">
              <p className="flex items-start gap-2"><ShieldCheck size={18} className="text-green-700 shrink-0" aria-hidden="true" />
                {quote?.freeCancelHours ? `Free cancellation until ${quote.freeCancelHours} hour${quote.freeCancelHours === 1 ? '' : 's'} before check-in; no refund after that.` : 'This booking cannot be refunded once confirmed.'}</p>
              <p className="flex items-start gap-2"><Clock size={18} className="text-navy-700 shrink-0" aria-hidden="true" /> Check in at your start time; the room is yours until the end of the slot. Arriving late does not extend it.</p>
              <label className="flex items-start gap-2 pt-2">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300" />
                <span>I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-semibold underline">Terms</a> and <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold underline">Privacy Policy</a>, and confirm the guest checking in is 18 or older.</span>
              </label>
            </section>

            {error && <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800"><AlertCircle size={18} className="shrink-0" aria-hidden="true" /> {error}</p>}
            <button type="submit" disabled={busy || !quote || !quote.available} className="w-full sm:w-auto px-8 py-4 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-lg disabled:opacity-50">
              {busy ? <span className="inline-flex items-center gap-2"><Loader2 size={18} className="animate-spin" /> Please wait…</span> : quote ? `${booking ? 'Pay' : 'Book & pay'} ${inr(quote.totalAmount)}` : 'Book & pay'}
            </button>
            {quote && !quote.available && <p className="text-sm text-red-700">This time is no longer free. <button type="button" onClick={() => navigate(-1)} className="font-semibold underline">Choose another</button></p>}
          </form>

          <aside className="bg-white rounded-card border border-gray-200 p-6 h-fit lg:sticky lg:top-28">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Hourly stay</p>
            <h2 className="mt-1 text-lg font-bold text-gray-900">{h.hotelName}</h2>
            <p className="text-sm text-gray-500">{h.city}</p>
            <div className="mt-4 rounded-xl bg-navy-50 p-3 text-sm">
              <p className="font-semibold text-navy-900">{h.roomName}</p>
              <p className="text-navy-900">{quote?.slot?.label || `${h.date} · ${h.start} · ${h.hours} hours`}</p>
              <p className="text-navy-800">{h.adults + h.children} guest{h.adults + h.children > 1 ? 's' : ''}</p>
            </div>
            {quote ? (
              <div className="mt-4 text-sm space-y-2 tabular-nums">
                <div className="flex justify-between text-gray-600"><span>{h.hours} hours</span><span>{inr(quote.roomPrice)}</span></div>
                {quote.memberDiscountAmount > 0 && <div className="flex justify-between text-green-700"><span>Member price</span><span>− {inr(quote.memberDiscountAmount)}</span></div>}
                <div className="flex justify-between text-gray-600"><span>GST ({quote.taxPercentage}%)</span><span>{inr(quote.taxAmount)}</span></div>
                <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-200"><span>Total</span><span>{inr(quote.totalAmount)}</span></div>
              </div>
            ) : <div className="mt-4 h-20 bg-gray-50 rounded-xl animate-pulse" />}
          </aside>
        </div>
      </div>
    </div>
  );
};

export default HourlyCheckout;
