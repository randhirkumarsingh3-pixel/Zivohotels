import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, RefreshCw, Filter, ChevronLeft, ChevronRight,
  CheckCircle, XCircle, Eye, AlertCircle, Download,
  CalendarDays, CreditCard, Building2, Clock4, UserCheck,
  ChevronDown, X
} from 'lucide-react';

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';
const API_URL = `${BASE_URL}/admin`;
const PAGE_LIMIT = 15;

const getAuthHeaders = () => {
  const token = localStorage.getItem('jwt_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

// ─── Status Badge ─────────────────────────────────────────────────────────────
const STATUS_STYLES = {
  CONFIRMED:  'bg-blue-50   text-blue-700   border-blue-200',
  PENDING:    'bg-yellow-50 text-yellow-700  border-yellow-200',
  COMPLETED:  'bg-green-50  text-green-700   border-green-200',
  CANCELLED:  'bg-red-50    text-red-700     border-red-200',
  NO_SHOW:    'bg-gray-100  text-gray-600    border-gray-300',
};

const PAYMENT_STYLES = {
  PAID:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  PENDING: 'bg-amber-50   text-amber-700   border-amber-200',
  FAILED:  'bg-red-50     text-red-700     border-red-200',
  REFUNDED:'bg-purple-50  text-purple-700  border-purple-200',
};

const StatusBadge = ({ value, map = STATUS_STYLES }) => (
  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${map[value] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
    {value}
  </span>
);

const fmt = (v) => v ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v) : '—';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// ─── Booking Detail Drawer ────────────────────────────────────────────────────
// ─── Cancellation Confirmation Modal ──────────────────────────────────────────
const CancellationModal = ({ booking, onClose, onConfirm, loading }) => {
  if (!booking) return null;
  
  // Logic for previewing refund (FE fallback)
  const hoursLeft = Math.floor((new Date(booking.checkIn) - new Date()) / 3600000);
  const paid = booking.paidAmount || 0;
  let estimatedRefund = 0;
  let policyText = 'Standard Policy';

  if (hoursLeft >= 24) { estimatedRefund = paid; policyText = 'Free Cancellation (>24h)'; }
  else if (hoursLeft >= 6) { estimatedRefund = paid * 0.5; policyText = 'Partial Refund (6-24h)'; }
  else { estimatedRefund = 0; policyText = 'No Refund (<6h)'; }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="p-6 text-center">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle size={32} />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">Cancel Booking?</h3>
          <p className="text-sm text-gray-500 mb-6">This will cancel the reservation for <span className="font-semibold text-gray-900">{booking.guestName}</span>.</p>
          
          <div className="bg-gray-50 rounded-xl p-4 text-left space-y-3 mb-6">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">Amount Paid</span>
              <span className="font-bold text-gray-900">{fmt(paid)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">Policy Applied</span>
              <span className="text-xs font-semibold px-2 py-0.5 bg-brand-50 text-brand-700 rounded-md uppercase">{policyText}</span>
            </div>
            <div className="pt-2 border-t border-gray-200 flex justify-between items-center">
              <span className="font-bold text-gray-900">Final Refund</span>
              <span className="text-lg font-bold text-green-600">{fmt(estimatedRefund)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button onClick={onClose} disabled={loading}
              className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors disabled:opacity-50">
              Go Back
            </button>
            <button onClick={() => onConfirm(booking.id)} disabled={loading}
              className="px-4 py-2.5 bg-red-600 text-white rounded-xl font-semibold text-sm hover:bg-red-700 transition-colors shadow-lg shadow-red-200 disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <RefreshCw size={14} className="animate-spin" /> : 'Confirm Cancel'}
            </button>
          </div>
        </div>
        <div className="bg-amber-50 px-6 py-3 border-t border-amber-100 flex items-start gap-2">
          <AlertCircle size={14} className="text-amber-600 mt-0.5 shrink-0" />
          <p className="text-[10px] text-amber-700 leading-relaxed font-medium">Refund will be processed to the original payment method. Inventory will be restored automatically.</p>
        </div>
      </div>
    </div>
  );
};

// ─── Booking Detail Drawer ────────────────────────────────────────────────────
const BookingDrawer = ({ booking, onClose, onAction, onCancelClick, actionLoading }) => {
  if (!booking) return null;
  const nights = Math.ceil((new Date(booking.checkOut) - new Date(booking.checkIn)) / 86400000);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-0.5">Booking Reference</p>
            <p className="text-xl font-mono font-bold text-gray-900">{booking.bookingRef}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6 flex-1">
          {/* Status row */}
          <div className="flex items-center gap-3 flex-wrap">
            <StatusBadge value={booking.status} />
            <StatusBadge value={booking.paymentStatus} map={PAYMENT_STYLES} />
            <span className="text-xs text-gray-400 font-medium">{booking.paymentType?.replace('_', ' ')}</span>
          </div>

          {/* Property */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Building2 size={14} /><span className="font-semibold text-gray-900">{booking.hotel?.name}</span>
              <span className="text-gray-400">{booking.hotel?.city}</span>
            </div>
            <div className="text-sm text-gray-600">{booking.roomType?.name}
              {booking.ratePlan && <span className="text-gray-400 ml-1">· {booking.ratePlan.name}</span>}
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-brand-50 rounded-xl p-3">
              <p className="text-[10px] text-brand-600 font-bold uppercase tracking-wider mb-1">Check-In</p>
              <p className="font-bold text-gray-900 text-sm">{fmtDate(booking.checkIn)}</p>
            </div>
            <div className="bg-brand-50 rounded-xl p-3">
              <p className="text-[10px] text-brand-600 font-bold uppercase tracking-wider mb-1">Check-Out</p>
              <p className="font-bold text-gray-900 text-sm">{fmtDate(booking.checkOut)}</p>
            </div>
          </div>
          <p className="text-xs text-gray-500">{nights} night{nights !== 1 ? 's' : ''} · {booking.guests} guest{booking.guests !== 1 ? 's' : ''} · {booking.rooms} room{booking.rooms !== 1 ? 's' : ''}</p>

          {/* Guest */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Guest</p>
            <p className="font-semibold text-gray-900">{booking.guestName}</p>
            <p className="text-sm text-gray-500">{booking.guestEmail}</p>
            <p className="text-sm text-gray-500">{booking.guestPhone}</p>
          </div>

          {/* Financials */}
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider">Financials</div>
            <div className="p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Base Amount</span><span className="font-medium">{fmt(booking.baseAmount)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Tax</span><span className="font-medium">{fmt(booking.taxAmount)}</span></div>
              <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-100"><span>Total</span><span>{fmt(booking.totalAmount)}</span></div>
              <div className="flex justify-between text-green-600"><span>Paid</span><span className="font-semibold">{fmt(booking.paidAmount)}</span></div>
              {booking.refundAmount > 0 && (
                <div className="flex justify-between text-purple-600 border-t border-dashed border-gray-100 pt-1 mt-1">
                  <span>Refunded</span>
                  <span className="font-bold">-{fmt(booking.refundAmount)}</span>
                </div>
              )}
              {booking.remainingAmount > 0 && (
                <div className="flex justify-between text-amber-600"><span>Remaining</span><span className="font-semibold">{fmt(booking.remainingAmount)}</span></div>
              )}
            </div>
          </div>

          {/* Timestamps */}
          <div className="text-xs text-gray-400 space-y-1">
            <p>Created: {fmtDate(booking.createdAt)}</p>
            {booking.cancelledAt && <p className="text-red-500 font-medium">Cancelled: {fmtDate(booking.cancelledAt)}</p>}
            {booking.expiresAt && <p className="text-amber-500">Expires: {fmtDate(booking.expiresAt)}</p>}
          </div>
        </div>

        {/* Action Buttons */}
        {!['CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(booking.status) && (
          <div className="p-6 border-t border-gray-100 bg-gray-50 space-y-2 sticky bottom-0">
            {booking.status !== 'CONFIRMED' && (
              <button onClick={() => onAction(booking.id, 'CONFIRMED')} disabled={actionLoading}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-60">
                <CheckCircle size={15} /> Mark Confirmed
              </button>
            )}
            <button onClick={() => onAction(booking.id, 'COMPLETED')} disabled={actionLoading}
              className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-60">
              <UserCheck size={15} /> Mark Completed
            </button>
            <button onClick={() => onAction(booking.id, 'NO_SHOW')} disabled={actionLoading}
              className="w-full flex items-center justify-center gap-2 bg-gray-500 hover:bg-gray-600 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-60">
              <Clock4 size={15} /> Mark No-Show
            </button>
            <button onClick={() => onCancelClick(booking)} disabled={actionLoading}
              className="w-full flex items-center justify-center gap-2 border-2 border-red-300 hover:bg-red-50 text-red-600 text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-60">
              <XCircle size={15} /> Cancel & Process Refund
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main Bookings Page ───────────────────────────────────────────────────────
const Bookings = () => {
  const [bookings,   setBookings]   = useState([]);
  const [meta,       setMeta]       = useState({ total: 0, totalPages: 1, page: 1 });
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [toast,      setToast]      = useState('');

  // Filters
  const [search,         setSearch]         = useState('');
  const [statusFilter,   setStatusFilter]   = useState('');
  const [paymentFilter,  setPaymentFilter]  = useState('');
  const [dateFrom,       setDateFrom]       = useState('');
  const [dateTo,         setDateTo]         = useState('');
  const [page,           setPage]           = useState(1);

  // Properties list for filter dropdown
  const [properties,    setProperties]    = useState([]);
  const [hotelFilter,   setHotelFilter]   = useState('');

  // Drawer state
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [cancellationTarget, setCancellationTarget] = useState(null);
  const [actionLoading,   setActionLoading]   = useState(false);

  const searchTimer = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 4000); };

  // Load properties for filter
  useEffect(() => {
    fetch(`${API_URL}/hotels`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(d => setProperties(d.data || []))
      .catch(() => {});
  }, []);

  const handleSearchChange = (val) => {
    setSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setDebouncedSearch(val); setPage(1); }, 400);
  };

  // ─── Fetch ─────────────────────────────────────────────────────────────────
  const fetchBookings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page, limit: PAGE_LIMIT });
      if (hotelFilter)      params.set('hotelId',       hotelFilter);
      if (statusFilter)     params.set('status',        statusFilter);
      if (paymentFilter)    params.set('paymentStatus', paymentFilter);
      if (dateFrom)         params.set('dateFrom',      dateFrom);
      if (dateTo)           params.set('dateTo',        dateTo);
      if (debouncedSearch)  params.set('search',        debouncedSearch);

      const res  = await fetch(`${API_URL}/bookings?${params}`, { headers: getAuthHeaders() });
      
      if (res.status === 401) {
        localStorage.removeItem('jwt_token');
        localStorage.removeItem('user_data');
        window.location.href = '/login?expired=true';
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load bookings');

      setBookings(data.data || []);
      setMeta(data.meta   || { total: 0, totalPages: 1, page: 1 });
    } catch (err) {
      setError(err.message);
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, [page, hotelFilter, statusFilter, paymentFilter, dateFrom, dateTo, debouncedSearch]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  // ─── Status Action ─────────────────────────────────────────────────────────
  const handleAction = async (id, newStatus) => {
    setActionLoading(true);
    try {
      const res  = await fetch(`${API_URL}/bookings/${id}/status`, {
        method:  'PATCH',
        headers: getAuthHeaders(),
        body:    JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Action failed');

      // Optimistic update
      setBookings(prev => prev.map(b => b.id === id ? { ...b, status: newStatus } : b));
      if (selectedBooking?.id === id) setSelectedBooking(p => ({ ...p, status: newStatus }));
      showToast(`Booking ${newStatus.toLowerCase()} successfully`);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancellation = async (id) => {
    setActionLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/bookings/${id}/cancel`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Cancellation failed');

      // Update state
      setBookings(prev => prev.map(b => b.id === id ? data.data : b));
      if (selectedBooking?.id === id) setSelectedBooking(data.data);
      setCancellationTarget(null);
      showToast('Booking cancelled and refund processed');
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // ─── CSV Export ─────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const headers = ['Ref', 'Guest', 'Email', 'Phone', 'Property', 'Room', 'CheckIn', 'CheckOut', 'Status', 'Payment', 'Total'];
    const rows = bookings.map(b => [
      b.bookingRef, b.guestName, b.guestEmail, b.guestPhone,
      b.hotel?.name, b.roomType?.name,
      fmtDate(b.checkIn), fmtDate(b.checkOut),
      b.status, b.paymentStatus, b.totalAmount,
    ].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const link = document.createElement('a');
    link.href = 'data:text/csv;charset=utf-8,' + encodeURI(csv);
    link.download = `Zivo_Bookings_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const resetFilters = () => {
    setStatusFilter(''); setPaymentFilter(''); setHotelFilter('');
    setDateFrom(''); setDateTo(''); setSearch(''); setDebouncedSearch(''); setPage(1);
  };
  const hasFilters = statusFilter || paymentFilter || hotelFilter || dateFrom || dateTo || debouncedSearch;

  const start = meta.total === 0 ? 0 : (page - 1) * PAGE_LIMIT + 1;
  const end   = Math.min(page * PAGE_LIMIT, meta.total);

  return (
    <div className="space-y-5 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bookings</h1>
          <p className="text-gray-500 mt-0.5 text-sm">
            Manage all reservations across properties.
            {meta.total > 0 && <span className="ml-2 text-brand-600 font-semibold">{meta.total} total</span>}
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={exportCSV}
            className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-1.5 transition-colors shadow-sm">
            <Download size={15} /> Export CSV
          </button>
          <button onClick={fetchBookings} disabled={loading}
            className="border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 px-3 py-2 rounded-lg text-sm flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          {/* Search */}
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input type="text" value={search} onChange={e => handleSearchChange(e.target.value)}
              placeholder="Search ref, guest, email..."
              className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
          </div>

          {/* Property */}
          <select value={hotelFilter} onChange={e => { setHotelFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-brand-500 bg-white">
            <option value="">All Properties</option>
            {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          {/* Status */}
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-brand-500 bg-white">
            <option value="">All Statuses</option>
            {['PENDING','CONFIRMED','COMPLETED','CANCELLED','NO_SHOW'].map(s =>
              <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>

          {/* Payment */}
          <select value={paymentFilter} onChange={e => { setPaymentFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-brand-500 bg-white">
            <option value="">All Payments</option>
            {['PENDING','PAID','FAILED','REFUNDED'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* Date range */}
          <div className="flex items-center gap-2">
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-brand-500 bg-white" />
            <span className="text-gray-400 text-xs">→</span>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-brand-500 bg-white" />
          </div>

          {hasFilters && (
            <button onClick={resetFilters}
              className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 border border-red-200 bg-red-50 px-3 py-2 rounded-lg transition-colors">
              <X size={12} /> Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 text-red-700 border border-red-200 px-4 py-3 rounded-xl text-sm">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{error} — <button onClick={fetchBookings} className="underline font-medium">Retry</button></span>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-72 gap-3">
            <span className="w-9 h-9 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-400">Loading bookings...</p>
          </div>
        ) : bookings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-72 gap-2 text-gray-400">
            <span className="text-4xl">📋</span>
            <p className="text-sm font-medium">
              {hasFilters ? 'No bookings match your filters.' : 'No bookings found.'}
            </p>
            {hasFilters && <button onClick={resetFilters} className="text-xs text-brand-600 underline">Clear filters</button>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Booking Ref', 'Guest', 'Property / Room', 'Dates', 'Amount', 'Status', 'Payment', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bookings.map(b => {
                  const nights = Math.ceil((new Date(b.checkOut) - new Date(b.checkIn)) / 86400000);
                  return (
                    <tr key={b.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button onClick={() => setSelectedBooking(b)}
                          className="font-mono text-brand-600 font-semibold hover:underline text-xs">
                          {b.bookingRef}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900 text-sm">{b.guestName}</div>
                        <div className="text-xs text-gray-400">{b.guestEmail}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800 text-sm">{b.hotel?.name}</div>
                        <div className="text-xs text-gray-400">{b.roomType?.name}
                          {b.ratePlan && <span className="ml-1">· {b.ratePlan.name}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="text-gray-700">{fmtDate(b.checkIn)}</div>
                        <div className="text-gray-400">→ {fmtDate(b.checkOut)}</div>
                        <div className="text-gray-400 mt-0.5">{nights}N · {b.rooms}R · {b.guests}G</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-bold text-gray-900">{fmt(b.totalAmount)}</div>
                        <div className="text-xs text-gray-400">{b.paymentType?.replace('_', ' ')}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap"><StatusBadge value={b.status} /></td>
                      <td className="px-4 py-3 whitespace-nowrap"><StatusBadge value={b.paymentStatus} map={PAYMENT_STYLES} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setSelectedBooking(b)}
                            className="p-1.5 text-gray-400 hover:text-brand-600 rounded-md hover:bg-brand-50 transition-colors" title="View Details">
                            <Eye size={16} />
                          </button>
                          {b.status === 'PENDING' && (
                            <button onClick={() => handleAction(b.id, 'CONFIRMED')}
                              className="p-1.5 text-gray-400 hover:text-blue-600 rounded-md hover:bg-blue-50 transition-colors" title="Confirm">
                              <CheckCircle size={16} />
                            </button>
                          )}
                           {!['CANCELLED','COMPLETED','NO_SHOW'].includes(b.status) && (
                            <button onClick={() => setCancellationTarget(b)}
                              className="p-1.5 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors" title="Cancel & Refund">
                              <XCircle size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && meta.total > 0 && (
          <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between text-sm">
            <span className="text-gray-500">
              Showing <span className="font-semibold text-gray-700">{start}–{end}</span> of{' '}
              <span className="font-semibold text-gray-700">{meta.total}</span> bookings
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-gray-600">
                <ChevronLeft size={14} /> Prev
              </button>
              <span className="px-3 py-1.5 text-gray-600 text-xs">{page} / {meta.totalPages}</span>
              <button onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))} disabled={page >= meta.totalPages}
                className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-gray-600">
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Booking Detail Drawer */}
      <BookingDrawer
        booking={selectedBooking}
        onClose={() => setSelectedBooking(null)}
        onAction={handleAction}
        onCancelClick={(b) => setCancellationTarget(b)}
        actionLoading={actionLoading}
      />

      {/* Cancellation Confirmation Modal */}
      <CancellationModal 
        booking={cancellationTarget}
        onClose={() => setCancellationTarget(null)}
        onConfirm={handleCancellation}
        loading={actionLoading}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-green-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-semibold">
          <CheckCircle size={16} /> {toast}
        </div>
      )}
    </div>
  );
};

export default Bookings;
