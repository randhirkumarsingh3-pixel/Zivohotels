import React, { useState } from 'react';
import { UploadCloud, X } from 'lucide-react';

const PhotosStep = ({ formData, updateForm }) => {
  const images = formData.images || [];
  const [urlInput, setUrlInput] = useState('');

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    const newEntries = files.map(file => ({
      url: URL.createObjectURL(file),
      file,
      tags: [],
    }));
    updateForm('images', [...images, ...newEntries]);
    e.target.value = '';
  };

  const handleUrlAdd = () => {
    if (!urlInput.trim()) return;
    updateForm('images', [...images, { url: urlInput.trim(), file: null, tags: [] }]);
    setUrlInput('');
  };

  const removeImage = (index) => {
    updateForm('images', images.filter((_, i) => i !== index));
  };

  return (
    <div className="p-8 animate-fade-in">
      <h2 className="text-xl font-bold text-gray-900 mb-2 border-b pb-4">Photos And Videos</h2>
      <p className="text-sm text-gray-500 mb-8">Great photos invite more bookings. Upload high-quality images of your property, rooms, and amenities.</p>

      {/* Upload Drop Zone */}
      <label className="block bg-gray-50 border-2 border-dashed border-blue-200 rounded-xl p-12 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-blue-50 transition-all mb-6">
        <div className="bg-white p-4 rounded-full shadow-sm mb-4">
          <UploadCloud size={32} className="text-blue-600" />
        </div>
        <h4 className="text-lg font-bold text-gray-800">Click to upload or drag & drop</h4>
        <p className="text-sm text-gray-500 mt-2">PNG, JPG (max. 5MB each). Upload at least 5 photos.</p>
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
      </label>

      {/* Or by URL */}
      <div className="flex gap-2 mb-8">
        <input
          type="url"
          value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
          placeholder="Or paste image URL here..."
          className="flex-1 px-4 py-3 border border-gray-300 rounded-md text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white"
        />
        <button
          type="button"
          onClick={handleUrlAdd}
          disabled={!urlInput.trim()}
          className="px-6 py-3 bg-white border border-gray-300 text-gray-700 font-semibold rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          Add URL
        </button>
      </div>

      {/* Uploaded Grid */}
      {images.length > 0 && (
        <div>
          <h3 className="text-md font-bold text-gray-800 mb-4">Uploaded Assets ({images.length})</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {images.map((img, idx) => (
              <div key={idx} className="relative aspect-video bg-gray-100 rounded-lg overflow-hidden border border-gray-200 group">
                <img src={img.url} alt={`upload-${idx}`} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button
                    onClick={() => removeImage(idx)}
                    className="bg-red-500 text-white p-2 rounded-full hover:bg-red-600 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};

export default PhotosStep;
