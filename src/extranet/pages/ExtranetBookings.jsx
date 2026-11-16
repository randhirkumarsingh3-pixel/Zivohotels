import { useState, useEffect, useCallback, useMemo } from 'react';
import { roomsText, bookingRoomsOf, roomGuests } from '../../utils/bookingRooms';
import {
  ClipboardList, Search, Download, CheckCircle2, Clock, XCircle, AlertCircle, Phone, Mail, Users,
  ChevronDown, BedDouble, Loader2, LogIn, LogOut, UserX,
} from 'lucide-react';
import { fetchBookings, transitionBookingStatus } from '../../services/extranetApi';
import { useExtranet } from '../context/ExtranetContext';
import { saveVoucher } from '../../utils/voucher';

/**
 * Extranet -> Bookings. Tabs with counts (Arriving today, Upcoming, In house, Checked out,
 * Cancelled, No-show), search by guest, booking ID, phone or email, CSV export of what's shown,
 * and the actions a front desk needs: check in and no-show from the check-in date, check out,
 * hotelier voucher, and cancel (after a confirmation that says the guest is refunded in full).
 * The server enforces the same rules; the buttons only appear when the action is allowed.
 */
const STATUS = {
  PENDING: { label: 'Awaiting payment', cls: 'bg-yellow-50 text-yellow-800 border-yellow-200', icon: Clock },
  CONFIRMED: { label: 'Confirmed', cls: 'bg-navy-50 text-navy-800 border-navy-100', icon: CheckCircle2 },
  CHECKED_IN: { label: 'Checked in', cls: 'bg-green-50 text-green-800 border-green-200', icon: CheckCircle2 },
  COMPLETED: { label: 'Checked out', cls: 'bg-gray-100 text-gray-700 border-gray-200', icon: Clock },
  CANCELLED: { label: 'Cancelled', cls: 'bg-red-50 text-red-700 border-red-200', icon: XCircle },
  NO_SHOW: { label: 'No-show', cls: 'bg-orange-50 text-orange-800 border-orange-200', icon: AlertCircle },
};
const PAY = { PREPAID: 'Paid online', PARTIAL: 'Part paid', PAY_AT_HOTEL: 'Pay at hotel' };

const istDay = (d) => new Date(new Date(d).getTime() + 330 * 60000).toISOString().slice(0, 10);
const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const nightsOf = (b) => Math.max(1, Math.round((new Date(b.checkOut) - new Date(b.checkIn)) / 86400000));

