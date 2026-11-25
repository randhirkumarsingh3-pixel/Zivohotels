/**
 * Photo tags owners pick at onboarding (Photos step) and admins in the media library. Guests can
 * filter the hotel page gallery by them. Room-type names are added as tags per property.
 */
export const PHOTO_TAG_GROUPS = [
  ['Outside', ['EXTERIOR', 'HOTEL_ENTRANCE', 'FACADE_AT_NIGHT', 'PARKING', 'GARDEN', 'TERRACE', 'ROOFTOP', 'VIEW']],
  ['Inside', ['LOBBY', 'RECEPTION', 'CORRIDOR', 'ELEVATOR', 'LOUNGE_AREA']],
  ['Rooms', ['ROOMS', 'BEDROOM', 'BATHROOM', 'ROOM_VIEW', 'BALCONY', 'WORK_DESK']],
  ['Food & drink', ['RESTAURANT', 'BREAKFAST', 'FOOD', 'BAR', 'CAFE']],
  ['Facilities', ['SWIMMING_POOL', 'GYM', 'SPA', 'KIDS_AREA', 'GAMES_ROOM']],
  ['Business & events', ['BUSINESS_CENTER', 'CONFERENCE_HALL', 'BANQUET_HALL']],
];
export const PHOTO_TAGS = PHOTO_TAG_GROUPS.flatMap(([, tags]) => tags);
export const formatTag = (tag) => String(tag).toLowerCase().split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
