import { useCallback, useEffect, useState } from 'react';
import { FileText, Loader2, Upload, Download, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { hotelGstInvoicesApi } from '../../services/api';
import { useExtranet } from '../context/ExtranetContext';
import useAccess from '../../hooks/useAccess';

/**
 * Extranet → GST invoices: for bookings made by a business with a GSTIN, the property issues the
 * GST invoice in the business's name and uploads it here; ZivoPlus is only the facilitator. The
 * business downloads it from ZivoPlus and claims input tax credit against it.
 */
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const day = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const input = 'mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-base sm:text-sm';
const today = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const readFile = (file) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error('The file could not be read.')); r.readAsDataURL(file); });

const Row = ({ hotelId, b, edit, addToast, onDone }) => {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ invoiceNumber: b.invoice?.invoiceNumber || '', invoiceDate: b.invoice?.invoiceDate || today(), amount: b.invoice?.amount ?? b.total, taxAmount: b.invoice?.taxAmount ?? b.tax, file: null });
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    if (!f.file) { addToast('Attach the invoice file (PDF, JPG or PNG).', 'error'); return; }
    setBusy(true);
    try {
      await hotelGstInvoicesApi.upload(hotelId, b.bookingId, { invoiceNumber: f.invoiceNumber, invoiceDate: f.invoiceDate, amount: Number(f.amount), taxAmount: f.taxAmount === '' ? null : Number(f.taxAmount), file: await readFile(f.file), fileName: f.file.name });
      addToast(`Uploaded. ${b.company.name} can download it now.`, 'success'); setOpen(false); await onDone();
    } catch (err) { addToast(err.message, 'error'); } finally { setBusy(false); }
  };
  const download = async () => {
    try { const blob = await hotelGstInvoicesApi.file(hotelId, b.bookingId); const u = URL.createObjectURL(blob); window.open(u, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(u), 60000); } catch (err) { addToast(err.message, 'error'); }
  };
  return (
    <li className="p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900">{b.company.name} <span className="text-xs font-normal text-gray-500">GSTIN {b.company.gstin}</span></p>
          <p className="text-sm text-gray-600">{b.bookingRef} · {b.guestName} · {day(b.checkIn)} → {day(b.checkOut)}</p>
          {b.company.address && <p className="text-xs text-gray-500">{b.company.address}</p>}
          <p className="text-sm text-gray-800 mt-1">Booking value {inr(b.total)} incl. GST {inr(b.tax)}</p>
        </div>
        <div className="text-right space-y-1">
          {b.invoice
            ? <span className="inline-flex items-center gap-1 text-xs font-bold text-green-800 bg-green-50 px-2 py-1 rounded"><CheckCircle2 size={13} /> Uploaded: {b.invoice.invoiceNumber}</span>
            : b.due
              ? <span className="inline-flex items-center gap-1 text-xs font-bold text-red-800 bg-red-50 px-2 py-1 rounded"><AlertTriangle size={13} /> Checked out: upload now</span>
              : <span className="inline-flex text-xs font-bold text-gray-700 bg-gray-100 px-2 py-1 rounded">Upload after check-out</span>}
          <div className="flex justify-end gap-3 text-sm">
            {b.invoice && <button type="button" onClick={download} className="font-semibold text-navy-800 underline inline-flex items-center gap-1"><Download size={13} /> View</button>}
            {edit && <button type="button" onClick={() => setOpen((o) => !o)} className="font-semibold text-brand-700 underline">{b.invoice ? 'Replace' : 'Upload invoice'}</button>}
          </div>
        </div>
      </div>
      {open && (
        <form onSubmit={save} className="rounded-xl bg-gray-50 p-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 items-end">
          <label className="text-xs font-semibold text-gray-700">Invoice number<input className={input} value={f.invoiceNumber} maxLength={16} onChange={(e) => setF({ ...f, invoiceNumber: e.target.value })} required /></label>
          <label className="text-xs font-semibold text-gray-700">Invoice date<input type="date" className={input} max={today()} value={f.invoiceDate} onChange={(e) => setF({ ...f, invoiceDate: e.target.value })} required /></label>
          <label className="text-xs font-semibold text-gray-700">Total incl. GST (₹)<input type="number" step="0.01" min="1" className={input} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required /></label>
          <label className="text-xs font-semibold text-gray-700">GST in it (₹)<input type="number" step="0.01" min="0" className={input} value={f.taxAmount} onChange={(e) => setF({ ...f, taxAmount: e.target.value })} /></label>
          <label className="text-xs font-semibold text-gray-700">File (PDF, JPG, PNG; up to 10 MB)<input type="file" accept="application/pdf,image/jpeg,image/png" className="mt-1 block w-full text-sm" onChange={(e) => setF({ ...f, file: e.target.files?.[0] || null })} /></label>
          <div className="sm:col-span-2 lg:col-span-5 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold disabled:opacity-50">{busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} {b.invoice ? 'Replace invoice' : 'Upload invoice'}</button>
            <span className="text-xs text-gray-600">In the name of {b.company.name}, GSTIN {b.company.gstin}.</span>
          </div>
        </form>
      )}
    </li>
  );
};

const ExtranetGstInvoices = () => {
  const { hotelId, addToast } = useExtranet();
  const { access, canAtHotel } = useAccess();
  const edit = !access || canAtHotel(hotelId, 'bookings.manage');
  const [status, setStatus] = useState('PENDING');
  const [data, setData] = useState(null);
  const load = useCallback(() => hotelGstInvoicesApi.list(hotelId, status).then(setData).catch((e) => addToast(e.message, 'error')), [hotelId, status, addToast]);
  useEffect(() => { if (hotelId) { setData(null); load(); } }, [hotelId, load]);
  useEffect(() => { document.title = 'GST invoices · ZivoPlus Extranet'; }, []);
  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><FileText size={22} className="text-brand-700" aria-hidden="true" /> GST invoices for business bookings</h1>
        <p className="text-sm text-gray-600 mt-1">When a business books with its GSTIN, you issue the GST invoice for the stay in its name and upload it here after check-out. ZivoPlus acts only as a facilitator: the business claims input tax credit against your invoice.</p>
      </div>
      {data && data.waiting > 0 && <p role="alert" className="text-sm px-3 py-2 rounded-lg bg-red-50 text-red-800">{data.waiting} checked-out booking{data.waiting > 1 ? 's are' : ' is'} waiting for your invoice.</p>}
      <div role="tablist" className="flex gap-1 rounded-xl bg-gray-100 p-1 w-fit">
        {[['PENDING', 'To upload'], ['UPLOADED', 'Uploaded'], ['', 'All']].map(([k, l]) => (
          <button key={k || 'all'} type="button" role="tab" aria-selected={status === k} onClick={() => setStatus(k)} className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${status === k ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'}`}>{l}</button>
        ))}
      </div>
      {!data ? <div className="flex h-40 items-center justify-center"><Loader2 className="animate-spin text-brand-700" size={28} /></div>
        : data.bookings.length === 0 ? <p className="text-sm text-gray-600 bg-white border border-gray-200 rounded-2xl p-5">{status === 'PENDING' ? 'Nothing to upload.' : 'No business bookings yet.'}</p>
          : <ul className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">{data.bookings.map((b) => <Row key={b.bookingId} hotelId={hotelId} b={b} edit={edit} addToast={addToast} onDone={load} />)}</ul>}
    </div>
  );
};

export default ExtranetGstInvoices;
