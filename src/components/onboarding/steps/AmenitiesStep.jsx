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
      { name: 'Laundry Service', hasDropdown: false },
      { name: 'Dry Cleaning Service', hasDropdown: false },
      { name: 'Ironing Service', hasDropdown: false },
      { name: 'Luggage Storage', hasDropdown: false },
      { name: 'Concierge', hasDropdown: false },
      { name: 'Tour Desk', hasDropdown: false },
      { name: 'Ticket Service', hasDropdown: false },
      { name: 'Currency Exchange', hasDropdown: false },
      { name: 'ATM on site', hasDropdown: false },
      { name: 'Daily Housekeeping', hasDropdown: false },
      { name: 'Trouser Press', hasDropdown: false },
      { name: 'Shoeshine', hasDropdown: false },
      { name: 'Butler Service', hasDropdown: false }
    ]
  },
  {
    name: 'Security',
    items: [
      { name: '24-Hour Security', hasDropdown: false },
      { name: 'Safe', hasDropdown: false },
      { name: 'Fire Extinguishers', hasDropdown: false },
      { name: 'Smoke Alarms', hasDropdown: false },
      { name: 'Security Alarms', hasDropdown: false },
      { name: 'Key Card Access', hasDropdown: false },
      { name: 'Security Guard', hasDropdown: false }
    ]
  },
  {
    name: 'Basic Facilities',
    items: [
      { name: 'Power Backup Facilities', hasDropdown: false },
      { name: 'Elevator/Lift Service', hasDropdown: false },
      { name: 'Air Conditioning (General Area)', hasDropdown: false },
      { name: 'Free Wi-Fi (General Area)', hasDropdown: false },
      { name: 'Paid Parking (General Area)', hasDropdown: false },
      { name: 'Public Restroom', hasDropdown: false },
      { name: 'Intercom', hasDropdown: false },
      { name: 'First Aid Kit', hasDropdown: false },
      { name: 'Doctor on Call', hasDropdown: false }
    ]
  },
  {
    name: 'Outdoor Sports & Activities',
    items: [
      { name: 'Badminton', hasDropdown: false },
      { name: 'Tennis Court', hasDropdown: false },
      { name: 'Golf Course', hasDropdown: false },
      { name: 'Cycling', hasDropdown: false },
      { name: 'Hiking', hasDropdown: false },
      { name: 'Horseback Riding', hasDropdown: false },
      { name: 'Squash', hasDropdown: false },
      { name: 'Mini Golf', hasDropdown: false },
      { name: 'Table Tennis', hasDropdown: false },
      { name: 'Darts', hasDropdown: false },
      { name: 'Billiards', hasDropdown: false },
      { name: 'Archery', hasDropdown: false },
      { name: 'Bowling', hasDropdown: false },
      { name: 'Fishing', hasDropdown: false },
      { name: 'Canoeing', hasDropdown: false },
      { name: 'Diving', hasDropdown: false },
      { name: 'Snorkeling', hasDropdown: false },
      { name: 'Skiing', hasDropdown: false },
      { name: 'Ski School', hasDropdown: false },
      { name: 'Windsurfing', hasDropdown: false },
      { name: 'Hiking Trails', hasDropdown: false },
      { name: 'Bicycle Rental', hasDropdown: false },
      { name: 'Tennis Equipment', hasDropdown: false },
      { name: 'Badminton Equipment', hasDropdown: false },
      { name: 'Ski Equipment Rental', hasDropdown: false },
      { name: 'Ski Pass Vendor', hasDropdown: false },
      { name: 'Ski-to-Door Access', hasDropdown: false },
      { name: 'Ski Storage', hasDropdown: false }
    ]
  },
  {
    name: 'Common Area',
    items: [
      { name: 'Shared Lounge/TV Area', hasDropdown: false },
      { name: 'Terrace', hasDropdown: false },
      { name: 'Garden', hasDropdown: false },
      { name: 'Library', hasDropdown: false },
      { name: 'Picnic Area', hasDropdown: false },
      { name: 'Outdoor Furniture', hasDropdown: false }
    ]
  },
  {
    name: 'Food and Drink',
    items: [
      { name: 'Bar Facility', hasDropdown: false },
      { name: 'Restaurant Facility', hasDropdown: false },
      { name: 'Coffee House on site', hasDropdown: false },
      { name: 'Breakfast in the Room', hasDropdown: false },
      { name: 'Special Diet Menus', hasDropdown: false },
      { name: 'Snack Bar', hasDropdown: false },
      { name: 'Kid-friendly Buffet', hasDropdown: false }
    ]
  },
  {
    name: 'Business Center and Conferences',
    items: [
      { name: 'Meeting/Banquet Facilities', hasDropdown: false },
      { name: 'Business Center Services', hasDropdown: false },
      { name: 'Fax/Photocopying Services', hasDropdown: false },
      { name: 'Conference Rooms', hasDropdown: false },
      { name: 'Executive Lounge Access', hasDropdown: false },
      { name: 'Boardrooms', hasDropdown: false }
    ]
  },
  {
    name: 'Transfers',
    items: [
      { name: 'Airport Shuttle (free)', hasDropdown: false },
      { name: 'Airport Shuttle (surcharge)', hasDropdown: false },
      { name: 'Shuttle Service (free)', hasDropdown: false },
      { name: 'Shuttle Service (surcharge)', hasDropdown: false }
    ]
  },
  {
    name: 'Entertainment',
    items: [
      { name: 'Evening Entertainment', hasDropdown: false },
      { name: 'Nightclub/DJ', hasDropdown: false },
      { name: 'Karaoke', hasDropdown: false },
      { name: 'Board Games/Puzzles', hasDropdown: false },
      { name: 'Casino', hasDropdown: false },
      { name: 'Game Room', hasDropdown: false }
    ]
  },
  {
    name: 'Shopping',
    items: [
      { name: 'Gift Shop', hasDropdown: false },
      { name: 'Convenience Store on site', hasDropdown: false },
      { name: 'Mini-market on site', hasDropdown: false }
    ]
  },
  {
    name: 'Media and technology',
    items: [
      { name: 'Flat-screen TV Access', hasDropdown: false }
    ]
  },
  {
    name: 'Payment Services',
    items: [
      { name: 'Mobile Payment options', hasDropdown: false },
      { name: 'Card Payment Accepted', hasDropdown: false }
    ]
  },
  {
    name: 'Family and kids',
    items: [
      { name: 'Babysitting/Child Services', hasDropdown: false },
      { name: 'Kids\' Outdoor Play Equipment', hasDropdown: false },
      { name: 'Indoor Play Area For Kids', hasDropdown: false }
    ]
  },
  {
    name: 'Pet essentials',
    items: [
      { name: 'Pet Bowls', hasDropdown: false },
      { name: 'Pet Basket', hasDropdown: false }
    ]
  },
  {
    name: 'Spa & Wellness',
    items: [
      { name: 'Spa/Wellness Packages', hasDropdown: false },
      { name: 'Sauna Room', hasDropdown: false },
      { name: 'Steam Room', hasDropdown: false },
      { name: 'Hot Tub/Jacuzzi', hasDropdown: false },
      { name: 'Solarium', hasDropdown: false },
      { name: 'Massage Services', hasDropdown: false },
      { name: 'Fitness Center Facility', hasDropdown: false },
      { name: 'Yoga Classes', hasDropdown: false },
      { name: 'Fitness Classes', hasDropdown: false },
      { name: 'Personal Trainer', hasDropdown: false },
      { name: 'Open-air Bath', hasDropdown: false }
    ]
  },
  {
    name: 'Accessibility',
    items: [
      { name: 'Wheelchair Accessible Rooms', hasDropdown: false },
      { name: 'Toilet with Grab Rails', hasDropdown: false },
      { name: 'Higher Level Toilet', hasDropdown: false },
      { name: 'Lower Bathroom Sink', hasDropdown: false },
      { name: 'Emergency Cord in Bathroom', hasDropdown: false },
      { name: 'Tactile Signs Available', hasDropdown: false },
      { name: 'Braille Visual Aids', hasDropdown: false },
      { name: 'Auditory Guidance', hasDropdown: false },
      { name: 'Raised Toilet Seat', hasDropdown: false },
      { name: 'Walk-in Shower', hasDropdown: false },
      { name: 'Shower Chair', hasDropdown: false }
    ]
  },
  {
    name: 'Water Sports & Activities',
    items: [
      { name: 'Water Sports Facilities on site', hasDropdown: false },
      { name: 'Water Park Access', hasDropdown: false },
      { name: 'Jet Skiing', hasDropdown: false },
      { name: 'Kayaking', hasDropdown: false },
      { name: 'Parasailing', hasDropdown: false },
      { name: 'Paddleboarding', hasDropdown: false },
      { name: 'Rafting', hasDropdown: false },
      { name: 'Sailing', hasDropdown: false },
      { name: 'Wakeboarding', hasDropdown: false },
      { name: 'Water Skiing', hasDropdown: false },
      { name: 'Kneeboarding', hasDropdown: false },
      { name: 'Tubing', hasDropdown: false },
      { name: 'Flyboarding', hasDropdown: false },
      { name: 'Kitesurfing', hasDropdown: false },
      { name: 'Skimboarding', hasDropdown: false },
      { name: 'Bodyboarding', hasDropdown: false },
      { name: 'Surfing', hasDropdown: false },
      { name: 'Free Diving', hasDropdown: false },
      { name: 'Scuba Diving', hasDropdown: false },
      { name: 'Snorkeling Tour', hasDropdown: false },
      { name: 'Boat Tour', hasDropdown: false },
      { name: 'Fishing Charter', hasDropdown: false },
      { name: 'Catamaran Sailing', hasDropdown: false },
      { name: 'Windsurfing School', hasDropdown: false },
      { name: 'Jet Ski Rental', hasDropdown: false }
    ]
  },
  {
    name: 'Indoor Sports & Activities',
    items: [
      { name: 'Billiards Room', hasDropdown: false },
      { name: 'Table Tennis Area', hasDropdown: false },
      { name: 'Darts Area', hasDropdown: false },
      { name: 'Bowling Alley', hasDropdown: false },
      { name: 'Squash Court Room', hasDropdown: false },
      { name: 'Card Games room', hasDropdown: false },
      { name: 'Foosball Table', hasDropdown: false },
      { name: 'Carrom Board', hasDropdown: false },
      { name: 'Chess Board', hasDropdown: false },
      { name: 'Video Games room', hasDropdown: false },
      { name: 'Escape Room Activity', hasDropdown: false },
      { name: 'Virtual Reality gaming', hasDropdown: false },
      { name: 'Laser Tag Activity', hasDropdown: false }
    ]
  },
  {
    name: 'Live Shows, Music & Entertainment Activities',
    items: [
      { name: 'Live Music/Performance', hasDropdown: false },
      { name: 'Stand-up Comedy Shows', hasDropdown: false },
      { name: 'Theater Shows', hasDropdown: false },
      { name: 'Magic Shows', hasDropdown: false },
      { name: 'Acrobatics Shows', hasDropdown: false },
      { name: 'Cultural Dance Shows', hasDropdown: false },
      { name: 'Karaoke Nights', hasDropdown: false },
      { name: 'DJ Nights', hasDropdown: false },
      { name: 'Movie Nights', hasDropdown: false },
      { name: 'Pub Crawls', hasDropdown: false },
      { name: 'Theme Dinners', hasDropdown: false },
      { name: 'Cooking Classes', hasDropdown: false },
      { name: 'Wine Tasting Sessions', hasDropdown: false },
      { name: 'Local Culture Tours', hasDropdown: false },
      { name: 'Art Galleries visits', hasDropdown: false },
      { name: 'Fashion Shows', hasDropdown: false },
      { name: 'Concerts', hasDropdown: false },
      { name: 'Festivals', hasDropdown: false }
    ]
  },
  {
    name: 'Wildlife Safari and Wildlife Exploration',
    items: [
      { name: 'Wildlife Safari Tours', hasDropdown: false },
      { name: 'Bird Watching', hasDropdown: false },
      { name: 'Nature Trails Walk', hasDropdown: false },
      { name: 'Tiger Reserve Tour', hasDropdown: false },
      { name: 'Jungle Trekking', hasDropdown: false },
      { name: 'Elephant Ride', hasDropdown: false },
      { name: 'Crocodile Farm visit', hasDropdown: false },
      { name: 'Snake Park visit', hasDropdown: false },
      { name: 'Butterfly Garden', hasDropdown: false },
      { name: 'Nocturnal Animal Tour', hasDropdown: false },
      { name: 'Reptile Show', hasDropdown: false },
      { name: 'Wildlife Photography Tour', hasDropdown: false },
      { name: 'Conservation Center visit', hasDropdown: false }
    ]
  },
  {
    name: 'Rides, Safari, Excursions & Tour',
    items: [
      { name: 'Hot Air Balloon Ride', hasDropdown: false },
      { name: 'Helicopter Tour', hasDropdown: false },
      { name: 'Desert Safari', hasDropdown: false },
      { name: 'Camel Ride', hasDropdown: false },
      { name: 'ATV Quad Biking', hasDropdown: false },
      { name: 'Boat Cruise', hasDropdown: false },
      { name: 'Cable Car Ride', hasDropdown: false },
      { name: 'Ziplining', hasDropdown: false },
      { name: 'Segway Tour', hasDropdown: false },
      { name: 'Bus Tour', hasDropdown: false },
      { name: 'Walking Tour', hasDropdown: false },
      { name: 'Bike Tour', hasDropdown: false },
      { name: 'Jeep Safari', hasDropdown: false },
      { name: 'Speedboat Ride', hasDropdown: false },
      { name: 'Catamaran Cruise', hasDropdown: false },
      { name: 'Historic Sites Tour', hasDropdown: false },
      { name: 'Museum Excursion', hasDropdown: false },
      { name: 'Theme Park Access', hasDropdown: false }
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
      // Check if already selected (with or without dropdown text)
      const exists = selectedAmenities.some(a => a === amenityName || a.startsWith(amenityName + ':'));
      if (!exists) {
        const defaultValue = hasDropdown && options ? `${amenityName}: ${options[0]}` : amenityName;
        updateForm('amenities', [...selectedAmenities, defaultValue]);
      }
    } else {
      // Toggle No: remove from array
      updateForm('amenities', selectedAmenities.filter(a => a !== amenityName && !a.startsWith(amenityName + ':')));
    }
  };

  // Handle dropdown value change
  const handleDropdownChange = (amenityName, optionValue) => {
    const cleanList = selectedAmenities.filter(a => a !== amenityName && !a.startsWith(amenityName + ':'));
    updateForm('amenities', [...cleanList, `${amenityName}: ${optionValue}`]);
  };

  // Check if amenity is selected (returns true if present as exact match or starts with name + ':')
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
        <div className="w-full md:w-1/3 border border-gray-200 rounded-lg overflow-hidden shadow-sm bg-white divide-y divide-gray-100 shrink-0">
          {AMENITIES_DATA.map((cat) => {
            const active = activeCategory === cat.name;
            const count = getSelectedCount(cat);
            const total = cat.items.length;

            return (
              <button
                key={cat.name}
                type="button"
                onClick={() => setActiveCategory(cat.name)}
                className={`w-full text-left px-5 py-4 flex items-center justify-between text-sm transition-all focus:outline-none ${
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
        <div className="w-full md:w-2/3 border border-gray-200 rounded-lg shadow-sm bg-white p-5 sm:p-8 space-y-6">
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
