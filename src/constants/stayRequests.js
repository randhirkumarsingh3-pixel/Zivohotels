/** Kinds of requests a guest can send the hotel (same ids as backend/services/stayRequestService.js). */
export const REQUEST_TYPES = [
  { id: 'LATE_ARRIVAL', label: 'Late arrival', time: 'Expected arrival time', placeholder: 'e.g. 23:30' },
  { id: 'EARLY_CHECKIN', label: 'Early check-in', time: 'Arrival time', placeholder: 'e.g. 09:00' },
  { id: 'LATE_CHECKOUT', label: 'Late check-out', time: 'Check-out time you need', placeholder: 'e.g. 14:00' },
  { id: 'AIRPORT_PICKUP', label: 'Airport / station pickup', time: 'Flight or train and arrival time', placeholder: 'e.g. 6E 512, lands 22:40' },
  { id: 'AIRPORT_DROP', label: 'Airport / station drop', time: 'Pickup time from the hotel', placeholder: 'e.g. 06:30' },
  { id: 'PARKING', label: 'Parking', time: '', placeholder: '' },
  { id: 'SPECIAL_OCCASION', label: 'Special occasion', time: '', placeholder: '' },
  { id: 'ROOM_SERVICE', label: 'Food / room service', time: 'When', placeholder: 'e.g. Dinner at 20:30' },
  { id: 'AMENITY', label: 'Room amenities', time: '', placeholder: '' },
  { id: 'LOST_ITEM', label: 'Lost item', time: '', placeholder: '' },
  { id: 'BILL_INVOICE', label: 'Bill / invoice', time: '', placeholder: '' },
  { id: 'OTHER', label: 'Something else', time: '', placeholder: '' },
];

export const requestLabel = (type) => REQUEST_TYPES.find((t) => t.id === type)?.label || 'Request';

/** Placeholder for the details box, by kind. */
export const detailsHint = (type) => ({
  PARKING: 'e.g. One car, SUV',
  SPECIAL_OCCASION: 'e.g. Anniversary on 20 Dec, a cake if possible',
  ROOM_SERVICE: 'What would you like?',
  AMENITY: 'e.g. Two extra pillows and a baby cot',
  LOST_ITEM: 'What it is, what it looks like, and where you think you left it',
  BILL_INVOICE: 'e.g. Please send the bill for the minibar, or correct the GST name',
}[type] || 'Anything the hotel should know');

/** Details are required for these. */
export const DETAILS_REQUIRED = ['OTHER', 'LOST_ITEM', 'AMENITY', 'ROOM_SERVICE', 'BILL_INVOICE'];
