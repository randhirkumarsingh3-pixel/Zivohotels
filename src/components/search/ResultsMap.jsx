import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Search results on a map (OpenStreetMap via Leaflet, the same library the onboarding location step
 * loads). Each hotel with a map pin gets a price marker; clicking it shows the hotel with a link.
 */
let leafletPromise = null;
const loadLeaflet = () => {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css'; link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    const existing = document.getElementById('leaflet-js');
    const script = existing || document.createElement('script');
    if (!existing) { script.id = 'leaflet-js'; script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; script.async = true; document.body.appendChild(script); }
    const done = () => (window.L ? resolve(window.L) : reject(new Error('Map failed to load')));
    script.addEventListener('load', done);
    script.addEventListener('error', () => { leafletPromise = null; reject(new Error('Map failed to load')); });
    if (window.L) done();
  });
  return leafletPromise;
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

const ResultsMap = ({ hotels, detailQuery = '', className = '' }) => {
  const boxRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const [state, setState] = useState('loading');
  const pinned = useMemo(() => hotels.filter((h) => Number.isFinite(Number(h.latitude)) && Number.isFinite(Number(h.longitude)) && h.latitude !== null && h.longitude !== null), [hotels]);

  useEffect(() => {
    let alive = true;
    loadLeaflet().then((L) => {
      if (!alive || !boxRef.current) return;
      if (!mapRef.current) {
        mapRef.current = L.map(boxRef.current, { scrollWheelZoom: false }).setView([20.6, 78.9], 5);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap contributors' }).addTo(mapRef.current);
      }
      setState('ready');
    }).catch(() => alive && setState('error'));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const L = window.L;
    const map = mapRef.current;
    if (state !== 'ready' || !L || !map) return;
    if (layerRef.current) layerRef.current.remove();
    const group = L.featureGroup();
    pinned.forEach((h) => {
      const price = h.offer ? h.offer.nightlyPriceAfter : (h.startingPrice || h.price);
      const icon = L.divIcon({
        className: '',
        html: `<span style="display:inline-block;transform:translate(-50%,-100%);background:#013a67;color:#fff;font:600 13px Inter,system-ui,sans-serif;padding:4px 8px;border-radius:8px;box-shadow:0 2px 6px rgba(0,0,0,.25);white-space:nowrap">${price ? inr(price) : esc(h.name)}</span>`,
        iconSize: [0, 0],
      });
      const score = h.reviewCount > 0 ? `<span style="background:#013a67;color:#fff;border-radius:4px;padding:1px 5px;font-weight:700">${esc(h.rating)}</span> ${h.reviewCount} reviews` : 'New';
      L.marker([Number(h.latitude), Number(h.longitude)], { icon, title: h.name, keyboard: true })
        .bindPopup(`<div style="font-family:Inter,system-ui,sans-serif;min-width:180px"><strong style="font-size:14px">${esc(h.name)}</strong><div style="color:#5a6b80;font-size:12px;margin:2px 0 6px">${esc(h.location || h.city || '')}</div><div style="font-size:12px;margin-bottom:6px">${score}</div>${price ? `<div style="font-weight:700;font-size:15px">${inr(price)} <span style="font-weight:400;color:#5a6b80;font-size:12px">/night</span></div>` : ''}<a href="/hotel/${encodeURIComponent(h.id)}${detailQuery}" style="display:inline-block;margin-top:8px;background:#e7194a;color:#fff;padding:6px 12px;border-radius:6px;text-decoration:none;font-weight:600">See hotel</a></div>`)
        .addTo(group);
    });
    group.addTo(map);
    layerRef.current = group;
    if (pinned.length) map.fitBounds(group.getBounds().pad(0.25), { maxZoom: 14 });
    setTimeout(() => map.invalidateSize(), 50);
  }, [state, pinned, detailQuery]);

  useEffect(() => () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } }, []);

  const missing = hotels.length - pinned.length;
  return (
    <div className={`relative rounded-card overflow-hidden border border-gray-200 bg-gray-100 ${className}`}>
      <div ref={boxRef} className="absolute inset-0 z-0" role="region" aria-label="Map of hotels" />
      {state === 'loading' && <div className="absolute inset-0 flex items-center justify-center text-gray-500"><Loader2 className="animate-spin mr-2" size={20} /> Loading map…</div>}
      {state === 'error' && <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-sm px-6 text-center">The map couldn&apos;t load. Check your connection, or use the list.</div>}
      {state === 'ready' && missing > 0 && (
        <p className="absolute bottom-3 left-3 z-[400] bg-white/95 rounded-lg px-3 py-1.5 text-xs text-gray-700 shadow">{missing} hotel{missing === 1 ? ' isn’t' : 's aren’t'} on the map yet</p>
      )}
    </div>
  );
};

export default ResultsMap;
