import { useState, useEffect } from 'react';
import { 
  Calendar, MapPin, CreditCard, ChevronRight, 
  XCircle, AlertCircle, RefreshCw, CheckCircle2 
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
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const fetchMyBookings = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('jwt_token');
      const res = await fetch(API_URL, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to fetch bookings');
      setBookings(data.data || []);
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
    } catch (err) {
      alert(err.message);
    } finally {
      setCancelling(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'CONFIRMED': return 'text-blue-600 bg-blue-50';
      case 'CANCELLED': return 'text-red-600 bg-red-50';
      case 'COMPLETED': return 'text-green-600 bg-green-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 flex flex-col items-center justify-center">
        <RefreshCw className="h-10 w-10 text-brand-600 animate-spin mb-4" />
        <p className="text-gray-500 font-medium">Fetching your reservations...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900">My Bookings</h1>
        <p className="text-gray-500 mt-2 text-lg">Manage your upcoming and past stays.</p>
      </div>

      {bookings.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border-2 border-dashed border-gray-200">
          <div className="bg-gray-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Calendar className="h-10 w-10 text-gray-300" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">No bookings found</h3>
          <p className="text-gray-500 mb-8 max-w-xs mx-auto">Looks like you haven't made any reservations yet. Ready to plan your next trip?</p>
          <Link to="/hotels" className="bg-brand-600 text-white px-8 py-3 rounded-full font-bold shadow-lg shadow-brand-500/30 hover:bg-brand-700 transition-all">
            Explore Hotels
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {bookings.map((booking) => (
            <div key={booking.id} className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
              <div className="p-6 md:p-8 flex flex-col md:flex-row gap-8">
                {/* Property Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${getStatusColor(booking.status)}`}>
                      {booking.status}
                    </span>
                    {booking.paymentStatus === 'REFUNDED' && (
                      <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-purple-50 text-purple-600">
                        Refunded
                      </span>
                    )}
                  </div>
                  
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">{booking.hotel?.name}</h2>
                  <div className="flex items-center text-gray-500 mb-6 text-sm">
                    <MapPin className="h-4 w-4 mr-1" />
                    {booking.hotel?.city} · {booking.roomType?.name}
                  </div>

                  <div className="grid grid-cols-2 gap-6 bg-gray-50 rounded-2xl p-4">
                    <div>
                      <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Check-in</p>
                      <p className="font-bold text-gray-900">{new Date(booking.checkIn).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Check-out</p>
                      <p className="font-bold text-gray-900">{new Date(booking.checkOut).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                    </div>
                  </div>
                </div>

                {/* Pricing & Actions */}
                <div className="md:w-64 flex flex-col justify-between border-t md:border-t-0 md:border-l border-gray-100 pt-6 md:pt-0 md:pl-8">
                  <div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Booking Ref</p>
                    <p className="font-mono font-bold text-gray-900 text-sm mb-4">{booking.bookingRef}</p>
                    
                    <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Total Paid</p>
                    <p className="text-2xl font-black text-gray-900">₹{booking.paidAmount?.toLocaleString('en-IN')}</p>
                  </div>

                  <div className="mt-6 space-y-3">
                    <Link to={`/hotel/${booking.hotelId}`} className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white py-3 rounded-xl font-bold text-sm hover:bg-gray-800 transition-colors">
                      View Hotel
                    </Link>
                    {booking.status === 'CONFIRMED' && (
                      <button 
                        onClick={() => setCancelTarget(booking)}
                        className="w-full flex items-center justify-center gap-2 text-red-600 bg-red-50 py-3 rounded-xl font-bold text-sm hover:bg-red-100 transition-colors"
                      >
                        <XCircle size={16} />
                        Cancel Booking
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Cancellation Modal */}
      {cancelTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-scale-in">
            <div className="p-8 text-center">
              <div className="w-20 h-20 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <XCircle size={40} />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Cancel Reservation?</h3>
              <p className="text-gray-500 mb-8">Are you sure you want to cancel your stay at <span className="font-bold text-gray-900">{cancelTarget.hotel?.name}</span>?</p>
              
              <div className="bg-amber-50 rounded-2xl p-5 text-left flex items-start gap-3 mb-8 border border-amber-100">
                <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="text-amber-800 font-bold mb-1">Refund Policy Notice</p>
                  <p className="text-amber-700 leading-relaxed">
                    Refunds are subject to the property's cancellation policy. The amount will be credited back to your original payment method.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setCancelTarget(null)}
                  disabled={cancelling}
                  className="px-6 py-4 border border-gray-200 text-gray-700 rounded-2xl font-bold hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Keep Booking
                </button>
                <button 
                  onClick={() => handleCancelBooking(cancelTarget.id)}
                  disabled={cancelling}
                  className="px-6 py-4 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-200 disabled:opacity-50 flex items-center justify-center"
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
