import { useState } from 'react';
import {
  Clock, ShieldCheck, Heart, PawPrint, Accessibility, Cigarette, Wine, PartyPopper, Users, Baby,
  Contact as IdCard, BedDouble, UtensilsCrossed, MapPin, Navigation, CheckCircle2, XCircle, Info, Ruler, Eye, Bath,
} from 'lucide-react';
import { amenityGroup } from '../../constants/amenities';
import { NEARBY_CATEGORIES, formatDistance } from '../../constants/nearbyPlaces';

/**
 * Sections of the guest hotel page built from what the property entered at onboarding:
 * highlights, amenities (grouped as in onboarding), house rules & policies, location, and room
 * features. Each renders nothing (or a short note) when the property left that part empty.
 */

const fmtTime = (t) => {
  if (!t) return null;
  const [h, m] = String(t).split(':').map(Number);
  if (Number.isNaN(h)) return t;
  const d = new Date(2000, 0, 1, h, m || 0);
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
};
const yes = (v) => v === 'Yes' || v === true;
const no = (v) => v === 'No' || v === false;

const CANCELLATION_TEXT = {
  FREE_CANCEL_CHECKIN: 'Free cancellation until check-in',
  FREE_CANCEL_24H: 'Free cancellation until 24 hours before check-in',
  FREE_CANCEL_48H: 'Free cancellation until 48 hours before check-in',
  FREE_CANCEL_72H: 'Free cancellation until 72 hours before check-in',
  NON_REFUNDABLE: 'Non-refundable: no refund if you cancel',
};

export const Section = ({ id, title, subtitle, children }) => (
  <section id={id} className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-100 scroll-mt-28">
    <h2 className="text-xl font-bold text-gray-900">{title}</h2>
    {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
    <div className="mt-5">{children}</div>
  </section>
);

/** Quick facts under the hotel name. */
export const Highlights = ({ hotel }) => {
  const r = hotel.houseRules || {};
  const items = [
    hotel.checkInTime && { icon: Clock, text: `Check-in ${fmtTime(hotel.checkInTime)} · Check-out ${fmtTime(hotel.checkOutTime || '11:00')}` },
    // No saved policy = free cancellation until 24h before check-in (as the booking engine applies)
    (hotel.cancellationPolicy || 'FREE_CANCEL_24H') !== 'NON_REFUNDABLE' && { icon: ShieldCheck, text: CANCELLATION_TEXT[hotel.cancellationPolicy || 'FREE_CANCEL_24H'].replace(' before check-in', '') },
    yes(r.unmarriedCouples) && { icon: Heart, text: 'Couple friendly' },
    yes(r.has24HrCheckin) && { icon: Clock, text: '24-hour check-in' },
    yes(r.petsAllowed) && { icon: PawPrint, text: 'Pets allowed' },
    yes(r.wheelchairAccessible) && { icon: Accessibility, text: 'Wheelchair accessible' },
    hotel.builtYear && { icon: Info, text: `Built in ${hotel.builtYear}` },
  ].filter(Boolean);
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => (
        <span key={it.text} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-xs font-semibold text-gray-700">
          <it.icon size={14} className="text-brand-700" /> {it.text}
        </span>
      ))}
    </div>
  );
};

/** Amenities grouped as in onboarding; "Wifi: Free High-Speed Wi-Fi" shows the detail. */
export const AmenitiesSection = ({ amenities }) => {
  const [showAll, setShowAll] = useState(false);
  const list = (amenities || []).filter(Boolean);
  if (!list.length) return <p className="text-sm text-gray-400">The property hasn&apos;t listed its amenities yet.</p>;
  const groups = list.reduce((acc, a) => {
    const g = amenityGroup(a) === 'Mandatory' ? 'Popular' : amenityGroup(a);
    (acc[g] ||= []).push(a);
    return acc;
  }, {});
  const order = Object.keys(groups).sort((a, b) => (a === 'Popular' ? -1 : b === 'Popular' ? 1 : a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b)));
  const label = (a) => {
    const [name, detail] = String(a).split(':').map((x) => x.trim());
    return detail ? <>{name} <span className="text-gray-400">· {detail}</span></> : name;
  };
  const visibleGroups = showAll ? order : order.slice(0, 2);
  return (
    <div className="space-y-6">
      {visibleGroups.map((g) => (
        <div key={g}>
          {order.length > 1 && <h3 className="text-sm font-bold text-gray-900 mb-3">{g === 'Other' ? 'More amenities' : g}</h3>}
          <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-3 gap-x-6">
            {(showAll ? groups[g] : groups[g].slice(0, 9)).map((a) => (
              <li key={a} className="flex items-start text-sm text-gray-700"><CheckCircle2 className="h-4 w-4 mr-2 mt-0.5 text-brand-500 shrink-0" /> <span>{label(a)}</span></li>
            ))}
          </ul>
        </div>
      ))}
      {(order.length > 2 || order.some((g) => groups[g].length > 9)) && (
        <button type="button" onClick={() => setShowAll((s) => !s)} className="text-sm font-bold text-brand-700 hover:text-brand-700">
          {showAll ? 'Show fewer amenities' : `Show all ${list.length} amenities`}
        </button>
      )}
    </div>
  );
};

