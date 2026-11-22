import { useState, useCallback } from 'react';
import PhotoViewer from './PhotoViewer';
import { Images } from 'lucide-react';
import { getImageUrl } from '../../utils/image';

/**
 * Hotel photos: a grid of the first five (primary first) and a full-screen viewer with every
 * photo, filterable by the tags the property gave them at onboarding (Exterior, Lobby, rooms...).
 * photos: [{ url, label }] where label is the tag / room name shown in the viewer.
 */
const Tile = ({ src, alt, className = '', onClick, w = 800, first = false }) => {
  const [failed, setFailed] = useState(false);
  return (
    <button type="button" onClick={onClick} className={`relative overflow-hidden bg-gray-100 group ${className}`} aria-label={`Open photo: ${alt}`}>
      {!failed && (
        <img src={getImageUrl(src, w)} alt={alt} onError={() => setFailed(true)} loading={first ? 'eager' : 'lazy'} {...(first ? { fetchpriority: 'high' } : {})} decoding="async"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
      )}
    </button>
  );
};

const PhotoGallery = ({ hotelName, photos }) => {
  const [open, setOpen] = useState(null); // photo index, or null
  const close = useCallback(() => setOpen(null), []);

  if (photos.length === 0) {
    return <div className="h-[200px] rounded-card bg-gray-100 flex items-center justify-center text-gray-400 text-sm">Photos coming soon</div>;
  }

  const openAt = (i) => setOpen(i);
  const grid = photos.slice(0, 5);

  return (
    <>
      <div className="relative">
        <div className={`grid grid-cols-1 ${grid.length > 1 ? 'md:grid-cols-4 md:grid-rows-2' : ''} gap-2 h-[240px] sm:h-[320px] md:h-[440px] rounded-card overflow-hidden`}>
          <Tile src={grid[0].url} alt={hotelName} onClick={() => openAt(0)} w={1600} first className={grid.length > 1 ? 'md:col-span-2 md:row-span-2' : 'h-full'} />
          {grid.slice(1).map((p, i) => (
            <Tile key={p.url + i} src={p.url} alt={`${hotelName}: ${p.label || `photo ${i + 2}`}`} onClick={() => openAt(i + 1)}
              className={`hidden md:block ${grid.length === 2 ? 'md:col-span-2 md:row-span-2' : grid.length === 3 ? 'md:col-span-2' : grid.length === 4 && i === 2 ? 'md:col-span-2' : ''}`} />
          ))}
        </div>
        <button type="button" onClick={() => openAt(0)} className="absolute bottom-4 right-4 flex items-center gap-2 bg-white/95 hover:bg-white text-gray-900 text-sm font-bold px-4 py-2 rounded-xl shadow-lg">
          <Images size={16} /> {photos.length === 1 ? 'View photo' : `View all ${photos.length} photos`}
        </button>
      </div>

      {open !== null && <PhotoViewer photos={photos} start={open} title={hotelName} onClose={close} />}
    </>
  );
};

export default PhotoGallery;
