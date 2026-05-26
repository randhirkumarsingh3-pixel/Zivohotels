import React from 'react';
import { Check } from 'lucide-react';

const AMENITY_CATEGORIES = [
  {
    name: 'Most Popular',
    items: ['Free Wi-Fi', 'Air Conditioning', 'Swimming Pool', 'Free Parking', 'Restaurant', 'Gym']
  },
  {
    name: 'Basic Facilities',
    items: ['Power Backup', 'Elevator/Lift', 'Room Service', 'Housekeeping', 'Smoking Rooms', 'Laundry Service']
  },
  {
    name: 'Food & Drinks',
    items: ['Bar', 'Coffee Shop', 'Breakfast Available', 'Dining Area', 'BBQ Facilities', 'Kids Meals']
  },
  {
    name: 'Safety & Security',
    items: ['CCTV', '24/7 Security', 'Fire Extinguishers', 'Smoke Alarms', 'Safe', 'Security Alarms']
  },
  {
    name: 'Health & Wellness',
    items: ['Spa', 'Massage', 'Yoga Room', 'Sauna', 'Jacuzzi', 'Fitness Center']
  }
];

const AmenitiesStep = ({ formData, updateForm }) => {
  const selectedAmenities = formData.amenities || [];

  const toggleAmenity = (amenity) => {
    if (selectedAmenities.includes(amenity)) {
      updateForm('amenities', selectedAmenities.filter(a => a !== amenity));
    } else {
      updateForm('amenities', [...selectedAmenities, amenity]);
    }
  };

  return (
    <div className="p-8 animate-fade-in">
      <h2 className="text-xl font-bold text-gray-900 mb-2 border-b pb-4">Amenities & Services</h2>
      <p className="text-sm text-gray-500 mb-8">Select all the amenities available at your property. This helps guests filter their search.</p>
      
      <div className="space-y-8">
        {AMENITY_CATEGORIES.map((category) => (
          <div key={category.name}>
            <h3 className="text-md font-bold text-gray-800 mb-4">{category.name}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {category.items.map((amenity) => {
                const isSelected = selectedAmenities.includes(amenity);
                return (
                  <label 
                    key={amenity}
                    className={`flex items-center p-3 border rounded-md cursor-pointer transition-colors ${
                      isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded border flex items-center justify-center mr-3 flex-shrink-0 ${
                      isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                    }`}>
                      {isSelected && <Check size={14} className="text-white" />}
                    </div>
                    <span className={`text-sm ${isSelected ? 'font-medium text-blue-900' : 'text-gray-700'}`}>
                      {amenity}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AmenitiesStep;