const RuleLine = ({ icon: Icon, allowed, text }) => (
  <li className="flex items-start gap-3 text-sm">
    <Icon size={18} className="text-gray-400 shrink-0 mt-0.5" />
    <span className="flex-1 text-gray-700">{text}</span>
    {allowed === true && <CheckCircle2 size={16} className="text-green-700 shrink-0 mt-0.5" aria-label="Allowed" />}
    {allowed === false && <XCircle size={16} className="text-red-500 shrink-0 mt-0.5" aria-label="Not allowed" />}
  </li>
);

/** Check-in/out, cancellation, house rules, children & extra beds, ID proofs, meal prices. */
export const PoliciesSection = ({ hotel }) => {
  const r = hotel.houseRules || {};
  const yn = (k, okText, noText, icon) => (yes(r[k]) ? <RuleLine key={k} icon={icon} allowed text={okText} /> : no(r[k]) ? <RuleLine key={k} icon={icon} allowed={false} text={noText} /> : null);
  const guestRules = [
    yn('unmarriedCouples', 'Unmarried couples are welcome', 'Unmarried couples are not allowed', Heart),
    yn('guestsBelow18', 'Guests below 18 can check in', 'Guests below 18 years are not allowed to check in', Users),
    yn('maleGroupsAllowed', 'Groups of only male guests are allowed', 'Groups of only male guests are not allowed', Users),
    yn('outsideVisitors', 'Outside visitors are allowed in rooms', 'Outside visitors are not allowed in rooms', Users),
  ].filter(Boolean);
  const propertyRules = [
    yn('smokingAllowed', 'Smoking is allowed in designated areas', 'Smoking is not allowed anywhere on the property', Cigarette),
    yn('alcoholAllowed', 'Alcohol is allowed on the property', 'Alcohol is not allowed on the property', Wine),
    yn('partiesAllowed', 'Private parties and events are allowed', 'Private parties and events are not allowed', PartyPopper),
    yn('petsAllowed', 'Pets are allowed', 'Pets are not allowed', PawPrint),
    yes(r.petsOnProperty) ? <RuleLine key="petsOn" icon={PawPrint} text="There are pets living on the property" /> : null,
    yn('wheelchairAccessible', 'Accessible for guests who use a wheelchair', 'Not accessible for wheelchair users', Accessibility),
  ].filter(Boolean);
  const bedText = (v, who) => (v === 'Subject to availability' ? `Extra beds for ${who} on request, subject to availability` : yes(v) ? `Extra beds available for ${who}` : no(v) ? `No extra beds for ${who}` : null);
  const childRules = [
    yes(r.infantIncluded) ? <RuleLine key="inf" icon={Baby} allowed text="One infant (0-2 years) per room stays free, not counted in occupancy" /> : null,
    yes(r.infantFood) ? <RuleLine key="infFood" icon={Baby} allowed text="Complimentary infant food (e.g. warm milk) on request" /> : null,
    bedText(r.extraBedAdults, 'adults') && <RuleLine key="eba" icon={BedDouble} text={bedText(r.extraBedAdults, 'adults')} />,
    bedText(r.extraBedKids, 'children') && <RuleLine key="ebk" icon={BedDouble} text={bedText(r.extraBedKids, 'children')} />,
    yes(r.extraBedInRates) ? <RuleLine key="ebr" icon={BedDouble} text="Extra adult / paid child rates include an extra bed or mattress" /> : null,
  ].filter(Boolean);
  const ids = Array.isArray(r.identityProofs) ? r.identityProofs : [];
  const MEAL_ORDER = ['breakfast', 'lunch', 'dinner'];
  const meals = Object.entries(hotel.mealPrices || {}).filter(([, v]) => Number(v) > 0)
    .sort(([a], [b]) => (MEAL_ORDER.indexOf(a) + 1 || 9) - (MEAL_ORDER.indexOf(b) + 1 || 9));
  const custom = typeof r.customPolicy === 'string' ? r.customPolicy.trim() : '';
  const extraPolicies = (hotel.policies || []).filter(Boolean);

  const Block = ({ title, children }) => (
    <div>
      <h3 className="text-sm font-bold text-gray-900 mb-3">{title}</h3>
      {children}
    </div>
  );

  return (
    <div className="space-y-7">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-200 p-4"><p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Check-in</p><p className="text-lg font-bold text-gray-900 mt-1">{fmtTime(hotel.checkInTime || '14:00')}</p>{yes(r.has24HrCheckin) && <p className="text-xs text-green-700 font-semibold">24-hour check-in</p>}</div>
        <div className="rounded-xl border border-gray-200 p-4"><p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Check-out</p><p className="text-lg font-bold text-gray-900 mt-1">{fmtTime(hotel.checkOutTime || '11:00')}</p></div>
        <div className="rounded-xl border border-gray-200 p-4"><p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Cancellation</p><p className={`text-sm font-bold mt-1 ${hotel.cancellationPolicy === 'NON_REFUNDABLE' ? 'text-red-600' : 'text-green-700'}`}>{CANCELLATION_TEXT[hotel.cancellationPolicy] || CANCELLATION_TEXT.FREE_CANCEL_24H}</p></div>
      </div>

      <Block title="Guests & ages">
        <ul className="space-y-3">
          {guestRules}
          <RuleLine icon={Users} text={<>Each room needs a lead guest aged 18 or older. Adults are 13 or above; guests aged 13–17 stay only with an adult in the room. <a href="/privacy#children" className="text-navy-700 underline">Age rules</a></>} />
        </ul>
      </Block>
      {(ids.length > 0 || r.sameCityId) && (
        <Block title="ID proof at check-in">
          <ul className="space-y-3">
            {ids.length > 0 && <RuleLine icon={IdCard} text={`Accepted: ${ids.join(', ')}`} />}
            {yes(r.sameCityId) && <RuleLine icon={IdCard} allowed text="Local IDs (same city) are accepted" />}
            {no(r.sameCityId) && <RuleLine icon={IdCard} allowed={false} text="Local IDs (same city) are not accepted" />}
          </ul>
        </Block>
      )}
      {propertyRules.length > 0 && <Block title="Property rules"><ul className="space-y-3">{propertyRules}</ul></Block>}
      {childRules.length > 0 && <Block title="Children & extra beds"><ul className="space-y-3">{childRules}</ul></Block>}
      {meals.length > 0 && (
        <Block title="Meals (if not included in your plan)">
          <ul className="space-y-3">
            {meals.map(([k, v]) => <RuleLine key={k} icon={UtensilsCrossed} text={`${k.charAt(0).toUpperCase() + k.slice(1)}: ₹${Number(v).toLocaleString('en-IN')} per person`} />)}
          </ul>
        </Block>
      )}
      {(custom || extraPolicies.length > 0) && (
        <Block title="More from the property">
          {custom && <p className="text-sm text-gray-700 whitespace-pre-line">{custom}</p>}
          {extraPolicies.length > 0 && <ul className="list-disc pl-5 mt-2 space-y-1 text-sm text-gray-700">{extraPolicies.map((p) => <li key={p}>{p}</li>)}</ul>}
        </Block>
      )}
    </div>
  );
};

