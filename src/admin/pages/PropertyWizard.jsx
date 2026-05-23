import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, ChevronLeft, Save, CheckCircle, UploadCloud, X, Navigation } from 'lucide-react';

// Reusable Tag Input Component
const TagInput = ({ label, placeholder, tags, setTags }) => {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && inputValue.trim() !== '') {
      e.preventDefault();
      if (!tags.includes(inputValue.trim())) {
        setTags([...tags, inputValue.trim()]);
      }
      setInputValue('');
    }
  };

  const removeTag = (indexToRemove) => {
    setTags(tags.filter((_, index) => index !== indexToRemove));
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex flex-wrap gap-2 mb-2">
        {tags.map((tag, index) => (
          <span key={index} className="bg-brand-50 text-brand-700 px-2.5 py-1 rounded-md text-sm flex items-center border border-brand-200">
            {tag}
            <button type="button" onClick={() => removeTag(index)} className="ml-1.5 text-brand-500 hover:text-brand-800">
              <X size={14} />
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
      />
      <p className="text-xs text-gray-500 mt-1">Press Enter to add</p>
    </div>
  );
};

// ─── Suggested Tags ───────────────────────────────────────────────────────────
const SUGGESTED_TAGS = ['exterior', 'room', 'bathroom', 'reception', 'amenities', 'food', 'lobby', 'pool', 'corridor', 'view'];
const MAX_TAGS = 10;

// ─── ImageTagCard ─────────────────────────────────────────────────────────────
const ImageTagCard = ({ img, index, onUpdateTags, onRemoveImage }) => {
  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);

  const addTag = (raw) => {
    const tag = raw.toLowerCase().trim();
    if (!tag || img.tags.includes(tag) || img.tags.length >= MAX_TAGS) return;
    onUpdateTags(index, [...img.tags, tag]);
  };

  const removeTag = (tag) => {
    onUpdateTags(index, img.tags.filter(t => t !== tag));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(input);
      setInput('');
    } else if (e.key === 'Backspace' && input === '' && img.tags.length > 0) {
      removeTag(img.tags[img.tags.length - 1]);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Image Preview */}
      <div className="relative aspect-video bg-gray-100 overflow-hidden">
        {img.url ? (
          <img src={img.url} alt={`upload-${index}`} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
            No Preview
          </div>
        )}
        <button
          onClick={() => onRemoveImage(index)}
          className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 shadow transition-colors"
          title="Remove image"
        >
          <X size={13} />
        </button>
        {img.tags.length > 0 && (
          <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full font-medium">
            {img.tags.length} tag{img.tags.length > 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Tag Section */}
      <div className="p-3">
        {/* Existing Tags */}
        <div className="flex flex-wrap gap-1.5 mb-2 min-h-[24px]">
          {img.tags.map(tag => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 bg-brand-50 text-brand-700 border border-brand-200 text-xs px-2 py-0.5 rounded-full font-medium"
            >
              {tag}
              <button onClick={() => removeTag(tag)} className="hover:text-red-500 transition-colors ml-0.5">
                <X size={10} />
              </button>
            </span>
          ))}
          {img.tags.length === 0 && (
            <span className="text-xs text-gray-400 italic">No tags yet</span>
          )}
        </div>

        {/* Tag Input */}
        {img.tags.length < MAX_TAGS ? (
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder="Type and press Enter to add tags"
            className="w-full text-xs px-2.5 py-1.5 border border-gray-300 rounded-lg outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400 placeholder:text-gray-400"
          />
        ) : (
          <p className="text-xs text-amber-600 font-medium">Max {MAX_TAGS} tags reached</p>
        )}

        {/* Suggested tags — shown on focus */}
        {focused && input === '' && (
          <div className="mt-2 flex flex-wrap gap-1">
            {SUGGESTED_TAGS.filter(t => !img.tags.includes(t)).slice(0, 6).map(t => (
              <button
                key={t}
                onMouseDown={() => { addTag(t); setInput(''); }}
                className="text-xs bg-gray-100 hover:bg-brand-50 hover:text-brand-700 text-gray-600 px-2 py-0.5 rounded-full border border-gray-200 transition-colors"
              >
                + {t}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Step6Media Component ─────────────────────────────────────────────────────
const Step6Media = ({ images, setImages }) => {
  const fileInputRef = useState(null);

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    const newEntries = files.map(file => ({
      url:  URL.createObjectURL(file),
      file, // kept for actual upload later
      tags: [],
    }));
    setImages([...images, ...newEntries]);
    e.target.value = ''; // reset input
  };

  const handleUrlAdd = (url) => {
    if (!url.trim()) return;
    setImages([...images, { url: url.trim(), file: null, tags: [] }]);
  };

  const updateTags = (index, newTags) => {
    const updated = [...images];
    updated[index] = { ...updated[index], tags: newTags };
    setImages(updated);
  };

  const removeImage = (index) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const [urlInput, setUrlInput] = useState('');

  return (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-xl font-bold text-gray-800 border-b pb-4">Property Media</h2>

      {/* Upload Drop Zone */}
      <label className="block bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-10 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-brand-50 hover:border-brand-400 transition-all">
        <div className="bg-white p-4 rounded-full shadow-sm mb-4">
          <UploadCloud size={32} className="text-brand-600" />
        </div>
        <h4 className="text-lg font-semibold text-gray-800">Click to upload or drag & drop</h4>
        <p className="text-sm text-gray-500 mt-2">PNG, JPG (max. 5MB each). Multiple files supported.</p>
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
      </label>

      {/* Or by URL */}
      <div className="flex gap-2">
        <input
          type="url"
          value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
          placeholder="Or paste image URL..."
          className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />
        <button
          type="button"
          onClick={() => { handleUrlAdd(urlInput); setUrlInput(''); }}
          disabled={!urlInput.trim()}
          className="px-4 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          Add
        </button>
      </div>

      {/* Uploaded Assets */}
      {images.length > 0 ? 
        <div>
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-gray-800 flex items-center gap-2">
              Uploaded Assets
              <span className="bg-brand-100 text-brand-700 text-xs font-bold px-2 py-0.5 rounded-full">
                {images.length} image{images.length > 1 ? 's' : ''}
              </span>
            </h4>
            <p className="text-xs text-gray-500">
              Tags help guests find the right images. Max {MAX_TAGS} per image.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {images.map((img, idx) => (
              <ImageTagCard
                key={idx}
                img={img}
                index={idx}
                onUpdateTags={updateTags}
                onRemoveImage={removeImage}
              />
            ))}
          </div>

          {/* Summary */}
          <div className="mt-5 bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-600 space-y-1">
            <p className="font-semibold text-gray-700 mb-2">Tag Summary</p>
            <div className="flex flex-wrap gap-2">
              {[...new Set(images.flatMap(i => i.tags))].length === 0 ? (
                <span className="text-gray-400 italic">No tags added yet</span>
              ) : (
                [...new Set(images.flatMap(i => i.tags))].map(tag => (
                  <span key={tag} className="bg-white border border-gray-200 px-2 py-0.5 rounded-full text-gray-700 font-medium">
                    {tag} ({images.filter(i => i.tags.includes(tag)).length})
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      : 
        <div className="text-center py-6 text-gray-400 text-sm italic">
          No images added yet. Upload files or enter a URL above.
        </div>
      }
    </div>
  );
};

const API_URL = '/api/v1';

const getAuthHeaders = () => {
  const token = localStorage.getItem('jwt_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

const PropertyWizard = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = Boolean(id);

  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 6;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');

  const [formData, setFormData] = useState({
    // Step 1: Basic
    name: '', type: 'Hotel', description: '', rating: '3',
    // Step 2: Location
    country: 'India', state: '', city: '', area: '', address: '',
    latitude: '', longitude: '',
    // Step 3: Contact
    ownerName: '', ownerEmail: '', ownerPhone: '',
    receptionPhone: '', receptionEmail: '',
    managerName: '', managerPhone: '', managerEmail: '',
    // Step 4: Commercials
    accountName: '', bankName: '', accountNumber: '', ifscCode: '', branchName: '',
    commission: '', paymentCycle: 'Monthly', payoutMethod: 'Bank Transfer',
    // Step 5: Amenities
    amenities: [], services: [], policies: [], checkInTime: '14:00', checkOutTime: '11:00',
    // Step 6: Media — each entry: { url: string, file: File|null, tags: string[] }
    images: [],
  });

  useEffect(() => {
    if (isEditing) {
      fetchProperty();
    }
  }, [id]);

  const fetchProperty = async () => {
    try {
      const res = await fetch(`${API_URL}/hotels/${id}`, { headers: getAuthHeaders() });
      const json = await res.json();
      if (json.success) {
        const hotel = json.data;
        setFormData(prev => ({
          ...prev,
          name: hotel.name || '',
          description: hotel.description || '',
          rating: String(hotel.rating || '3'),
          city: hotel.city || '',
          state: hotel.state || '',
          address: hotel.location || '',
          latitude: hotel.latitude || '',
          longitude: hotel.longitude || '',
          // Contacts
          receptionPhone: hotel.receptionPhone || '',
          receptionEmail: hotel.receptionEmail || '',
          managerName: hotel.managerName || '',
          managerPhone: hotel.managerPhone || '',
          managerEmail: hotel.managerEmail || '',
          ownerName: hotel.owner?.name || '',
          ownerEmail: hotel.owner?.email || '',
          ownerPhone: hotel.owner?.phone || '',
          // Commercials
          accountName: hotel.bankDetail?.accountName || '',
          bankName: hotel.bankDetail?.bankName || '',
          accountNumber: hotel.bankDetail?.accountNumber || '',
          ifscCode: hotel.bankDetail?.ifscCode || '',
          branchName: hotel.bankDetail?.branchName || '',
          commission: hotel.agreement?.commissionRate || '',
          // Other
          amenities: Array.isArray(hotel.amenities) ? hotel.amenities : [],
          policies: Array.isArray(hotel.policies) ? hotel.policies : [],
          checkInTime: hotel.checkInTime || '14:00',
          checkOutTime: hotel.checkOutTime || '11:00',
          images: Array.isArray(hotel.images) ? hotel.images : [],
        }));
      }
    } catch (err) {
      console.error('Error fetching property:', err);
      setApiError('Failed to load property data.');
    }
  };

  const updateForm = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const nextStep = () => {
    if (currentStep < totalSteps) setCurrentStep(currentStep + 1);
  };

  const prevStep = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleSaveDraft = () => {
    console.log("Draft saved:", formData);
    alert("Draft saved successfully!");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');

    // Final Validation
    if (!formData.name || !formData.city || !formData.address) {
      setApiError('Name, City, and Address are required.');
      return;
    }
    if (formData.images.length === 0) {
      setApiError('At least one image is required.');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        name: formData.name,
        address: formData.address,
        city: formData.city,
        state: formData.state,
        description: formData.description || '',
        latitude: formData.latitude,
        longitude: formData.longitude,
        media: formData.images.map(img => ({
          url: img.url,
          tags: img.tags || []
        })),
        amenities: formData.amenities,
        policies: formData.policies,
        checkInTime: formData.checkInTime,
        checkOutTime: formData.checkOutTime,
        // Contact Info
        receptionPhone: formData.receptionPhone,
        receptionEmail: formData.receptionEmail,
        managerName: formData.managerName,
        managerPhone: formData.managerPhone,
        managerEmail: formData.managerEmail,
        // Bank Details
        bankDetail: formData.accountNumber ? {
          accountName: formData.accountName,
          bankName: formData.bankName,
          accountNumber: formData.accountNumber,
          ifscCode: formData.ifscCode,
          branchName: formData.branchName,
        } : undefined,
        commissionRate: formData.commission ? parseFloat(formData.commission) : undefined,
      };

      const url = isEditing ? `${API_URL}/hotels/${id}` : `${API_URL}/hotels`;
      const method = isEditing ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.errors && data.errors.fieldErrors) {
          const fieldErrors = data.errors.fieldErrors;
          const firstField = Object.keys(fieldErrors)[0];
          const firstMsg = fieldErrors[firstField][0];
          throw new Error(`${firstField.charAt(0).toUpperCase() + firstField.slice(1)}: ${firstMsg}`);
        }
        throw new Error(data.message || 'Failed to save property');
      }

      // Success
      if (isEditing) {
        alert('Property updated successfully!');
        navigate('/admin/properties');
      } else {
        navigate('/admin/configuration');
      }
    } catch (err) {
      setApiError(err.message || 'An error occurred during submission.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const steps = [
    { num: 1, title: 'Basic Info' },
    { num: 2, title: 'Location' },
    { num: 3, title: 'Contacts' },
    { num: 4, title: 'Commercials' },
    { num: 5, title: 'Amenities & Policies' },
    { num: 6, title: 'Media' },
  ];

  return (
    <div className="max-w-5xl mx-auto pb-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{isEditing ? 'Edit Property' : 'Add New Property'}</h1>
          <p className="text-gray-500">{isEditing ? `Managing details for: ${formData.name}` : 'Complete the details below to list a new property.'}</p>
        </div>
        <button 
          onClick={handleSaveDraft}
          className="text-brand-600 bg-brand-50 px-4 py-2 rounded-lg font-medium text-sm flex items-center hover:bg-brand-100 transition-colors"
        >
          <Save size={16} className="mr-2" /> Save Draft
        </button>
      </div>

      {/* Stepper UI */}
      <div className="mb-8">
        <div className="flex items-center justify-between relative">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-gray-200 z-0"></div>
          <div 
            className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-brand-500 z-0 transition-all duration-300"
            style={{ width: `${((currentStep - 1) / (totalSteps - 1)) * 100}%` }}
          ></div>
          
          {steps.map((step) => (
            <div key={step.num} className="relative z-10 flex flex-col items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-2 transition-colors duration-300 ${
                currentStep >= step.num 
                  ? 'bg-brand-600 border-brand-600 text-white shadow-md' 
                  : 'bg-white border-gray-300 text-gray-400'
              }`}>
                {currentStep > step.num ? <CheckCircle size={20} /> : step.num}
              </div>
              <span className={`mt-2 text-xs font-semibold ${currentStep >= step.num ? 'text-gray-900' : 'text-gray-400'}`}>
                {step.title}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Form Container */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-8">
          
          {/* STEP 1 */}
          {currentStep === 1 && (
            <div className="space-y-6 animate-fade-in">
              <h2 className="text-xl font-bold text-gray-800 border-b pb-4">Basic Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Property Name <span className="text-red-500">*</span></label>
                  <input type="text" value={formData.name} onChange={e => updateForm('name', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" placeholder="e.g. Grand Plaza Hotel" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Property Type</label>
                  <select value={formData.type} onChange={e => updateForm('type', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none">
                    <option>Hotel</option>
                    <option>Resort</option>
                    <option>Villa</option>
                    <option>Hostel</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Star Rating</label>
                  <select value={formData.rating} onChange={e => updateForm('rating', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none">
                    <option value="5">5 Star (Luxury)</option>
                    <option value="4">4 Star (Premium)</option>
                    <option value="3">3 Star (Comfort)</option>
                    <option value="2">2 Star (Budget)</option>
                    <option value="1">1 Star (Basic)</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea value={formData.description} onChange={e => updateForm('description', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" rows="4" placeholder="Describe the property..."></textarea>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2 */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-fade-in">
              <h2 className="text-xl font-bold text-gray-800 border-b pb-4">Location Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                  <input type="text" value={formData.country} onChange={e => updateForm('country', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                  <input type="text" value={formData.state} onChange={e => updateForm('state', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input type="text" value={formData.city} onChange={e => updateForm('city', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Area / Neighborhood</label>
                  <input type="text" value={formData.area} onChange={e => updateForm('area', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Address</label>
                  <textarea value={formData.address} onChange={e => updateForm('address', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" rows="2"></textarea>
                </div>
                
                {/* Coordinates Section */}
                <div className="md:col-span-2">
                  <div className="bg-gradient-to-br from-brand-50 to-blue-50 border border-brand-200 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-semibold text-gray-800 flex items-center gap-2">
                        <Navigation size={17} className="text-brand-600" />
                        GPS Coordinates
                      </h4>
                      <span className="text-xs text-gray-500 bg-white px-2.5 py-1 rounded-full border border-gray-200 font-medium">
                        Required for map display & OTA integration
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {/* Latitude */}
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          Latitude <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="any"
                            value={formData.latitude}
                            onChange={e => {
                              const v = parseFloat(e.target.value);
                              if (e.target.value === '' || (!isNaN(v) && v >= -90 && v <= 90)) {
                                updateForm('latitude', e.target.value);
                              }
                            }}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none bg-white font-mono text-sm"
                            placeholder="e.g. 19.0760"
                            min="-90" max="90"
                          />
                          {formData.latitude && (parseFloat(formData.latitude) < -90 || parseFloat(formData.latitude) > 90) && (
                            <p className="text-red-500 text-xs mt-1">⚠ Must be between -90 and +90</p>
                          )}
                        </div>
                      </div>

                      {/* Longitude */}
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          Longitude <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="any"
                            value={formData.longitude}
                            onChange={e => {
                              const v = parseFloat(e.target.value);
                              if (e.target.value === '' || (!isNaN(v) && v >= -180 && v <= 180)) {
                                updateForm('longitude', e.target.value);
                              }
                            }}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none bg-white font-mono text-sm"
                            placeholder="e.g. 72.8777"
                            min="-180" max="180"
                          />
                          {formData.longitude && (parseFloat(formData.longitude) < -180 || parseFloat(formData.longitude) > 180) && (
                            <p className="text-red-500 text-xs mt-1">⚠ Must be between -180 and +180</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-gray-500 mt-3 flex items-start gap-1.5">
                      <span className="text-blue-500 mt-0.5">ℹ</span>
                      Enter coordinates (e.g., 19.0760, 72.8777 for Mumbai). 
                      Find them at <a href="https://maps.google.com" target="_blank" rel="noreferrer" className="text-brand-600 underline">maps.google.com</a> → right-click on location → copy coordinates.
                    </p>

                    {/* Live preview if both are filled */}
                    {formData.latitude && formData.longitude && (
                      <div className="mt-4 flex items-center gap-3 bg-white rounded-lg px-4 py-2.5 border border-brand-200">
                        <Navigation size={16} className="text-brand-600 shrink-0" />
                        <span className="text-sm font-mono text-gray-700">
                          {parseFloat(formData.latitude).toFixed(6)}° N, {parseFloat(formData.longitude).toFixed(6)}° E
                        </span>
                        <a
                          href={`https://maps.google.com/?q=${formData.latitude},${formData.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-auto text-xs text-brand-600 font-medium hover:underline"
                        >
                          Verify on Map →
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {currentStep === 3 && (
            <div className="space-y-8 animate-fade-in">
              <div>
                <h2 className="text-xl font-bold text-gray-800 border-b pb-4 mb-6">Property Owner Details</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Owner Name</label>
                    <input type="text" value={formData.ownerName} onChange={e => updateForm('ownerName', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Owner Email</label>
                    <input type="email" value={formData.ownerEmail} onChange={e => updateForm('ownerEmail', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Owner Phone</label>
                    <input type="tel" value={formData.ownerPhone} onChange={e => updateForm('ownerPhone', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-xl font-bold text-gray-800 border-b pb-4 mb-6">Property Contact Info</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reception Phone</label>
                    <input type="tel" value={formData.receptionPhone} onChange={e => updateForm('receptionPhone', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reception Email</label>
                    <input type="email" value={formData.receptionEmail} onChange={e => updateForm('receptionEmail', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-xl font-bold text-gray-800 border-b pb-4 mb-6">Manager Details</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Manager Name</label>
                    <input type="text" value={formData.managerName} onChange={e => updateForm('managerName', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Manager Email</label>
                    <input type="email" value={formData.managerEmail} onChange={e => updateForm('managerEmail', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Manager Phone</label>
                    <input type="tel" value={formData.managerPhone} onChange={e => updateForm('managerPhone', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4 */}
          {currentStep === 4 && (
            <div className="space-y-8 animate-fade-in">
              <div>
                <h2 className="text-xl font-bold text-gray-800 border-b pb-4 mb-6">Owner Bank Details</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Account Holder Name <span className="text-red-500">*</span></label>
                    <input type="text" value={formData.accountName} onChange={e => updateForm('accountName', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name <span className="text-red-500">*</span></label>
                    <input type="text" value={formData.bankName} onChange={e => updateForm('bankName', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Account Number <span className="text-red-500">*</span></label>
                    <input type="text" value={formData.accountNumber} onChange={e => updateForm('accountNumber', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">IFSC Code <span className="text-red-500">*</span></label>
                    <input type="text" value={formData.ifscCode} onChange={e => updateForm('ifscCode', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Branch Name</label>
                    <input type="text" value={formData.branchName} onChange={e => updateForm('branchName', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Upload Cancelled Cheque</label>
                    <div className="flex items-center space-x-3 mt-1">
                      <button className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium flex items-center transition-colors">
                        <UploadCloud size={16} className="mr-2" /> Upload File
                      </button>
                      <span className="text-xs text-gray-500">Max 5MB (JPG, PNG, PDF)</span>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-xl font-bold text-gray-800 border-b pb-4 mb-6">Commercial Terms</h2>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start mb-6">
                  <span className="text-xl mr-3">⚠️</span>
                  <div className="text-sm text-yellow-800">
                    <span className="font-bold">Important Logic:</span> Commission % will be used to calculate Revenue (Booking Amount - Commission). This is required for owner payouts and financial reports.
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Commission % (Platform cut) <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <input type="number" min="0" max="100" value={formData.commission} onChange={e => updateForm('commission', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none pr-8" required />
                      <span className="absolute right-3 top-2.5 text-gray-500 font-medium">%</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Cycle <span className="text-red-500">*</span></label>
                    <select value={formData.paymentCycle} onChange={e => updateForm('paymentCycle', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none">
                      <option>Weekly</option>
                      <option>Bi-weekly</option>
                      <option>Monthly</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Payout Method <span className="text-red-500">*</span></label>
                    <select value={formData.payoutMethod} onChange={e => updateForm('payoutMethod', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none">
                      <option>Bank Transfer</option>
                      <option>UPI</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5 */}
          {currentStep === 5 && (
            <div className="space-y-6 animate-fade-in">
              <h2 className="text-xl font-bold text-gray-800 border-b pb-4">Amenities, Services & Policies</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-gray-100">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Standard Check-In Time</label>
                  <input type="time" value={formData.checkInTime} onChange={e => updateForm('checkInTime', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Standard Check-Out Time</label>
                  <input type="time" value={formData.checkOutTime} onChange={e => updateForm('checkOutTime', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
                </div>
              </div>

              <div className="space-y-6">
                <TagInput 
                  label="Property Amenities" 
                  placeholder="e.g. Swimming Pool, Free WiFi, Gym" 
                  tags={formData.amenities} 
                  setTags={(newTags) => updateForm('amenities', newTags)} 
                />
                
                <TagInput 
                  label="Available Services" 
                  placeholder="e.g. 24/7 Room Service, Airport Shuttle, Laundry" 
                  tags={formData.services} 
                  setTags={(newTags) => updateForm('services', newTags)} 
                />

                <TagInput 
                  label="Cancellation Policies" 
                  placeholder="e.g. Free cancellation up to 48 hours before check-in" 
                  tags={formData.policies} 
                  setTags={(newTags) => updateForm('policies', newTags)} 
                />
              </div>
            </div>
          )}

          {/* STEP 6 — Property Media with Multi-Tag System */}
          {currentStep === 6 && (
            <Step6Media images={formData.images} setImages={(imgs) => updateForm('images', imgs)} />
          )}

        </div>

        {/* Navigation Footer */}
        <div className="px-8 py-5 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <button 
            onClick={prevStep} 
            disabled={currentStep === 1}
            className={`px-5 py-2.5 rounded-lg font-medium text-sm flex items-center transition-colors ${
              currentStep === 1 ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-100'
            }`}
          >
            <ChevronLeft size={18} className="mr-1" /> Previous
          </button>
          
          {currentStep === totalSteps && (
            <div className="flex flex-col items-end gap-2">
              {apiError && <p className="text-red-500 text-sm font-medium">{apiError}</p>}
              <button 
                type="button" 
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-6 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center shadow-sm"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Publishing...
                  </>
                ) : (
                  <>
                    Publish Property <CheckCircle size={18} className="ml-2" />
                  </>
                )}
              </button>
            </div>
          )}
          
          {currentStep < totalSteps && (
            <button 
              onClick={nextStep}
              className="bg-gray-900 hover:bg-black text-white px-6 py-2.5 rounded-lg font-medium text-sm flex items-center transition-colors shadow-sm"
            >
              Next Step <ChevronRight size={18} className="ml-1" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PropertyWizard;
