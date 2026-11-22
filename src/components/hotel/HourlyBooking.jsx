import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, BedDouble, Users, ShieldCheck, Check, Loader2, Hourglass } from 'lucide-react';
import { getHotelHourly, previewHourlyApi } from '../../services/api';
import { getImageUrl } from '../../utils/image';
import PhotoViewer from './PhotoViewer';
import { timeLabel, todayIst } from '../../utils/hourly';

/**
 * Hourly booking on the hotel page: date, duration and guests, then a room and a start time
 * (only free times are offered), the price from the server (same as checkout), and Book now.
 */
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const addHours = (hhmm, h) => { const [a, b] = hhmm.split(':').map(Number); const m = a * 60 + b + h * 60; return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

const HourlyBooking = ({ hotel, initial, onSlotChange }) => {
  const navigate = useNavigate();
  const [date, setDate] = useState(initial.date);
  const [hours, setHours] = useState(initial.hours);
  const [guests, setGuests] = useState(initial.guests);
  const [start, setStart] = useState(initial.start);
  const [roomId, setRoomId] = useState(null);
  const [offer, setOffer] = useState(null);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');
  const [viewer, setViewer] = useState(null);

  useEffect(() => {
    let live = true;
    setOffer(null);
    getHotelHourly(hotel.id, date, hours).then((o) => { if (live) setOffer(o || { roomTypes: [], startTimes: [] }); }).catch(() => live && setOffer({ roomTypes: [], startTimes: [] }));
    return () => { live = false; };
  }, [hotel.id, date, hours]);

  const durations = offer?.settings?.durations?.length ? offer.settings.durations : [3, 6];
  useEffect(() => { if (offer?.hours && offer.hours !== hours) setHours(offer.hours); }, [offer, hours]);

  const rooms = useMemo(() => (offer?.roomTypes || []).filter((r) => (r.maxOccupancy || 2) >= guests), [offer, guests]);
  const room = rooms.find((r) => r.id === roomId) || null;
  const times = room ? room.startTimes : (offer?.startTimes || []);

  // Keep a room and a start that work together: the chosen start when free, else the first free one
  useEffect(() => {
    if (!offer) return;
    const r = rooms.find((x) => x.id === roomId && x.startTimes.includes(start)) || rooms.find((x) => x.startTimes.includes(start)) || rooms.find((x) => x.startTimes.length);
    if (!r) { setRoomId(null); return; }
    if (r.id !== roomId) setRoomId(r.id);
    if (!r.startTimes.includes(start)) setStart(r.startTimes[0]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer, rooms]);

  useEffect(() => { onSlotChange?.({ date, start, hours, guests }); }, [date, start, hours, guests, onSlotChange]);

  useEffect(() => {
    setQuote(null); setError('');
    if (!room || !start || !room.startTimes.includes(start)) return undefined;
    let live = true;
    const t = setTimeout(() => {
      previewHourlyApi({ hotelId: hotel.id, roomTypeId: room.id, date, start, hours, adults: Math.min(guests, room.maxOccupancy || 2), children: 0 })
        .then((q) => { if (live) setQuote(q); }).catch((e) => { if (live) setError(e.message); });
    }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [hotel.id, room, date, start, hours, guests]);

  const book = () => {
    if (!room || !quote) return;
    navigate('/checkout/hourly', { state: { hourly: { hotelId: hotel.id, hotelName: hotel.name, city: hotel.city, roomTypeId: room.id, roomName: room.name, date, start, hours, adults: guests, children: 0 }, quote } });
  };

  const selectCls = 'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none';

  return (
    <section id="rooms" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6 scroll-mt-32">
      {viewer && <PhotoViewer photos={viewer.photos} title={viewer.title} filters={false} onClose={() => setViewer(null)} />}
      <div className="flex flex-col lg:flex-row gap-8">
        <div className="flex-1 min-w-0 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-4 grid gap-3 grid-cols-2 md:grid-cols-4">
            <label className="text-sm col-span-2 md:col-span-1"><span className="block text-xs font-semibold text-gray-500 mb-1">Date</span>
              <input type="date" min={todayIst()} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className={selectCls} /></label>
            <label className="text-sm"><span className="block text-xs font-semibold text-gray-500 mb-1">Stay for</span>
              <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className={selectCls}>{durations.map((d) => <option key={d} value={d}>{d} hours</option>)}</select></label>
            <label className="text-sm"><span className="block text-xs font-semibold text-gray-500 mb-1">Guests</span>
              <select value={guests} onChange={(e) => setGuests(Number(e.target.value))} className={selectCls}>{[1, 2, 3, 4].map((g) => <option key={g} value={g}>{g} guest{g > 1 ? 's' : ''}</option>)}</select></label>
            <div className="text-sm col-span-2 md:col-span-1"><span className="block text-xs font-semibold text-gray-500 mb-1">Hourly stays here</span>
              <p className="py-2.5 text-gray-800">{offer?.settings ? `${timeLabel(offer.settings.openFrom)} – ${timeLabel(offer.settings.openTo)}` : '…'}</p></div>
          </div>

          <div>
            <h2 className="text-xl font-bold text-gray-900">Choose your room</h2>
            <p className="text-sm text-gray-500 mt-0.5">Prices for {hours} hours, before GST.</p>
          </div>
          {!offer ? <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-brand-600" /></div>
            : !rooms.length ? <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{(offer.roomTypes || []).length ? `No room for ${guests} guests is offered by the hour. Try fewer guests.` : 'No hourly rooms are free on this date. Try another date or duration.'}</p>
              : rooms.map((r) => {
                const pics = [...(r.images || [])].filter((i) => i?.url).sort((a, b) => Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary))).map((i) => ({ url: i.url }));
                const photo = pics[0]?.url;
                const sel = r.id === roomId;
                return (
                  <article key={r.id} className={`rounded-xl border bg-white overflow-hidden ${sel ? 'border-brand-300 ring-1 ring-brand-200' : 'border-gray-200'}`}>
                    <div className="flex flex-col sm:flex-row gap-4 p-4">
                      <div className="w-full sm:w-40 h-32 sm:h-28 shrink-0 rounded-lg overflow-hidden bg-gray-100">
                        {photo ? (
                          <button type="button" onClick={() => setViewer({ photos: pics, title: r.name })} className="relative block w-full h-full" aria-label={`See photos of ${r.name}`}>
                            <img src={getImageUrl(photo, 800)} alt={r.name} loading="lazy" className="w-full h-full object-cover" />
                            <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/60 text-white text-xs font-semibold">{pics.length} photo{pics.length === 1 ? '' : 's'}</span>
                          </button>
                        ) : <div className="w-full h-full flex items-center justify-center"><BedDouble size={28} className="text-gray-300" aria-hidden="true" /></div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap justify-between gap-2">
                          <h3 className="text-lg font-bold text-gray-900">{r.name}</h3>
                          <div className="text-right">
                            {r.offer && <p className="text-xs"><span className="text-gray-400 line-through tabular-nums">{inr(r.price)}</span> <span className="ml-1 px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-bold">{r.offer.label}</span></p>}
                            <p><span className="text-xl font-bold text-gray-900 tabular-nums">{inr(r.offer ? r.offer.priceAfter : r.price)}</span><span className="text-xs text-gray-500"> for {hours} h</span></p>
                          </div>
                        </div>
                        <p className="mt-1 flex flex-wrap gap-x-4 text-sm text-gray-600">
                          <span className="inline-flex items-center gap-1"><Users size={14} aria-hidden="true" /> Up to {r.maxOccupancy || 2} guests</span>
                          {r.bedType && <span className="inline-flex items-center gap-1"><BedDouble size={14} aria-hidden="true" /> {r.bedType}</span>}
                          {Object.keys(r.prices || {}).length > 1 && <span className="text-gray-500">{Object.entries(r.prices).map(([d, p]) => `${d} h ${inr(p)}`).join(' · ')}</span>}
                        </p>
                        {r.startTimes.length === 0 ? <p className="mt-2 text-sm font-semibold text-red-700">Fully booked for {hours} hours on this date</p> : (
                          <button type="button" onClick={() => { setRoomId(r.id); if (!r.startTimes.includes(start)) setStart(r.startTimes[0]); }} aria-pressed={sel}
                            className={`mt-3 px-4 py-2 rounded-lg text-sm font-bold ${sel ? 'bg-brand-600 text-white' : 'border-2 border-brand-600 text-brand-700 hover:bg-brand-50'}`}>
                            {sel ? <span className="inline-flex items-center gap-1"><Check size={16} aria-hidden="true" /> Selected</span> : 'Select'}
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}

          {room && times.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <h3 className="font-bold text-gray-900 flex items-center gap-2"><Clock size={18} className="text-brand-700" aria-hidden="true" /> Check-in time</h3>
              <p className="text-sm text-gray-500 mb-3">Times free for {room.name} on this date.</p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Check-in time">
                {times.map((t) => (
                  <button key={t} type="button" role="radio" aria-checked={t === start} onClick={() => setStart(t)}
                    className={`px-3 py-2 rounded-lg border text-sm font-semibold tabular-nums ${t === start ? 'border-brand-600 bg-brand-600 text-white' : 'border-gray-300 text-gray-800 hover:border-brand-400'}`}>{timeLabel(t)}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="w-full lg:w-[380px]" aria-label="Your hourly booking">
          <div className="bg-white p-6 rounded-2xl shadow-xl border border-gray-100 lg:sticky lg:top-32">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Hourglass size={18} className="text-brand-700" aria-hidden="true" /> Your hourly stay</h2>
            {room && start ? (
              <div className="mt-3 rounded-xl border border-gray-200 p-3 text-sm">
                <p className="font-semibold text-gray-900">{room.name}</p>
                <p className="text-gray-700">{new Date(`${date}T06:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} · {timeLabel(start)} – {timeLabel(addHours(start, hours))}</p>
                <p className="text-gray-500">{hours} hours · {guests} guest{guests > 1 ? 's' : ''}</p>
              </div>
            ) : <p className="mt-3 text-sm text-amber-800 bg-amber-50 px-3 py-2 rounded-lg">Choose a room and a check-in time.</p>}
            {quote ? (
              <div className="mt-4 bg-gray-50 rounded-xl p-4 text-sm space-y-2 tabular-nums">
                <div className="flex justify-between text-gray-600"><span>{hours} hours</span><span>{inr(quote.roomPrice)}</span></div>
                {quote.promotionDiscountAmount > 0 && <div className="flex justify-between text-green-700 font-medium"><span>{quote.promotion?.name || 'Offer'}</span><span>− {inr(quote.promotionDiscountAmount)}</span></div>}
                {quote.memberDiscountAmount > 0 && <div className="flex justify-between text-green-700 font-medium"><span>Member price</span><span>− {inr(quote.memberDiscountAmount)}</span></div>}
                <div className="flex justify-between text-gray-600"><span>GST ({quote.taxPercentage}%)</span><span>{inr(quote.taxAmount)}</span></div>
                <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-200"><span>Total</span><span>{inr(quote.totalAmount)}</span></div>
              </div>
            ) : room && start && !error ? <div className="mt-4 h-24 bg-gray-50 rounded-xl animate-pulse" aria-busy="true" /> : null}
            {error && <p role="alert" className="mt-3 text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            <button type="button" onClick={book} disabled={!quote || !quote.available}
              className="mt-4 w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-4 rounded-xl text-lg disabled:opacity-50 disabled:cursor-not-allowed">
              {quote ? `Book now · ${inr(quote.totalAmount)}` : 'Book now'}
            </button>
            <p className="text-center text-xs text-gray-500 mt-3 flex items-center justify-center gap-1">
              <ShieldCheck size={12} className="text-green-700" aria-hidden="true" />
              {offer?.settings?.freeCancelHours ? `Free cancellation until ${offer.settings.freeCancelHours} hour${offer.settings.freeCancelHours === 1 ? '' : 's'} before check-in` : 'Non-refundable once booked'}
            </p>
            <p className="text-center text-xs text-gray-500 mt-1">Pay online to confirm. Carry a photo ID for every guest.</p>
          </div>
        </aside>
      </div>
    </section>
  );
};

export default HourlyBooking;
