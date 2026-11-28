import { useEffect, useState } from 'react';
import { QrCode, Download, Loader2 } from 'lucide-react';
import { extranetGet, financeHubApi } from '../../services/extranetApi';

/**
 * Extranet → Reviews: the property's feedback QR code. Print it for the front desk and rooms; guests
 * who booked on ZivoPlus scan it, sign in and rate their stay (from check-in day). Anyone without a
 * booking here gets no form.
 */
const save = (blob, name) => { const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 30000); };

const FeedbackQrCard = ({ hotelId, propertyName, addToast }) => {
  const [stats, setStats] = useState(null);
  const [busy, setBusy] = useState('');
  useEffect(() => { if (hotelId) extranetGet('/reviews/qr-stats').then(setStats).catch(() => {}); }, [hotelId]);
  const slug = String(propertyName || 'hotel').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const get = async (kind) => {
    setBusy(kind);
    try { save(await (kind === 'png' ? financeHubApi.feedbackQrPng() : financeHubApi.feedbackQrPdf()), `feedback-qr-${slug}.${kind}`); } catch (e) { addToast?.(e.message || 'Download failed', 'error'); } finally { setBusy(''); }
  };
  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center gap-4" aria-labelledby="fqr-h">
      <div className="w-12 h-12 rounded-xl bg-navy-50 text-navy-800 flex items-center justify-center shrink-0"><QrCode size={26} aria-hidden="true" /></div>
      <div className="flex-1 min-w-0">
        <h2 id="fqr-h" className="font-bold text-gray-900">Feedback QR code</h2>
        <p className="text-sm text-gray-600">Put it at the front desk and in rooms. Guests who booked on ZivoPlus scan it, sign in and rate their stay, even before check-out. Others can&apos;t leave a review.</p>
        {stats && <p className="text-xs text-gray-500 mt-1">{stats.scans30d} scan{stats.scans30d === 1 ? '' : 's'} in the last 30 days · {stats.reviews} review{stats.reviews === 1 ? '' : 's'} from the code{stats.url ? ` · ${stats.url.replace(/^https?:\/\//, '')}` : ''}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => get('pdf')} disabled={Boolean(busy)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-navy-800 text-white text-sm font-semibold disabled:opacity-60">{busy === 'pdf' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Printable card (PDF)</button>
        <button type="button" onClick={() => get('png')} disabled={Boolean(busy)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-semibold disabled:opacity-60">{busy === 'png' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} QR image (PNG)</button>
      </div>
    </section>
  );
};

export default FeedbackQrCard;
