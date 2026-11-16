import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LocateFixed, History, Loader2, MapPin } from 'lucide-react';
import { cityLink, defaultStay } from './searchLinks';

/**
 * Under the home search bar: "Near me", the visitor's recent searches (saved in this browser by
 * the search box) and popular cities with their live hotel counts. One tap runs the search for
 * tonight; dates can be changed on the results page.
 */
const chip = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-colors whitespace-nowrap';

const QuickChips = ({ cities = [] }) => {
  const navigate = useNavigate();
  const [recent, setRecent] = useState([]);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    try { setRecent((JSON.parse(localStorage.getItem('zivo_recent_searches') || '[]') || []).filter((r) => r && r.value !== 'nearby' && r.type !== 'near').slice(0, 3)); } catch { setRecent([]); }
  }, []);

  const go = (item) => {
    if (item.type === 'hotel' && item.id) {
      const { checkin, checkout } = defaultStay();
      navigate(`/hotel/${item.id}?${new URLSearchParams({ checkin, checkout, guests: '2', rooms: '1' })}`);
    } else navigate(cityLink(item.value || item.label));
  };

  // Hotels within 50 km of the visitor, nearest first (the results page says if there are none)
  const nearMe = () => {
    if (!navigator.geolocation) { setNote('Your browser can’t share your location.'); return; }
    setLocating(true); setNote('');
    navigator.geolocation.getCurrentPosition((pos) => {
      setLocating(false);
      const { checkin, checkout } = defaultStay();
      const { latitude, longitude } = pos.coords;
      navigate(`/hotels?${new URLSearchParams({ lat: latitude.toFixed(5), lng: longitude.toFixed(5), checkin, checkout, guests: '2', rooms: '1' })}`);
    }, () => { setLocating(false); setNote('Allow location access to search near you.'); }, { timeout: 10000, maximumAge: 300000 });
  };

  const recentKeys = new Set(recent.map((r) => String(r.value || r.label).toLowerCase()));
  const popular = cities.filter((c) => !recentKeys.has(c.name.toLowerCase())).slice(0, 6);

  return (
    <div className="mt-6 w-full max-w-4xl">
      <div className="flex gap-2 overflow-x-auto pb-1 justify-start md:justify-center md:flex-wrap" aria-label="Quick searches">
        <button type="button" onClick={nearMe} disabled={locating} className={`${chip} bg-white/20`}>
          {locating ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <LocateFixed size={15} aria-hidden="true" />} Near me
        </button>
        {recent.map((r) => (
          <button key={`r-${r.type}-${r.value || r.label}`} type="button" onClick={() => go(r)} className={chip} title="Recent search">
            <History size={15} aria-hidden="true" /> {r.label}
          </button>
        ))}
        {popular.map((c) => (
          <button key={c.name} type="button" onClick={() => navigate(cityLink(c.name))} className={chip}>
            <MapPin size={15} aria-hidden="true" /> {c.name} <span className="text-white/70">· {c.count}</span>
          </button>
        ))}
      </div>
      {note && <p role="status" className="mt-2 text-sm text-white/90 text-center">{note}</p>}
    </div>
  );
};

export default QuickChips;
