import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Tag, Copy, Check, Crown } from 'lucide-react';
import { defaultStay } from './searchLinks';

/**
 * Live offers from the promotion engine: automatic deals and promo codes, with their conditions.
 * Hidden when there are none. A hotel's own offer links to that hotel; platform offers to search.
 */
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const date = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : null);

const OfferCard = ({ o }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(o.code); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the code is visible to type */ }
  };
  const terms = [
    o.minBookingAmount && `On bookings over ${inr(o.minBookingAmount)}`,
    o.maxDiscount && o.label.includes('%') && `Up to ${inr(o.maxDiscount)} off`,
    o.minNights && `Stays of ${o.minNights}+ nights`,
    o.firstBookingOnly && 'First booking only',
    o.stayStart && o.stayEnd && `Stays ${date(o.stayStart)}–${date(o.stayEnd)}`,
    o.bookEnd && `Book by ${date(o.bookEnd)}`,
  ].filter(Boolean);
  const { checkin, checkout } = defaultStay();
  const href = o.hotelId ? `/hotel/${o.hotelId}?${new URLSearchParams({ checkin, checkout, guests: '2', rooms: '1' })}` : '/hotels';

  return (
    <article className="w-[280px] sm:w-[320px] shrink-0 snap-start bg-white rounded-card border border-gray-200 p-5 flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <p className="text-2xl font-bold text-brand-700">{o.label}</p>
        {o.audience !== 'ALL' && <span className="inline-flex items-center gap-1 text-xs font-semibold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md"><Crown size={12} aria-hidden="true" /> {o.audience === 'MEMBERS' ? 'Members' : o.audience}</span>}
      </div>
      <h3 className="font-bold text-gray-900 mt-1">{o.name}</h3>
      <p className="text-sm text-gray-600 mt-1">{o.hotelName ? `At ${o.hotelName}` : o.scope}{o.description ? ` · ${o.description}` : ''}</p>
      {terms.length > 0 && <ul className="mt-2 text-xs text-gray-600 space-y-0.5">{terms.map((t) => <li key={t}>{t}</li>)}</ul>}
      <div className="mt-auto pt-4 flex items-center justify-between gap-3">
        {o.code ? (
          <button type="button" onClick={copy} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-dashed border-navy-300 bg-navy-50 text-navy-900 font-mono text-sm font-bold" aria-label={`Copy code ${o.code}`}>
            {o.code} {copied ? <Check size={14} className="text-green-700" aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          </button>
        ) : <span className="text-xs font-semibold text-green-800 bg-green-50 px-2 py-1 rounded-md">Applied automatically</span>}
        <Link to={href} className="text-sm font-semibold text-navy-700 hover:underline whitespace-nowrap">{o.hotelId ? 'See hotel' : 'Find hotels'}</Link>
      </div>
    </article>
  );
};

const OffersCarousel = ({ offers = [] }) => {
  if (!offers.length) return null;
  return (
    <section className="py-12 bg-white" aria-labelledby="offers-heading">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 id="offers-heading" className="flex items-center gap-2 text-2xl font-bold text-navy-900 mb-1"><Tag size={22} className="text-brand-600" aria-hidden="true" /> Offers for you</h2>
        <p className="text-gray-600 mb-5">Automatic deals are applied at checkout; enter a code in the promo box.</p>
        <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
          {offers.map((o) => <OfferCard key={o.id} o={o} />)}
        </div>
      </div>
    </section>
  );
};

export default OffersCarousel;
