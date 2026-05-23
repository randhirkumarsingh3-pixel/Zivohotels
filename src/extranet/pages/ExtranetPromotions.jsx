import { useState, useEffect, useCallback } from 'react';
import { 
  Tag, Plus, Percent, Calendar, Clock, 
  Zap, TrendingUp, Eye, Copy, Edit3, 
  Trash2, CheckCircle2, AlertCircle, 
  ChevronRight, IndianRupee, Users,
  ArrowRight, Gift, Loader2, X
} from 'lucide-react';
import { fetchPromotions, createPromotion } from '../../services/extranetApi';
import { useExtranet } from '../context/ExtranetContext';
import { useForm } from 'react-hook-form';

const statusStyles = {
  ACTIVE: 'bg-green-50 text-green-600 border-green-100',
  SCHEDULED: 'bg-blue-50 text-blue-600 border-blue-100',
  EXPIRED: 'bg-gray-100 text-gray-500 border-gray-200',
  PAUSED: 'bg-orange-50 text-orange-600 border-orange-100',
};

const ExtranetPromotions = () => {
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const { addToast } = useExtranet();
  
  const { register, handleSubmit, watch, reset, formState: { isSubmitting } } = useForm({
    defaultValues: {
      type: 'PERCENTAGE',
      discountValue: 10,
      minStay: 1
    }
  });

  const formValues = watch();

  const loadPromotions = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchPromotions();
      setPromotions(data);
    } catch (error) {
      addToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadPromotions();
  }, [loadPromotions]);

  const onSubmit = async (data) => {
    try {
      await createPromotion(data);
      addToast('Promotion launched successfully', 'success');
      reset();
      setShowCreate(false);
      loadPromotions();
    } catch (error) {
      addToast(error.message, 'error');
    }
  };

  const activeCount = promotions.filter(p => p.isActive).length;

  if (loading && promotions.length === 0) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-brand-600" size={32} /></div>;
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Promotions</h1>
          <p className="text-gray-500 font-medium mt-1">Create and manage deals to boost your visibility and bookings.</p>
        </div>
        <button 
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-black transition-all"
        >
          {showCreate ? <X size={16} /> : <Plus size={16} />} 
          {showCreate ? 'Cancel' : 'Create Promotion'}
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-brand-600 to-brand-700 rounded-2xl p-5 text-white shadow-lg shadow-brand-600/20">
          <p className="text-[10px] font-black text-brand-200 uppercase tracking-widest mb-1">Active Promos</p>
          <h3 className="text-2xl font-black">{activeCount}</h3>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Impact Potential</p>
          <h3 className="text-2xl font-black text-green-600">+22%</h3>
        </div>
      </div>

      {/* Create Promotion Form */}
      {showCreate && (
        <div className="bg-white rounded-[2.5rem] border-2 border-brand-200 shadow-xl p-8 space-y-8 animate-in zoom-in duration-200">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-black text-gray-900 flex items-center gap-3">
              <Gift className="text-brand-600" size={24} />
              New Promotion
            </h3>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Promotion Name</label>
                  <input {...register('name')} placeholder="e.g., Summer Flash Sale" className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-brand-500/20 outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Promo Code</label>
                  <input {...register('code')} placeholder="e.g., SUMMER20" className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold uppercase focus:ring-2 focus:ring-brand-500/20 outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Discount Type</label>
                  <select {...register('type')} className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold">
                    <option value="PERCENTAGE">Percentage Off</option>
                    <option value="FIXED">Fixed Amount Off</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Discount Value</label>
                  <input type="number" {...register('discountValue')} className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-brand-500/20 outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Start Date</label>
                  <input type="date" {...register('startDate')} className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-brand-500/20 outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">End Date</label>
                  <input type="date" {...register('endDate')} className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-brand-500/20 outline-none" />
                </div>
              </div>
            </div>

            {/* Promotion Intelligence Preview */}
            <div className="bg-brand-50 rounded-[2rem] p-6 border border-brand-100">
               <h4 className="text-xs font-black text-brand-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                 <Zap size={14} fill="currentColor" /> Promotion Intelligence
               </h4>
               <div className="space-y-4">
                 <div className="flex justify-between items-center">
                   <span className="text-xs font-medium text-brand-700">Estimated CTR Uplift</span>
                   <span className="text-sm font-black text-green-600">+12%</span>
                 </div>
                 <div className="flex justify-between items-center">
                   <span className="text-xs font-medium text-brand-700">Estimated Margin Impact</span>
                   <span className="text-sm font-black text-orange-600">-{formValues.type === 'PERCENTAGE' ? formValues.discountValue : '5'}%</span>
                 </div>
                 <div className="h-px bg-brand-200 my-2" />
                 <p className="text-[10px] text-brand-600 italic leading-relaxed">
                   "Based on current market demand in your cluster, this discount level is highly competitive."
                 </p>
               </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button 
              onClick={handleSubmit(onSubmit)}
              disabled={isSubmitting}
              className="px-8 py-3 bg-brand-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-brand-700 transition-all shadow-lg shadow-brand-600/20 flex items-center gap-2"
            >
              {isSubmitting && <Loader2 size={16} className="animate-spin" />}
              Launch Promotion
            </button>
          </div>
        </div>
      )}

      {/* Promotions List */}
      <div className="space-y-4">
        {promotions.length === 0 && !showCreate && (
          <div className="text-center py-12 bg-white rounded-[2rem] border border-gray-100">
            <Tag className="mx-auto text-gray-200 mb-4" size={48} />
            <h3 className="text-lg font-black text-gray-900">No Promotions Active</h3>
            <p className="text-sm text-gray-500">Run a deal to capture more bookings during low-demand periods.</p>
          </div>
        )}

        {promotions.map(promo => (
          <div key={promo.id} className={`bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden transition-all hover:border-brand-200`}>
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center gap-5">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${promo.type === 'PERCENTAGE' ? 'bg-purple-50 text-purple-600' : 'bg-green-50 text-green-600'}`}>
                  {promo.type === 'PERCENTAGE' ? <Percent size={24} /> : <IndianRupee size={24} />}
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h4 className="text-sm font-black text-gray-900">{promo.name}</h4>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${promo.isActive ? 'bg-green-50 text-green-600 border-green-100' : 'bg-orange-50 text-orange-600 border-orange-100'}`}>
                      {promo.isActive ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-gray-500 font-medium">
                    <span className="font-mono font-black text-brand-600 bg-brand-50 px-2 py-0.5 rounded">{promo.code}</span>
                    <span>•</span>
                    <span>{promo.type === 'PERCENTAGE' ? `${promo.discountValue}% off` : `₹${promo.discountValue} off`}</span>
                    <span>•</span>
                    <span>{new Date(promo.startDate).toLocaleDateString()} → {new Date(promo.endDate).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-8">
                <div className="text-right">
                  <p className="text-lg font-black text-gray-900">{promo.minStay} Night(s)</p>
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Min Stay</p>
                </div>
                <div className="flex items-center gap-2">
                  <button className="p-2 text-gray-300 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-all">
                    <Edit3 size={14} />
                  </button>
                  <button className="p-2 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ExtranetPromotions;
