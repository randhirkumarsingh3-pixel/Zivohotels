import { useCallback, useEffect, useState } from 'react';
import { Loader2, Download, BellRing, Search } from 'lucide-react';
import { adminFinanceApi, downloadHotelInvoice } from '../../services/api';
import usePageTitle from '../../hooks/usePageTitle';
import useAccess from '../../hooks/useAccess';

/**
 * Admin → Finance → Hotel GST invoices (B2B). For bookings made with a business GSTIN where the
 * property issues the GST invoice (Documents & emails), what each property has uploaded and what
 * is still waiting after check-out. ZivoPlus is the facilitator; the business claims input tax
 * credit against the property's invoice. Properties are reminded daily; admins can nudge now.
 */
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const TABS = [['WAITING', 'Waiting (checked out)'], ['UPCOMING', 'Before check-out'], ['UPLOADED', 'Uploaded'], ['', 'All']];

const FinanceHotelInvoices = () => {
  usePageTitle('Hotel GST invoices');
  const { can } = useAccess();
  const [status, setStatus] = useState('WAITING');
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState('');
  const load = useCallback(() => adminFinanceApi.hotelInvoices({ status, q }).then(setData).catch((e) => setMsg({ ok: false, text: e.message })), [status, q]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  const remind = async (b) => {
    setBusy(b.bookingId); setMsg(null);
    try { await adminFinanceApi.remindHotelInvoice(b.bookingId); setMsg({ ok: true, text: `${b.hotel.name} was reminded about ${b.bookingRef}.` }); } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(''); }
  };
  const download = async (b) => {
    try { const blob = await downloadHotelInvoice(b.bookingId); const u = URL.createObjectURL(blob); window.open(u, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(u), 60000); } catch (e) { setMsg({ ok: false, text: e.message }); }
  };
  return (
    <div className="space-y-5 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Hotel GST invoices (B2B)</h1>
        <p className="text-sm text-gray-600 mt-1">Bookings made with a business GSTIN: the property issues the GST invoice in the business&apos;s name and uploads it in its extranet; ZivoPlus only facilitates. Properties are reminded once a day after check-out (up to 7 times).</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" className="flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1">
          {TABS.map(([k, l]) => (
            <button key={k || 'all'} type="button" role="tab" aria-selected={status === k} onClick={() => setStatus(k)} className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${status === k ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'}`}>
              {l}{data?.counts && k ? ` (${data.counts[{ WAITING: 'waiting', UPCOMING: 'upcoming', UPLOADED: 'uploaded' }[k]]})` : ''}
            </button>
          ))}
        </div>
        <label className="relative flex-1 min-w-[14rem]"><span className="sr-only">Search</span><Search size={15} className="absolute left-3 top-2.5 text-gray-400" aria-hidden="true" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Booking, business or GSTIN" className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm" /></label>
      </div>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm px-3 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}
      {!data ? <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading…</p>
        : data.bookings.length === 0 ? <p className="text-sm text-gray-600 bg-white border border-gray-200 rounded-2xl p-5">Nothing here.</p> : (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase"><tr><th className="text-left px-4 py-2.5">Property</th><th className="text-left px-4 py-2.5">Business</th><th className="text-left px-4 py-2.5">Booking</th><th className="text-right px-4 py-2.5">Value</th><th className="text-left px-4 py-2.5">Hotel invoice</th><th className="px-4 py-2.5" /></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {data.bookings.map((b) => (
                  <tr key={b.bookingId}>
                    <td className="px-4 py-2.5"><span className="font-semibold text-gray-900">{b.hotel.name}</span><span className="block text-xs text-gray-500">{b.hotel.city}</span></td>
                    <td className="px-4 py-2.5">{b.company.name}<span className="block text-xs text-gray-500">{b.company.gstin}</span></td>
                    <td className="px-4 py-2.5">{b.bookingRef}<span className="block text-xs text-gray-500">Check-out {day(b.checkOut)}</span></td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">{inr(b.total)}</td>
                    <td className="px-4 py-2.5">{b.invoice
                      ? <span className="text-green-800 font-semibold">{b.invoice.invoiceNumber}<span className="block text-xs font-normal text-gray-500">{day(b.invoice.invoiceDate)} · {inr(b.invoice.amount)}{Math.abs(b.invoice.amount - b.total) >= 1 ? ' (differs from booking)' : ''}</span></span>
                      : b.due ? <span className="text-red-700 font-semibold">Waiting<span className="block text-xs font-normal text-gray-500">{b.reminders} reminder{b.reminders === 1 ? '' : 's'} sent</span></span>
                        : <span className="text-gray-600">After check-out</span>}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {b.invoice && <button type="button" onClick={() => download(b)} className="inline-flex items-center gap-1 text-sm font-semibold text-navy-800 underline"><Download size={13} /> View</button>}
                      {!b.invoice && b.due && can('finance.manage') && <button type="button" disabled={busy === b.bookingId} onClick={() => remind(b)} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 underline disabled:opacity-50"><BellRing size={13} /> Remind hotel</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
};

export default FinanceHotelInvoices;
