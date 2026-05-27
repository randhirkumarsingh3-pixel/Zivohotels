import React, { useState } from 'react';
import { Plus, Trash2, Bed, Search, Info, PlusCircle, MinusCircle, HelpCircle } from 'lucide-react';

const ROOM_TYPES = ["Deluxe", "Standard", "Suite", "Executive", "Family", "Villa", "Studio", "Premium", "Apartment"];
const ROOM_VIEWS = ["Airport View", "Pool View", "Garden View", "City View", "Ocean View", "Mountain View"];
const MEAL_PLANS = ["FREE Breakfast", "Room Only", "Breakfast & Dinner", "All Meals"];
const BED_OPTIONS = [
  { name: "Queen Bed", desc: "6 feet by 6 feet" },
  { name: "King Bed", desc: "6.5 feet by 6.5 feet" },
  { name: "Double Bed", desc: "4.5 feet by 6 feet" },
  { name: "Twin Bed", desc: "3.5 feet by 6 feet" },
  { name: "Single Bed", desc: "3 feet by 6 feet" }
];

const ROOM_AMENITIES_DATA = [
  {
    name: 'Mandatory',
    items: ['Bathtub', 'Hairdryer', 'Hot & Cold Water', 'Toiletries', 'Towels', 'TV', 'Balcony', 'Private Pool', 'Air Conditioning', 'Iron/Ironing Board', 'Mineral Water', 'Kettle', 'Wifi', 'Safe', 'Bathroom', 'Peep Hole']
  },
  {
    name: 'Popular with Guests',
    items: ['Interconnected Room', 'Heater', 'Housekeeping', 'In Room dining', 'Laundry Service', 'Room service', 'Smoking Room', 'Study Room', 'Air Purifier']
  },
  {
    name: 'Bathroom',
    items: ['Bathroom Phone', 'Bubble Bath', 'Dental Kit', 'Geyser/ Water heater', 'Slippers', 'Shower Cap', 'Hammam', 'Bathrobes', 'Western Toilet Seat', 'Shower cubicle', 'Weighing Scale', 'Shaving Mirror', 'Sewing kit', 'Bidet', 'Toilet with grab rails', 'Ensuite Bathroom/Common Bay', 'Jetspray', 'Open Air Shower']
  },
  {
    name: 'Room Features',
    items: ['Closet', 'Blackout curtains', 'Center Table', 'Charging points', 'Couch', 'Dining Table', 'Fireplace', 'Mini Fridge', 'Sofa', 'Telephone', 'Work Desk', 'Pillow menu', 'Hypoallergenic Bedding', 'Living Area', 'Dining Area', 'Seating Area', 'Chair', 'Fireplace Guards', 'Open air bath', 'Jaccuzi', 'Hot Water Bag', 'Full-length Mirror', 'Private Garden', 'Private Beach']
  },
  {
    name: 'Media & Entertainment',
    items: ['Smart Controls', 'Sound Speakers', 'Smartphone']
  },
  {
    name: 'Food & Drinks',
    items: ['Cake', 'Fruit Basket', 'Mini Bar', 'BBQ Grill', 'Cook Service', 'Champagne', 'Sparkling Wine']
  },
  {
    name: 'Kitchen and Appliances',
    items: ['Dishwasher', 'Induction', 'Kitchenette', 'Refrigerator', 'Washing machine', 'Cook/Chef', 'Cooking Basics', 'Coffee Machine', 'Stove/Induction', 'Dishes and Silverware', 'Toaster', 'Microwave', 'Rice Cooker', 'Espresso Pod Machine', 'French Press']
  },
  {
    name: 'Beds and Blanket',
    items: ['Blanket']
  },
  {
    name: 'Safety and Security',
    items: ['Cupboards with locks']
  },
  {
    name: 'Childcare',
    items: ['Crib']
  },
  {
    name: 'Other Facilities',
    items: ['Mosquito Net', 'Newspaper', 'Jacuzzi', 'Terrace', 'Fan', 'Butler Service']
  }
];

