import { BedDouble, ShieldCheck, Check, Ruler, Eye, Users, Images } from 'lucide-react';
import { getImageUrl } from '../../utils/image';
import { MEAL_LABELS, nightlyPrice, offerPrice, offerDiscount, fmt } from './ratePlans';

/**
 * One room type on the hotel page: photo and facts on top, then every rate plan as a row with
 * its meals, cancellation, price per night, total for the stay and a Select button. Nothing is
 * collapsed: guests compare plans at a glance.
 */
const Fact = ({ icon: Icon, children }) => (
  <span className="inline-flex items-center gap-1.5 text-sm text-gray-600"><Icon size={15} className="text-gray-400" aria-hidden="true" /> {children}</span>
);

const RatePlanRow = ({ plan, nights, selected, disabled, onSelect }) => {
  const perNight = nightlyPrice(plan);
  const total = perNight * nights;
  const totalAfter = plan.offer ? total - offerDiscount(plan.offer, total) : total;
  const meal = MEAL_LABELS[plan.mealPlan] || MEAL_LABELS.NONE;
  const freeCancel = /free/i.test(plan.cancellationPolicy || '');
  return (
    <li className={`flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-4 ${selected ? 'bg-brand-50/60' : ''}`}>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900">{plan.name}</p>
        <p className="text-sm text-gray-700 mt-0.5">{meal}</p>
        {plan.cancellationPolicy && (
          <p className={`text-xs mt-1 flex items-center gap-1 ${freeCancel ? 'text-green-700' : 'text-gray-500'}`}>
            <ShieldCheck size={13} aria-hidden="true" /> {plan.cancellationPolicy}
          </p>
        )}
        {plan.offer && (
          <p className="mt-1.5 inline-flex px-2 py-0.5 rounded-md bg-green-50 border border-green-200 text-green-700 text-xs font-bold">{plan.offer.label} · {plan.offer.name}</p>
        )}
      </div>
      <div className="flex sm:flex-col items-end sm:items-end justify-between gap-2 sm:gap-1 shrink-0 sm:text-right">
        <div className="text-right">
          {plan.offer && <p className="text-xs text-gray-400 line-through tabular-nums">{fmt(perNight)}</p>}
          <p className="text-xl font-bold text-gray-900 tabular-nums">{fmt(offerPrice(plan))}<span className="text-xs font-normal text-gray-500"> /night</span></p>
          {nights > 1 && <p className="text-xs text-gray-500 tabular-nums">{fmt(totalAfter)} for {nights} nights</p>}
          <p className="text-[11px] text-gray-400">+ GST</p>
        </div>
        <button
          type="button" onClick={() => onSelect(plan)} disabled={disabled} aria-pressed={selected}
          className={`min-w-[112px] px-4 py-2.5 rounded-lg text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${selected ? 'bg-brand-600 text-white' : 'border-2 border-brand-600 text-brand-700 hover:bg-brand-50'}`}
        >
          {selected ? <span className="inline-flex items-center gap-1"><Check size={16} aria-hidden="true" /> Selected</span> : 'Select'}
        </button>
      </div>
    </li>
  );
};

const RoomCard = ({ roomType, nights, selectedRatePlanId, onSelect, tooSmallFor = null, onPhotos }) => {
  const photo = (roomType.images?.find((i) => i.isPrimary) || roomType.images?.[0])?.url;
  const soldOut = roomType.availableForStay === 0;
  const fewLeft = !soldOut && roomType.availableForStay != null && roomType.availableForStay <= 3;
  const facts = [
    roomType.roomSize && roomType.roomSize !== 'Standard' && [Ruler, roomType.roomSize],
    roomType.bedType && [BedDouble, roomType.bedType],
    roomType.viewType && [Eye, roomType.viewType],
    [Users, `Up to ${roomType.maxOccupancy || 2} guest${(roomType.maxOccupancy || 2) === 1 ? '' : 's'}`],
  ].filter(Boolean);
  const amenities = (Array.isArray(roomType.amenities) ? roomType.amenities : []).filter(Boolean).map((a) => String(a).split(':')[0]);
  const plans = roomType.ratePlans || [];

  return (
    <article className={`rounded-xl border overflow-hidden bg-white ${selectedRatePlanId ? 'border-brand-300 ring-1 ring-brand-200' : 'border-gray-200'}`}>
      <div className="flex flex-col sm:flex-row gap-4 p-4">
        <div className="relative w-full sm:w-48 h-40 sm:h-32 shrink-0 rounded-lg overflow-hidden bg-gray-100">
          {photo ? (
            <img src={getImageUrl(photo)} alt={roomType.name} loading="lazy" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center"><BedDouble size={32} className="text-gray-300" aria-hidden="true" /></div>
          )}
          {roomType.images?.length > 1 && onPhotos && (
            <button type="button" onClick={() => onPhotos(roomType)} className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-black/60 text-white text-xs font-semibold">
              <Images size={13} aria-hidden="true" /> {roomType.images.length}
            </button>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="text-lg font-bold text-gray-900">{roomType.name}</h3>
            {soldOut && <span className="px-2 py-0.5 rounded-md bg-red-50 text-red-700 text-xs font-bold">Sold out for your dates</span>}
            {fewLeft && <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 text-xs font-bold">Only {roomType.availableForStay} left</span>}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">{facts.map(([I, t]) => <Fact key={t} icon={I}>{t}</Fact>)}</div>
          {roomType.description && <p className="mt-2 text-sm text-gray-600 line-clamp-2">{roomType.description}</p>}
          {amenities.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {amenities.slice(0, 6).map((a) => <span key={a} className="px-2 py-0.5 rounded-md bg-gray-50 border border-gray-200 text-xs text-gray-600">{a}</span>)}
              {amenities.length > 6 && <span className="text-xs text-gray-400 self-center">+{amenities.length - 6} more</span>}
            </div>
          )}
          {tooSmallFor && (
            <p className="mt-2 text-sm font-semibold text-amber-800">
              Fits up to {roomType.maxOccupancy || 2} guests: too small for {tooSmallFor.multi ? `room ${tooSmallFor.room} ` : ''}({tooSmallFor.guests} guests).{tooSmallFor.multi ? '' : ' Add a room for the others.'}
            </p>
          )}
        </div>
      </div>
      {plans.length > 0 ? (
        <ul className="border-t border-gray-100 divide-y divide-gray-100" aria-label={`${roomType.name} rate plans`}>
          {plans.map((p) => (
            <RatePlanRow key={p.id} plan={p} nights={nights} selected={selectedRatePlanId === p.id} disabled={soldOut || !!tooSmallFor} onSelect={(plan) => onSelect(roomType, plan)} />
          ))}
        </ul>
      ) : (
        <p className="border-t border-gray-100 px-4 py-4 text-sm text-gray-400">No rates for this room yet.</p>
      )}
    </article>
  );
};

export default RoomCard;
