import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Listing from './Listing';
import NotFound from './NotFound';
import { apiFetch } from '../services/api';

const API = import.meta.env.VITE_API_URL || '/api/v1';

/**
 * City and area pages: /hotels-in-bengaluru, /hotels-in-marathahalli-bengaluru. The hotel list
 * for that place (the search results page, with its filters and map), with an intro and common
 * questions. Search engines get the same content filled in by the server (seoService).
 */
const PlaceLanding = () => {
  // (React Router can't match "hotels-in-:place" inside one segment, so the address is read here)
  const slug = (/^\/hotels-in-([a-z0-9-]+)\/?$/.exec(useLocation().pathname) || [])[1];
  const [place, setPlace] = useState(undefined);
  useEffect(() => {
    let live = true;
    setPlace(undefined);
    if (!slug) { setPlace(null); return undefined; }
    apiFetch(`${API}/public/places/${encodeURIComponent(slug)}`, {}, 0).then((r) => live && setPlace(r?.data || null)).catch(() => live && setPlace(null));
    return () => { live = false; };
  }, [slug]);
  if (place === undefined) return <div className="pt-24 min-h-screen bg-gray-50" aria-busy="true" />;
  if (!place) return <NotFound />;
  return <Listing key={slug} place={place} />;
};

export default PlaceLanding;
