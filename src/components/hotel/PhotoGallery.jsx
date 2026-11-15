import { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Images } from 'lucide-react';
import { getImageUrl } from '../../utils/image';

/**
 * Hotel photos: a grid of the first five (primary first) and a full-screen viewer with every
 * photo, filterable by the tags the property gave them at onboarding (Exterior, Lobby, rooms...).
 * photos: [{ url, label }] where label is the tag / room name shown in the viewer.
 */
const Tile = ({ src, alt, className = '', onClick }) => {
  const [failed, setFailed] = useState(false);
  return (
    <button type="button" onClick={onClick} className={`relative overflow-hidden bg-gray-100 group ${className}`} aria-label={`Open photo: ${alt}`}>
      {!failed && (
        <img src={getImageUrl(src)} alt={alt} onError={() => setFailed(true)} loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
      )}
    </button>
  );
};

const PhotoGallery = ({ hotelName, photos }) => {
  const [open, setOpen] = useState(null); // index in the filtered list, or null
  const [filter, setFilter] = useState('All');

  const labels = ['All', ...[...new Set(photos.map((p) => p.label).filter(Boolean))]];
  const shown = filter === 'All' ? photos : photos.filter((p) => p.label === filter);

  const close = useCallback(() => setOpen(null), []);
  const move = useCallback((d) => setOpen((i) => (i === null ? i : (i + d + shown.length) % shown.length)), [shown.length]);
  useEffect(() => {
    if (open === null) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') move(1); if (e.key === 'ArrowLeft') move(-1); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, close, move]);

  if (photos.length === 0) {
    return <div className="h-[30vh] rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400 text-sm">Photos coming soon</div>;
  }

  const openAt = (i) => { setFilter('All'); setOpen(i); };
  const grid = photos.slice(0, 5);

  return (
    <>
      <div className="relative">
        <div className={`grid grid-cols-1 ${grid.length > 1 ? 'md:grid-cols-4 md:grid-rows-2' : ''} gap-2 h-[40vh] md:h-[56vh] rounded-2xl overflow-hidden`}>
          <Tile src={grid[0].url} alt={hotelName} onClick={() => openAt(0)} className={grid.length > 1 ? 'md:col-span-2 md:row-span-2' : 'h-full'} />
          {grid.slice(1).map((p, i) => (
            <Tile key={p.url + i} src={p.url} alt={`${hotelName}: ${p.label || `photo ${i + 2}`}`} onClick={() => openAt(i + 1)}
              className={`hidden md:block ${grid.length === 2 ? 'md:col-span-2 md:row-span-2' : grid.length === 3 ? 'md:col-span-2' : grid.length === 4 && i === 2 ? 'md:col-span-2' : ''}`} />
          ))}
        </div>
        <button type="button" onClick={() => openAt(0)} className="absolute bottom-4 right-4 flex items-center gap-2 bg-white/95 hover:bg-white text-gray-900 text-sm font-bold px-4 py-2 rounded-xl shadow-lg">
          <Images size={16} /> {photos.length === 1 ? 'View photo' : `View all ${photos.length} photos`}
        </button>
      </div>

      {open !== null && shown[open] && (
        <div className="fixed inset-0 z-[300] bg-black flex flex-col" role="dialog" aria-modal="true" aria-label={`${hotelName} photos`}>
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
            <div className="flex gap-2 overflow-x-auto">
              {labels.length > 2 && labels.map((l) => (
                <button key={l} type="button" onClick={() => { setFilter(l); setOpen(0); }}
                  className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold ${filter === l ? 'bg-white text-gray-900' : 'bg-white/10 hover:bg-white/20'}`}>
                  {l === 'All' ? `All (${photos.length})` : l}
                </button>
              ))}
            </div>
            <button type="button" aria-label="Close photos" onClick={close} className="p-2 rounded-full hover:bg-white/10"><X size={22} /></button>
          </div>
          <div className="flex-1 flex items-center justify-center relative px-4 min-h-0">
            {shown.length > 1 && (
              <button type="button" aria-label="Previous photo" onClick={() => move(-1)} className="absolute left-4 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white"><ChevronLeft size={24} /></button>
            )}
            <img src={getImageUrl(shown[open].url)} alt={shown[open].label || hotelName} className="max-h-full max-w-full object-contain rounded-lg" />
            {shown.length > 1 && (
              <button type="button" aria-label="Next photo" onClick={() => move(1)} className="absolute right-4 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white"><ChevronRight size={24} /></button>
            )}
          </div>
          <div className="text-center text-white/80 text-sm py-2">{shown[open].label ? `${shown[open].label} · ` : ''}{open + 1} / {shown.length}</div>
          <div className="flex gap-2 overflow-x-auto px-4 pb-4 justify-center">
            {shown.map((p, i) => (
              <button key={p.url + i} type="button" onClick={() => setOpen(i)} aria-label={`Photo ${i + 1}`}
                className={`shrink-0 w-20 h-14 rounded-md overflow-hidden border-2 ${i === open ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'}`}>
                <img src={getImageUrl(p.url)} alt="" className="w-full h-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

export default PhotoGallery;
