import { useState } from 'react';
import { Clock, Building2, Star, DoorOpen, CalendarDays, CheckCircle2 } from 'lucide-react';

/** Overview: key facts, the description (with "Read more") and top amenities (highlights are under the name). */
const fmtTime = (t) => {
  if (!t) return null;
  const [h, m] = String(t).split(':').map(Number);
  if (Number.isNaN(h)) return t;
  return new Date(2000, 0, 1, h, m || 0).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
};
const cap = (s) => String(s || '').replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const OverviewSection = ({ hotel, stars }) => {
  const [more, setMore] = useState(false);
  const rooms = (hotel.roomTypes || []).reduce((n, rt) => n + (Number(rt.totalInventory) || 0), 0);
  const facts = [
    [Clock, 'Check-in / check-out', `${fmtTime(hotel.checkInTime || '14:00')} / ${fmtTime(hotel.checkOutTime || '11:00')}`],
    hotel.type && [Building2, 'Property type', cap(hotel.type)],
    stars > 0 && [Star, 'Star category', `${stars}-star`],
    rooms > 0 && [DoorOpen, 'Rooms', String(rooms)],
    hotel.builtYear && [CalendarDays, 'Built', String(hotel.builtYear)],
  ].filter(Boolean);
  const desc = String(hotel.description || '').trim();
  const long = desc.length > 420;
  const amenities = (hotel.amenities || []).filter(Boolean).map((a) => String(a).split(':')[0]);

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {facts.map(([Icon, label, value]) => (
          <div key={label} className="rounded-xl border border-gray-200 p-3">
            <dt className="flex items-center gap-1.5 text-xs font-semibold text-gray-500"><Icon size={14} aria-hidden="true" /> {label}</dt>
            <dd className="mt-1 font-bold text-gray-900">{value}</dd>
          </div>
        ))}
      </dl>
      {desc && (
        <div>
          <h3 className="font-bold text-gray-900 mb-2">About this property</h3>
          <p className={`text-gray-600 leading-relaxed whitespace-pre-line ${long && !more ? 'line-clamp-5' : ''}`}>{desc}</p>
          {long && <button type="button" onClick={() => setMore((m) => !m)} className="mt-1 text-sm font-bold text-brand-700">{more ? 'Show less' : 'Read more'}</button>}
        </div>
      )}
      {amenities.length > 0 && (
        <div>
          <h3 className="font-bold text-gray-900 mb-3">Popular amenities</h3>
          <ul className="grid grid-cols-2 md:grid-cols-3 gap-y-2.5 gap-x-6">
            {amenities.slice(0, 6).map((a) => <li key={a} className="flex items-center gap-2 text-sm text-gray-700"><CheckCircle2 size={16} className="text-brand-500 shrink-0" aria-hidden="true" /> {a}</li>)}
          </ul>
          {amenities.length > 6 && <a href="#amenities" className="inline-block mt-3 text-sm font-bold text-brand-700">See all {amenities.length} amenities</a>}
        </div>
      )}
    </div>
  );
};

export default OverviewSection;
