import React, { useState } from 'react';

const AMENITIES_DATA = [
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

const AmenitiesStep = ({ formData, updateForm }) => {
  const [activeCategory, setActiveCategory] = useState('Mandatory');
  const selectedAmenities = formData.amenities || [];

  // Toggle selected amenities
  const handleToggle = (amenityName, value, hasDropdown, options) => {
    if (value === 'Yes') {
      const exists = selectedAmenities.some(a => a === amenityName || a.startsWith(amenityName + ':'));
      if (!exists) {
        const defaultValue = hasDropdown && options ? `${amenityName}: ${options[0]}` : amenityName;
        updateForm('amenities', [...selectedAmenities, defaultValue]);
      }
    } else {
      updateForm('amenities', selectedAmenities.filter(a => a !== amenityName && !a.startsWith(amenityName + ':')));
    }
  };

  // Handle dropdown value change
  const handleDropdownChange = (amenityName, optionValue) => {
    const cleanList = selectedAmenities.filter(a => a !== amenityName && !a.startsWith(amenityName + ':'));
    updateForm('amenities', [...cleanList, `${amenityName}: ${optionValue}`]);
  };

  // Check if amenity is selected
  const isSelected = (amenityName) => {
    return selectedAmenities.some(a => a === amenityName || a.startsWith(amenityName + ':'));
  };

  // Get current dropdown value
  const getDropdownValue = (amenityName, defaultVal) => {
    const found = selectedAmenities.find(a => a.startsWith(amenityName + ':'));
    return found ? found.split(': ')[1] : defaultVal;
  };

  // Calculate count of selected items for a given category
  const getSelectedCount = (category) => {
    let count = 0;
    category.items.forEach(item => {
      if (isSelected(item.name)) {
        count++;
      }
    });
    return count;
  };

  const activeCategoryData = AMENITIES_DATA.find(c => c.name === activeCategory) || AMENITIES_DATA[0];

  return (
    <div className="p-4 sm:p-8 animate-fade-in bg-white">
      <h1 className="text-2xl font-extrabold text-black mb-1">Property Amenities</h1>
      <p className="text-sm text-gray-500 mb-8 leading-snug">
        Answering the amenities available at your property can significantly influence guests to book! Please answer the Mandatory Amenities available below
      </p>

      <div className="flex flex-col md:flex-row gap-8 items-start min-h-[500px]">
        {/* Left Column: Categories Sidebar */}
        <div className="w-full md:w-1/3 border border-gray-200 rounded-lg overflow-hidden shadow-sm bg-white divide-y divide-gray-100 shrink-0 max-h-[700px] overflow-y-auto">
          {AMENITIES_DATA.map((cat) => {
            const active = activeCategory === cat.name;
            const count = getSelectedCount(cat);
            const total = cat.items.length;

            return (
              <button
                key={cat.name}
                type="button"
                onClick={() => setActiveCategory(cat.name)}
                className={`w-full text-left px-5 py-3.5 flex items-center justify-between text-sm transition-all focus:outline-none ${
                  active
                    ? 'bg-blue-50/70 border-l-4 border-blue-600 text-blue-700 font-bold'
                    : 'text-gray-700 hover:bg-gray-50/50 hover:text-gray-900 font-medium'
                }`}
              >
                <span>{cat.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${active ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-500'}`}>
                  {count} of {total}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right Column: Amenities Toggles */}
        <div className="w-full md:w-2/3 border border-gray-200 rounded-lg shadow-sm bg-white p-5 sm:p-8 space-y-6 max-h-[700px] overflow-y-auto">
          <h2 className="text-lg font-bold text-gray-900 mb-4 border-b border-gray-100 pb-3">
            {activeCategory} Amenities
          </h2>

          <div className="divide-y divide-gray-100">
            {activeCategoryData.items.map((item, idx) => {
              const selected = isSelected(item.name);
              const dropVal = item.hasDropdown ? getDropdownValue(item.name, item.options[0]) : '';

              return (
                <div key={item.name} className={`${idx > 0 ? 'pt-5 mt-5' : ''}`}>
                  <div className="flex flex-row items-center justify-between gap-4">
                    {/* Amenity Title */}
                    <span className="font-semibold text-gray-800 text-sm sm:text-base">
                      {item.name}
                    </span>

                    {/* Radio Selectors */}
                    <div className="flex items-center gap-6 shrink-0">
                      {/* No Radio */}
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="radio"
                          name={`amenity-radio-${item.name}`}
                          checked={!selected}
                          onChange={() => handleToggle(item.name, 'No', item.hasDropdown, item.options)}
                          className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-sm font-semibold text-gray-700">No</span>
                      </label>

                      {/* Yes Radio */}
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="radio"
                          name={`amenity-radio-${item.name}`}
                          checked={selected}
                          onChange={() => handleToggle(item.name, 'Yes', item.hasDropdown, item.options)}
                          className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-sm font-semibold text-gray-700">Yes</span>
                      </label>
                    </div>
                  </div>

                  {/* Dropdown Select underneath if YES is selected and dropdown is supported */}
                  {item.hasDropdown && selected && (
                    <div className="mt-3 animate-fade-in w-full max-w-md">
                      <select
                        value={dropVal}
                        onChange={(e) => handleDropdownChange(item.name, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm bg-white text-gray-900 shadow-sm"
                      >
                        {item.options.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AmenitiesStep;