const TABS = [
  ['ALL', 'All', () => true],
  ['TODAY', 'Arriving today', (b, t) => istDay(b.checkIn) === t && ['CONFIRMED', 'CHECKED_IN', 'PENDING'].includes(b.status)],
  ['UPCOMING', 'Upcoming', (b, t) => istDay(b.checkIn) > t && ['CONFIRMED', 'PENDING'].includes(b.status)],
  ['CHECKED_IN', 'In house', (b) => b.status === 'CHECKED_IN'],
  ['COMPLETED', 'Checked out', (b) => b.status === 'COMPLETED'],
  ['CANCELLED', 'Cancelled', (b) => b.status === 'CANCELLED'],
  ['NO_SHOW', 'No-show', (b) => b.status === 'NO_SHOW'],
];

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const exportCsv = (rows, name) => {
  const head = ['Booking ID', 'Status', 'Guest', 'Phone', 'Email', 'Room', 'Rooms', 'Guests', 'Check-in', 'Check-out', 'Nights', 'Payment', 'Total (₹)', 'Paid online (₹)', 'Due at hotel (₹)', 'Booked on'];
  const lines = rows.map((b) => [b.bookingRef, STATUS[b.status]?.label || b.status, b.guestName, b.guestPhone, b.guestEmail, roomsText(b), b.rooms, b.guests, istDay(b.checkIn), istDay(b.checkOut), nightsOf(b), PAY[b.paymentType] || b.paymentType, Number(b.totalAmount || 0), Number(b.paidAmount || 0), Math.max(0, Number(b.totalAmount || 0) - Number(b.paidAmount || 0)), istDay(b.createdAt)].map(csvCell).join(','));
  const blob = new Blob([String.fromCharCode(0xfeff) + [head.map(csvCell).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' }); // BOM: Excel reads ₹ correctly
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

const ExtranetBookings = () => {
  const { addToast, property } = useExtranet();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [tab, setTab] = useState('ALL');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(null);
  const [confirmNoShow, setConfirmNoShow] = useState(null);
  const today = istDay(new Date());

  const load = useCallback(async (silent = false) => {
    try { if (!silent) setLoading(true); setBookings(await fetchBookings()); }
    catch (e) { addToast(e.message, 'error'); }
    finally { if (!silent) setLoading(false); }
  }, [addToast]);

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 30000); // new bookings appear without a reload
    return () => clearInterval(t);
  }, [load]);

  const act = async (b, status, done) => {
    setBusy(b.id);
    try {
      await transitionBookingStatus(b.id, status);
      addToast(done, 'success');
      setConfirmCancel(null); setConfirmNoShow(null);
      await load(true);
    } catch (e) { addToast(e.message, 'error'); }
    finally { setBusy(null); }
  };

  const counts = useMemo(() => Object.fromEntries(TABS.map(([k, , fn]) => [k, bookings.filter((b) => fn(b, today)).length])), [bookings, today]);
  const shown = useMemo(() => {
    const fn = TABS.find(([k]) => k === tab)[2];
    const needle = q.trim().toLowerCase();
    return bookings.filter((b) => fn(b, today)).filter((b) => !needle || [b.bookingRef, b.guestName, b.guestPhone, b.guestEmail].some((v) => String(v || '').toLowerCase().includes(needle)));
  }, [bookings, tab, q, today]);

  if (loading && !bookings.length) return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-navy-700" size={32} /></div>;

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Bookings</h1>
          <p className="text-gray-600 mt-1">Reservations for {property?.name || 'your property'}. New bookings appear automatically.</p>
        </div>
        <button type="button" onClick={() => exportCsv(shown, `bookings-${(property?.name || 'property').replace(/\W+/g, '-').toLowerCase()}-${today}.csv`)} disabled={!shown.length}
          className="self-start flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50">
          <Download size={16} aria-hidden="true" /> Export {shown.length} to CSV
        </button>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="Booking status">
          {TABS.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`shrink-0 px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${tab === k ? 'bg-navy-800 text-white border-navy-800' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'}`}>
              {label} <span className={`ml-1 tabular-nums ${tab === k ? 'text-navy-100' : 'text-gray-500'}`}>{counts[k]}</span>
            </button>
          ))}
        </div>
        <div className="relative lg:ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} aria-hidden="true" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search bookings" placeholder="Guest, booking ID, phone or email"
            className="w-full lg:w-72 bg-white border border-gray-300 rounded-lg py-2.5 pl-9 pr-3 text-sm focus:border-navy-500 focus:ring-2 focus:ring-navy-500/20 outline-none" />
        </div>
      </div>

      <div className="space-y-3">
        {shown.length === 0 && (
          <div className="text-center py-12 bg-white rounded-card border border-gray-200">
            <ClipboardList className="mx-auto text-gray-300 mb-3" size={40} aria-hidden="true" />
            <h2 className="font-bold text-gray-900">No bookings here</h2>
            <p className="text-sm text-gray-600">{q ? 'Nothing matches your search.' : 'Bookings in this view will appear here.'}</p>
          </div>
        )}

        {shown.map((b) => {
          const st = STATUS[b.status] || STATUS.PENDING;
          const isOpen = open === b.id;
          const started = istDay(b.checkIn) <= today;
          const due = Math.max(0, Number(b.totalAmount || 0) - Number(b.paidAmount || 0));
          const nights = nightsOf(b);
          const working = busy === b.id;
          return (
            <article key={b.id} className="bg-white rounded-card border border-gray-200 overflow-hidden">
              <button type="button" onClick={() => setOpen(isOpen ? null : b.id)} aria-expanded={isOpen}
                className="w-full p-4 sm:p-5 flex items-center justify-between gap-4 text-left hover:bg-gray-50">
                <div className="flex items-center gap-4 min-w-0">
                  <span className="w-10 h-10 rounded-full bg-navy-50 text-navy-800 flex items-center justify-center font-bold shrink-0" aria-hidden="true">{b.guestName?.charAt(0)?.toUpperCase() || '?'}</span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-900">{b.guestName}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${st.cls}`}>{st.label}</span>
                      {b.metadata?.membership?.isPaid && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-xs font-semibold">{b.metadata.membership.plan}{b.metadata.membership.prioritySupport ? ' · priority' : ''}</span>}
                    </p>
                    <p className="text-sm text-gray-600 mt-0.5">
                      <span className="font-mono text-gray-800">{b.bookingRef}</span> · {roomsText(b)} · {fmtDate(b.checkIn)} → {fmtDate(b.checkOut)} ({nights} night{nights === 1 ? '' : 's'})
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="font-bold text-gray-900 tabular-nums">{inr(b.totalAmount)}</p>
                    <p className={`text-xs font-semibold ${due > 0 && !['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(b.status) ? 'text-orange-800' : 'text-green-800'}`}>
                      {['CANCELLED', 'NO_SHOW'].includes(b.status) ? PAY[b.paymentType] : due > 0 ? (b.status === 'COMPLETED' ? `${inr(due)} collected at hotel` : `${inr(due)} due at hotel`) : 'Paid online'}
                    </p>
                  </div>
                  {working ? <Loader2 size={18} className="animate-spin text-navy-700" aria-hidden="true" /> : <ChevronDown size={18} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />}
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-gray-100 p-4 sm:p-5 bg-gray-50 space-y-4">
                  <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div><dt className="flex items-center gap-1.5 text-gray-500"><Phone size={14} aria-hidden="true" /> Phone</dt><dd className="font-semibold text-gray-900">{b.guestPhone ? <a href={`tel:${b.guestPhone}`} className="hover:underline">{b.guestPhone}</a> : 'Not given'}</dd></div>
                    <div><dt className="flex items-center gap-1.5 text-gray-500"><Mail size={14} aria-hidden="true" /> Email</dt><dd className="font-semibold text-gray-900 break-all">{b.guestEmail || 'Not given'}</dd></div>
                    <div><dt className="flex items-center gap-1.5 text-gray-500"><Users size={14} aria-hidden="true" /> Guests</dt><dd className="font-semibold text-gray-900">{b.guests || b.adults || '—'}</dd></div>
                    <div><dt className="flex items-center gap-1.5 text-gray-500"><BedDouble size={14} aria-hidden="true" /> Payment</dt><dd className="font-semibold text-gray-900">{PAY[b.paymentType] || '—'} · {inr(b.paidAmount)} paid</dd></div>
                  </dl>
                  {/* Each room: type, plan, guests and the lead guest it is checked in under */}
                  {bookingRoomsOf(b).length > 0 && (
                    <div className="text-sm">
                      <p className="font-semibold text-gray-900 mb-1">Rooms</p>
                      <ul className="space-y-1">
                        {bookingRoomsOf(b).map((r) => (
                          <li key={r.roomNumber} className="text-gray-700"><span className="font-semibold">Room {r.roomNumber}:</span> {r.roomType?.name} · {r.ratePlan?.name} · {roomGuests(r)} · Lead guest <span className="font-semibold text-gray-900">{r.guestName}</span></li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {confirmCancel === b.id ? (
                    <div role="alertdialog" aria-label="Cancel this booking?" className="rounded-lg border border-red-200 bg-red-50 p-4">
                      <p className="font-semibold text-red-900">Cancel {b.bookingRef} for {b.guestName}?</p>
                      <p className="text-sm text-red-900 mt-1">{Number(b.paidAmount) > 0 ? `The guest gets a full refund of ${inr(b.paidAmount)}.` : 'Nothing was paid online, so there is no refund.'} The guest is told by email. This can&apos;t be undone.</p>
                      <div className="mt-3 flex gap-2">
                        <button type="button" disabled={working} onClick={() => act(b, 'CANCELLED', `${b.bookingRef} cancelled`)} className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white text-sm font-semibold disabled:opacity-50">Yes, cancel booking</button>
                        <button type="button" onClick={() => setConfirmCancel(null)} className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-800">Keep booking</button>
                      </div>
                    </div>
                  ) : confirmNoShow === b.id ? (
                    <div role="alertdialog" aria-label="Mark as no-show?" className="rounded-lg border border-orange-200 bg-orange-50 p-4">
                      <p className="font-semibold text-orange-900">Mark {b.guestName} as a no-show?</p>
                      <p className="text-sm text-orange-900 mt-1">Use this only if the guest didn&apos;t arrive. Amounts paid online are not refunded. This can&apos;t be undone.</p>
                      <div className="mt-3 flex gap-2">
                        <button type="button" disabled={working} onClick={() => act(b, 'NO_SHOW', `${b.bookingRef} marked as no-show`)} className="px-4 py-2 rounded-lg bg-orange-700 hover:bg-orange-800 text-white text-sm font-semibold disabled:opacity-50">Yes, mark no-show</button>
                        <button type="button" onClick={() => setConfirmNoShow(null)} className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-800">Back</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      {b.status === 'CONFIRMED' && (started
                        ? <button type="button" disabled={working} onClick={() => act(b, 'CHECKED_IN', `${b.guestName} checked in`)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-700 hover:bg-green-800 text-white text-sm font-semibold disabled:opacity-50"><LogIn size={16} aria-hidden="true" /> Check in</button>
                        : <span className="text-sm text-gray-600">Check-in opens on {fmtDate(b.checkIn)}.</span>)}
                      {b.status === 'CHECKED_IN' && <button type="button" disabled={working} onClick={() => act(b, 'COMPLETED', `${b.guestName} checked out`)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-navy-800 hover:bg-navy-900 text-white text-sm font-semibold disabled:opacity-50"><LogOut size={16} aria-hidden="true" /> Check out</button>}
                      <button type="button" onClick={async () => { try { await saveVoucher(b.id, b.bookingRef, 'hotelier'); } catch (e) { addToast(e.message || 'Could not download the voucher.', 'error'); } }}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-800 hover:bg-gray-50"><Download size={16} aria-hidden="true" /> Hotelier voucher</button>
                      <span className="flex-1" />
                      {b.status === 'CONFIRMED' && started && <button type="button" onClick={() => setConfirmNoShow(b.id)} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-orange-300 bg-white text-sm font-semibold text-orange-800 hover:bg-orange-50"><UserX size={16} aria-hidden="true" /> No-show</button>}
                      {['PENDING', 'CONFIRMED'].includes(b.status) && <button type="button" onClick={() => setConfirmCancel(b.id)} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-300 bg-white text-sm font-semibold text-red-700 hover:bg-red-50"><XCircle size={16} aria-hidden="true" /> Cancel booking</button>}
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
};

export default ExtranetBookings;
