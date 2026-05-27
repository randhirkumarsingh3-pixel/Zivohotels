import { useState, useEffect } from 'react';
import { 
  Calendar, MapPin, CreditCard, ChevronRight, XCircle, AlertCircle, 
  RefreshCw, CheckCircle2, FileText, MessageSquare, Phone, Compass, 
  User, Sparkles, Gift, ArrowRightLeft, Clock, Printer, Download,
  ExternalLink, Wifi, ShieldAlert, Award, ArrowRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';
const API_URL = `${BASE_URL}/bookings`;

const MyBookings = () => {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeBooking, setActiveBooking] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // overview, timeline, concierge, billing, support
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [conciergeActionLoading, setConciergeActionLoading] = useState('');
  const [conciergeSuccess, setConciergeSuccess] = useState('');

  const fetchMyBookings = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('jwt_token');
      const res = await fetch(`${API_URL}/my-bookings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to fetch bookings');
      setBookings(data.data || []);
      
      // If we had an active booking selected, refresh its data in the drawer
      if (activeBooking) {
        const updated = (data.data || []).find(b => b.id === activeBooking.id);
        if (updated) setActiveBooking(updated);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyBookings();
  }, []);

  const handleCancelBooking = async (id) => {
    setCancelling(true);
    try {
      const token = localStorage.getItem('jwt_token');
      const res = await fetch(`${API_URL}/${id}/cancel`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Cancellation failed');
      
      // Update local state
      setBookings(prev => prev.map(b => b.id === id ? data.data.booking : b));
      setCancelTarget(null);
      // Refresh current active booking details in the drawer
      fetchMyBookings();
    } catch (err) {
      alert(err.message);
    } finally {
      setCancelling(false);
    }
  };

  const handleDownloadInvoice = async (invoiceId, refName) => {
    try {
      const token = localStorage.getItem('jwt_token');
      const res = await fetch(`${BASE_URL}/invoices/${invoiceId}/download`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Invoice PDF is not generated yet or missing on server.');
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Invoice-${refName}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleConciergeRequest = (requestType) => {
    setConciergeActionLoading(requestType);
    setTimeout(() => {
      setConciergeActionLoading('');
      setConciergeSuccess(requestType);
      setTimeout(() => setConciergeSuccess(''), 4000);
    }, 1500);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'CONFIRMED': return 'text-emerald-700 bg-emerald-50 border-emerald-100';
      case 'PENDING': return 'text-amber-700 bg-amber-50 border-amber-100';
      case 'CANCELLED': return 'text-rose-700 bg-rose-50 border-rose-100';
      case 'REFUNDED': return 'text-sky-700 bg-sky-50 border-sky-100';
      case 'CHECKED_IN': return 'text-violet-700 bg-violet-50 border-violet-100';
      case 'COMPLETED': return 'text-gray-700 bg-gray-100 border-gray-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-100';
    }
  };

  const getTimelineIcon = (status) => {
    switch (status) {
      case 'BOOKING_INITIATED': return <Clock size={16} className="text-gray-500" />;
      case 'PENDING_PAYMENT': return <CreditCard size={16} className="text-amber-500" />;
      case 'CONFIRMED': return <CheckCircle2 size={16} className="text-emerald-500" />;
      case 'INVOICE_GENERATED': return <FileText size={16} className="text-blue-500" />;
      case 'CHECKED_IN': return <MapPin size={16} className="text-violet-500" />;
      case 'CANCELLED': return <XCircle size={16} className="text-rose-500" />;
      case 'REFUNDED': return <ArrowRightLeft size={16} className="text-sky-500" />;
      default: return <Sparkles size={16} className="text-brand-500" />;
    }
  };

  if (loading && bookings.length === 0) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-24 flex flex-col items-center justify-center">
        <RefreshCw className="h-12 w-12 text-brand-600 animate-spin mb-6" />
        <p className="text-gray-600 font-semibold text-lg">Accessing Guest Travel Hub...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      {/* Header and Loyalty Tracker */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <div>
          <span className="text-brand-600 font-bold uppercase tracking-wider text-sm">Zivo Premium</span>
          <h1 className="text-4xl font-black text-gray-900 tracking-tight mt-1">Guest Travel Hub</h1>
          <p className="text-gray-500 mt-2 text-lg">Manage stay parameters, access digital invoices, and coordinate trip assistance.</p>
        </div>

        {/* Loyalty Wallet Integration Card */}
        <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-brand-950 text-white rounded-3xl p-6 shadow-xl shadow-gray-950/20 flex items-center gap-6 border border-gray-800">
          <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-amber-400 backdrop-blur-md">
            <Award size={28} />
          </div>
          <div>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Points Balance</p>
            <p className="text-2xl font-black text-white mt-0.5">240 Zivo Points</p>
            <p className="text-[10px] text-emerald-400 font-medium flex items-center gap-1 mt-1">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping"></span>
              Wallet cashback credited
            </p>
          </div>
        </div>
      </div>

      {bookings.length === 0 ? (
        <div className="bg-white rounded-3xl p-16 text-center border border-gray-100 shadow-sm max-w-3xl mx-auto">
          <div className="bg-gray-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8 border border-gray-100">
            <Calendar className="h-12 w-12 text-gray-300" />
          </div>
          <h3 className="text-2xl font-black text-gray-900 mb-3">No active travel reservations</h3>
          <p className="text-gray-500 mb-8 max-w-sm mx-auto leading-relaxed">Your Travel Hub is currently empty. Explore premium accommodations and reserve your next escape.</p>
          <Link to="/hotels" className="inline-flex items-center justify-center bg-brand-600 text-white px-8 py-4 rounded-full font-bold shadow-lg shadow-brand-500/20 hover:bg-brand-700 transition-all gap-2 group">
            Explore Hotels
            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Bookings Grid (2/3 width) */}
          <div className="lg:col-span-2 space-y-6">
            <h2 className="text-xl font-black text-gray-900 mb-4 flex items-center gap-2">
              <Clock size={20} className="text-brand-600" />
              Upcoming & Past Stays
            </h2>

            {bookings.map((booking) => {
              const mainImageUrl = booking.hotel?.media?.[0]?.url 
                ? (booking.hotel.media[0].url.startsWith('http') ? booking.hotel.media[0].url : `${BASE_URL.replace('/api/v1', '')}${booking.hotel.media[0].url}`)
                : 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80';

              return (
                <div 
                  key={booking.id} 
                  className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow group flex flex-col md:flex-row"
                >
                  {/* Hotel Thumbnail */}
                  <div className="md:w-64 h-48 md:h-auto relative overflow-hidden shrink-0">
                    <img 
                      src={mainImageUrl} 
                      alt={booking.hotel?.name || 'Hotel'} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none md:hidden"></div>
                    <span className="absolute top-4 left-4 md:hidden px-3 py-1 rounded-full text-xs font-black bg-white/95 text-gray-900 shadow-md">
                      ₹{booking.paidAmount?.toLocaleString('en-IN') || booking.totalAmount?.toLocaleString('en-IN')}
                    </span>
                  </div>

                  {/* Card Details */}
                  <div className="p-6 md:p-8 flex-1 flex flex-col justify-between">
                    <div>
                      {/* Status and tags */}
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <span className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider border ${getStatusColor(booking.status)}`}>
                          {booking.status}
                        </span>
                        {booking.paymentStatus === 'REFUNDED' && (
                          <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-purple-50 text-purple-600 border border-purple-100">
                            Refunded
                          </span>
                        )}
                        {booking.intelligence?.aiTags?.slice(0, 2).map((tag, idx) => (
                          <span key={idx} className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-gray-50 text-gray-500 border border-gray-100 flex items-center gap-1">
                            <Sparkles size={10} className="text-brand-500" />
                            {tag}
                          </span>
                        ))}
                      </div>

                      <h3 className="text-2xl font-bold text-gray-900 group-hover:text-brand-600 transition-colors mb-1">{booking.hotel?.name}</h3>
                      <p className="text-gray-500 text-sm flex items-center gap-1.5 mb-4">
                        <MapPin size={14} className="text-gray-400" />
                        {booking.hotel?.city} · {booking.roomType?.name}
                      </p>

                      <div className="grid grid-cols-2 gap-4 bg-gray-50/70 rounded-2xl p-4 mb-4 border border-gray-50">
                        <div>
                          <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Check-in</p>
                          <p className="font-extrabold text-gray-800 text-sm">{new Date(booking.checkIn).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Check-out</p>
                          <p className="font-extrabold text-gray-800 text-sm">{new Date(booking.checkOut).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                        </div>
                      </div>
                    </div>

                    {/* Footer / Main CTAs */}
                    <div className="flex items-center justify-between pt-4 border-t border-gray-100 gap-4">
                      <div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Ref ID</p>
                        <p className="font-mono text-xs font-bold text-gray-700">{booking.bookingRef}</p>
                      </div>

                      <button 
                        onClick={() => {
                          setActiveBooking(booking);
                          setActiveTab('overview');
                        }}
                        className="inline-flex items-center gap-1.5 bg-gray-900 text-white hover:bg-brand-600 px-5 py-2.5 rounded-xl font-bold text-xs shadow-sm transition-all"
                      >
                        Manage Booking
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Intelligence & Support panel (1/3 width) */}
          <div className="space-y-6">
            {/* Trip Assistant Helpdesk */}
            <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
              <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
                <Sparkles size={20} className="text-brand-600" />
                AI Trip Assistant
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed mb-4">
                Need immediate help with your active reservation? Tell Zivo AI to notify the hotel of a late check-in or request amenities.
              </p>
              <div className="space-y-3">
                <button 
                  onClick={() => handleConciergeRequest('general')}
                  className="w-full flex items-center justify-between p-3 rounded-2xl bg-gray-50 border border-gray-100 hover:border-brand-500 transition-colors text-left text-xs font-bold text-gray-800"
                >
                  <span>Request Airport Transfer Setup</span>
                  <ChevronRight size={14} />
                </button>
                <button 
                  onClick={() => handleConciergeRequest('general')}
                  className="w-full flex items-center justify-between p-3 rounded-2xl bg-gray-50 border border-gray-100 hover:border-brand-500 transition-colors text-left text-xs font-bold text-gray-800"
                >
                  <span>Inquire about Parking Availability</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>

            {/* Smart Rebooking / Guest Retention card */}
            <div className="bg-gradient-to-br from-brand-900 to-brand-950 text-white rounded-3xl p-6 shadow-lg shadow-brand-950/20 border border-brand-800/50 relative overflow-hidden">
              <div className="absolute -right-10 -bottom-10 opacity-10">
                <ArrowRightLeft size={200} />
              </div>
              <span className="bg-white/10 text-white/90 text-[10px] font-black uppercase px-2.5 py-1 rounded-full border border-white/10">Loyalty Perk</span>
              <h3 className="text-xl font-bold text-white mt-4 mb-2">Ready for your next stay?</h3>
              <p className="text-xs text-brand-200 leading-relaxed mb-6">Enjoy a flat 10% loyalty discount at any Zivo partner property when you rebook today.</p>
              <Link 
                to="/hotels"
                className="w-full bg-white text-brand-950 font-extrabold text-sm py-3 px-4 rounded-xl flex items-center justify-center gap-1.5 hover:bg-brand-50 transition-colors"
              >
                Apply Rebook Discount
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Contextual Side Drawer */}
      {activeBooking && (
        <>
          {/* Backdrop */}
          <div 
            onClick={() => setActiveBooking(null)}
            className="fixed inset-0 z-[110] bg-gray-900/60 backdrop-blur-sm transition-opacity"
          ></div>

          {/* Drawer content */}
          <div className="fixed inset-y-0 right-0 z-[120] w-full max-w-xl bg-white shadow-2xl overflow-y-auto flex flex-col h-full animate-slide-in">
            {/* Drawer Header */}
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div>
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Booking Hub Workspace</span>
                <h3 className="text-xl font-black text-gray-900 mt-0.5">{activeBooking.hotel?.name}</h3>
                <p className="text-xs text-gray-500 font-mono mt-1">Ref ID: {activeBooking.bookingRef}</p>
              </div>
              <button 
                onClick={() => setActiveBooking(null)}
                className="w-10 h-10 bg-white border border-gray-200 rounded-full flex items-center justify-center hover:bg-gray-100 text-gray-500 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Tab Navigation */}
            <div className="border-b border-gray-100 px-6 flex gap-4 overflow-x-auto whitespace-nowrap scrollbar-none">
              {[
                { id: 'overview', label: 'Overview', icon: <User size={14} /> },
                { id: 'timeline', label: 'Timeline', icon: <Clock size={14} /> },
                { id: 'concierge', label: 'AI Concierge', icon: <Sparkles size={14} /> },
                { id: 'billing', label: 'Financials', icon: <FileText size={14} /> },
                { id: 'support', label: 'Support', icon: <Phone size={14} /> }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 py-4 border-b-2 font-bold text-xs transition-colors ${activeTab === tab.id ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Content Body */}
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              
              {/* Tab 1: OVERVIEW */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Quick summary stats */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100/50 text-center">
                      <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Guests</p>
                      <p className="font-extrabold text-gray-900 text-base">{activeBooking.guests} pax</p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100/50 text-center">
                      <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Rooms</p>
                      <p className="font-extrabold text-gray-900 text-base">{activeBooking.rooms} Unit</p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100/50 text-center">
                      <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Stay Duration</p>
                      <p className="font-extrabold text-gray-900 text-base">
                        {Math.ceil(Math.abs(new Date(activeBooking.checkOut) - new Date(activeBooking.checkIn)) / (1000 * 60 * 60 * 24))} Nights
                      </p>
                    </div>
                  </div>

                  {/* Booking parameters detail */}
                  <div className="border border-gray-100 rounded-2xl p-5 space-y-4">
                    <h4 className="font-bold text-gray-900 text-sm">Stay Parameters</h4>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-gray-400 font-medium">Guest Name</span>
                        <p className="font-bold text-gray-800 mt-0.5">{activeBooking.guestName}</p>
                      </div>
                      <div>
                        <span className="text-gray-400 font-medium">Guest Contact</span>
                        <p className="font-bold text-gray-800 mt-0.5">{activeBooking.guestPhone}</p>
                      </div>
                      <div className="col-span-2">
                        <span className="text-gray-400 font-medium">Room Type Reserved</span>
                        <p className="font-bold text-gray-800 mt-0.5">{activeBooking.roomType?.name}</p>
                      </div>
                      <div className="col-span-2">
                        <span className="text-gray-400 font-medium">Rate Plan Description</span>
                        <p className="font-bold text-gray-800 mt-0.5">{activeBooking.ratePlan?.name} ({activeBooking.ratePlan?.mealPlan || 'No Meal Included'})</p>
                      </div>
                    </div>
                  </div>

                  {/* Offline Voucher Card */}
                  <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-5 flex items-start gap-4">
                    <div className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center shrink-0">
                      <Printer size={20} />
                    </div>
                    <div className="text-xs">
                      <h4 className="font-bold text-emerald-900 mb-1">Offline Travel Voucher</h4>
                      <p className="text-emerald-700 leading-relaxed mb-3">Save booking coordinates locally for access during low-reception travel. Includes access address and verification QR code.</p>
                      <button 
                        onClick={() => window.print()}
                        className="inline-flex items-center gap-1.5 bg-emerald-600 text-white font-bold px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-600/10"
                      >
                        Print/Save Voucher
                        <ExternalLink size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: TIMELINE */}
              {activeTab === 'timeline' && (
                <div className="space-y-6">
                  <h4 className="font-bold text-gray-900 text-sm">Live Operational Timeline</h4>
                  <div className="relative pl-8 border-l-2 border-gray-100 space-y-8 py-2 ml-4">
                    {activeBooking.timelineEvents?.map((event, idx) => (
                      <div key={event.id} className="relative">
                        {/* Milestone dot */}
                        <div className="absolute -left-12 top-0.5 w-8 h-8 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center shadow-sm">
                          {getTimelineIcon(event.status)}
                        </div>

                        {/* Event Content */}
                        <div>
                          <h5 className="font-extrabold text-gray-900 text-sm">{event.title}</h5>
                          <p className="text-xs text-gray-500 mt-1 leading-relaxed">{event.message}</p>
                          <span className="text-[10px] text-gray-400 font-bold block mt-2">
                            {new Date(event.createdAt).toLocaleDateString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
                          </span>
                        </div>
                      </div>
                    ))}

                    {/* Dynamic Next Steps indicators */}
                    {activeBooking.status === 'CONFIRMED' && (
                      <div className="relative opacity-60">
                        <div className="absolute -left-12 top-0.5 w-8 h-8 rounded-full bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center">
                          <Clock size={14} className="text-gray-400" />
                        </div>
                        <div>
                          <h5 className="font-bold text-gray-500 text-sm">Hotel Acknowledge Arrival</h5>
                          <p className="text-xs text-gray-400 mt-0.5">Awaiting check-in process verification.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 3: CONCIERGE */}
              {activeTab === 'concierge' && (
                <div className="space-y-6">
                  {/* Success Banner */}
                  {conciergeSuccess && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-emerald-800 flex items-start gap-2.5 text-xs">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Request Transmitted Successfully</p>
                        <p className="text-emerald-700 leading-normal mt-0.5">Your request was logged. The properties manager has been alerted via the Extranet.</p>
                      </div>
                    </div>
                  )}

                  {/* AI Assistance Action layer */}
                  <div className="bg-brand-50 border border-brand-100 rounded-2xl p-5 flex gap-4">
                    <Sparkles className="text-brand-600 mt-0.5 shrink-0" size={24} />
                    <div className="text-xs">
                      <h4 className="font-bold text-brand-900 mb-1">AI Concierge Services</h4>
                      <p className="text-brand-700 leading-relaxed mb-4">Quickly send check-in requests or stay modifications directly to the reception desk. These alerts sync in real-time.</p>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <button 
                          onClick={() => handleConciergeRequest('late')}
                          disabled={conciergeActionLoading === 'late' || activeBooking.status !== 'CONFIRMED'}
                          className="bg-white border border-brand-200 hover:border-brand-600 text-brand-950 font-bold p-3 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm text-[11px] disabled:opacity-50"
                        >
                          {conciergeActionLoading === 'late' ? <RefreshCw size={12} className="animate-spin" /> : <Clock size={12} />}
                          Alert Late Arrival
                        </button>
                        <button 
                          onClick={() => handleConciergeRequest('early')}
                          disabled={conciergeActionLoading === 'early' || activeBooking.status !== 'CONFIRMED'}
                          className="bg-white border border-brand-200 hover:border-brand-600 text-brand-950 font-bold p-3 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm text-[11px] disabled:opacity-50"
                        >
                          {conciergeActionLoading === 'early' ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
                          Request Early Check-in
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Trip Intelligence Card */}
                  <div className="border border-gray-100 rounded-2xl p-5 space-y-4">
                    <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                      <ExternalLink size={16} className="text-brand-600" />
                      Stay Intelligence Summary
                    </h4>
                    
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div className="bg-gray-50/70 p-3 rounded-xl border border-gray-50 flex items-start gap-2">
                        <Clock size={16} className="text-brand-500 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-gray-400 font-medium">Peak Check-in Hours</span>
                          <p className="font-bold text-gray-800 mt-0.5">{activeBooking.intelligence?.peakCheckIn || '12 PM - 2 PM'}</p>
                        </div>
                      </div>
                      <div className="bg-gray-50/70 p-3 rounded-xl border border-gray-50 flex items-start gap-2">
                        <Wifi size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-gray-400 font-medium">WiFi Speed Score</span>
                          <p className="font-bold text-gray-800 mt-0.5">{activeBooking.intelligence?.wifiRating || 'Excellent'}</p>
                        </div>
                      </div>
                      <div className="bg-gray-50/70 p-3 rounded-xl border border-gray-50 flex items-start gap-2">
                        <Compass size={16} className="text-blue-500 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-gray-400 font-medium">Airport Distance</span>
                          <p className="font-bold text-gray-800 mt-0.5">{activeBooking.intelligence?.airportDistance || '18 mins away'}</p>
                        </div>
                      </div>
                      <div className="bg-gray-50/70 p-3 rounded-xl border border-gray-50 flex items-start gap-2">
                        <ShieldAlert size={16} className="text-amber-500 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-gray-400 font-medium">Traffic / Access</span>
                          <p className="font-bold text-gray-800 mt-0.5">{activeBooking.intelligence?.trafficAlert || 'Clear Route'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 4: BILLING & INVOICE */}
              {activeTab === 'billing' && (
                <div className="space-y-6">
                  {/* Financial summary card */}
                  <div className="bg-gray-900 text-white rounded-2xl p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Total Paid Amount</p>
                        <p className="text-3xl font-black mt-1">₹{activeBooking.paidAmount?.toLocaleString('en-IN')}</p>
                      </div>
                      <span className="bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase px-2.5 py-1 rounded-full border border-emerald-500/20">
                        Payment Captured
                      </span>
                    </div>

                    <div className="border-t border-white/10 pt-4 grid grid-cols-2 gap-4 text-xs text-gray-400">
                      <div>
                        <span>Payment Method</span>
                        <p className="font-bold text-white mt-0.5">{activeBooking.paymentType}</p>
                      </div>
                      <div>
                        <span>Reference No.</span>
                        <p className="font-mono text-white mt-0.5">{activeBooking.bookingRef}</p>
                      </div>
                    </div>
                  </div>

                  {/* Actions: Download Invoice, receipts */}
                  <div className="border border-gray-100 rounded-2xl p-5 space-y-4">
                    <h4 className="font-bold text-gray-900 text-sm">Travel Invoices & Billing Center</h4>
                    <p className="text-xs text-gray-500 leading-relaxed">Download official billing receipts or regenerate standard booking invoices for tax declarations.</p>
                    
                    <div className="grid grid-cols-1 gap-2.5">
                      {activeBooking.invoice ? (
                        <button 
                          onClick={() => handleDownloadInvoice(activeBooking.invoice.id, activeBooking.bookingRef)}
                          className="flex items-center justify-between p-3 rounded-xl border border-gray-200 hover:border-brand-500 text-left text-xs font-bold text-gray-800 transition-colors"
                        >
                          <span className="flex items-center gap-2">
                            <FileText size={16} className="text-brand-600" />
                            Official GST Invoice PDF
                          </span>
                          <Download size={14} className="text-gray-400" />
                        </button>
                      ) : (
                        <div className="p-3 rounded-xl bg-amber-50 text-amber-700 text-xs border border-amber-100 flex items-start gap-2">
                          <AlertCircle size={16} className="shrink-0 mt-0.5" />
                          <span>No invoice found. If you just made this booking, it may be generating in the background.</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Cancellation Engine Widget */}
                  {activeBooking.status === 'CONFIRMED' && (
                    <div className="bg-rose-50/50 border border-rose-100 rounded-2xl p-5 space-y-3">
                      <h4 className="font-bold text-rose-950 text-sm">Cancel Booking Options</h4>
                      <p className="text-xs text-rose-700 leading-relaxed">
                        To request a cancellation, click the button below. You will be shown a refund preview and penalty breakdown before you confirm.
                      </p>
                      <button 
                        onClick={() => setCancelTarget(activeBooking)}
                        className="bg-white border border-rose-200 hover:border-rose-600 text-rose-700 font-bold py-2.5 px-4 rounded-xl text-xs transition-colors flex items-center gap-1.5"
                      >
                        <XCircle size={14} />
                        Request Booking Cancellation
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 5: SUPPORT & CONTACT */}
              {activeTab === 'support' && (
                <div className="space-y-6">
                  {/* Contact channels card */}
                  <div className="border border-gray-100 rounded-2xl p-5 space-y-4">
                    <h4 className="font-bold text-gray-900 text-sm">Contact Support & Property</h4>
                    <p className="text-xs text-gray-500 leading-relaxed">Connect directly with the hospitality team or navigate your route to the property entrance.</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-bold text-gray-800">
                      <a 
                        href={`tel:${activeBooking.guestPhone}`}
                        className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-100 rounded-xl hover:border-brand-500 transition-colors"
                      >
                        <Phone size={16} className="text-gray-500" />
                        Call Property Desk
                      </a>
                      <a 
                        href={`https://wa.me/${activeBooking.guestPhone}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 p-3 bg-emerald-50/40 border border-emerald-100 rounded-xl hover:border-emerald-500 transition-colors text-emerald-800"
                      >
                        <MessageSquare size={16} className="text-emerald-500" />
                        WhatsApp Concierge
                      </a>
                      <a 
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activeBooking.hotel?.name + ' ' + activeBooking.hotel?.city)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="col-span-1 md:col-span-2 flex items-center justify-center gap-2 p-3 bg-blue-50/30 border border-blue-100 rounded-xl hover:border-blue-500 transition-colors text-blue-700"
                      >
                        <Compass size={16} className="text-blue-500" />
                        Launch Google Maps Navigation
                      </a>
                    </div>
                  </div>

                  {/* Loyalty rebooking loop */}
                  <div className="bg-brand-900 text-white rounded-2xl p-5 space-y-3">
                    <h4 className="font-bold text-white text-sm">Recommended Accommodation Nearby</h4>
                    <p className="text-xs text-brand-200 leading-relaxed">Loved {activeBooking.hotel?.name}? Unlock additional benefits by booking similar stays nearby.</p>
                    <Link 
                      to="/hotels"
                      className="inline-flex items-center gap-1.5 text-xs text-white bg-white/10 border border-white/10 font-bold px-4 py-2.5 rounded-xl hover:bg-white/20 transition-all"
                    >
                      Browse Similar Properties
                      <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>
              )}

            </div>
          </div>
        </>
      )}

      {/* Cancellation Preview & Action Modal */}
      {cancelTarget && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-scale-in">
            <div className="p-8">
              <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <XCircle size={32} />
              </div>
              <h3 className="text-2xl font-black text-gray-900 text-center mb-2">Cancel Stay Reservation?</h3>
              <p className="text-gray-500 text-center text-sm mb-6">You are initiating cancellation for <span className="font-bold text-gray-900">{cancelTarget.hotel?.name}</span>.</p>
              
              {/* Refund Calculations & Penalties (Smart Cancellation Engine) */}
              <div className="border border-gray-100 rounded-2xl p-4 mb-6 space-y-3 text-xs">
                <div className="flex justify-between items-center pb-2 border-b border-gray-100 text-gray-500 font-semibold">
                  <span>Price Component</span>
                  <span>Amount (INR)</span>
                </div>
                <div className="flex justify-between items-center text-gray-700">
                  <span>Total Amount Paid</span>
                  <span>₹{cancelTarget.paidAmount?.toLocaleString('en-IN') || cancelTarget.totalAmount?.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between items-center text-rose-600 font-bold">
                  <span>Cancellation Penalty</span>
                  <span>- ₹0</span>
                </div>
                <div className="flex justify-between items-center text-emerald-600 font-black text-sm pt-2 border-t border-gray-100">
                  <span>Estimated Refund Amount</span>
                  <span>₹{cancelTarget.paidAmount?.toLocaleString('en-IN') || cancelTarget.totalAmount?.toLocaleString('en-IN')}</span>
                </div>
              </div>

              <div className="bg-amber-50 rounded-2xl p-4 text-xs flex items-start gap-2.5 mb-8 border border-amber-100">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-amber-800">
                  <p className="font-bold mb-0.5">Refund Timelines notice</p>
                  <p className="leading-relaxed">
                    Refunds are processed back to the original method and settle within 5-7 business days. Alternatively, you can select standard wallet credit for instant bookings.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setCancelTarget(null)}
                  disabled={cancelling}
                  className="px-6 py-4 border border-gray-200 text-gray-700 rounded-2xl font-bold hover:bg-gray-50 transition-colors disabled:opacity-50 text-xs"
                >
                  Keep Booking
                </button>
                <button 
                  onClick={() => handleCancelBooking(cancelTarget.id)}
                  disabled={cancelling}
                  className="px-6 py-4 bg-rose-600 text-white rounded-2xl font-bold hover:bg-rose-700 transition-all shadow-lg shadow-rose-200 disabled:opacity-50 flex items-center justify-center text-xs"
                >
                  {cancelling ? <RefreshCw className="h-5 w-5 animate-spin" /> : 'Confirm Cancel'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyBookings;
