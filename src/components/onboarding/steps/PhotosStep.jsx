import React, { useState, useEffect } from 'react';
import { UploadCloud, Trash2, Tag, Star, Eye, X, Check, Search, ChevronLeft, ArrowRight, Sparkles } from 'lucide-react';
import { getImageUrl } from '../../../utils/image';

const TAG_OPTIONS = [
  "EXTERIOR", "HOTEL_ENTRANCE", "LOBBY", "RECEPTION", "CORRIDOR",
  "ELEVATOR", "PARKING", "GARDEN", "TERRACE", "ROOFTOP",
  "LOUNGE_AREA", "BUSINESS_CENTER", "CONFERENCE_HALL", "BANQUET_HALL"
];

const formatTag = (tag) => {
  return tag
    .toLowerCase()
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const PhotosStep = ({ formData, updateForm }) => {
  const hotelId = formData.id || localStorage.getItem('currentHotelId');
  const rooms = formData.rooms || [];
  
  // Local Media State
  const [library, setLibrary] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  // View States
  // 'main' | 'tagging'
  const [currentView, setCurrentView] = useState('main'); 
  const [selectedImageForTagging, setSelectedImageForTagging] = useState(null);

  // Modal Room Assignment State
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignRoomType, setAssignRoomType] = useState(null);
  const [modalSearchQuery, setModalSearchQuery] = useState('');
  const [tagSearch, setTagSearch] = useState('');

  const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

  const getAuthHeaders = () => {
    const token = localStorage.getItem('jwt_token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
  };

  const fetchLibrary = async () => {
    if (!hotelId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/images?hotelId=${hotelId}`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (res.ok) {
        const imgs = data.data || [];
        setLibrary(imgs);
        updateForm('images', imgs);
      }
    } catch (err) {
      console.error('Failed to fetch media library:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLibrary();
  }, [hotelId]);

  // Handle uploading files and converting to base64
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    if (!hotelId) {
      alert("Please ensure the property details are saved first.");
      return;
    }

    setUploading(true);
    try {
      for (const file of files) {
        // Read file as base64
        const reader = new FileReader();
        const base64Promise = new Promise((resolve) => {
          reader.onloadend = () => resolve(reader.result);
        });
        reader.readAsDataURL(file);
        const base64Data = await base64Promise;

        const payload = {
          image: base64Data,
          hotelId: hotelId,
          category: 'ROOM',
          tags: [],
          isPrimary: library.length === 0 // Auto-cover for first photo
        };

        const res = await fetch(`${API_URL}/admin/images`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload)
        });
        const resJson = await res.json();
        if (!res.ok) {
          throw new Error(resJson.message || 'Upload failed');
        }
      }
      await fetchLibrary();
    } catch (err) {
      alert(err.message || 'Failed to upload one or more files.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleUpdateImage = async (imageId, payload) => {
    try {
      const res = await fetch(`${API_URL}/admin/images/${imageId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        await fetchLibrary();
      }
    } catch (err) {
      console.error('Failed to update image:', err);
    }
  };

  const handleDeleteImage = async (imageId, e) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this photo permanently?")) return;

    try {
      const res = await fetch(`${API_URL}/admin/images/${imageId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        await fetchLibrary();
        if (selectedImageForTagging?.id === imageId) {
          setSelectedImageForTagging(null);
          setCurrentView('main');
        }
      }
    } catch (err) {
      console.error('Failed to delete image:', err);
    }
  };

  // Tagging functions
  const openTaggingView = (image) => {
    setSelectedImageForTagging(image);
    setCurrentView('tagging');
  };

  const toggleTag = async (image, tag) => {
    const isSelected = image.tags.includes(tag);
    const newTags = isSelected 
      ? image.tags.filter(t => t !== tag) 
      : [...image.tags, tag];
      
    // Optimistic UI Update
    setLibrary(prev => prev.map(img => img.id === image.id ? { ...img, tags: newTags } : img));
    setSelectedImageForTagging(prev => prev.id === image.id ? { ...prev, tags: newTags } : prev);

    await handleUpdateImage(image.id, { tags: newTags });
  };

  const toggleCoverPhoto = async (image, checked) => {
    // Optimistic UI Update
    setLibrary(prev => prev.map(img => ({
      ...img,
      isPrimary: img.id === image.id ? checked : (checked ? false : img.isPrimary)
    })));
    setSelectedImageForTagging(prev => prev.id === image.id ? { ...prev, isPrimary: checked } : prev);

    await handleUpdateImage(image.id, { isPrimary: checked });
  };

  // Room assignments link handlers
  const openAssignModal = (roomType) => {
    setAssignRoomType(roomType);
    setIsAssignModalOpen(true);
  };

  const handleToggleRoomAssignment = async (image, roomType) => {
    const isLinked = image.roomLinks?.some(link => link.roomTypeId === roomType.id);
    const isUUID = typeof roomType.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roomType.id);
    
    if (!isUUID) {
      // Local-only toggle since room type is not saved in backend yet
      const updatedLinks = isLinked
        ? (image.roomLinks || []).filter(link => link.roomTypeId !== roomType.id)
        : [...(image.roomLinks || []), { roomTypeId: roomType.id, imageId: image.id }];
      
      const updatedLibrary = library.map(img => 
        img.id === image.id ? { ...img, roomLinks: updatedLinks } : img
      );
      setLibrary(updatedLibrary);
      updateForm('images', updatedLibrary);
      return;
    }

    try {
      if (isLinked) {
        const res = await fetch(`${API_URL}/admin/images/room-types/${roomType.id}/images/${image.id}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        if (res.ok) await fetchLibrary();
      } else {
        const res = await fetch(`${API_URL}/admin/images/room-types/${roomType.id}`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ imageId: image.id, isPrimary: false })
        });
        if (res.ok) await fetchLibrary();
      }
    } catch (err) {
      console.error('Failed to toggle room assignment:', err);
    }
  };

  // Helper getters
  const coverImage = library.find(img => img.isPrimary) || library[0] || null;
  const untaggedCount = library.filter(img => !img.tags || img.tags.length === 0).length;

  if (currentView === 'tagging' && selectedImageForTagging) {
    const baseTags = [
      ...TAG_OPTIONS,
      "ROOMS",
      "BATHROOM"
    ];
    const roomTags = (rooms || []).map(r => r.name.toUpperCase().trim().replace(/[^A-Z0-9_]+/g, '_')).filter(Boolean);
    const dynamicTagOptions = Array.from(new Set([...baseTags, ...roomTags]));
    const filteredTags = dynamicTagOptions.filter(tag => tag.toLowerCase().includes(tagSearch.toLowerCase()));

    return (
      <div className="p-4 sm:p-8 animate-fade-in bg-gray-50/50 space-y-6 min-h-[70vh] pb-24">
        {/* Header Navigation */}
        <div className="flex items-center justify-between border-b pb-4 bg-white -mx-4 px-4 sm:-mx-8 sm:px-8 py-3 shadow-sm sticky top-0 z-10">
          <button
            type="button"
            onClick={() => setCurrentView('main')}
            className="flex items-center gap-2 text-sm font-bold text-gray-700 hover:text-gray-900 focus:outline-none"
          >
            <ChevronLeft size={16} /> Back
          </button>
          <div>
            <h2 className="text-lg font-black text-gray-900 text-center">Untagged Items ({untaggedCount})</h2>
            <p className="text-xs text-gray-500 text-center">Add tags to classify this asset</p>
          </div>
          <div className="w-16"></div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          {/* Sidebar Thumbnail List */}
          <div className="lg:col-span-1 border border-gray-200 rounded-xl bg-white p-4 space-y-3 max-h-[550px] overflow-y-auto shadow-sm">
            <span className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">Assets Queue</span>
            <div className="grid grid-cols-3 lg:grid-cols-1 gap-2">
              {library.map(img => {
                const isActive = img.id === currentImg.id;
                const hasTags = img.tags && img.tags.length > 0;
                return (
                  <div
                    key={img.id}
                    onClick={() => openTaggingView(img)}
                    className={`relative aspect-video rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                      isActive ? 'border-blue-600 scale-[1.02] shadow' : 'border-transparent hover:border-gray-300'
                    }`}
                  >
                    <img src={getImageUrl(img.url)} className="w-full h-full object-cover" alt="thumbnail" />
                    {!hasTags && (
                      <span className="absolute bottom-1 right-1 bg-red-500 text-white text-[8px] font-bold px-1 py-0.5 rounded-sm">
                        MISSING
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Central Preview Panel */}
          <div className="lg:col-span-2 space-y-4">
            <div className="relative aspect-video w-full rounded-xl overflow-hidden border border-gray-200 bg-black flex items-center justify-center group shadow-md">
              <img src={getImageUrl(currentImg.url)} className="max-w-full max-h-full object-contain" alt="Preview" />
              
              {/* Delete Icon Trigger */}
              <button
                type="button"
                onClick={(e) => handleDeleteImage(currentImg.id, e)}
                className="absolute top-4 right-4 bg-white/90 hover:bg-red-500 hover:text-white p-2.5 rounded-full shadow-lg text-gray-600 transition-all focus:outline-none"
                title="Delete Photo"
              >
                <Trash2 size={18} />
              </button>
            </div>

            {/* Set as Cover Checkbox */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
              <div>
                <span className="block text-sm font-bold text-gray-800">Property Cover Photo</span>
                <span className="text-xs text-gray-500">Make this image the main display photo for your property list banner</span>
              </div>
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={currentImg.isPrimary}
                  onChange={(e) => toggleCoverPhoto(currentImg, e.target.checked)}
                  className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                />
                <span className="text-sm font-semibold text-gray-700">{currentImg.isPrimary ? 'Set as cover photo' : 'Set as cover photo'}</span>
              </label>
            </div>
          </div>

          {/* Right Tags Selector Checklist */}
          <div className="lg:col-span-1 border border-gray-200 rounded-xl bg-white p-5 space-y-4 shadow-sm">
            <div className="border-b pb-3">
              <h3 className="text-sm font-black text-gray-850 uppercase tracking-widest">Selected Tags</h3>
              <p className="text-[11px] text-gray-400 mt-1">Associate tags to help guests search and filters</p>
            </div>

            {/* Tag Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
              <input
                type="text"
                placeholder="Search tags"
                value={tagSearch}
                onChange={e => setTagSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-xs outline-none bg-gray-50 focus:bg-white focus:border-blue-500 transition-all text-gray-800"
              />
            </div>

            {/* Tag Choices Scroll Grid */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
              {filteredTags.map(tag => {
                const isTagged = currentImg.tags.includes(tag);
                return (
                  <label
                    key={tag}
                    className={`flex items-center justify-between p-3 rounded-lg border text-xs cursor-pointer select-none transition-all ${
                      isTagged ? 'border-blue-500 bg-blue-50/50 font-bold text-blue-700 shadow-sm' : 'border-gray-150 hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <span>{formatTag(tag)}</span>
                    <input
                      type="checkbox"
                      checked={isTagged}
                      onChange={() => toggleTag(currentImg, tag)}
                      className="hidden"
                    />
                    {isTagged && <Check size={14} className="text-blue-600" />}
                  </label>
                );
              })}
              {filteredTags.length === 0 && (
                <div className="text-center py-6 text-gray-400 italic text-xs">No matching tags found.</div>
              )}
            </div>
            
            <button
              type="button"
              onClick={() => setCurrentView('main')}
              className="w-full bg-[#E05A3E] hover:bg-[#c64f35] text-white py-2.5 rounded-lg text-xs font-bold transition-all shadow-md mt-4 cursor-pointer"
            >
              Add Tag
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 animate-fade-in bg-white space-y-6 pb-24">
      {/* Step Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-4 gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-black flex items-center gap-2">
            Photos & Videos <span className="text-gray-400 font-medium">({library.length})</span>
          </h1>
          <p className="text-sm text-gray-500">Manage, tag, and assign media items of your property.</p>
        </div>

        {/* Upload More Button Trigger */}
        <label className="bg-[#E05A3E] hover:bg-[#c64f35] text-white px-5 py-2.5 rounded font-bold text-sm transition-colors shadow flex items-center gap-2 cursor-pointer shrink-0">
          <UploadCloud size={16} />
          Upload More
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileUpload}
            disabled={uploading}
          />
        </label>
      </div>

      {/* Main Cover Banner */}
      <div className="relative aspect-video sm:h-72 w-full rounded-2xl overflow-hidden border border-gray-200 bg-gray-100 shadow">
        {coverImage ? (
          <>
            <img src={getImageUrl(coverImage.url)} className="w-full h-full object-cover animate-fade-in" alt="Property Cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex flex-col justify-end p-6">
              <span className="text-[10px] bg-blue-600 text-white font-black px-2 py-0.5 rounded uppercase w-fit tracking-wider shadow-sm mb-1.5">
                Property cover photo
              </span>
              <button
                type="button"
                onClick={() => openTaggingView(coverImage)}
                className="text-xs text-white/90 hover:text-white font-bold underline text-left w-fit"
              >
                Change
              </button>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-gray-400">
            <UploadCloud size={40} className="mb-2" />
            <p className="text-sm font-semibold">No cover image set yet</p>
            <p className="text-xs text-gray-550 mt-1">Upload files below to get started</p>
          </div>
        )}
      </div>

      {/* Review Alert Notice */}
      <div className="border border-amber-200 bg-amber-50/50 rounded-xl p-4 flex items-center justify-between text-xs text-amber-800 shadow-sm gap-4">
        <div className="flex items-center gap-2.5">
          <Sparkles className="text-amber-600 shrink-0 w-4 h-4" />
          <span>{library.length} photos & videos are being reviewed. It will take up to 24 hrs.</span>
        </div>
        <button
          type="button"
          onClick={() => {
            if (library.length > 0) openTaggingView(library[0]);
          }}
          className="font-bold underline text-blue-700 hover:text-blue-900"
        >
          View Items
        </button>
      </div>

      {/* Untagged Files Section Box */}
      <div className="border border-red-200 rounded-xl p-5 bg-red-50/10 space-y-4 shadow-sm">
        <div>
          <h3 className="text-sm font-extrabold text-gray-900">Untagged Photos & Videos ({untaggedCount})</h3>
          <p className="text-xs text-gray-500">Click here to tag photos & videos. Tagged photos & videos help to address customer queries.</p>
        </div>

        {loading ? (
          <div className="py-8 text-center text-xs text-gray-400 italic">Loading media assets...</div>
        ) : library.length === 0 ? (
          <div className="py-12 border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center text-center">
            <UploadCloud size={36} className="text-gray-300 mb-2" />
            <span className="text-xs text-gray-400 font-semibold">No files uploaded yet</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
            {library.map(img => {
              const hasTags = img.tags && img.tags.length > 0;
              return (
                <div
                  key={img.id}
                  onClick={() => openTaggingView(img)}
                  className={`group relative aspect-video rounded-lg overflow-hidden border cursor-pointer bg-gray-50 shadow-sm hover:shadow transition-all ${
                    !hasTags ? 'border-red-400 hover:border-red-500' : 'border-gray-200'
                  }`}
                >
                  <img src={getImageUrl(img.url)} className="w-full h-full object-cover" alt="grid-asset" />
                  
                  {/* Hover Tag overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-[10px] bg-white text-gray-800 px-2 py-1 rounded font-bold flex items-center gap-1.5">
                      <Tag size={10} /> + Add Tag
                    </span>
                  </div>

                  {/* Warning Pill if tag missing */}
                  {!hasTags && (
                    <span className="absolute bottom-1.5 left-1.5 right-1.5 bg-red-600 text-white text-[8px] font-black py-0.5 rounded-sm text-center uppercase tracking-wider">
                      🛈 Tag Missing
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Room Specific Photo Assignments Grid */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-extrabold text-gray-900">Photos & Videos assigned to the rooms & restaurant(s)</h3>
          <p className="text-xs text-gray-500">Photos help customers visualize what the room looks like</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {rooms.map(room => {
            const assignedImages = library.filter(img => 
              img.roomLinks?.some(link => link.roomTypeId === room.id)
            );

            return (
              <div key={room.id} className="border border-gray-200 rounded-xl bg-white p-4 space-y-3 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                <div>
                  <h4 className="font-extrabold text-gray-950 text-sm">{room.name}</h4>
                  <p className="text-[11px] text-gray-400 uppercase tracking-tighter font-semibold mt-0.5">
                    {assignedImages.length} photo(s) assigned
                  </p>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto py-1 custom-scrollbar scrollbar-thin">
                  {/* Assigned images thumbnails */}
                  {assignedImages.slice(0, 4).map(img => (
                    <div key={img.id} className="w-12 h-12 rounded-lg overflow-hidden border border-gray-250 shrink-0 bg-gray-50">
                      <img src={getImageUrl(img.url)} className="w-full h-full object-cover" alt="assigned" />
                    </div>
                  ))}
                  {assignedImages.length > 4 && (
                    <div className="w-12 h-12 rounded-lg bg-gray-150 text-gray-700 flex items-center justify-center font-bold text-xs border shrink-0">
                      +{assignedImages.length - 4}
                    </div>
                  )}

                  {/* Add images to room trigger button */}
                  <button
                    type="button"
                    onClick={() => openAssignModal(room)}
                    className="w-12 h-12 border-2 border-dashed border-blue-400 hover:border-blue-600 hover:bg-blue-50/50 rounded-lg flex items-center justify-center font-bold text-blue-600 transition-colors shrink-0 outline-none"
                    title="Assign images to room"
                  >
                    +
                  </button>
                </div>
              </div>
            )})}
        </div>
      </div>

      {/* Room Assignment Modal */}
      {isAssignModalOpen && assignRoomType && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden shadow-2xl flex flex-col justify-between animate-scale-up">
            {/* Modal Header */}
            <div className="p-5 border-b flex items-start justify-between">
              <div>
                <h3 className="text-md font-black text-gray-950">Upload or select photos & videos for {assignRoomType.name}</h3>
                <p className="text-xs text-gray-500 mt-1">Photos help customers visualize what the room looks like</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAssignModalOpen(false)}
                className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 focus:outline-none"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Filter and Search */}
            <div className="px-5 py-3 border-b bg-gray-50/50 flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
                <input
                  type="text"
                  placeholder="Search assets by tag..."
                  value={modalSearchQuery}
                  onChange={e => setModalSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-250 rounded-lg text-xs outline-none bg-white text-gray-800"
                />
              </div>
            </div>

            {/* Modal Assets Selector Scroll area */}
            <div className="p-5 overflow-y-auto max-h-[45vh] grid grid-cols-2 sm:grid-cols-3 gap-4 custom-scrollbar">
              {library
                .filter(img => 
                  !modalSearchQuery || 
                  img.tags.some(tag => tag.toLowerCase().includes(modalSearchQuery.toLowerCase()))
                )
                .map(image => {
                  const isLinked = image.roomLinks?.some(link => link.roomTypeId === assignRoomType.id);
                  return (
                    <div
                      key={image.id}
                      onClick={() => handleToggleRoomAssignment(image, assignRoomType)}
                      className={`relative aspect-video rounded-lg overflow-hidden border-2 cursor-pointer bg-gray-50 shadow-sm transition-all hover:scale-[1.01] ${
                        isLinked ? 'border-blue-600 ring-2 ring-blue-100' : 'border-gray-200'
                      }`}
                    >
                      <img src={getImageUrl(image.url)} className="w-full h-full object-cover" alt="assign-thumb" />
                      
                      {/* Checkbox Overlay */}
                      <div className="absolute top-2 right-2 flex items-center justify-center w-5 h-5 rounded border border-gray-300 bg-white/95">
                        {isLinked && <Check size={12} className="text-blue-600 font-bold" />}
                      </div>

                      {/* Cover label indicator */}
                      {image.isPrimary && (
                        <span className="absolute bottom-2 left-2 bg-amber-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-sm uppercase">
                          Cover
                        </span>
                      )}
                    </div>
                  );
                })}
              {library.length === 0 && (
                <div className="col-span-full py-12 text-center text-gray-400 italic text-xs">
                  No images in library. Upload files first to assign them.
                </div>
              )}
            </div>

            {/* Modal Footer Controls */}
            <div className="p-5 border-t bg-gray-50 flex items-center justify-between">
              <button
                type="button"
                onClick={async () => {
                  // Deselect All
                  const linkedImages = library.filter(img => img.roomLinks?.some(link => link.roomTypeId === assignRoomType.id));
                  for (const img of linkedImages) {
                    await handleToggleRoomAssignment(img, assignRoomType);
                  }
                }}
                className="text-xs font-bold text-blue-700 hover:text-blue-900 cursor-pointer"
              >
                Deselect All
              </button>

              <div className="flex items-center gap-3">
                {/* Upload New file directly to room type */}
                <label className="border border-blue-600 text-blue-700 hover:bg-blue-50 px-4 py-2 rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-sm">
                  Upload New
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={async (e) => {
                      const files = Array.from(e.target.files);
                      if (files.length === 0) return;
                      
                      setUploading(true);
                      try {
                        for (const file of files) {
                          const reader = new FileReader();
                          const base64Promise = new Promise((resolve) => {
                            reader.onloadend = () => resolve(reader.result);
                          });
                          reader.readAsDataURL(file);
                          const base64Data = await base64Promise;

                          // Upload
                          const res = await fetch(`${API_URL}/admin/images`, {
                            method: 'POST',
                            headers: getAuthHeaders(),
                            body: JSON.stringify({
                              image: base64Data,
                              hotelId: hotelId,
                              category: 'ROOM',
                              tags: [],
                              isPrimary: false
                            })
                          });
                          const data = await res.json();
                          if (res.ok) {
                            // Automatically link to room type
                            await fetch(`${API_URL}/admin/images/room-types/${assignRoomType.id}`, {
                              method: 'POST',
                              headers: getAuthHeaders(),
                              body: JSON.stringify({ imageId: data.data.id, isPrimary: false })
                            });
                          }
                        }
                        await fetchLibrary();
                      } catch (err) {
                        alert('Upload failed');
                      } finally {
                        setUploading(false);
                      }
                    }}
                  />
                </label>

                <button
                  type="button"
                  onClick={() => setIsAssignModalOpen(false)}
                  className="bg-gray-300/80 hover:bg-gray-300 text-gray-800 px-6 py-2 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer"
                >
                  Assign
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PhotosStep;
