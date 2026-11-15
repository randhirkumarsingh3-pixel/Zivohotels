import { useState, useEffect, useCallback } from 'react';
import { TrendingUp,
  Clock, AlertTriangle, ArrowRight, ChevronRight, Activity,
  Bell, Info, LayoutDashboard, Loader2, FileSignature
} from 'lucide-react';
import StickyKPIStrip from '../../components/shared/StickyKPIStrip';
import { fetchProperty, fetchActivityTimeline, fetchNotifications } from '../../services/extranetApi';
import { useExtranet } from '../context/ExtranetContext';
import { useSocketEvent } from '../../context/SocketContext';

const _DeltaIndicator = ({ value, type }) => (
  <div className={`flex items-center gap-1 text-xs font-black px-2 py-0.5 rounded-full ${
    type === 'green' ? 'bg-green-50 text-green-700' :
    type === 'red' ? 'bg-red-50 text-red-600' :
    'bg-slate-50 text-slate-500'
  } animate-in zoom-in duration-300`}>
    <TrendingUp size={10} /> {value}
  </div>
);

const ExtranetDashboard = () => {
  const [property, setProperty] = useState(null);
  const [activities, setActivities] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revenueToday, setRevenueToday] = useState(0);
  const [revenueDelta, setRevenueDelta] = useState(null);
  const { addToast } = useExtranet();

  // Listen for live financial events to update KPIs
  useSocketEvent('SETTLEMENT_CREATED', (event) => {
    const amount = Number(event.data.netPayable);
    setRevenueToday(prev => prev + amount);
    setRevenueDelta(`+₹${amount.toLocaleString()}`);
    
    // Clear delta after animation
    setTimeout(() => setRevenueDelta(null), 5000);
    
    // Add to activities list optimistically
    setActivities(prev => [{
      action: 'SETTLEMENT_CREATED',
      entityType: 'SETTLEMENT',
      entityId: event.data.settlementId,
      createdAt: event.timestamp
    }, ...prev]);
  });

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const [propData, activityData, notifData] = await Promise.all([
        fetchProperty(),
        fetchActivityTimeline(),
        fetchNotifications()
      ]);
      setProperty(propData);
      setActivities(activityData);
      setNotifications(notifData);
    } catch (error) {
      addToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  const handleSignAgreement = async () => {
    if (!confirm('By clicking OK, you are digitally signing the ZivoHotels property agreement.')) return;
    try {
      setLoading(true);
      const res = await fetch(`${import.meta.env.VITE_API_URL || '/api/v1'}/hotels/${property.id}/sign-agreement`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to sign agreement');
      addToast('Agreement signed successfully!', 'success');
      loadDashboardData();
    } catch (error) {
      addToast(error.message, 'error');
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Group activities by date (Today, Yesterday, Earlier)
  const groupActivities = (logs) => {
    const groups = { Today: [], Yesterday: [], Earlier: [] };
    const today = new Date().setHours(0,0,0,0);
    const yesterday = new Date(today - 86400000).setHours(0,0,0,0);

    logs.forEach(log => {
      const logDate = new Date(log.createdAt).setHours(0,0,0,0);
      if (logDate === today) groups.Today.push(log);
      else if (logDate === yesterday) groups.Yesterday.push(log);
      else groups.Earlier.push(log);
    });
    return groups;
  };

  const activityGroups = groupActivities(activities);

  // What the owner should know about where their property stands (was always "Property Live")
  const STATUS_INFO = {
    LIVE: { label: 'Property Live • Zivo Certified', short: 'Live', isLive: true },
    ACTIVE: { label: 'Property Live • Zivo Certified', short: 'Live', isLive: true },
    READY_FOR_GO_LIVE: { label: 'Agreement signed • ZivoHotels will take it live shortly', short: 'Going live' },
    PENDING_AGREEMENT: { label: 'Approved • Sign the agreement to go live', short: 'Sign agreement' },
    IN_REVIEW: { label: 'Under review by ZivoHotels', short: 'In review' },
    SUBMITTED: { label: 'Submitted • Awaiting review', short: 'Submitted' },
    INFORMATION_REQUESTED: { label: 'Action needed • ZivoHotels requested more information', short: 'Action needed' },
    PAUSED: { label: 'Paused • Not taking bookings', short: 'Paused' },
    DRAFT: { label: 'Draft • Finish and submit your listing', short: 'Draft' },
  };
  const statusInfo = STATUS_INFO[property?.status] || { label: property?.status || 'Status unknown', short: property?.status || '—' };

  const hotelMetrics = [
    { 
      label: 'Revenue Today', 
      value: `₹ ${revenueToday.toLocaleString()}`, 
      delta: revenueDelta || 'LIVE', 
      deltaType: revenueDelta ? 'green' : 'gray' 
    },
    { label: 'Status', value: statusInfo.short, delta: statusInfo.isLive ? 'LIVE' : 'NOT LIVE', deltaType: statusInfo.isLive ? 'green' : 'gray' },
    { label: 'Review Score', value: property?.reviewCount > 0 ? `${property.reviewScore}/5` : '—', delta: property?.reviewCount > 0 ? `${property.reviewCount} reviews` : 'NO REVIEWS YET', deltaType: 'brand' },
    { label: 'Health Score', value: property?.healthScore ?? '—', delta: property?.healthScore != null ? 'LIVE' : 'NEW', deltaType: property?.healthScore != null ? 'green' : 'gray' }
  ];

  if (loading && !property) {
    return <div className="flex h-screen items-center justify-center bg-[#F8FAFC]"><Loader2 className="animate-spin text-brand-700" size={48} /></div>;
  }

  return (
    <div className="-m-8 bg-[#F8FAFC]">
      {property?.status === 'PENDING_AGREEMENT' && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-8 max-w-lg w-full text-center shadow-2xl animate-in zoom-in duration-300">
            <div className="w-20 h-20 bg-orange-100 text-orange-700 rounded-full flex items-center justify-center mx-auto mb-6">
              <FileSignature size={32} />
            </div>
            <h2 className="text-2xl font-black text-gray-900 mb-2">Digital Agreement Pending</h2>
            <p className="text-gray-600 mb-8">
              Congratulations! Your property <strong>{property.name}</strong> has been approved. 
              Please review and sign the digital listing agreement to go live and start receiving bookings.
            </p>
            <div className="flex gap-4">
              <button 
                onClick={handleSignAgreement}
                className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-brand-500/30"
              >
                Digitally Sign Agreement
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-4">
              By signing, you agree to our standard terms of service and a commission of{' '}
              <strong>{property.agreement?.commissionRate ?? 15}%</strong> on the room price before GST, plus GST on the commission.
            </p>
          </div>
        </div>
      )}

      <StickyKPIStrip metrics={hotelMetrics} />

      <div className="p-10 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-gray-200 pb-8">
          <div className="flex items-center gap-6">
             <div className="w-20 h-20 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-xl shadow-blue-500/20 font-black text-2xl">
                {property?.name?.charAt(0) || 'H'}
             </div>
             <div>
                <div className="flex items-center gap-2 mb-1">
                   <span className={`w-2 h-2 rounded-full ${statusInfo.isLive ? 'bg-green-500 animate-pulse' : 'bg-amber-400'}`}></span>
                   <span className={`text-xs font-black uppercase tracking-widest ${statusInfo.isLive ? 'text-blue-600' : 'text-amber-700'}`}>{statusInfo.label}</span>
                </div>
                <h1 className="text-4xl font-black text-slate-900 tracking-tight">{property?.name}</h1>
                <p className="text-slate-500 font-medium mt-1 flex items-center gap-2">
                   <LayoutDashboard size={14} /> 
                   Hotel ID: #{property?.id?.slice(0, 8)} • {property?.city || 'India'}
                </p>
             </div>
          </div>

          <div className="flex items-center gap-4">
             <div className="bg-white px-6 py-4 rounded-2xl border border-blue-100 shadow-sm flex items-center gap-6">
                <div className="text-right">
                   <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Health Score</p>
                   <p className="text-sm font-black text-blue-600">{property?.healthScore >= 80 ? 'Premium Partner' : 'Rising Partner'}</p>
                </div>
                <div className="w-14 h-14 rounded-full border-4 border-blue-600 border-t-slate-100 flex items-center justify-center text-[12px] font-black text-blue-600 bg-blue-50">
                   {property?.healthScore != null ? `${property.healthScore}%` : '—'}
                </div>
             </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
           {/* Left: Operational Focus */}
           <div className="lg:col-span-2 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="bg-white p-6 rounded-[2rem] border border-blue-100 shadow-sm flex items-center gap-5 group hover:border-blue-500 transition-all cursor-pointer">
                    <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all">
                       <Clock size={24} />
                    </div>
                    <div>
                       <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Action Required</h4>
                       <p className="text-2xl font-black text-slate-900">{notifications.filter(n => !n.isRead).length} Notifications</p>
                    </div>
                    <ChevronRight className="ml-auto text-slate-300 group-hover:text-blue-600" />
                 </div>
                 
                 <div className="bg-white p-6 rounded-[2rem] border border-orange-100 shadow-sm flex items-center gap-5 group hover:border-orange-500 transition-all cursor-pointer">
                    <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center text-orange-700 group-hover:bg-orange-600 group-hover:text-white transition-all">
                       <AlertTriangle size={24} />
                    </div>
                    <div>
                       <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">System Mode</h4>
                       <p className="text-2xl font-black text-slate-900">{property?.isThrottled ? 'Safe Mode' : 'Normal'}</p>
                    </div>
                    <ChevronRight className="ml-auto text-slate-300 group-hover:text-orange-700" />
                 </div>
              </div>

              {/* Recent Activity Timeline */}
              <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
                 <div className="p-8 border-b border-slate-100 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                       <Activity className="text-blue-600" size={20} />
                       <h3 className="text-xl font-black text-slate-900">Recent Activity</h3>
                    </div>
                 </div>
                 <div className="p-8 space-y-8">
                    {Object.entries(activityGroups).map(([group, logs]) => logs.length > 0 && (
                      <div key={group}>
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">{group}</h4>
                        <div className="space-y-4 border-l-2 border-slate-50 ml-2 pl-6">
                          {logs.map((log, i) => (
                            <div key={i} className="relative">
                              <div className="absolute -left-[31px] top-1 w-2.5 h-2.5 rounded-full bg-blue-500 border-4 border-white"></div>
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="text-sm font-bold text-slate-800">{log.action.replace(/_/g, ' ')}</p>
                                  <p className="text-xs text-slate-500 mt-0.5">{log.entityType} • ID: {log.entityId.slice(0, 8)}</p>
                                </div>
                                <span className="text-xs font-bold text-slate-400">{new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    {activities.length === 0 && (
                      <div className="text-center py-8">
                        <Activity className="mx-auto text-slate-200 mb-2" size={40} />
                        <p className="text-sm text-slate-400">No recent activity found.</p>
                      </div>
                    )}
                 </div>
              </div>
           </div>

           {/* Right: Notifications */}
           <div className="space-y-8">
              <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 shadow-sm">
                 <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center justify-between">
                    Operational Alerts
                    <Bell className="text-orange-500" size={18} />
                 </h3>
                 <div className="space-y-4">
                    {notifications.slice(0, 5).map((n, i) => (
                      <div key={i} className={`p-4 rounded-2xl border transition-all ${n.isRead ? 'bg-white border-slate-100 grayscale opacity-60' : 'bg-blue-50 border-blue-100 shadow-sm'}`}>
                         <p className="text-xs font-black text-slate-900 mb-1">{n.title}</p>
                         <p className="text-xs text-slate-500 leading-relaxed">{n.message}</p>
                         <p className="text-xs font-bold text-blue-600 mt-2">{new Date(n.createdAt).toLocaleString()}</p>
                      </div>
                    ))}
                    {notifications.length === 0 && (
                      <div className="text-center py-6">
                        <Bell className="mx-auto text-slate-200 mb-2" size={32} />
                        <p className="text-xs text-slate-400">All clear! No alerts.</p>
                      </div>
                    )}
                 </div>
              </div>

              {/* Quick Support */}
              <div className="flex items-center gap-4 p-6 bg-navy-900 rounded-[2rem] text-white">
                 <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center">
                    <Info className="text-blue-600" />
                 </div>
                 <div className="min-w-0">
                    <h4 className="text-sm font-bold">Need help?</h4>
                    <p className="text-xs text-navy-100">Write to <span className="font-semibold text-white select-all">partners@zivohotels.com</span></p>
                 </div>
                 <a href="/help#hotels" aria-label="Help for hotels" className="ml-auto w-10 h-10 bg-brand-600 rounded-full flex items-center justify-center hover:bg-brand-700 transition-colors shrink-0">
                    <ArrowRight size={16} />
                 </a>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default ExtranetDashboard;
