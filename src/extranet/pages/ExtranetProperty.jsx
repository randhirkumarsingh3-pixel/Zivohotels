import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { 
  Building2, 
  Edit3, Save, Clock, Shield,
  Wifi, Car, Coffee, Waves, Dumbbell, Wind, Loader2, ArrowRight
} from 'lucide-react';
import { fetchProperty, updateProperty, fetchPropertyOverview } from '../../services/extranetApi';
import { useExtranet } from '../context/ExtranetContext';
import useAccess from '../../hooks/useAccess';
import PropertyHeader from '../components/PropertyHeader';
import { EDIT_SECTIONS, editLink, scoreTone } from '../components/propertySections';

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
  const [, setFull] = useState(null);
  const [overview, setOverview] = useState(null); // header, guest rating, content score
  const { addToast, registerDirtyState, hotelId } = useExtranet();
  const { access } = useAccess();
  const isOwner = !access || !hotelId || Boolean(access.hotels?.[hotelId]?.owner);
  const loadOverview = () => fetchPropertyOverview().then(setOverview).catch(() => {});
  useEffect(() => { loadOverview(); }, [hotelId]); // eslint-disable-line react-hooks/exhaustive-deps

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
      loadOverview();
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
      <PropertyHeader overview={overview} isOwner={isOwner} />

      {/* Each part of the listing, with its share of the content score; opens that part of the editor */}
      {overview && (
        <section aria-labelledby="listing-parts">
          <div className="flex items-end justify-between gap-3 mb-3">
            <div>
              <h2 id="listing-parts" className="text-lg font-bold text-gray-900">Your listing</h2>
              <p className="text-sm text-gray-600">Open any part to edit it; changes go live when you save.</p>
            </div>
            <Link to="/extranet/property/score" className="text-sm font-semibold text-navy-700 hover:underline whitespace-nowrap">All tips</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {EDIT_SECTIONS.filter((x) => !x.owner || isOwner).map((x) => {
              const sec = overview.content.sections.find((c) => c.key === x.key);
              const pct = sec ? Math.round((sec.score / sec.max) * 100) : null;
              const todo = sec ? sec.checks.find((c) => !c.done) : null;
              return (
                <Link key={x.key} to={editLink(overview.hotel.id, x.key)} className="group bg-white rounded-card border border-gray-200 shadow-sm p-4 hover:border-navy-300 hover:shadow-md transition-all flex flex-col">
                  <span className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-lg bg-navy-50 flex items-center justify-center"><x.icon size={18} className="text-navy-700" aria-hidden="true" /></span>
                    <span className="flex-1 font-semibold text-gray-900">{x.label}</span>
                    {sec ? <span className="text-sm font-semibold text-gray-700">{sec.score}/{sec.max}</span> : null}
                  </span>
                  {sec ? (
                    <>
                      <span className="mt-3 h-1.5 rounded-full bg-gray-100 overflow-hidden" aria-hidden="true"><span className="block h-full rounded-full" style={{ width: `${pct}%`, background: scoreTone(pct).ring }} /></span>
                      <span className={`mt-2 text-xs ${todo ? 'text-gray-600' : 'text-green-800'}`}>{todo ? todo.tip : 'Complete'}</span>
                    </>
                  ) : <span className="mt-2 text-xs text-gray-600">PAN, GST, bank account and documents</span>}
                  <span className="mt-auto pt-3 text-sm font-semibold text-navy-700 flex items-center gap-1">Edit <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" aria-hidden="true" /></span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Quick edit: name, description and times without opening the full editor */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-2">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Quick edit</h2>
          <p className="text-sm text-gray-600">Name, description and check-in times.</p>
        </div>
        <div className="flex items-center gap-3">
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
