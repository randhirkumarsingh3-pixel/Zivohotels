import { useState } from 'react';
import Modal from './Modal';
import TagInput from './TagInput';
import ImageTagSelector from './ImageTagSelector';
import PropertyMediaLibrary from './PropertyMediaLibrary';
import { Camera, X, Library, Upload, Star, Image } from 'lucide-react';
import { getImageUrl } from '../../utils/image';

const RoomTypeModal = ({ isOpen, onClose, onSubmit, initialData = null, hotelId = null }) => {
  const [activeTab, setActiveTab] = useState('upload'); // 'upload' | 'library'
  const [uploadTags, setUploadTags] = useState([]);
  const [uploadCategory, setUploadCategory] = useState('ROOM');
  const [uploading, setUploading] = useState(false);

  const [formData, setFormData] = useState(initialData ? {
    ...initialData,
    size: initialData.roomSize || '',
    view: initialData.viewType || '',
    maxOccupancy: initialData.maxOccupancy || 2,
    baseOccupancy: initialData.baseOccupancy || 2,
    bedType: initialData.bedType || 'King',
    amenities: initialData.amenities || [],
    totalRooms: initialData.totalInventory || 10,
    isActive: initialData.isActive !== undefined ? initialData.isActive : true,
    // Images are now structured objects from include: { images: { include: { image: true } } }
    roomImages: Array.isArray(initialData.images) ? initialData.images.map(li => ({
      id: li.image.id,
      url: li.image.url,
      isPrimary: li.isPrimary
    })) : [],
    extraBedAllowed: initialData.extraBedAllowed || false,
    maxExtraBeds: initialData.maxExtraBeds || 1
  } : {
    name: '', code: '', description: '', size: '', view: '',
    maxOccupancy: 2, baseOccupancy: 2, 
    bedType: 'King',
    amenities: [], totalRooms: 10, isActive: true,
    roomImages: [],
    extraBedAllowed: false, maxExtraBeds: 1
  });

  const updateForm = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const currentHotelId = hotelId || formData.hotelId || localStorage.getItem('currentHotelId_admin');
      if (!currentHotelId || currentHotelId === 'undefined' || currentHotelId === 'null') {
        alert('Please save the property name on Step 1 first, then come back to upload room photos.');
        setUploading(false);
        return;
      }

      const token = localStorage.getItem('jwt_token');
      // 1. In a real app, you'd upload to S3/Cloudinary here. 
      // For this demo, we'll simulate a URL or use a placeholder if no actual uploader middleware is set.
      // But we must create the HotelImage record.
      const payload = {
        url: URL.createObjectURL(file), // Placeholder for real URL
        hotelId: currentHotelId,
        category: uploadCategory,
        tags: uploadTags,
        isPrimary: false
      };

      const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';
      const res = await fetch(`${BASE_URL}/admin/images`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (res.ok) {
        setFormData(prev => ({
          ...prev,
          roomImages: [...prev.roomImages, { id: data.data.id, url: data.data.url, isPrimary: prev.roomImages.length === 0 }]
        }));
        setUploadTags([]); // reset
      }
    } catch (e) {
      console.error('Upload failed', e);
    } finally {
      setUploading(false);
    }
  };

  const attachFromLibrary = (image) => {
    setFormData(prev => ({
      ...prev,
      roomImages: [...prev.roomImages, { id: image.id, url: image.url, isPrimary: prev.roomImages.length === 0 }]
    }));
  };

  const removeImage = (id) => {
    setFormData(prev => {
      const filtered = prev.roomImages.filter(img => img.id !== id);
      // If we removed the primary, pick a new one
      if (filtered.length > 0 && !filtered.find(img => img.isPrimary)) {
        filtered[0].isPrimary = true;
      }
      return { ...prev, roomImages: filtered };
    });
  };

  const setPrimary = (id) => {
    setFormData(prev => ({
      ...prev,
      roomImages: prev.roomImages.map(img => ({ ...img, isPrimary: img.id === id }))
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const primary = formData.roomImages.find(img => img.isPrimary);
    const payload = {
      name: formData.name,
      code: formData.code,
      description: formData.description,
      maxOccupancy: parseInt(formData.maxOccupancy),
      baseOccupancy: formData.baseOccupancy ? parseInt(formData.baseOccupancy) : null,
      bedType: formData.bedType,
      totalRooms: parseInt(formData.totalRooms),
      amenities: formData.amenities,
      roomSize: formData.size,
      viewType: formData.view,
      isActive: formData.isActive,
      extraBedAllowed: formData.extraBedAllowed,
      maxExtraBeds: parseInt(formData.maxExtraBeds),
      imageIds: formData.roomImages.map(img => img.id),
      primaryImageId: primary?.id,
      hotelId: formData.hotelId
    };
    onSubmit(payload);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={initialData ? "Edit Room Type" : "Add Room Type"} maxWidth="max-w-4xl">
      <form onSubmit={handleSubmit} className="space-y-8 max-h-[80vh] overflow-y-auto pr-2 pb-6 custom-scrollbar">
        
        {/* Basic Information */}
        <section>
          <h4 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-4">Basic Information</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Room Name</label>
              <input type="text" value={formData.name} onChange={e => updateForm('name', e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all" required placeholder="e.g. Deluxe Ocean Suite" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Internal Code</label>
              <input type="text" value={formData.code} onChange={e => updateForm('code', e.target.value.toUpperCase())} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none uppercase" required placeholder="e.g. DLX-SUITE" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Description</label>
              <textarea value={formData.description} onChange={e => updateForm('description', e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none" rows="3" placeholder="Describe the room's unique features..." />
            </div>
          </div>
        </section>

        {/* Media Library */}
        <section className="bg-gray-50 -mx-6 px-6 py-8 border-y border-gray-200">
          <div className="flex justify-between items-end mb-6">
            <div>
              <h4 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-1">Media Management</h4>
              <p className="text-xs text-gray-500">Tag your images to improve categorization on the booking engine.</p>
            </div>
            <div className="flex bg-white p-1 rounded-lg border border-gray-200">
              <button 
                type="button" 
                onClick={() => setActiveTab('upload')}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'upload' ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
              >
                <Upload size={14} /> Upload
              </button>
              <button 
                type="button" 
                onClick={() => setActiveTab('library')}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'library' ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
              >
                <Library size={14} /> Library
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
              {activeTab === 'upload' ? (
                <div className="space-y-6">
                  <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:bg-gray-50 transition-all cursor-pointer relative">
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer" disabled={uploading} />
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 bg-brand-50 text-brand-600 rounded-2xl flex items-center justify-center mb-3">
                        {uploading ? <div className="animate-spin h-5 w-5 border-2 border-brand-600 border-t-transparent rounded-full" /> : <Camera size={24} />}
                      </div>
                      <span className="text-sm font-bold text-gray-700">Drag or Click to Upload</span>
                      <span className="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-tight">Auto-classified under category</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Category</label>
                      <select 
                        value={uploadCategory} 
                        onChange={e => setUploadCategory(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold outline-none"
                      >
                        <option value="ROOM">Room</option>
                        <option value="EXTERIOR">Exterior</option>
                        <option value="AMENITIES">Amenities</option>
                        <option value="FOOD">Food</option>
                      </select>
                    </div>
                    <ImageTagSelector selectedTags={uploadTags} onChange={setUploadTags} />
                  </div>
                </div>
              ) : (
                <PropertyMediaLibrary 
                  hotelId={formData.hotelId || localStorage.getItem('currentHotelId_admin')} 
                  onSelect={attachFromLibrary}
                  attachedImageIds={formData.roomImages.map(img => img.id)}
                />
              )}
            </div>

            <div className="space-y-4">
              <h5 className="text-[10px] font-black text-gray-400 uppercase">Attached to this Room ({formData.roomImages.length})</h5>
              {formData.roomImages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-300 py-12">
                  <Image className="h-10 w-10 mb-2 opacity-20" />
                  <p className="text-xs italic">No images attached yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {formData.roomImages.map(img => (
                    <div key={img.id} className="group relative aspect-video rounded-xl overflow-hidden border border-gray-200 bg-gray-100 shadow-sm">
                      <img src={getImageUrl(img.url)} className="w-full h-full object-cover" alt="Attached" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button 
                          type="button" 
                          onClick={() => setPrimary(img.id)}
                          className={`p-2 rounded-lg transition-all ${img.isPrimary ? 'bg-yellow-400 text-white' : 'bg-white/20 text-white hover:bg-white/40'}`}
                        >
                          <Star size={16} fill={img.isPrimary ? 'currentColor' : 'none'} />
                        </button>
                        <button 
                          type="button" 
                          onClick={() => removeImage(img.id)}
                          className="p-2 bg-red-500/80 text-white rounded-lg hover:bg-red-600 transition-all"
                        >
                          <X size={16} />
                        </button>
                      </div>
                      {img.isPrimary && (
                        <div className="absolute top-2 left-2 bg-brand-600 text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter shadow-md">
                          Cover Image
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Configuration */}
        <section>
          <h4 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-4">Configuration</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Room Size (sq ft)</label>
              <input type="text" value={formData.size} onChange={e => updateForm('size', e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none" placeholder="e.g. 450" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">View Type</label>
              <input type="text" value={formData.view} onChange={e => updateForm('view', e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none" placeholder="e.g. Ocean, City" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Bed Type</label>
              <select value={formData.bedType} onChange={e => updateForm('bedType', e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none appearance-none bg-white">
                <option value="King">King Bed</option>
                <option value="Queen">Queen Bed</option>
                <option value="Twin">Twin Beds</option>
                <option value="Double">Double Bed</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Base Occupancy</label>
              <input type="number" min={1} value={formData.baseOccupancy} onChange={e => updateForm('baseOccupancy', e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Max Occupancy</label>
              <input type="number" min={1} value={formData.maxOccupancy} onChange={e => updateForm('maxOccupancy', e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none" required />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Physical Inventory</label>
              <input type="number" min={1} value={formData.totalRooms} onChange={e => updateForm('totalRooms', e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none" required />
            </div>
          </div>
        </section>

        {/* Extra Bed & Amenities */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <section>
            <h4 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-4">Extra Bed Rules</h4>
            <div className="space-y-4">
              <label className="flex items-center space-x-3 cursor-pointer p-4 bg-gray-50 rounded-2xl border border-gray-200 hover:bg-gray-100 transition-all">
                <input type="checkbox" checked={formData.extraBedAllowed} onChange={e => updateForm('extraBedAllowed', e.target.checked)} className="w-5 h-5 rounded-lg border-gray-300 text-brand-600 focus:ring-brand-500" />
                <span className="text-sm font-bold text-gray-700">Allow Extra Bed</span>
              </label>
              {formData.extraBedAllowed && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Max Extra Beds</label>
                  <input type="number" min="1" value={formData.maxExtraBeds} onChange={e => updateForm('maxExtraBeds', e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none" />
                </div>
              )}
            </div>
          </section>

          <section>
            <h4 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-4">Amenities</h4>
            <TagInput label="" placeholder="Add amenity (e.g. WiFi, Bathtub)..." tags={formData.amenities} setTags={(newTags) => updateForm('amenities', newTags)} />
          </section>
        </div>

        <div className="border-t border-gray-200 pt-8 flex justify-end gap-3 sticky bottom-0 bg-white">
          <button type="button" onClick={onClose} className="px-8 py-3 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors">Cancel</button>
          <button type="submit" className="px-10 py-3 text-sm font-black text-white bg-brand-600 rounded-xl hover:bg-brand-700 shadow-lg shadow-brand-200 transition-all">Save Changes</button>
        </div>
      </form>
    </Modal>
  );
};

export default RoomTypeModal;
