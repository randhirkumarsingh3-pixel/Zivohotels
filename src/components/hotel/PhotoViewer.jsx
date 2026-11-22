import { useCallback, useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { getImageUrl } from '../../utils/image';

/**
 * Full-screen photo viewer: next / previous (buttons, arrow keys, swipe), thumbnails, and zoom
 * (click or tap the photo, or the zoom button; move the mouse or drag to look around).
 * photos: [{ url, label? }]. Optional category filters from the photos' labels.
 */
const PhotoViewer = ({ photos, start = 0, title, onClose, filters = true }) => {
  const [filter, setFilter] = useState('All');
  const [index, setIndex] = useState(start);
  const [zoom, setZoom] = useState(false);
  const [origin, setOrigin] = useState('50% 50%');
  const touch = useRef(null);

  const labels = ['All', ...new Set(photos.map((p) => p.label).filter(Boolean))];
  const shown = filter === 'All' ? photos : photos.filter((p) => p.label === filter);
  const current = shown[Math.min(index, shown.length - 1)];

  const move = useCallback((d) => { setZoom(false); setIndex((i) => (i + d + shown.length) % shown.length); }, [shown.length]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') move(1);
      if (e.key === 'ArrowLeft') move(-1);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [move, onClose]);

  const aim = (clientX, clientY, el) => {
    const r = el.getBoundingClientRect();
    setOrigin(`${Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100))}% ${Math.min(100, Math.max(0, ((clientY - r.top) / r.height) * 100))}%`);
  };

  const onTouchStart = (e) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY, moved: false }; };
  const onTouchMove = (e) => {
    const t = e.touches[0];
    if (!touch.current) return;
    touch.current.moved = Math.abs(t.clientX - touch.current.x) > 10 || Math.abs(t.clientY - touch.current.y) > 10;
    if (zoom) aim(t.clientX, t.clientY, e.currentTarget);
  };
  const onTouchEnd = (e) => {
    const s = touch.current;
    touch.current = null;
    if (!s || zoom) return;
    const dx = (e.changedTouches[0]?.clientX ?? s.x) - s.x;
    if (Math.abs(dx) > 50) move(dx < 0 ? 1 : -1);
  };

  if (!current) return null;
  const pos = shown.indexOf(current);

  return (
    <div className="fixed inset-0 z-[300] bg-black flex flex-col" role="dialog" aria-modal="true" aria-label={`${title} photos`}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <div className="flex gap-2 overflow-x-auto min-w-0">
          {filters && labels.length > 2 ? labels.map((l) => (
            <button key={l} type="button" onClick={() => { setFilter(l); setIndex(0); setZoom(false); }}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold ${filter === l ? 'bg-white text-gray-900' : 'bg-white/10 hover:bg-white/20'}`}>
              {l === 'All' ? `All (${photos.length})` : l}
            </button>
          )) : <p className="text-sm font-semibold truncate">{title}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" aria-label={zoom ? 'Zoom out' : 'Zoom in'} onClick={() => setZoom((z) => !z)} className="p-2 rounded-full hover:bg-white/10">{zoom ? <ZoomOut size={22} /> : <ZoomIn size={22} />}</button>
          <button type="button" aria-label="Close photos" onClick={onClose} className="p-2 rounded-full hover:bg-white/10"><X size={22} /></button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center relative px-4 min-h-0 overflow-hidden">
        {shown.length > 1 && (
          <button type="button" aria-label="Previous photo" onClick={() => move(-1)} className="absolute left-2 sm:left-4 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white"><ChevronLeft size={24} /></button>
        )}
        <div
          className={`max-h-full max-w-full overflow-hidden rounded-lg ${zoom ? 'cursor-zoom-out' : 'cursor-zoom-in'}`}
          onClick={(e) => { aim(e.clientX, e.clientY, e.currentTarget); setZoom((z) => !z); }}
          onMouseMove={(e) => zoom && aim(e.clientX, e.clientY, e.currentTarget)}
          onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        >
          <img
            key={current.url}
            src={getImageUrl(current.url, 1600)}
            alt={current.label || title}
            className="block max-h-[calc(100vh-220px)] max-w-full object-contain select-none transition-transform duration-200"
            style={{ transform: zoom ? 'scale(2.2)' : 'scale(1)', transformOrigin: origin }}
            draggable={false}
          />
        </div>
        {shown.length > 1 && (
          <button type="button" aria-label="Next photo" onClick={() => move(1)} className="absolute right-2 sm:right-4 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white"><ChevronRight size={24} /></button>
        )}
      </div>

      <div className="text-center text-white/80 text-sm py-2">{current.label ? `${current.label} · ` : ''}{pos + 1} / {shown.length}{!zoom ? ' · tap the photo to zoom' : ''}</div>
      <div className="flex gap-2 overflow-x-auto px-4 pb-4 justify-start sm:justify-center">
        {shown.map((p, i) => (
          <button key={p.url + i} type="button" onClick={() => { setIndex(i); setZoom(false); }} aria-label={`Photo ${i + 1}`}
            className={`shrink-0 w-20 h-14 rounded-md overflow-hidden border-2 ${i === pos ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'}`}>
            <img src={getImageUrl(p.url, 400)} alt="" className="w-full h-full object-cover" loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  );
};

export default PhotoViewer;