const RoomsStep = ({ formData, updateForm }) => {
  const rooms = formData.rooms || [];
  
  // Editor States
  const [isEditing, setIsEditing] = useState(false);
  const [editRoomId, setEditRoomId] = useState(null);
  
  // Single Room Edit State
  const [roomForm, setRoomForm] = useState({
    type: 'Deluxe',
    view: 'Airport View',
    size: '',
    sizeUnit: 'Square Feet',
    name: 'Deluxe Room',
    count: 1,
    description: '',
    beds: [{ type: 'Queen Bed', count: 1 }],
    allowExtraBed: 'No',
    allowAlternateSleeping: 'No',
    baseAdults: 2,
    maxAdults: 2,
    baseChildren: 1,
    maxChildren: 1,
    maxOccupancy: 3,
    bathrooms: 1,
    mealPlan: 'FREE Breakfast',
    basePrice: '',
    extraAdultPrice: '',
    childPrice: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
    amenities: []
  });

  const [activeAmenityCategory, setActiveAmenityCategory] = useState('Mandatory');
  const [amenitySearchQuery, setAmenitySearchQuery] = useState('');

  const updateRoomForm = (field, value) => {
    setRoomForm(prev => {
      const updated = { ...prev, [field]: value };
      
      // Auto-name if changing type
      if (field === 'type') {
        updated.name = `${value} Room`;
      }
      
      // Recalculate default occupancy if beds list updates
      if (field === 'beds') {
        let defaultAdults = 0;
        value.forEach(b => {
          if (b.type.includes('King') || b.type.includes('Queen') || b.type.includes('Double')) {
            defaultAdults += 2 * b.count;
          } else {
            defaultAdults += 1 * b.count;
          }
        });
        updated.baseAdults = defaultAdults || 2;
        updated.maxAdults = defaultAdults || 2;
        updated.maxOccupancy = (defaultAdults || 2) + updated.maxChildren;
      }
      
      return updated;
    });
  };

  const handleEditRoom = (room) => {
    setRoomForm(room);
    setEditRoomId(room.id);
    setIsEditing(true);
    setActiveAmenityCategory('Mandatory');
    setAmenitySearchQuery('');
  };

  const handleOpenAddRoom = () => {
    setRoomForm({
      type: 'Deluxe',
      view: 'Airport View',
      size: '',
      sizeUnit: 'Square Feet',
      name: 'Deluxe Room',
      count: 1,
      description: '',
      beds: [{ type: 'Queen Bed', count: 1 }],
      allowExtraBed: 'No',
      allowAlternateSleeping: 'No',
      baseAdults: 2,
      maxAdults: 2,
      baseChildren: 1,
      maxChildren: 1,
      maxOccupancy: 3,
      bathrooms: 1,
      mealPlan: 'FREE Breakfast',
      basePrice: '',
      extraAdultPrice: '',
      childPrice: '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
      amenities: []
    });
    setEditRoomId(null);
    setIsEditing(true);
    setActiveAmenityCategory('Mandatory');
    setAmenitySearchQuery('');
  };

  const handleSaveRoom = () => {
    if (!roomForm.name) {
      alert("Please enter a Room Name.");
      return;
    }
    if (!roomForm.basePrice) {
      alert("Please enter a Base Rate.");
      return;
    }

    if (editRoomId) {
      // Update
      updateForm('rooms', rooms.map(r => r.id === editRoomId ? { ...roomForm } : r));
    } else {
      // Create
      updateForm('rooms', [...rooms, { ...roomForm, id: Date.now().toString() }]);
    }
    setIsEditing(false);
  };

  const handleRemoveRoom = (id, e) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to remove this room configuration?")) {
      updateForm('rooms', rooms.filter(r => r.id !== id));
    }
  };

  // Beds list handlers
  const handleAddBed = () => {
    const newBeds = [...roomForm.beds, { type: 'Queen Bed', count: 1 }];
    updateRoomForm('beds', newBeds);
  };

  const handleRemoveBed = (idx) => {
    if (roomForm.beds.length === 1) return;
    const newBeds = roomForm.beds.filter((_, i) => i !== idx);
    updateRoomForm('beds', newBeds);
  };

  const handleBedFieldChange = (idx, field, value) => {
    const newBeds = roomForm.beds.map((b, i) => {
      if (i === idx) {
        return { ...b, [field]: value };
      }
      return b;
    });
    updateRoomForm('beds', newBeds);
  };

  // Amenities handlers
  const toggleAmenity = (name, val) => {
    const current = roomForm.amenities || [];
    if (val === 'Yes') {
      if (!current.includes(name)) {
        updateRoomForm('amenities', [...current, name]);
      }
    } else {
      updateRoomForm('amenities', current.filter(a => a !== name));
    }
  };

  const getCategoryCount = (cat) => {
    let count = 0;
    cat.items.forEach(item => {
      if (roomForm.amenities.includes(item)) count++;
    });
    return count;
  };

  const activeCategoryData = ROOM_AMENITIES_DATA.find(c => c.name === activeAmenityCategory) || ROOM_AMENITIES_DATA[0];

  // Filter items in active category by search query
  const filteredAmenities = activeCategoryData.items.filter(item =>
    item.toLowerCase().includes(amenitySearchQuery.toLowerCase())
  );

  if (isEditing) {
    return (
      <div className="p-4 sm:p-8 animate-fade-in bg-gray-50/50 space-y-8 pb-20">
        <div className="flex items-center justify-between border-b pb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Room Configuration Form</h2>
            <p className="text-sm text-gray-500">Configure details, occupancy, rates, and amenities for this room type</p>
          </div>
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="text-sm font-semibold text-blue-600 hover:text-blue-800"
          >
            ← Back to Room List
          </button>
        </div>

        {/* Section 1: Room Details */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden p-6 space-y-6">
          <div className="flex items-start gap-4 mb-4">
            <span className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shrink-0">1</span>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Room Details</h3>
              <p className="text-xs text-gray-500">Add the name and key features of this room type</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pl-12">
            {/* Room Type */}
            <div>
              <label className="block text-sm font-bold text-gray-800 mb-1">Room type</label>
              <p className="text-xs text-gray-500 mb-1.5">Choose the type that best describes this room</p>
              <select
                value={roomForm.type}
                onChange={e => updateRoomForm('type', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:border-blue-500 outline-none text-sm bg-white text-gray-900"
              >
                {ROOM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* Room View */}
            <div>
              <label className="block text-sm font-bold text-gray-800 mb-1 font-sans">Room view</label>
              <p className="text-xs text-gray-500 mb-1.5 font-sans">Describe what the guest will see from this room, like pool, garden, or city views</p>
              <select
                value={roomForm.view}
                onChange={e => updateRoomForm('view', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:border-blue-500 outline-none text-sm bg-white text-gray-900"
              >
                {ROOM_VIEWS.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>

            {/* Room Size */}
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-gray-800 mb-1">Room Size (Area)</label>
              <p className="text-xs text-gray-500 mb-2">Specify the Indoor area only, excluding shared & outdoor spaces</p>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="radio"
                      name="sizeUnit"
                      checked={roomForm.sizeUnit === 'Square Feet'}
                      onChange={() => updateRoomForm('sizeUnit', 'Square Feet')}
                      className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-gray-700">Square Feet</span>
                      <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-bold">Recommended</span>
                    </div>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="radio"
                      name="sizeUnit"
                      checked={roomForm.sizeUnit === 'Square Meter'}
                      onChange={() => updateRoomForm('sizeUnit', 'Square Meter')}
                      className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <span className="text-sm font-semibold text-gray-700">Square Meter</span>
                  </label>
                </div>
                <input
                  type="number"
                  value={roomForm.size}
                  onChange={e => updateRoomForm('size', e.target.value)}
                  placeholder="Enter size (Area)"
                  className="px-3 py-2 border border-gray-300 rounded-md focus:border-blue-500 outline-none text-sm bg-white text-gray-900 w-full sm:w-48 shadow-sm"
                />
              </div>
            </div>

            {/* Room Name */}
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-gray-800 mb-1">Room Name (as displayed on ZivoHotels & partner websites)</label>
              <p className="text-xs text-gray-500 mb-2">Add a room name that looks attractive to travellers</p>
              <input
                type="text"
                value={roomForm.name}
                onChange={e => updateRoomForm('name', e.target.value)}
                placeholder="e.g. Deluxe Room"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:border-blue-500 outline-none text-sm bg-white text-gray-900 shadow-sm"
              />
            </div>

            {/* Number of Rooms */}
            <div>
              <label className="block text-sm font-bold text-gray-800 mb-1">Number of rooms (of this type)</label>
              <p className="text-xs text-gray-500 mb-2">Total rooms/units available in this property</p>
              <div className="flex items-center border border-gray-300 rounded overflow-hidden w-28 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => updateRoomForm('count', Math.max(1, roomForm.count - 1))}
                  className="px-3 py-1.5 bg-gray-50 hover:bg-gray-150 border-r border-gray-300 font-bold text-gray-600 focus:outline-none"
                >
                  -
                </button>
                <span className="flex-1 text-sm font-semibold text-gray-800 min-w-[32px] text-center">{roomForm.count}</span>
                <button
                  type="button"
                  onClick={() => updateRoomForm('count', roomForm.count + 1)}
                  className="px-3 py-1.5 bg-gray-50 hover:bg-gray-150 border-l border-gray-300 font-bold text-gray-600 focus:outline-none"
                >
                  +
                </button>
              </div>
            </div>

            {/* Description */}
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-gray-800 mb-1">Description of the room (Optional)</label>
              <p className="text-xs text-gray-500 mb-2">Describe the room by highlighting its features, sleeping arrangement, amenities, and view</p>
              <textarea
                value={roomForm.description}
                onChange={e => updateRoomForm('description', e.target.value)}
                placeholder="Write the description"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:border-blue-500 outline-none text-sm bg-white text-gray-900"
                rows="3"
              ></textarea>
            </div>
          </div>
        </div>

        {/* Section 2: Sleeping Arrangement & Occupancy */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden p-6 space-y-6">
          <div className="flex items-start gap-4 mb-4">
            <span className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shrink-0">2</span>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Sleeping Arrangement & Occupancy</h3>
              <p className="text-xs text-gray-500">Select bed types and how many guests this room can host</p>
            </div>
          </div>

          <div className="pl-12 space-y-6">
            {/* Standard Arrangement */}
            <div>
              <h4 className="text-sm font-bold text-gray-800 mb-3 border-b pb-1">Standard Arrangement</h4>
              <div className="space-y-4">
                <span className="block text-xs font-semibold text-gray-600">Select the types of beds available in this room</span>
                
                {roomForm.beds.map((bed, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-4 bg-gray-50 p-3 rounded-lg border border-gray-200 w-full max-w-xl">
                    <div className="flex-1 min-w-[200px]">
                      <span className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Bed Type {idx + 1}</span>
                      <select
                        value={bed.type}
                        onChange={e => handleBedFieldChange(idx, 'type', e.target.value)}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded focus:border-blue-500 bg-white text-sm text-gray-900 font-medium"
                      >
                        {BED_OPTIONS.map(bo => (
                          <option key={bo.name} value={bo.name}>{bo.name} ({bo.desc})</option>
                        ))}
                      </select>
                    </div>

                    <div className="shrink-0">
                      <span className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Number of beds</span>
                      <div className="flex items-center border border-gray-300 rounded overflow-hidden bg-white w-28">
                        <button
                          type="button"
                          onClick={() => handleBedFieldChange(idx, 'count', Math.max(1, bed.count - 1))}
                          className="px-3 py-1 bg-gray-50 hover:bg-gray-155 border-r border-gray-300 font-bold text-gray-600"
                        >
                          -
                        </button>
                        <span className="flex-1 text-sm font-semibold text-gray-800 text-center">{bed.count}</span>
                        <button
                          type="button"
                          onClick={() => handleBedFieldChange(idx, 'count', bed.count + 1)}
                          className="px-3 py-1 bg-gray-50 hover:bg-gray-155 border-l border-gray-300 font-bold text-gray-600"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {roomForm.beds.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveBed(idx)}
                        className="text-gray-400 hover:text-red-500 transition-colors pt-4"
                        title="Remove bed type"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={handleAddBed}
                  className="text-sm font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                >
                  <PlusCircle size={16} />
                  Add Another Bed Type
                </button>
              </div>

              {/* Extra Bed Allowed */}
              <div className="mt-5 flex items-center gap-6">
                <span className="text-sm font-bold text-gray-800">Can this room/unit accommodate extra bed(s)?</span>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="allowExtraBed"
                      checked={roomForm.allowExtraBed === 'No'}
                      onChange={() => updateRoomForm('allowExtraBed', 'No')}
                      className="w-4 h-4 text-blue-600 border-gray-300"
                    />
                    <span className="text-sm font-semibold text-gray-700">No</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="allowExtraBed"
                      checked={roomForm.allowExtraBed === 'Yes'}
                      onChange={() => updateRoomForm('allowExtraBed', 'Yes')}
                      className="w-4 h-4 text-blue-600 border-gray-300"
                    />
                    <span className="text-sm font-semibold text-gray-700">Yes</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Alternative Sleeping Arrangement */}
            <div>
              <h4 className="text-sm font-bold text-gray-800 mb-1.5 border-b pb-1">Alternative Sleeping Arrangement <span className="font-normal text-gray-500 text-xs">(Optional)</span></h4>
              <p className="text-xs text-gray-500 mb-3">If the standard sleeping arrangement isn't available, the guest will get one of the alternative bed options below</p>
              <div className="flex items-center gap-6">
                <span className="text-sm font-bold text-gray-800">Does this room offer an alternate sleeping arrangement?</span>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="allowAlternateSleeping"
                      checked={roomForm.allowAlternateSleeping === 'No'}
                      onChange={() => updateRoomForm('allowAlternateSleeping', 'No')}
                      className="w-4 h-4 text-blue-600 border-gray-300"
                    />
                    <span className="text-sm font-semibold text-gray-700">No</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="allowAlternateSleeping"
                      checked={roomForm.allowAlternateSleeping === 'Yes'}
                      onChange={() => updateRoomForm('allowAlternateSleeping', 'Yes')}
                      className="w-4 h-4 text-blue-600 border-gray-300"
                    />
                    <span className="text-sm font-semibold text-gray-700">Yes</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Occupancy details */}
            <div className="bg-gray-50 p-5 rounded-lg border border-gray-200 space-y-4">
              <h4 className="text-sm font-bold text-gray-800">Occupancy</h4>
              <p className="text-xs text-gray-400">Occupancy details have been pre-filled based on the selected bed arrangement above</p>
              
              <div className="divide-y divide-gray-200">
                {/* Base Adults */}
                <div className="flex items-center justify-between py-3">
                  <div>
                    <span className="block text-sm font-bold text-gray-800">Base adults</span>
                    <span className="text-xs text-gray-500">Ideal number of adults supported by the standard sleeping arrangement</span>
                  </div>
                  <div className="flex items-center border border-gray-300 rounded overflow-hidden bg-white w-28 shadow-sm">
                    <button
                      type="button"
                      onClick={() => updateRoomForm('baseAdults', Math.max(1, roomForm.baseAdults - 1))}
                      className="px-3 py-1 bg-gray-50 hover:bg-gray-150 border-r border-gray-300 font-bold text-gray-600 focus:outline-none"
                    >
                      -
                    </button>
                    <span className="flex-1 text-sm font-semibold text-gray-800 text-center">{roomForm.baseAdults}</span>
                    <button
                      type="button"
                      onClick={() => updateRoomForm('baseAdults', roomForm.baseAdults + 1)}
                      className="px-3 py-1 bg-gray-50 hover:bg-gray-150 border-l border-gray-300 font-bold text-gray-600 focus:outline-none"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Maximum Adults */}
                <div className="flex items-center justify-between py-3">
                  <div>
                    <span className="block text-sm font-bold text-gray-800">Maximum adults</span>
                    <span className="text-xs text-gray-500">Maximum number of adults that can be accommodated in this room</span>
                  </div>
                  <div className="flex items-center border border-gray-300 rounded overflow-hidden bg-white w-28 shadow-sm">
                    <button
                      type="button"
                      onClick={() => updateRoomForm('maxAdults', Math.max(1, roomForm.maxAdults - 1))}
                      className="px-3 py-1 bg-gray-50 hover:bg-gray-150 border-r border-gray-300 font-bold text-gray-600 focus:outline-none"
                    >
                      -
                    </button>
                    <span className="flex-1 text-sm font-semibold text-gray-800 text-center">{roomForm.maxAdults}</span>
                    <button
                      type="button"
                      onClick={() => updateRoomForm('maxAdults', roomForm.maxAdults + 1)}
                      className="px-3 py-1 bg-gray-50 hover:bg-gray-150 border-l border-gray-300 font-bold text-gray-600 focus:outline-none"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Base Children */}
                <div className="flex items-center justify-between py-3">
                  <div>
                    <span className="block text-sm font-bold text-gray-800">Base children</span>
                    <span className="text-xs text-gray-500">Maximum number of free children that can be accommodated in this room</span>
                  </div>
                  <div className="flex items-center border border-gray-300 rounded overflow-hidden bg-white w-28 shadow-sm">
                    <button
                      type="button"
                      onClick={() => updateRoomForm('baseChildren', Math.max(0, roomForm.baseChildren - 1))}
                      className="px-3 py-1 bg-gray-50 hover:bg-gray-150 border-r border-gray-300 font-bold text-gray-600 focus:outline-none"
                    >
                      -
                    </button>
                    <span className="flex-1 text-sm font-semibold text-gray-800 text-center">{roomForm.baseChildren}</span>
                    <button
                      type="button"
                      onClick={() => updateRoomForm('baseChildren', roomForm.baseChildren + 1)}
                      className="px-3 py-1 bg-gray-50 hover:bg-gray-150 border-l border-gray-300 font-bold text-gray-600 focus:outline-none"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Maximum Children */}
                <div className="flex items-center justify-between py-3">
                  <div>
                    <span className="block text-sm font-bold text-gray-800">Maximum children</span>
                    <span className="text-xs text-gray-500">Maximum number of children that can be accommodated in this room</span>
                  </div>
                  <div className="flex items-center border border-gray-300 rounded overflow-hidden bg-white w-28 shadow-sm">
                    <button
                      type="button"
                      onClick={() => updateRoomForm('maxChildren', Math.max(0, roomForm.maxChildren - 1))}
                      className="px-3 py-1 bg-gray-50 hover:bg-gray-150 border-r border-gray-300 font-bold text-gray-600 focus:outline-none"
                    >
                      -
                    </button>
                    <span className="flex-1 text-sm font-semibold text-gray-800 text-center">{roomForm.maxChildren}</span>
                    <button
                      type="button"
                      onClick={() => updateRoomForm('maxChildren', roomForm.maxChildren + 1)}
                      className="px-3 py-1 bg-gray-50 hover:bg-gray-150 border-l border-gray-300 font-bold text-gray-600 focus:outline-none"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Maximum Occupancy */}
                <div className="flex items-center justify-between py-3">
                  <div>
                    <span className="block text-sm font-bold text-gray-800">Maximum occupancy</span>
                    <span className="text-xs text-gray-500">Maximum number of guests that can be accommodated in this room</span>
                  </div>
                  <div className="flex items-center border border-gray-300 rounded overflow-hidden bg-white w-28 shadow-sm">
                    <button
                      type="button"
                      onClick={() => updateRoomForm('maxOccupancy', Math.max(1, roomForm.maxOccupancy - 1))}
                      className="px-3 py-1 bg-gray-50 hover:bg-gray-150 border-r border-gray-300 font-bold text-gray-600 focus:outline-none"
                    >
                      -
                    </button>
                    <span className="flex-1 text-sm font-semibold text-gray-800 text-center">{roomForm.maxOccupancy}</span>
                    <button
                      type="button"
                      onClick={() => updateRoomForm('maxOccupancy', roomForm.maxOccupancy + 1)}
                      className="px-3 py-1 bg-gray-50 hover:bg-gray-150 border-l border-gray-300 font-bold text-gray-600 focus:outline-none"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Bathroom Details */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden p-6 space-y-6">
          <div className="flex items-start gap-4 mb-4">
            <span className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shrink-0">3</span>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Bathroom Details</h3>
              <p className="text-xs text-gray-500">Add details of bathroom(s) for this room type</p>
            </div>
          </div>

          <div className="pl-12 flex items-center justify-between max-w-xl">
            <span className="text-sm font-bold text-gray-850">Specify number of bathroom(s) available</span>
            <div className="flex items-center border border-gray-300 rounded overflow-hidden bg-white w-28 shadow-sm">
              <button
                type="button"
                onClick={() => updateRoomForm('bathrooms', Math.max(1, roomForm.bathrooms - 1))}
                className="px-3 py-1.5 bg-gray-50 hover:bg-gray-150 border-r border-gray-300 font-bold text-gray-600 focus:outline-none"
              >
                -
              </button>
              <span className="flex-1 text-sm font-semibold text-gray-800 text-center">{roomForm.bathrooms}</span>
              <button
                type="button"
                onClick={() => updateRoomForm('bathrooms', roomForm.bathrooms + 1)}
                className="px-3 py-1.5 bg-gray-50 hover:bg-gray-150 border-l border-gray-300 font-bold text-gray-600 focus:outline-none"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Section 4: Meal Plan, Rates & Inventory Details */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden p-6 space-y-6">
          <div className="flex items-start gap-4 mb-4">
            <span className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shrink-0">4</span>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Meal Plan, Rates & Inventory Details</h3>
              <p className="text-xs text-gray-500">Set up the meal plan, pricing, and inventory to make this room ready to sell</p>
            </div>
          </div>

          <div className="pl-12 space-y-6">
            {/* Meal Options */}
            <div>
              <h4 className="text-sm font-bold text-gray-800 mb-2">Meal Options</h4>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Select a meal plan</label>
              <p className="text-[11px] text-gray-500 mb-2">Select the meals included with this room type (e.g. breakfast only, breakfast & dinner...)</p>
              <select
                value={roomForm.mealPlan}
                onChange={e => updateRoomForm('mealPlan', e.target.value)}
                className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-md focus:border-blue-500 outline-none text-sm bg-white text-gray-900"
              >
                {MEAL_PLANS.map(mp => <option key={mp} value={mp}>{mp}</option>)}
              </select>
            </div>

            {/* Room Prices */}
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-gray-800 mb-1">Room Prices</h4>
              
              {/* Base Rate */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 max-w-xl py-2 border-b border-gray-100">
                <div>
                  <span className="block text-sm font-bold text-gray-800">Base Rate for 2 adults</span>
                  <span className="text-xs text-gray-500">Enter the standard room rate for 2 adults</span>
                </div>
                <div className="flex items-center border border-gray-300 rounded-md shadow-sm overflow-hidden w-full md:w-56 bg-white">
                  <span className="px-3 bg-gray-50 border-r border-gray-300 text-gray-600 font-bold text-sm">₹</span>
                  <input
                    type="number"
                    value={roomForm.basePrice}
                    onChange={e => updateRoomForm('basePrice', e.target.value)}
                    placeholder="3500"
                    className="w-full px-3 py-2 outline-none text-sm bg-white text-gray-900"
                  />
                </div>
              </div>

              {/* Extra Adult Charge */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 max-w-xl py-2 border-b border-gray-100">
                <div>
                  <span className="block text-sm font-bold text-gray-800">Extra Adult Charge</span>
                  <span className="text-xs text-gray-500">Additional charge for each adult guest aged 18 years or older</span>
                </div>
                <div className="flex items-center border border-gray-300 rounded-md shadow-sm overflow-hidden w-full md:w-56 bg-white">
                  <span className="px-3 bg-gray-50 border-r border-gray-300 text-gray-600 font-bold text-sm">₹</span>
                  <input
                    type="number"
                    value={roomForm.extraAdultPrice}
                    onChange={e => updateRoomForm('extraAdultPrice', e.target.value)}
                    placeholder="500"
                    className="w-full px-3 py-2 outline-none text-sm bg-white text-gray-900"
                  />
                </div>
              </div>

              {/* Paid Child Charge */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 max-w-xl py-2">
                <div>
                  <span className="block text-sm font-bold text-gray-800">Paid Child Charge</span>
                  <span className="text-xs text-gray-500">Charge per child aged 7 to 17 years</span>
                </div>
                <div className="flex items-center border border-gray-300 rounded-md shadow-sm overflow-hidden w-full md:w-56 bg-white">
                  <span className="px-3 bg-gray-50 border-r border-gray-300 text-gray-600 font-bold text-sm">₹</span>
                  <input
                    type="number"
                    value={roomForm.childPrice}
                    onChange={e => updateRoomForm('childPrice', e.target.value)}
                    placeholder="200"
                    className="w-full px-3 py-2 outline-none text-sm bg-white text-gray-900"
                  />
                </div>
              </div>
            </div>

            {/* Inventory Calendar */}
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-gray-800">Inventory Calendar</h4>
              <span className="block text-xs font-semibold text-gray-600">Select a date range</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Start Date</label>
                  <input
                    type="date"
                    value={roomForm.startDate}
                    onChange={e => updateRoomForm('startDate', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:border-blue-500 outline-none text-sm bg-white text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">End Date</label>
                  <input
                    type="date"
                    value={roomForm.endDate}
                    onChange={e => updateRoomForm('endDate', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:border-blue-500 outline-none text-sm bg-white text-gray-900"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 5: Amenity Details */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-4 gap-4">
            <div className="flex items-start gap-4">
              <span className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shrink-0">5</span>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Amenity Details</h3>
                <p className="text-xs text-gray-500">select the amenities to help guests know what to expect during their stay</p>
              </div>
            </div>

            {/* Search Input inside Card */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search amenities"
                value={amenitySearchQuery}
                onChange={e => setAmenitySearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 border border-gray-300 rounded-md focus:border-blue-500 outline-none text-xs bg-white text-gray-900 shadow-sm"
              />
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-6 pl-0 sm:pl-12 items-start">
            {/* Left Category List */}
            <div className="w-full lg:w-1/3 border border-gray-200 rounded-md bg-white divide-y max-h-[400px] overflow-y-auto shrink-0 shadow-sm">
              {ROOM_AMENITIES_DATA.map(cat => {
                const active = activeAmenityCategory === cat.name;
                const count = getCategoryCount(cat);
                const total = cat.items.length;

                return (
                  <button
                    key={cat.name}
                    type="button"
                    onClick={() => setActiveAmenityCategory(cat.name)}
                    className={`w-full text-left px-4 py-3 flex items-center justify-between text-xs transition-colors focus:outline-none ${
                      active ? 'bg-blue-50 text-blue-700 font-bold border-l-4 border-blue-600' : 'text-gray-700 hover:bg-gray-55 font-medium'
                    }`}
                  >
                    <span>{cat.name}</span>
                    <span className="text-[10px] text-gray-500">({count} of {total})</span>
                  </button>
                );
              })}
            </div>

            {/* Right Amenities Toggles */}
            <div className="w-full lg:w-2/3 border border-gray-200 rounded-md bg-white p-5 max-h-[400px] overflow-y-auto space-y-4 shadow-sm">
              <span className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 border-b pb-1.5">
                {activeAmenityCategory} Options
              </span>

              {filteredAmenities.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-xs italic">
                  No matching amenities found.
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredAmenities.map((item, idx) => {
                    const isSelected = roomForm.amenities.includes(item);
                    return (
                      <div key={item} className={`flex items-center justify-between py-3 ${idx > 0 ? 'border-t border-gray-100' : ''}`}>
                        <span className="text-xs font-semibold text-gray-700">{item}</span>
                        <div className="flex items-center gap-4 shrink-0">
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="radio"
                              name={`room-amenity-${item}`}
                              checked={!isSelected}
                              onChange={() => toggleAmenity(item, 'No')}
                              className="w-3.5 h-3.5 text-blue-600 border-gray-300"
                            />
                            <span className="text-xs text-gray-600 font-medium">No</span>
                          </label>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="radio"
                              name={`room-amenity-${item}`}
                              checked={isSelected}
                              onChange={() => toggleAmenity(item, 'Yes')}
                              className="w-3.5 h-3.5 text-blue-600 border-gray-300"
                            />
                            <span className="text-xs text-gray-600 font-medium">Yes</span>
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Room Wizard Footer Navigation Actions */}
        <div className="flex items-center justify-between pt-6 border-t border-gray-200">
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="text-sm font-bold text-blue-600 hover:text-blue-800"
          >
            Cancel
          </button>
          
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => alert(`Room Configuration Preview:\n\nName: ${roomForm.name}\nType: ${roomForm.type}\nPrice: ₹${roomForm.basePrice}\nAmenities: ${roomForm.amenities.length} selected`)}
              className="text-sm font-bold text-blue-600 hover:text-blue-800"
            >
              Preview Room
            </button>
            <button
              type="button"
              onClick={handleSaveRoom}
              className="bg-[#E05A3E] hover:bg-[#c64f35] text-white px-8 py-2.5 rounded font-bold text-sm transition-colors shadow-md cursor-pointer"
            >
              Save Room Configuration
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 animate-fade-in bg-white space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-4 gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-black mb-1">Rooms Configurations</h1>
          <p className="text-sm text-gray-500">Manage and add the different types of rooms available at your property.</p>
        </div>
        
        <button
          type="button"
          onClick={handleOpenAddRoom}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded font-bold text-sm transition-colors shadow flex items-center gap-2 cursor-pointer shrink-0"
        >
          <Plus size={16} />
          Add Room Type
        </button>
      </div>

      {/* Added Rooms List */}
      <div className="space-y-4">
        {rooms.length === 0 ? (
          <div className="text-center py-16 bg-gray-50 border border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center">
            <Bed size={48} className="text-gray-400 mb-3" />
            <h3 className="font-bold text-gray-800 mb-1 text-lg">No rooms added yet</h3>
            <p className="text-gray-550 text-sm mb-6 max-w-sm">Create room configurations specifying rates, amenities, and sleeping arrangements for this property.</p>
            <button
              type="button"
              onClick={handleOpenAddRoom}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-bold text-sm transition-colors cursor-pointer"
            >
              Add Your First Room Type
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {rooms.map((room) => {
              const bedSummary = room.beds?.map(b => `${b.count}x ${b.type}`).join(', ') || 'No beds configured';
              
              return (
                <div
                  key={room.id}
                  onClick={() => handleEditRoom(room)}
                  className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-5 bg-white border border-gray-200 rounded-lg shadow-sm hover:border-blue-400 hover:shadow-md transition-all cursor-pointer gap-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="bg-blue-50 p-3.5 rounded-md shrink-0">
                      <Bed size={26} className="text-blue-600" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-bold text-gray-900 text-lg leading-tight">{room.name}</h4>
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-semibold">
                          {room.count} Unit(s)
                        </span>
                        {room.view && (
                          <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                            {room.view}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        {bedSummary} • Up to {room.maxOccupancy} Guests ({room.baseAdults} Adults, {room.baseChildren} Child)
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {room.size ? `${room.size} ${room.sizeUnit}` : 'No size specified'} • {room.mealPlan} • {room.amenities?.length || 0} Amenities
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto border-t sm:border-0 pt-3 sm:pt-0">
                    <div className="text-left sm:text-right">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Base Rate</p>
                      <p className="font-extrabold text-gray-900 text-xl">₹{room.basePrice}</p>
                    </div>
                    <button 
                      onClick={(e) => handleRemoveRoom(room.id, e)}
                      className="text-gray-400 hover:text-red-500 transition-colors p-2.5 rounded-full hover:bg-red-50 shrink-0"
                      title="Remove Room Type"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default RoomsStep;
