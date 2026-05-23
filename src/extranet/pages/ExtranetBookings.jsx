import { useState, useEffect, useCallback } from 'react';
import { 
  ClipboardList, Search, Filter, Download, Eye,
  CheckCircle2, Clock, XCircle, AlertCircle,
  Phone, Mail, Calendar, Users, IndianRupee,
  ChevronDown, ArrowRight, MessageSquare, BedDouble, Loader2
} from 'lucide-react';
import { fetchBookings, transitionBookingStatus } from '../../services/extranetApi';
import { useExtranet } from '../context/ExtranetContext';

const statusConfig = {
  PENDING: { color: 'bg-yellow-50 text-yellow-600 border-yellow-100', icon: Clock },
  CONFIRMED: { color: 'bg-blue-50 text-blue-600 border-blue-100', icon: CheckCircle2 },
  CHECKED_IN: { color: 'bg-green-50 text-green-600 border-green-100', icon: CheckCircle2 },
  CHECKED_OUT: { color: 'bg-gray-100 text-gray-500 border-gray-200', icon: Clock },
  CANCELLED: { color: 'bg-red-50 text-red-600 border-red-100', icon: XCircle },
  NO_SHOW: { color: 'bg-orange-50 text-orange-600 border-orange-100', icon: AlertCircle },
};

const ExtranetBookings = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null); // stores bookingId being processed
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [expandedBooking, setExpandedBooking] = useState(null);
  
  const { addToast } = useExtranet();

  const loadBookings = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const data = await fetchBookings();
      setBookings(data);
    } catch (error) {
      addToast(error.message, 'error');
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadBookings();
    // Live Status Stream (Polling every 30s)
    const interval = setInterval(() => {
      loadBookings(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [loadBookings]);

  const handleTransition = async (bookingId, newStatus) => {
    try {
      setActionLoading(bookingId);
      await transitionBookingStatus(bookingId, newStatus);
      addToast(`Booking successfully marked as ${newStatus.replace('_', ' ')}`, 'success');
      loadBookings(true); // Refresh state
    } catch (error) {
      addToast(error.message, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const filters = ['ALL', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'];
  
  const filteredBookings = activeFilter === 'ALL' 
    ? bookings 
    : bookings.filter(b => b.status === activeFilter);

  if (loading && bookings.length === 0) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-brand-600" size={32} /></div>;
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Bookings</h1>
          <p className="text-gray-500 font-medium mt-1">View and manage all your reservations.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-black transition-all">
            <Download size={16} /> Export
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {filters.map(f => (
          <button 
            key={f}
            onClick={() => setActiveFilter(f)}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${activeFilter === f ? 'bg-brand-600 text-white border-brand-600 shadow-lg shadow-brand-600/20' : 'bg-white text-gray-400 border-gray-100 hover:text-gray-600 hover:border-gray-200'}`}
          >
            {f.replace('_', ' ')}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input 
              type="text" 
              placeholder="Search guest or booking ID..."
              className="bg-white border-gray-200 border rounded-xl py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-brand-500/20 outline-none transition-all w-64"
            />
          </div>
        </div>
      </div>

      {/* Booking List */}
      <div className="space-y-4">
        {filteredBookings.length === 0 && (
          <div className="text-center py-12 bg-white rounded-[2rem] border border-gray-100">
            <ClipboardList className="mx-auto text-gray-300 mb-4" size={48} />
            <h3 className="text-lg font-black text-gray-900">No Bookings Found</h3>
            <p className="text-sm text-gray-500">There are no bookings matching your criteria.</p>
          </div>
        )}

        {filteredBookings.map(booking => {
          const config = statusConfig[booking.status] || statusConfig.PENDING;
          const isExpanded = expandedBooking === booking.id;
          const isProcessing = actionLoading === booking.id;

          return (
            <div key={booking.id} className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden hover:border-gray-200 transition-all">
              <div 
                onClick={() => !isProcessing && setExpandedBooking(isExpanded ? null : booking.id)}
                className={`p-6 flex items-center justify-between ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-500 uppercase text-lg shrink-0">
                    {booking.guestName ? booking.guestName.charAt(0) : '?'}
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h4 className="text-sm font-black text-gray-900">{booking.guestName}</h4>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${config.color}`}>
                        {booking.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 font-medium flex items-center gap-3 flex-wrap">
                      <span className="font-bold text-gray-700">{booking.bookingRef}</span>
                      <span>•</span>
                      <span>{booking.roomType?.name || 'Unknown Room'}</span>
                      <span>•</span>
                      <span>{new Date(booking.checkIn).toLocaleDateString()} → {new Date(booking.checkOut).toLocaleDateString()}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-lg font-black text-gray-900">₹ {booking.totalAmount}</p>
                    <p className={`text-[9px] font-black uppercase tracking-widest ${booking.paymentMode === 'PREPAID' ? 'text-green-600' : 'text-orange-600'}`}>
                      {booking.paymentMode || 'N/A'}
                    </p>
                  </div>
                  {isProcessing ? <Loader2 size={18} className="animate-spin text-brand-600" /> : <ChevronDown size={18} className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />}
                </div>
              </div>

              {isExpanded && !isProcessing && (
                <div className="border-t border-gray-100 p-6 bg-gray-50/50">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                    <div className="flex items-center gap-3">
                      <Phone className="text-brand-600" size={16} />
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Phone</p>
                        <p className="text-sm font-bold text-gray-900">{booking.guestPhone || 'N/A'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Mail className="text-brand-600" size={16} />
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Email</p>
                        <p className="text-sm font-bold text-gray-900">{booking.guestEmail || 'N/A'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Users className="text-brand-600" size={16} />
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Guests</p>
                        <p className="text-sm font-bold text-gray-900">{booking.guests} Guest(s)</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <BedDouble className="text-brand-600" size={16} />
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Rooms</p>
                        <p className="text-sm font-bold text-gray-900">{booking.rooms} Room(s)</p>
                      </div>
                    </div>
                  </div>

                  {/* Actions - Driven by strict state machine rules */}
                  <div className="flex items-center gap-3 flex-wrap">
                    {(booking.status === 'PENDING' || booking.status === 'CONFIRMED') && (
                      <button 
                        onClick={() => handleTransition(booking.id, 'CHECKED_IN')}
                        className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-green-700 transition-all"
                      >
                        <CheckCircle2 size={14} /> Mark Check-in
                      </button>
                    )}
                    {booking.status === 'CHECKED_IN' && (
                      <button 
                        onClick={() => handleTransition(booking.id, 'CHECKED_OUT')}
                        className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-700 transition-all"
                      >
                        <CheckCircle2 size={14} /> Mark Check-out
                      </button>
                    )}
                    
                    {['PENDING', 'CONFIRMED'].includes(booking.status) && (
                      <button 
                        onClick={() => handleTransition(booking.id, 'CANCELLED')}
                        className="flex items-center gap-2 px-5 py-2.5 border border-red-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-red-600 hover:bg-red-50 transition-all ml-auto"
                      >
                        <XCircle size={14} /> Cancel Booking
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ExtranetBookings;
