import { TrainFront, Landmark, Building2, Utensils } from 'lucide-react';

/** What's nearby a property: the four groups shown in onboarding and on the hotel page. */
export const NEARBY_CATEGORIES = [
  { key: 'TRANSIT', label: 'Transit', icon: TrainFront, types: ['Airport', 'Metro Station', 'Railway Station', 'Bus Station', 'Bus Stop'] },
  { key: 'ATTRACTION', label: 'Attractions', icon: Landmark, types: ['Shopping', 'Beach', 'Museum', 'Monument', 'Park', 'Theatre', 'Cinema', 'Religious Place', 'Water Body', 'Attraction'] },
  { key: 'LANDMARK', label: 'Landmarks', icon: Building2, types: ['Embassy', 'Hospital', 'College', 'Stadium', 'Business Center', 'Locality', 'Landmark'] },
  { key: 'RESTAURANT', label: 'Restaurants', icon: Utensils, types: ['Restaurant', 'Cafe', 'Nightlife'] },
];

/** "0.4 km", "12 km" ("" when unknown). */
export const formatDistance = (km) => {
  const n = Number(km);
  if (km === null || km === undefined || km === '' || !Number.isFinite(n)) return '';
  return `${n >= 10 ? Math.round(n) : n.toFixed(1).replace(/\.0$/, '')} km`;
};
