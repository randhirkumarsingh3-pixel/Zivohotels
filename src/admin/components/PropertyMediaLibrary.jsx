import React, { useState, useEffect } from 'react';
import { Search, Filter, Image as ImageIcon, CheckCircle2, Plus } from 'lucide-react';
import { getImageUrl } from '../../utils/image';

const formatTag = (tag) => {
  return tag
    .toLowerCase()
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const PropertyMediaLibrary = ({ hotelId, onSelect, attachedImageIds = [] }) => {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState({ category: '', tag: '' });

  const fetchLibrary = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('jwt_token');
      const query = new URLSearchParams({ hotelId, ...filter }).toString();
      const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';
      const res = await fetch(`${BASE_URL}/admin/images?${query}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) setImages(data.data || []);
    } catch (e) {
      console.error('Library load fail', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hotelId) fetchLibrary();
  }, [hotelId, filter]);

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <select 
          className="text-xs border rounded-lg px-3 py-2 outline-none bg-gray-50"
          value={filter.category}
          onChange={e => setFilter(p => ({...p, category: e.target.value}))}
        >
          <option value="">All Categories</option>
          <option value="ROOM">Rooms</option>
          <option value="EXTERIOR">Exterior</option>
          <option value="AMENITIES">Amenities</option>
          <option value="FOOD">Food</option>
        </select>
        
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search by tag..." 
            className="w-full pl-9 pr-4 py-2 border rounded-lg text-xs outline-none bg-gray-50"
            onChange={e => setFilter(p => ({...p, tag: e.target.value.toUpperCase()}))}
          />
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-400 text-xs italic">Searching property library...</div>
      ) : images.length === 0 ? (
        <div className="py-12 text-center border-2 border-dashed rounded-xl border-gray-100">
          <ImageIcon className="h-8 w-8 text-gray-200 mx-auto mb-2" />
          <p className="text-xs text-gray-400 font-medium">No images found in library.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
          {images.map(img => {
            const isAttached = attachedImageIds.includes(img.id);
            return (
              <div 
                key={img.id}
                onClick={() => !isAttached && onSelect(img)}
                className={`
                  relative aspect-video rounded-lg overflow-hidden border-2 cursor-pointer transition-all
                  ${isAttached ? 'border-brand-500 opacity-60 grayscale' : 'border-transparent hover:border-brand-300'}
                `}
              >
                <img src={getImageUrl(img.url)} className="w-full h-full object-cover" alt="Library" />
                <div className="absolute inset-x-0 bottom-0 bg-black/50 p-1">
                  <div className="flex flex-wrap gap-0.5">
                    {img.tags.slice(0, 2).map(t => (
                      <span key={t} className="text-[7px] text-white bg-white/20 px-1 rounded-sm font-bold">
                        {formatTag(t)}
                      </span>
                    ))}
                  </div>
                </div>
                {isAttached && (
                  <div className="absolute inset-0 flex items-center justify-center bg-brand-600/20">
                    <CheckCircle2 className="text-white drop-shadow-md" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PropertyMediaLibrary;
