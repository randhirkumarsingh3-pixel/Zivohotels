import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, MapPin, Star, Gauge, Mail, ArrowRight } from 'lucide-react';
import { scoreTone, EDIT_SECTIONS, editLink } from './propertySections';

/**
 * Top of the property pages: which property this is, how guests rate it, how complete its listing
 * is, and a menu that opens any part of the listing editor directly.
 */

/** A ring that fills to the score (0-100). */
export const ScoreRing = ({ score = 0, size = 56, stroke = 6, label = true }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tone = scoreTone(score);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Content score ${score} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone.ring} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(100, score)) / 100)} style={{ transition: 'stroke-dashoffset .6s ease' }} />
      </svg>
      {label && <span className={`absolute inset-0 flex items-center justify-center font-bold ${size >= 80 ? 'text-2xl' : 'text-sm'} text-gray-900`}>{score}</span>}
    </div>
  );
};

const STATUS = {
  LIVE: ['Live', 'bg-green-50 text-green-800 border-green-200'],
  ACTIVE: ['Live', 'bg-green-50 text-green-800 border-green-200'],
  DRAFT: ['Draft', 'bg-gray-50 text-gray-700 border-gray-200'],
  IN_REVIEW: ['In review', 'bg-blue-50 text-blue-800 border-blue-200'],
  SUBMITTED: ['In review', 'bg-blue-50 text-blue-800 border-blue-200'],
  INFORMATION_REQUESTED: ['Changes requested', 'bg-amber-50 text-amber-900 border-amber-200'],
};

const PropertyHeader = ({ overview, isOwner = true }) => {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  if (!overview) return <div className="h-24 rounded-card bg-white border border-gray-200 animate-pulse" aria-hidden="true" />;
  const { hotel, rating, content } = overview;
  const [statusLabel, statusClass] = STATUS[hotel.status] || [String(hotel.status || '').replace(/_/g, ' ').toLowerCase(), 'bg-gray-50 text-gray-700 border-gray-200'];
  const tone = scoreTone(content.score);
  const sections = EDIT_SECTIONS.filter((s) => !s.owner || isOwner);

  return (
    <div className="bg-white rounded-card border border-gray-200 shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-stretch">
        {/* Which property, with the section menu */}
        <div ref={boxRef} className="relative flex-1 min-w-0 p-4 sm:p-5">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu"
            className="group flex items-start gap-2 text-left max-w-full">
            <span className="min-w-0">
              <span className="flex items-center gap-2 flex-wrap">
                <span className="text-lg sm:text-xl font-bold text-gray-900 truncate">{hotel.name}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${statusClass}`}>{statusLabel}</span>
              </span>
              <span className="mt-1 flex items-center gap-1.5 text-sm text-gray-600 flex-wrap">
                {hotel.stars ? <span className="flex items-center gap-0.5" aria-label={`${hotel.stars} star`}>{Array.from({ length: hotel.stars }).map((_, i) => <Star key={i} size={12} className="fill-amber-400 text-amber-400" aria-hidden="true" />)}</span> : null}
                <span>{hotel.type}</span>
                <span aria-hidden="true">·</span>
                <MapPin size={13} className="text-gray-400" aria-hidden="true" />
                <span>{[hotel.area, hotel.city].filter(Boolean).join(', ')}</span>
              </span>
            </span>
            <span className="mt-1 shrink-0 flex items-center gap-1 text-xs font-semibold text-navy-700 bg-navy-50 group-hover:bg-navy-100 rounded-full px-2.5 py-1">
              Edit <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
            </span>
          </button>

          {open && (
            <div role="menu" className="absolute left-4 right-4 sm:right-auto sm:w-80 top-full -mt-1 z-30 bg-white rounded-xl border border-gray-200 shadow-xl p-2">
              <p className="px-3 pt-1 pb-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Edit a part of your listing</p>
              {sections.map((s) => {
                const sec = content.sections.find((x) => x.key === s.key);
                return (
                  <Link key={s.key} role="menuitem" to={editLink(hotel.id, s.key)} onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 focus:bg-gray-50 outline-none">
                    <s.icon size={16} className="text-navy-700" aria-hidden="true" />
                    <span className="flex-1 text-sm text-gray-800">{s.label}</span>
                    {sec && <span className={`text-xs font-semibold ${sec.score === sec.max ? 'text-green-700' : 'text-gray-500'}`}>{sec.score}/{sec.max}</span>}
                  </Link>
                );
              })}
              <div className="my-1 border-t border-gray-100" />
              <Link role="menuitem" to="/extranet/property/score" onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50">
                <Gauge size={16} className="text-navy-700" aria-hidden="true" /><span className="flex-1 text-sm text-gray-800">Content score & tips</span>
              </Link>
              <Link role="menuitem" to="/extranet/settings" onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50">
                <Mail size={16} className="text-navy-700" aria-hidden="true" /><span className="flex-1 text-sm text-gray-800">Booking emails & settings</span>
              </Link>
            </div>
          )}
        </div>

        {/* Guest rating (ZivoPlus reviews) */}
        <Link to="/extranet/reviews" className="flex items-center gap-3 px-4 sm:px-5 py-3 lg:py-0 border-t lg:border-t-0 lg:border-l border-gray-100 hover:bg-gray-50">
          <span className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center"><Star size={18} className="fill-amber-400 text-amber-400" aria-hidden="true" /></span>
          <span>
            <span className="block text-xs text-gray-500">Guest rating</span>
            {rating.score != null
              ? <span className="block text-gray-900"><b className="text-lg">{rating.score.toFixed(1)}</b><span className="text-sm text-gray-500">/5 · {rating.count} review{rating.count === 1 ? '' : 's'}</span></span>
              : <span className="block text-sm font-semibold text-gray-700">No reviews yet</span>}
          </span>
        </Link>

        {/* Content score */}
        <Link to="/extranet/property/score" className="flex items-center gap-3 px-4 sm:px-5 py-3 lg:py-0 border-t lg:border-t-0 lg:border-l border-gray-100 hover:bg-gray-50 rounded-b-card lg:rounded-r-card lg:rounded-bl-none">
          <ScoreRing score={content.score} size={48} stroke={5} />
          <span>
            <span className="block text-xs text-gray-500">Content score</span>
            <span className={`block text-sm font-semibold ${tone.text}`}>{content.label}</span>
            <span className="flex items-center gap-1 text-xs text-navy-700 font-semibold">See tips <ArrowRight size={12} aria-hidden="true" /></span>
          </span>
        </Link>
      </div>
    </div>
  );
};

export default PropertyHeader;
