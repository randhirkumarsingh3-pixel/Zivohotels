import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { 
  Building2, 
  Edit3, Save, CheckCircle2, Clock, Shield,
  Wifi, Car, Coffee, Waves, Dumbbell, Wind, Loader2, Image as ImageIcon, MapPin, ListChecks, AlertCircle, ArrowRight
} from 'lucide-react';
import { fetchProperty, updateProperty } from '../../services/extranetApi';
import { useExtranet } from '../context/ExtranetContext';

const _amenities = [
  { icon: Wifi, name: 'Free Wi-Fi', key: 'wifi' },
  { icon: Car, name: 'Parking', key: 'parking' },
  { icon: Coffee, name: 'Breakfast', key: 'breakfast' },
  { icon: Waves, name: 'Swimming Pool', key: 'pool' },
  { icon: Dumbbell, name: 'Gym / Fitness', key: 'gym' },
  { icon: Wind, name: 'Air Conditioning', key: 'ac' },
  { icon: Shield, name: 'EV Charging', key: 'ev' },
  { icon: Clock, name: '24/7 Front Desk', key: 'frontdesk' },
];

const ExtranetProperty = () => {
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [full, setFull] = useState(null); // the whole listing, for the "Your listing" summary
  const { addToast, registerDirtyState } = useExtranet();

  const { register, handleSubmit, reset, formState: { isDirty }, watch } = useForm({
    defaultValues: {
      name: '',
      description: '',
      checkInTime: '14:00',
      checkOutTime: '11:00',
    }
  });

  const formValues = watch();

  useEffect(() => {
    registerDirtyState('property', isDirty);
  }, [isDirty, registerDirtyState]);

  // Auto-Drafts
  useEffect(() => {
    if (isDirty && isEditing) {
      const timer = setTimeout(() => {
        sessionStorage.setItem('draft_property', JSON.stringify(formValues));
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [formValues, isDirty, isEditing]);

  useEffect(() => {
    const loadProperty = async () => {
      try {
        const data = await fetchProperty();
        setFull(data);
        const draft = sessionStorage.getItem('draft_property');
        
        if (draft) {
          const parsed = JSON.parse(draft);
          reset(parsed);
          setIsEditing(true);
          addToast('Draft restored from previous session', 'info');
        } else {
          reset(data);
        }
      } catch (error) {
        addToast(error.message, 'error');
      } finally {
        setLoading(false);
      }
    };
    loadProperty();
  }, [reset, addToast]);

  const onSubmit = async (data) => {
    try {
      setLoading(true);
      await updateProperty(data);
      addToast('Property updated successfully', 'success');
      sessionStorage.removeItem('draft_property');
      reset(data); // Resets dirty state
      setIsEditing(false);
    } catch (error) {
      addToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !formValues.name) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-brand-700" size={32} /></div>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Property Information</h1>
          <p className="text-gray-500 font-medium mt-1">Manage your hotel&apos;s profile as displayed on Zivo.</p>
        </div>
        <div className="flex items-center gap-3">
          {['LIVE', 'ACTIVE'].includes(full?.status) ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-green-50 text-green-800 rounded-lg border border-green-200">
              <CheckCircle2 size={14} aria-hidden="true" />
              <span className="text-sm font-semibold">Live on ZivoPlus</span>
            </div>
          ) : full?.status && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 text-amber-900 rounded-lg border border-amber-200">
              <AlertCircle size={14} aria-hidden="true" />
              <span className="text-sm font-semibold">Not live yet ({String(full.status).replace(/_/g, ' ').toLowerCase()})</span>
            </div>
          )}
          {isEditing ? (
            <div className="flex gap-2">
              <button 
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  sessionStorage.removeItem('draft_property');
                  fetchProperty().then(reset);
                }}
                className="px-6 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-200 transition-all"
              >
                Cancel
              </button>
              <button 
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-black transition-all disabled:opacity-50"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Save Changes
              </button>
            </div>
          ) : (
            <button 
              type="button"
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-black transition-all"
            >
              <Edit3 size={16} /> Edit Profile
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Core Details */}
        <div className="lg:col-span-2 space-y-8">
          {/* Basic Information */}
          <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-8 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-xl font-black text-gray-900 flex items-center gap-3">
                <Building2 className="text-blue-600" size={20} />
                Basic Information
              </h3>
            </div>
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-xs font-black text-gray-400 uppercase tracking-widest block mb-2">Property Name</label>
                  <input 
                    aria-label="Property name" {...register('name')}
                    disabled={!isEditing}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-brand-500/20 outline-none transition-all disabled:bg-gray-50 disabled:cursor-default"
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-gray-400 uppercase tracking-widest block mb-2">Location</label>
                  <input 
                    aria-label="Address" {...register('location')}
                    disabled={!isEditing}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold text-gray-900 disabled:cursor-default"
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-gray-400 uppercase tracking-widest block mb-2">City</label>
                  <input 
                    aria-label="City" {...register('city')}
                    disabled={!isEditing}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold text-gray-900 disabled:cursor-default"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-black text-gray-400 uppercase tracking-widest block mb-2">Property Description</label>
                <textarea 
                  aria-label="Description" {...register('description')}
                  rows={4} 
                  disabled={!isEditing}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-medium text-gray-700 leading-relaxed disabled:cursor-default resize-none"
                />
                {(() => {
                  // Search engines rank pages with enough of the hotel's own words higher
                  const words = String(formValues.description || '').split(/\s+/).filter(Boolean).length;
                  return words < 150 ? (
                    <p className="mt-2 text-xs text-amber-800">{words} words. Write at least 150 in your own words (rooms, the area, what guests like) so your page ranks better on Google. Don&apos;t copy text from other websites.</p>
                  ) : <p className="mt-2 text-xs text-green-700">{words} words: good length for search engines.</p>;
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Sidebar */}
        <div className="space-y-8">
          {/* Everything else about the listing is edited in the property wizard */}
          {full && (() => {
            const photos = Array.isArray(full.media) ? full.media.length : 0;
            const amenities = Array.isArray(full.amenities) ? full.amenities.length : 0;
            const nearby = Array.isArray(full.nearbyPlaces) ? full.nearbyPlaces.length : 0;
            const pinned = Boolean(full.latitude && full.longitude);
            const rules = full.integrationSettings?.policyRules ? Object.keys(full.integrationSettings.policyRules).length : 0;
            const items = [
              { icon: ImageIcon, label: 'Photos', value: `${photos}`, ok: photos >= 5, hint: photos < 5 ? 'Add at least 5' : '' },
              { icon: ListChecks, label: 'Amenities', value: `${amenities}`, ok: amenities >= 5, hint: amenities < 5 ? 'Add what you offer' : '' },
              { icon: MapPin, label: 'Map pin', value: pinned ? 'Set' : 'Not set', ok: pinned },
              { icon: MapPin, label: "What's nearby", value: `${nearby} places`, ok: nearby > 0 },
              { icon: Shield, label: 'House rules', value: rules ? `${rules} answered` : 'Not set', ok: rules > 0 },
            ];
            return (
              <div className="bg-white rounded-card border border-gray-200 p-6 shadow-sm">
                <h3 className="text-lg font-bold text-gray-900">Your listing</h3>
                <p className="text-sm text-gray-600 mt-1">Photos, amenities, location, nearby places, rooms and house rules are edited in the full listing editor.</p>
                <ul className="mt-4 divide-y divide-gray-100">
                  {items.map((it) => (
                    <li key={it.label} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="flex items-center gap-2 text-gray-700"><it.icon size={16} className="text-navy-700" aria-hidden="true" /> {it.label}</span>
                      <span className={`font-semibold ${it.ok ? 'text-green-800' : 'text-amber-800'}`}>{it.value}{it.hint ? ` · ${it.hint}` : ''}</span>
                    </li>
                  ))}
                </ul>
                <Link to={`/extranet/onboarding/${full.id}`} className="mt-4 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-navy-800 hover:bg-navy-900 text-white text-sm font-semibold">
                  Edit full listing <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            );
          })()}

          {/* Policies */}
          <div className="bg-white rounded-[2.5rem] border border-gray-100 p-8 shadow-sm">
            <h3 className="text-lg font-black text-gray-900 mb-6 flex items-center gap-2">
              <Shield className="text-blue-600" size={20} />
              Policies
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b border-gray-50">
                <span className="text-xs font-bold text-gray-500">Check-in Time</span>
                <input 
                  type="time"
                  aria-label="Check-in time" {...register('checkInTime')}
                  disabled={!isEditing}
                  className="text-xs font-black text-gray-900 bg-transparent text-right outline-none"
                />
              </div>
              <div className="flex items-center justify-between py-3 border-b border-gray-50">
                <span className="text-xs font-bold text-gray-500">Check-out Time</span>
                <input 
                  type="time"
                  aria-label="Check-out time" {...register('checkOutTime')}
                  disabled={!isEditing}
                  className="text-xs font-black text-gray-900 bg-transparent text-right outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
};

export default ExtranetProperty;