/** Address and a map (OpenStreetMap, no key needed) when the property set its pin. */
export const LocationSection = ({ hotel }) => {
  const address = [hotel.addressLine || hotel.location, hotel.area, hotel.city, hotel.state, hotel.pincode].filter(Boolean)
    .filter((v, i, a) => a.findIndex((x) => String(x).toLowerCase() === String(v).toLowerCase()) === i).join(', ');
  const lat = Number(hotel.latitude);
  const lng = Number(hotel.longitude);
  const hasPin = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
  const d = 0.01;
  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 text-gray-700"><MapPin size={18} className="text-brand-700 mt-0.5 shrink-0" /> {address || hotel.city}</p>
      {hotel.landmark && <p className="flex items-start gap-2 text-sm text-gray-600"><Navigation size={16} className="text-gray-400 mt-0.5 shrink-0" /> Near {hotel.landmark}</p>}
      {hasPin && (
        <>
          <div className="rounded-xl overflow-hidden border border-gray-200 h-64">
            <iframe
              title={`Map of ${hotel.name}`}
              className="w-full h-full"
              loading="lazy"
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${lng - d}%2C${lat - d}%2C${lng + d}%2C${lat + d}&layer=mapnik&marker=${lat}%2C${lng}`}
            />
          </div>
          <a href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-700 hover:text-brand-700">
            <Navigation size={15} /> Get directions
          </a>
        </>
      )}
      <NearbyPlaces places={hotel.nearbyPlaces} />
    </div>
  );
};

/** What's nearby: Transit, Attractions, Landmarks, Restaurants with distances (top 5, then "View all"). */
const NearbyPlaces = ({ places }) => {
  const [open, setOpen] = useState({});
  const visible = (Array.isArray(places) ? places : []).filter((p) => p && p.name && p.visible !== false);
  const groups = NEARBY_CATEGORIES.map((c) => ({ ...c, items: visible.filter((p) => p.category === c.key).sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999)) })).filter((g) => g.items.length);
  if (!groups.length) return null;
  return (
    <div className="pt-2">
      <h3 className="font-bold text-gray-900 mb-3">What&apos;s nearby</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-x-8 gap-y-6">
        {groups.map((g) => {
          const shown = open[g.key] ? g.items : g.items.slice(0, 5);
          return (
            <div key={g.key}>
              <p className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-2"><g.icon size={16} className="text-brand-700" /> {g.label}</p>
              <ul className="space-y-2">
                {shown.map((p, i) => (
                  <li key={`${p.name}-${i}`} className="flex items-start justify-between gap-3 text-sm">
                    <span className="min-w-0">
                      <span className="block text-gray-800 leading-snug">{p.name}</span>
                      {p.type && <span className="block text-xs text-gray-500">{p.type}</span>}
                    </span>
                    <span className="text-gray-600 whitespace-nowrap">{formatDistance(p.distanceKm)}</span>
                  </li>
                ))}
              </ul>
              {g.items.length > 5 && (
                <button type="button" onClick={() => setOpen((o) => ({ ...o, [g.key]: !o[g.key] }))} className="mt-2 text-sm font-bold text-brand-700 hover:text-brand-700">
                  {open[g.key] ? 'Show less' : `View all ${g.items.length}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Room features from Room Config / onboarding: size, beds, view, occupancy, room amenities. */
export const RoomFeatures = ({ roomType }) => {
  const facts = [
    roomType.roomSize && roomType.roomSize !== 'Standard' && { icon: Ruler, text: roomType.roomSize },
    roomType.bedType && { icon: BedDouble, text: roomType.bedType },
    roomType.viewType && { icon: Eye, text: roomType.viewType },
    roomType.maxOccupancy && { icon: Users, text: `Up to ${roomType.maxOccupancy} guest${roomType.maxOccupancy === 1 ? '' : 's'}` },
    roomType.extraBedAllowed && { icon: Bath, text: `Extra bed available${roomType.maxExtraBeds ? ` (max ${roomType.maxExtraBeds})` : ''}` },
  ].filter(Boolean);
  const amenities = Array.isArray(roomType.amenities) ? roomType.amenities.filter(Boolean) : [];
  if (!facts.length && !amenities.length && !roomType.description) return null;
  return (
    <div className="space-y-2">
      {facts.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {facts.map((f) => <span key={f.text} className="inline-flex items-center gap-1.5 text-xs text-gray-600"><f.icon size={13} className="text-gray-400" /> {f.text}</span>)}
        </div>
      )}
      {roomType.description && <p className="text-xs text-gray-500 leading-relaxed">{roomType.description}</p>}
      {amenities.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {amenities.slice(0, 8).map((a) => <span key={a} className="px-2 py-0.5 rounded-md bg-gray-50 border border-gray-200 text-xs text-gray-600">{String(a).split(':')[0]}</span>)}
          {amenities.length > 8 && <span className="text-xs text-gray-400 self-center">+{amenities.length - 8} more</span>}
        </div>
      )}
    </div>
  );
};
