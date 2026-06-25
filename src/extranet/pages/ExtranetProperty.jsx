import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { 
  Building2, 
  Edit3, Save, CheckCircle2, Clock, Shield,
  Wifi, Car, Coffee, Waves, Dumbbell, Wind, Loader2
} from 'lucide-react';
import { fetchProperty, updateProperty } from '../../services/extranetApi';
import { useExtranet } from '../context/ExtranetContext';

const amenities = [
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
    return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-brand-600" size={32} /></div>;
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
          <div className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-xl border border-green-100">
            <CheckCircle2 size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">Profile Active</span>
          </div>
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
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Property Name</label>
                  <input 
                    {...register('name')}
                    disabled={!isEditing}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-brand-500/20 outline-none transition-all disabled:bg-gray-50 disabled:cursor-default"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Location</label>
                  <input 
                    {...register('location')}
                    disabled={!isEditing}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold text-gray-900 disabled:cursor-default"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">City</label>
                  <input 
                    {...register('city')}
                    disabled={!isEditing}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold text-gray-900 disabled:cursor-default"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Property Description</label>
                <textarea 
                  {...register('description')}
                  rows={4} 
                  disabled={!isEditing}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-medium text-gray-700 leading-relaxed disabled:cursor-default resize-none"
                />
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
                  {...register('checkInTime')}
                  disabled={!isEditing}
                  className="text-xs font-black text-gray-900 bg-transparent text-right outline-none"
                />
              </div>
              <div className="flex items-center justify-between py-3 border-b border-gray-50">
                <span className="text-xs font-bold text-gray-500">Check-out Time</span>
                <input 
                  type="time"
                  {...register('checkOutTime')}
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
