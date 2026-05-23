import { useState, useRef, useEffect } from 'react';
import { MapPin, Map, Building } from 'lucide-react';

const mockLocations = [
  { id: 1, name: 'Mumbai', type: 'City' },
  { id: 2, name: 'Delhi', type: 'City' },
  { id: 3, name: 'Goa', type: 'City' },
  { id: 4, name: 'Taj Mahal Palace', type: 'Hotel' },
  { id: 5, name: 'Leela Palace', type: 'Hotel' },
  { id: 6, name: 'Bandra', type: 'Area' },
  { id: 7, name: 'Connaught Place', type: 'Area' },
];

const DestinationSearch = ({ destination, setDestination, error }) => {
  const [query, setQuery] = useState(destination);
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const wrapperRef = useRef(null);

  useEffect(() => {
    setQuery(destination);
  }, [destination]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    setDestination(val);
    
    if (val.length > 0) {
      const filtered = mockLocations.filter(loc => 
        loc.name.toLowerCase().includes(val.toLowerCase())
      );
      setSuggestions(filtered);
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
    setFocusedIndex(-1);
  };

  const handleSelect = (locName) => {
    setQuery(locName);
    setDestination(locName);
    setIsOpen(false);
  };

  const handleKeyDown = (e) => {
    if (!isOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(prev => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (focusedIndex >= 0 && focusedIndex < suggestions.length) {
        handleSelect(suggestions[focusedIndex].name);
      } else if (query) {
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const getIcon = (type) => {
    switch(type) {
      case 'City': return <Map className="h-4 w-4 text-gray-400" />;
      case 'Hotel': return <Building className="h-4 w-4 text-gray-400" />;
      default: return <MapPin className="h-4 w-4 text-gray-400" />;
    }
  };

  return (
    <div className="flex-1 relative group" ref={wrapperRef}>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 ml-1">Destination</label>
      <div className={`flex items-center border rounded-xl px-4 py-3 bg-white transition-colors focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20 ${error ? 'border-red-500' : 'border-gray-200 hover:border-brand-500'}`}>
        <MapPin className="text-brand-500 mr-3 h-5 w-5" />
        <input 
          type="text" 
          placeholder="City, Hotel, or Area" 
          className="w-full bg-transparent border-none outline-none text-gray-800 placeholder-gray-400 font-medium"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onClick={() => query && setSuggestions(mockLocations.filter(l => l.name.toLowerCase().includes(query.toLowerCase()))) || setIsOpen(true)}
        />
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden animate-fade-in">
          <ul className="py-2">
            {suggestions.map((loc, index) => (
              <li 
                key={loc.id}
                onClick={() => handleSelect(loc.name)}
                onMouseEnter={() => setFocusedIndex(index)}
                className={`px-4 py-3 cursor-pointer flex items-center ${focusedIndex === index ? 'bg-gray-50 text-brand-600' : 'text-gray-700'}`}
              >
                <div className="bg-gray-100 p-2 rounded-lg mr-3">
                  {getIcon(loc.type)}
                </div>
                <div>
                  <div className="font-medium">{loc.name}</div>
                  <div className="text-xs text-gray-500">{loc.type}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {isOpen && query.length > 0 && suggestions.length === 0 && (
        <div className="absolute z-50 w-full mt-2 bg-white rounded-xl shadow-xl border border-gray-100 p-4 text-center text-gray-500 text-sm">
          No matches found
        </div>
      )}
    </div>
  );
};

export default DestinationSearch;
