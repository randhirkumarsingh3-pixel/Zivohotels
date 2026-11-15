/**
 * Property amenities by group: the onboarding Amenities step lets owners pick from these, and the
 * guest hotel page groups the chosen ones the same way. A chosen amenity is stored as its name, or
 * "Name: option" when it has a dropdown (e.g. "Wifi: Free High-Speed Wi-Fi").
 */
export const AMENITY_GROUPS = [
  {
    name: 'Mandatory',
    items: [
      { name: 'Air Conditioning', hasDropdown: true, options: ["Centralized AC", "Split AC", "Window AC", "Portable AC"] },
      { name: 'Parking', hasDropdown: true, options: ["Free On-site Parking", "Paid On-site Parking", "Valet Parking", "Off-site Parking"] },
      { name: 'Room service', hasDropdown: true, options: ["24-Hour Room Service", "Limited Hour Room Service", "On-request Room Service"] },
      { name: 'Swimming Pool', hasDropdown: false },
      { name: 'Wifi', hasDropdown: true, options: ["Free High-Speed Wi-Fi", "Paid Wi-Fi", "Free Wi-Fi (Basic)"] },
      { name: 'Reception', hasDropdown: true, options: ["24-Hour Reception", "Limited Hour Reception"] },
      { name: 'Bar', hasDropdown: true, options: ["Lounge Bar", "Poolside Bar", "In-house Bar"] },
      { name: 'Restaurant', hasDropdown: true, options: ["Buffet & A la Carte", "Buffet Only", "A la Carte Only"] },
      { name: 'Luggage assistance', hasDropdown: false },
      { name: 'Wheelchair', hasDropdown: true, options: ["Fully Accessible", "Partial Access", "On-request"] },
      { name: 'Gym/ Fitness centre', hasDropdown: false },
      { name: 'CCTV', hasDropdown: false },
      { name: 'Airport Transfers', hasDropdown: true, options: ["Free Airport Shuttle", "Paid Airport Shuttle", "Private Car Service"] },
      { name: 'Elevator/ Lift', hasDropdown: false },
      { name: 'Housekeeping', hasDropdown: false },
      { name: 'Kitchen/Kitchenette', hasDropdown: true, options: ["Fully Equipped Kitchen", "Basic Kitchenette", "Shared Kitchen"] },
      { name: 'Power backup', hasDropdown: false },
      { name: 'Caretaker', hasDropdown: false },
      { name: 'Spa', hasDropdown: false },
      { name: 'Kids\' Play Area', hasDropdown: true, options: ["Indoor Play Area", "Outdoor Play Area", "Kids Club"] }
    ]
  },
  {
    name: 'General Services',
    items: [
      { name: 'Laundry', hasDropdown: false },
      { name: 'Newspaper', hasDropdown: false },
      { name: 'Smoking rooms', hasDropdown: false },
      { name: 'Lounge', hasDropdown: false },
      { name: 'First-aid services', hasDropdown: false },
      { name: 'Concierge', hasDropdown: false },
      { name: 'Multilingual Staff', hasDropdown: false },
      { name: 'Cloak Room', hasDropdown: false },
      { name: 'Specially abled assistance', hasDropdown: false },
      { name: 'Butler Services', hasDropdown: false },
      { name: 'Doctor on call', hasDropdown: false },
      { name: 'Medical centre (Within Premise)', hasDropdown: false },
      { name: 'Pool/ Beach towels', hasDropdown: false }
    ]
  },
  {
    name: 'Security',
    items: [
      { name: 'Smoke detector', hasDropdown: false },
      { name: 'Fire extinguishers', hasDropdown: false },
      { name: 'Security alarms', hasDropdown: false },
      { name: 'Security Guard', hasDropdown: false },
      { name: 'Carbon Monoxide Detector', hasDropdown: false },
      { name: 'Door-Eye', hasDropdown: false },
      { name: 'Door Chain', hasDropdown: false }
    ]
  },
  {
    name: 'Basic Facilities',
    items: [
      { name: 'LAN', hasDropdown: false },
      { name: 'Refrigerator', hasDropdown: false },
      { name: 'Umbrellas', hasDropdown: false },
      { name: 'Washing Machine', hasDropdown: false },
      { name: 'Laundromat', hasDropdown: false },
      { name: 'EV Charging Station (Within Premise)', hasDropdown: false },
      { name: 'Driver\'s Accommodation', hasDropdown: false },
      { name: 'Grocery Purchase', hasDropdown: false },
      { name: 'Utensil Cleaning', hasDropdown: false }
    ]
  },
  {
    name: 'Outdoor Sports & Activities',
    items: [
      { name: 'Beach', hasDropdown: false },
      { name: 'Golf Course / Mini Golf', hasDropdown: false },
      { name: 'Outdoor sports', hasDropdown: false },
      { name: 'Skiing', hasDropdown: false },
      { name: 'Cycling', hasDropdown: false },
      { name: 'Rock Climbing', hasDropdown: false },
      { name: 'Ziplining', hasDropdown: false },
      { name: 'Archery', hasDropdown: false },
      { name: 'Tennis', hasDropdown: false },
      { name: 'Basketball court', hasDropdown: false },
      { name: 'Cricket', hasDropdown: false },
      { name: 'Badminton', hasDropdown: false },
      { name: 'Volley Ball', hasDropdown: false },
      { name: 'High rope course', hasDropdown: false },
      { name: 'Paintball', hasDropdown: false },
      { name: 'Paragliding', hasDropdown: false },
      { name: 'Camping', hasDropdown: false },
      { name: 'Hot Air Balloon Ride', hasDropdown: false },
      { name: 'Air Rifle Shooting', hasDropdown: false },
      { name: 'Football/Soccer', hasDropdown: false },
      { name: 'Pickle Ball', hasDropdown: false },
      { name: 'ATV or Buggy Ride', hasDropdown: false },
      { name: 'Zorbing', hasDropdown: false },
      { name: 'Wall Climbing', hasDropdown: false },
      { name: 'Bungee Jumping', hasDropdown: false },
      { name: 'Beach Volley / Football', hasDropdown: false },
      { name: 'Golf Simulator', hasDropdown: false },
      { name: 'Rappelling', hasDropdown: false }
    ]
  },
  {
    name: 'Common Area',
    items: [
      { name: 'Balcony/ Terrace', hasDropdown: false },
      { name: 'Garden', hasDropdown: false },
      { name: 'Sun Deck', hasDropdown: false },
      { name: 'Prayer Room', hasDropdown: false },
      { name: 'Living Room', hasDropdown: false },
      { name: 'Outdoor Furniture', hasDropdown: false }
    ]
  },
  {
    name: 'Food and Drink',
    items: [
      { name: 'Barbeque', hasDropdown: false },
      { name: 'Dining Area', hasDropdown: false },
      { name: 'Kid\'s Menu', hasDropdown: false },
      { name: 'Breakfast', hasDropdown: false },
      { name: 'Food Options Available', hasDropdown: false },
      { name: 'Indian Chef', hasDropdown: false },
      { name: 'Cook Service', hasDropdown: false }
    ]
  },
  {
    name: 'Business Center and Conferences',
    items: [
      { name: 'Banquet', hasDropdown: false },
      { name: 'Business Center', hasDropdown: false },
      { name: 'Conference room', hasDropdown: false },
      { name: 'Photocopying', hasDropdown: false },
      { name: 'Fax service', hasDropdown: false },
      { name: 'Printer', hasDropdown: false }
    ]
  },
  {
    name: 'Transfers',
    items: [
      { name: 'Pickup/ Drop', hasDropdown: false },
      { name: 'Shuttle Service', hasDropdown: false },
      { name: 'Railway Station Transfers', hasDropdown: false },
      { name: 'Bus Station transfers', hasDropdown: false }
    ]
  },
  {
    name: 'Entertainment',
    items: [
      { name: 'Events', hasDropdown: false },
      { name: 'Professional Photography', hasDropdown: false },
      { name: 'Night Club', hasDropdown: false },
      { name: 'Beach club', hasDropdown: false },
      { name: 'Movie Room', hasDropdown: false },
      { name: 'Music System', hasDropdown: false }
    ]
  },
  {
    name: 'Shopping',
    items: [
      { name: 'Grocery/Supermarket (Within Premise)', hasDropdown: false },
      { name: 'Souvenir shop', hasDropdown: false },
      { name: 'Jewellery Shop', hasDropdown: false }
    ]
  },
  {
    name: 'Media and technology',
    items: [
      { name: 'TV', hasDropdown: false }
    ]
  },
  {
    name: 'Payment Services',
    items: [
      { name: 'ATM', hasDropdown: false },
      { name: 'Currency Exchange', hasDropdown: false }
    ]
  },
  {
    name: 'Family and kids',
    items: [
      { name: 'Kids\' Club', hasDropdown: false },
      { name: 'Babysitting', hasDropdown: false },
      { name: 'Crib', hasDropdown: false }
    ]
  },
  {
    name: 'Pet essentials',
    items: [
      { name: 'Pet bowls', hasDropdown: false },
      { name: 'Pet baskets', hasDropdown: false }
    ]
  },
  {
    name: 'Spa & Wellness',
    items: [
      { name: 'Massage', hasDropdown: false },
      { name: 'Salon', hasDropdown: false },
      { name: 'Steam and Sauna', hasDropdown: false },
      { name: 'Jacuzzi', hasDropdown: false },
      { name: 'Activity Centre', hasDropdown: false },
      { name: 'Yoga', hasDropdown: false },
      { name: 'Meditation Room', hasDropdown: false },
      { name: 'Solarium', hasDropdown: false },
      { name: 'Hot Spring bath (Within Premise)', hasDropdown: false },
      { name: 'Hammam', hasDropdown: false },
      { name: 'Ayurvedic Treatment (Within Premise)', hasDropdown: false }
    ]
  },
  {
    name: 'Accessibility',
    items: [
      { name: 'Auditory Guidance', hasDropdown: false },
      { name: 'Visual aids (Braille)', hasDropdown: false },
      { name: 'Visual aids (tactile signs)', hasDropdown: false },
      { name: 'Ramp', hasDropdown: false },
      { name: 'Step free entrance', hasDropdown: false },
      { name: 'Designated Accessible Parking', hasDropdown: false },
      { name: 'Wide Pathways', hasDropdown: false },
      { name: 'Toilet with grabrails', hasDropdown: false },
      { name: 'Raised toilet', hasDropdown: false },
      { name: 'Lowered sink', hasDropdown: false },
      { name: 'Bathroom emergency cord', hasDropdown: false }
    ]
  },
  {
    name: 'Water Sports & Activities',
    items: [
      { name: 'Kayaking', hasDropdown: false },
      { name: 'Snorkelling', hasDropdown: false },
      { name: 'Water sports', hasDropdown: false },
      { name: 'Canoeing', hasDropdown: false },
      { name: 'Water Park (Within Premise)', hasDropdown: false },
      { name: 'Scuba Diving', hasDropdown: false },
      { name: 'Jet skiing', hasDropdown: false },
      { name: 'Paddle Boarding', hasDropdown: false },
      { name: 'Pedal Boats', hasDropdown: false },
      { name: 'Banana Boat Ride', hasDropdown: false },
      { name: 'Fishing', hasDropdown: false },
      { name: 'Windsurfing', hasDropdown: false },
      { name: 'Beach Volleyball', hasDropdown: false },
      { name: 'Laser Boat', hasDropdown: false },
      { name: 'Glass Bottom Boat', hasDropdown: false },
      { name: 'Parasailing', hasDropdown: false },
      { name: 'Beach football', hasDropdown: false },
      { name: 'Surfing', hasDropdown: false },
      { name: 'River Rafting', hasDropdown: false },
      { name: 'Dolphin Boat Ride', hasDropdown: false },
      { name: 'Water Skiing', hasDropdown: false },
      { name: 'Diving', hasDropdown: false },
      { name: 'Motor Boat ride', hasDropdown: false },
      { name: 'Boat Ride', hasDropdown: false },
      { name: 'Beach Sports', hasDropdown: false }
    ]
  },
  {
    name: 'Indoor Sports & Activities',
    items: [
      { name: 'Library', hasDropdown: false },
      { name: 'Indoor games', hasDropdown: false },
      { name: 'Indoor games room', hasDropdown: false },
      { name: 'Table Tennis', hasDropdown: false },
      { name: 'Billiards/pool table', hasDropdown: false },
      { name: 'Board Games', hasDropdown: false },
      { name: 'Foosball table', hasDropdown: false },
      { name: 'Air hockey table', hasDropdown: false },
      { name: 'Game Zone / Arcade', hasDropdown: false },
      { name: 'Virtual Gaming/VR Zone', hasDropdown: false },
      { name: 'Dart Board', hasDropdown: false },
      { name: 'Bowling', hasDropdown: false },
      { name: 'Squash', hasDropdown: false }
    ]
  },
  {
    name: 'Live Shows, Music & Entertainment Activities',
    items: [
      { name: 'Casino', hasDropdown: false },
      { name: 'Bonfire', hasDropdown: false },
      { name: 'Live Music', hasDropdown: false },
      { name: 'Cultural Programme', hasDropdown: false },
      { name: 'Movie Screenings', hasDropdown: false },
      { name: 'Karaoke', hasDropdown: false },
      { name: 'Magic Shows', hasDropdown: false },
      { name: 'Puppet Shows', hasDropdown: false },
      { name: 'Live Art Performance', hasDropdown: false },
      { name: 'Stand-up Comedy', hasDropdown: false },
      { name: 'Light & Sound Show', hasDropdown: false },
      { name: 'Rain Dance', hasDropdown: false },
      { name: 'DJ Party', hasDropdown: false },
      { name: 'Firework Show', hasDropdown: false },
      { name: 'Dance Performance', hasDropdown: false },
      { name: 'Disco Club', hasDropdown: false },
      { name: 'Aarti Ceremony', hasDropdown: false },
      { name: 'Drone Show', hasDropdown: false }
    ]
  },
  {
    name: 'Wildlife Safari and Wildlife Exploration',
    items: [
      { name: 'Jungle Safari', hasDropdown: false },
      { name: 'Wildlife Photography', hasDropdown: false },
      { name: 'Wildlife Documentary', hasDropdown: false },
      { name: 'Night Safari', hasDropdown: false },
      { name: 'Forest Camping', hasDropdown: false },
      { name: 'Dolphin Watching', hasDropdown: false },
      { name: 'Tiger Safari', hasDropdown: false },
      { name: 'Leopard Safari', hasDropdown: false },
      { name: 'Lion Safari', hasDropdown: false },
      { name: 'Elephant Safari', hasDropdown: false },
      { name: 'Whale Watching', hasDropdown: false },
      { name: 'Turtle Watching', hasDropdown: false },
      { name: 'Sea Life Exploration', hasDropdown: false }
    ]
  },
  {
    name: 'Rides, Safari, Excursions & Tour',
    items: [
      { name: 'Jungle Safari', hasDropdown: false },
      { name: 'Wildlife Photography', hasDropdown: false },
      { name: 'Wildlife Documentary', hasDropdown: false },
      { name: 'Night Safari', hasDropdown: false },
      { name: 'Forest Camping', hasDropdown: false },
      { name: 'Dolphin Watching', hasDropdown: false },
      { name: 'Tiger Safari', hasDropdown: false },
      { name: 'Leopard Safari', hasDropdown: false },
      { name: 'Lion Safari', hasDropdown: false },
      { name: 'Elephant Safari', hasDropdown: false },
      { name: 'Whale Watching', hasDropdown: false },
      { name: 'Turtle Watching', hasDropdown: false },
      { name: 'Sea Life Exploration', hasDropdown: false }
    ]
  },
  {
    name: 'Nature Activities, Walks & Treks',
    items: [
      { name: 'Guided Forest Walk', hasDropdown: false },
      { name: 'Mountain Trekking', hasDropdown: false },
      { name: 'Waterfall Hike', hasDropdown: false },
      { name: 'Cave Exploration', hasDropdown: false },
      { name: 'Rock Climbing', hasDropdown: false },
      { name: 'Canyoning', hasDropdown: false },
      { name: 'Star Gazing', hasDropdown: false },
      { name: 'Camping', hasDropdown: false },
      { name: 'Nature Photography', hasDropdown: false },
      { name: 'River Crossing', hasDropdown: false }
    ]
  },
  {
    name: 'Hands-on Workshops & Interactive activities',
    items: [
      { name: 'Cooking Class Workshops', hasDropdown: false },
      { name: 'Pottery Workshop', hasDropdown: false },
      { name: 'Painting Class', hasDropdown: false },
      { name: 'Yoga & Meditation Workshop', hasDropdown: false },
      { name: 'Photography Workshop', hasDropdown: false },
      { name: 'Local Craft Making', hasDropdown: false },
      { name: 'Farming/Gardening Activity', hasDropdown: false },
      { name: 'Cow Milking Experience', hasDropdown: false },
      { name: 'Tea/Coffee Estate Tour', hasDropdown: false },
      { name: 'Wine Making Workshop', hasDropdown: false },
      { name: 'Soap Making Workshop', hasDropdown: false },
      { name: 'Textile Weaving Class', hasDropdown: false }
    ]
  }
];

/** Group name of a stored amenity string, or 'Other' (amenities typed in by hand, older data). */
export const amenityGroup = (stored) => {
  const name = String(stored).split(':')[0].trim().toLowerCase();
  const g = AMENITY_GROUPS.find((grp) => grp.items.some((i) => i.name.toLowerCase() === name));
  return g ? g.name : 'Other';
};
