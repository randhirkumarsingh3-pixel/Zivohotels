import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Heart, Bell, BellOff, Trash2, Loader2, TrendingDown, TrendingUp, MapPin } from 'lucide-react';
import { savedHotelsApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import usePageTitle from '../hooks/usePageTitle';
import { getImageUrl } from '../utils/image';

/**
 * My saved hotels: hotels the guest saved with the heart, today's price for the dates they saved
 * against the price when they saved it, and price-drop emails on or off for each.
 */
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const day = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

const SavedHotels = () => {
  usePageTitle('My saved hotels');
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [list, setList] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => { if (isAuthenticated) savedHotelsApi.list().then(setList).catch((e) => setMsg(e.message)); }, [isAuthenticated]);
  if (!authLoading && !isAuthenticated) return <Navigate to="/login" state={{ from: { pathname: '/saved' } }} replace />;

  const toggleAlerts = async (s) => {
    setBusy(s.hotelId);
    try { const u = await savedHotelsApi.alerts(s.hotelId, !s.alerts); setList((l) => l.map((x) => (x.hotelId === s.hotelId ? { ...x, alerts: u.alerts } : x))); } catch (e) { setMsg(e.message); } finally { setBusy(''); }
  };
  const remove = async (s) => {
    setBusy(s.hotelId);
    try { await savedHotelsApi.remove(s.hotelId); setList((l) => l.filter((x) => x.hotelId !== s.hotelId)); } catch (e) { setMsg(e.message); } finally { setBusy(''); }
  };

  return (
    <div className="pt-24 pb-16 bg-gray-50 min-h-screen">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <h1 className="text-2xl md:text-3xl font-bold text-navy-900 flex items-center gap-2"><Heart className="text-brand-600 fill-brand-600" size={26} aria-hidden="true" /> My saved hotels</h1>
        <p className="text-gray-600 mt-1">Saved with your dates? We check the price a few times a day and email you when it drops.</p>
        {msg && <p role="alert" className="mt-4 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{msg}</p>}
        {list === null ? (
          <p className="mt-10 flex items-center gap-2 text-gray-500"><Loader2 className="animate-spin" size={18} /> Loading…</p>
        ) : list.length === 0 ? (
          <div className="mt-10 bg-white rounded-2xl border border-gray-200 p-8 text-center">
            <Heart className="mx-auto text-gray-300" size={40} aria-hidden="true" />
            <p className="mt-3 font-semibold text-gray-900">No saved hotels yet</p>
            <p className="text-sm text-gray-600 mt-1">Tap the heart on any hotel to keep it here, with price-drop alerts for your dates.</p>
            <Link to="/hotels" className="inline-block mt-4 px-5 py-2.5 rounded-full bg-brand-600 text-white font-semibold">Find hotels</Link>
          </div>
        ) : (
          <ul className="mt-6 space-y-4">
            {list.map((s) => {
              const dated = s.checkIn && s.checkOut && !s.datesPassed;
              const diff = dated && s.priceNow != null && s.savedPrice != null ? Math.round(s.priceNow - s.savedPrice) : null;
              const link = `/hotel/${s.hotel.slug}${dated ? `?checkin=${s.checkIn}&checkout=${s.checkOut}&guests=${s.adults}&rooms=${s.rooms}` : ''}`;
              return (
                <li key={s.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden flex flex-col sm:flex-row">
                  <Link to={link} className="sm:w-56 h-40 sm:h-auto bg-gray-100 shrink-0 block">
                    {s.hotel.image && <img src={getImageUrl(s.hotel.image, 600)} alt="" className="w-full h-full object-cover" loading="lazy" />}
                  </Link>
                  <div className="flex-1 p-4 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Link to={link} className="font-bold text-gray-900 hover:text-navy-800">{s.hotel.name}</Link>
                        <p className="text-sm text-gray-600 flex items-center gap-1"><MapPin size={14} aria-hidden="true" />{[s.hotel.area, s.hotel.city].filter(Boolean).join(', ')}</p>
                      </div>
                      {s.hotel.reviewCount > 0 && <span className="text-xs font-bold bg-navy-800 text-white rounded-md px-2 py-1">{Number(s.hotel.reviewScore).toFixed(1)}</span>}
                    </div>
                    {!s.hotel.bookable ? <p className="text-sm text-gray-600">This hotel isn&apos;t taking bookings on ZivoPlus right now.</p>
                      : dated ? (
                        <div className="text-sm">
                          <p className="text-gray-700">{day(s.checkIn)} → {day(s.checkOut)} · {s.adults} adult{s.adults === 1 ? '' : 's'}, {s.rooms} room{s.rooms === 1 ? '' : 's'}</p>
                          {s.priceNow == null ? <p className="text-amber-800 mt-1">Sold out for these dates right now.</p> : (
                            <p className="mt-1 flex flex-wrap items-center gap-x-2">
                              <span className="text-lg font-bold text-gray-900">{inr(s.priceNow)}</span>
                              <span className="text-gray-500">total, GST included</span>
                              {diff != null && diff !== 0 && (
                                <span className={`inline-flex items-center gap-1 text-xs font-semibold ${diff < 0 ? 'text-green-800' : 'text-gray-600'}`}>
                                  {diff < 0 ? <TrendingDown size={14} aria-hidden="true" /> : <TrendingUp size={14} aria-hidden="true" />}
                                  {inr(Math.abs(diff))} {diff < 0 ? 'less' : 'more'} than when you saved it
                                </span>
                              )}
                            </p>
                          )}
                        </div>
                      ) : <p className="text-sm text-gray-600">{s.datesPassed ? 'Your dates have passed.' : 'No dates saved.'} Open the hotel and save it again with dates to get price alerts.</p>}
                    <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                      <Link to={link} className="px-4 py-2 rounded-full bg-navy-800 text-white text-sm font-semibold">See rooms</Link>
                      {dated && (
                        <button type="button" onClick={() => toggleAlerts(s)} disabled={busy === s.hotelId} aria-pressed={s.alerts} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-gray-300 text-sm font-semibold text-gray-800">
                          {s.alerts ? <><Bell size={15} aria-hidden="true" /> Price alerts on</> : <><BellOff size={15} aria-hidden="true" /> Price alerts off</>}
                        </button>
                      )}
                      <button type="button" onClick={() => remove(s)} disabled={busy === s.hotelId} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold text-gray-600 hover:text-red-700">
                        <Trash2 size={15} aria-hidden="true" /> Remove
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default SavedHotels;
