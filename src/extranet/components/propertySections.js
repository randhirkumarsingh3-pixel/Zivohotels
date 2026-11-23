import { Building2, Navigation, Sparkles, BedDouble, Image as ImageIcon, ScrollText, Landmark } from 'lucide-react';

/** Colours for a score out of 100 (ring colour and text). */
export const scoreTone = (score) => (score >= 85 ? { ring: '#15803d', text: 'text-green-800', bg: 'bg-green-50' }
  : score >= 70 ? { ring: '#0f766e', text: 'text-teal-800', bg: 'bg-teal-50' }
    : score >= 50 ? { ring: '#b45309', text: 'text-amber-800', bg: 'bg-amber-50' }
      : { ring: '#b91c1c', text: 'text-red-800', bg: 'bg-red-50' });

/** The parts of the listing, in the order owners usually work through them. */
export const EDIT_SECTIONS = [
  { key: 'basics', label: 'Basic information', icon: Building2 },
  { key: 'location', label: 'Location & nearby', icon: Navigation },
  { key: 'amenities', label: 'Amenities', icon: Sparkles },
  { key: 'rooms', label: 'Rooms & rate plans', icon: BedDouble },
  { key: 'photos', label: 'Photos', icon: ImageIcon },
  { key: 'policies', label: 'Policies & house rules', icon: ScrollText },
  { key: 'finance', label: 'Legal & payout details', icon: Landmark, owner: true },
];

export const editLink = (hotelId, section) => `/extranet/onboarding/${hotelId}?section=${section}`;

