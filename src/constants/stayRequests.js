/** Kinds of requests a guest can send the hotel (same ids as backend/services/stayRequestService.js). */
export const REQUEST_TYPES = [
  { id: 'LATE_ARRIVAL', label: 'Late arrival', time: 'Expected arrival time', placeholder: 'e.g. 23:30' },
  { id: 'EARLY_CHECKIN', label: 'Early check-in', time: 'Arrival time', placeholder: 'e.g. 09:00' },
  { id: 'LATE_CHECKOUT', label: 'Late check-out', time: 'Check-out time you need', placeholder: 'e.g. 14:00' },
  { id: 'AIRPORT_PICKUP', label: 'Airport / station pickup', time: 'Flight or train and arrival time', placeholder: 'e.g. 6E 512, lands 22:40' },
  { id: 'AIRPORT_DROP', label: 'Airport / station drop', time: 'Pickup time from the hotel', placeholder: 'e.g. 06:30' },
  { id: 'PARKING', label: 'Parking', time: '', placeholder: '' },
  { id: 'SPECIAL_OCCASION', label: 'Special occasion', time: '', placeholder: '' },
  { id: 'OTHER', label: 'Something else', time: '', placeholder: '' },
];

export const requestLabel = (type) => REQUEST_TYPES.find((t) => t.id === type)?.label || 'Request';
