import { useState } from 'react';
import { AMENITY_GROUPS as AMENITIES_DATA } from '../../../constants/amenities';

const AmenitiesStep = ({ formData, updateForm }) => {
  const [activeCategory, setActiveCategory] = useState('Mandatory');
  const [searchQuery, setSearchQuery] = useState('');
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

  // Global search filtering
  const searchResults = searchQuery
    ? AMENITIES_DATA.flatMap(c => 
        c.items
          .filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()))
          .map(item => ({ ...item, categoryName: c.name }))
      )
    : [];

  return (
    <div className="animate-fade-in flex flex-col h-full">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">What makes your place special?</h1>
          <p className="text-slate-500 mt-2 text-lg">Select the amenities and services your property offers.</p>
        </div>
        <div className="relative w-full sm:w-72">
          <input 
            type="text" 
            placeholder="Search amenities..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none text-sm font-medium transition-all"
          />
          <svg className="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 items-start h-[calc(100vh-280px)] min-h-[500px]">
        {/* Left Column: Categories Sidebar */}
        <div className={`w-full lg:w-1/3 bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden shadow-sm shrink-0 h-full overflow-y-auto hidden-scrollbar ${searchQuery ? 'hidden lg:block opacity-50 pointer-events-none' : ''}`}>
          <div className="p-4 bg-white border-b border-slate-200 sticky top-0 z-10">
            <h3 className="font-bold text-slate-800">Categories</h3>
          </div>
          <div className="divide-y divide-slate-100">
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
                      ? 'bg-blue-600 border-l-4 border-blue-800 text-white font-bold shadow-md'
                      : 'text-slate-700 hover:bg-slate-100 font-medium border-l-4 border-transparent'
                  }`}
                >
                  <span className="truncate pr-2">{cat.name}</span>
                  <span className={`text-xs px-2.5 py-1 rounded-full shrink-0 font-bold ${
                    active ? 'bg-white/20 text-white' : count > 0 ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-500'
                  }`}>
                    {count} / {total}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Amenities Grid */}
        <div className="w-full lg:w-2/3 border border-slate-200 rounded-2xl shadow-sm bg-white p-6 sm:p-8 h-full flex flex-col">
          <div className="border-b border-slate-100 pb-4 mb-6 shrink-0 flex items-center justify-between">
            <h2 className="text-xl font-extrabold text-slate-900">
              {searchQuery ? `Search Results for "${searchQuery}"` : activeCategory}
            </h2>
            <span className="text-sm font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
              {searchQuery ? `${searchResults.length} Found` : `${getSelectedCount(activeCategoryData)} Selected`}
            </span>
          </div>

          <div className="overflow-y-auto pr-2 hidden-scrollbar flex-1 pb-10">
            {searchQuery && searchResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <svg className="w-16 h-16 mb-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-lg font-medium">No amenities found</p>
                <p className="text-sm">Try adjusting your search</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(searchQuery ? searchResults : activeCategoryData.items).map((item) => {
                  const selected = isSelected(item.name);
                  const dropVal = item.hasDropdown ? getDropdownValue(item.name, item.options[0]) : '';

                  return (
                  <div 
                    key={item.name} 
                    className={`relative overflow-hidden rounded-xl border-2 transition-all duration-200 ${
                      selected 
                        ? 'border-blue-600 bg-blue-50/50 shadow-md' 
                        : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50 cursor-pointer'
                    }`}
                  >
                    <div 
                      className="p-4 flex flex-row items-center justify-between gap-3 cursor-pointer select-none"
                      onClick={() => handleToggle(item.name, selected ? 'No' : 'Yes', item.hasDropdown, item.options)}
                    >
                      <span className={`font-semibold text-xs ${selected ? 'text-blue-900' : 'text-slate-700'}`}>
                        {item.name}
                        {searchQuery && (
                          <span className="block text-xs text-slate-400 font-normal mt-0.5">{item.categoryName}</span>
                        )}
                      </span>

                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                        selected ? 'bg-blue-600 border-blue-600' : 'border-slate-300'
                      }`}>
                        {selected && (
                          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>

                    {/* Dropdown Select if YES is selected and dropdown is supported */}
                    {item.hasDropdown && selected && (
                      <div className="px-4 pb-4 animate-fade-in w-full">
                        <select
                          value={dropVal}
                          onChange={(e) => handleDropdownChange(item.name, e.target.value)}
                          className="w-full px-4 py-2.5 border-2 border-blue-200 rounded-lg focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none text-sm bg-white text-slate-900 shadow-sm font-medium transition-all"
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AmenitiesStep;
