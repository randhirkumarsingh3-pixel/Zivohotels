import { useState, useEffect, useCallback } from 'react';
import { Star, MessageSquare, Reply, Flag, Loader2, Trash2, Pencil, BadgeCheck, ShieldAlert, X } from 'lucide-react';
import { fetchReviews, replyToReview, deleteReviewReply, reportReview } from '../../services/extranetApi';
import { getImageUrl } from '../../utils/image';
import { useExtranet } from '../context/ExtranetContext';

/**
 * Extranet -> Guest Reviews for the active property: review score and breakdown, published
 * reviews, public replies (the guest is emailed), and reporting a review to Zivo.
 * (The old page's replies were not saved anywhere.)
 */
const ASPECT_LABEL = { cleanliness: 'Cleanliness', staff: 'Staff & service', comfort: 'Room comfort', location: 'Location', value: 'Value for money' };
const TRIP_LABEL = { BUSINESS: 'Business', COUPLE: 'Couple', FAMILY: 'Family', FRIENDS: 'Friends', SOLO: 'Solo' };
const REPORT_REASONS = ['Not about this property', 'Abusive or offensive', 'Contains false information', 'Guest did not stay', 'Personal information', 'Competitor or conflict of interest', 'Other'];
const FILTERS = [['all', 'All'], ['unreplied', 'Awaiting reply'], ['negative', 'Below 3★'], ['replied', 'Replied'], ['reported', 'Reported']];

const Stars = ({ value }) => (
  <span className="inline-flex gap-0.5">{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={14} className={n <= Math.round(value) ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'} />)}</span>
);

const ExtranetReviews = () => {
  const { addToast, hotelId, property } = useExtranet();
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [replyFor, setReplyFor] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [reportFor, setReportFor] = useState(null);
  const [report, setReport] = useState({ reason: REPORT_REASONS[0], details: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchReviews({ filter, limit: 50 }));
    } catch (e) {
      addToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [filter, addToast]);

  useEffect(() => { if (hotelId) load(); }, [load, hotelId]);

  const sendReply = async (id) => {
    if (replyText.trim().length < 2) return addToast('Write a reply first', 'warning');
    setBusy(true);
    try {
      await replyToReview(id, replyText.trim());
      addToast('Reply published. The guest has been emailed.', 'success');
      setReplyFor(null);
      setReplyText('');
      load();
    } catch (e) { addToast(e.message, 'error'); } finally { setBusy(false); }
  };
  const removeReply = async (id) => {
    if (!confirm('Delete your reply? Guests will no longer see it.')) return;
    try { await deleteReviewReply(id); addToast('Reply deleted', 'success'); load(); } catch (e) { addToast(e.message, 'error'); }
  };
  const sendReport = async () => {
    setBusy(true);
    try {
      await reportReview(reportFor.id, report.reason, report.details);
      addToast('Reported to Zivo. The review stays visible until our team decides.', 'success');
      setReportFor(null);
      setReport({ reason: REPORT_REASONS[0], details: '' });
      load();
    } catch (e) { addToast(e.message, 'error'); } finally { setBusy(false); }
  };

  if (loading && !data) return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-brand-700" size={32} /></div>;
  const s = data?.summary || { count: 0, distribution: {}, aspects: {} };

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Guest Reviews</h1>
        <p className="text-gray-500 font-medium mt-1">Verified reviews of {property?.name || 'your property'}. Reply to show future guests you listen.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Review score</p>
          <p className="text-3xl font-black text-gray-900 mt-1">{s.score ?? '—'}<span className="text-base text-gray-400 font-bold">/5</span></p>
          <p className="text-xs text-gray-500">{s.count} published review{s.count === 1 ? '' : 's'}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Awaiting your reply</p>
          <p className={`text-3xl font-black mt-1 ${data?.unreplied ? 'text-orange-700' : 'text-gray-900'}`}>{data?.unreplied ?? 0}</p>
          <p className="text-xs text-gray-500">Reply rate {s.replyRate || 0}%</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm md:col-span-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">What guests rate</p>
          {Object.keys(s.aspects || {}).length === 0 ? <p className="text-sm text-gray-400">No aspect ratings yet.</p> : (
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
              {Object.entries(s.aspects).map(([k, v]) => (
                <div key={k} className="text-xs">
                  <div className="flex justify-between"><span className="text-gray-600">{ASPECT_LABEL[k] || k}</span><span className={`font-bold ${v < 3 ? 'text-red-600' : 'text-gray-900'}`}>{v}</span></div>
                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mt-0.5"><div className={`h-full ${v < 3 ? 'bg-red-400' : 'bg-green-500'}`} style={{ width: `${(v / 5) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {data?.inModeration > 0 && (
        <p className="text-sm text-gray-500 flex items-center gap-2"><ShieldAlert size={15} className="text-amber-500" /> {data.inModeration} new review{data.inModeration === 1 ? ' is' : 's are'} being checked by Zivo and will appear here once published.</p>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2" role="tablist">
        {FILTERS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={filter === id} onClick={() => setFilter(id)}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold ${filter === id ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{label}</button>
        ))}
      </div>

      {/* Reviews */}
      {(data?.reviews || []).length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center">
          <MessageSquare className="mx-auto text-gray-300 mb-2" size={32} />
          <p className="font-semibold text-gray-700">{filter === 'all' ? 'No reviews yet' : 'Nothing here'}</p>
          <p className="text-sm text-gray-500">Guests can review their stay from the day after check-in.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.reviews.map((r) => (
            <div key={r.id} className={`bg-white border rounded-xl p-5 shadow-sm ${r.rating < 3 ? 'border-red-200' : 'border-gray-200'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2"><Stars value={r.rating} /><span className="font-bold text-gray-900">{r.rating}/5</span></div>
                  <p className="text-xs text-gray-500 mt-1">
                    <span className="font-semibold text-gray-700">{r.guest}</span> <BadgeCheck size={12} className="inline text-green-700" /> · {r.bookingRef} · {[r.roomType, r.tripType && TRIP_LABEL[r.tripType]].filter(Boolean).join(' · ')} · {new Date(r.publishedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {r.report && <span className={`px-2 py-0.5 rounded text-xs font-bold ${r.report.resolved ? 'bg-gray-100 text-gray-500' : 'bg-amber-100 text-amber-800'}`}>{r.report.resolved ? 'Report reviewed' : 'Reported to Zivo'}</span>}
                  {!r.report || r.report.resolved ? (
                    <button type="button" onClick={() => setReportFor(r)} className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-red-600"><Flag size={13} /> Report</button>
                  ) : null}
                </div>
              </div>
              {r.title && <h3 className="font-bold text-gray-900 mt-3">{r.title}</h3>}
              {r.comment && <p className="text-sm text-gray-700 mt-1 whitespace-pre-line">{r.comment}</p>}
              {Object.keys(r.aspectRatings || {}).length > 0 && (
                <p className="text-xs text-gray-500 mt-2">{Object.entries(r.aspectRatings).map(([k, v]) => `${ASPECT_LABEL[k] || k} ${v}`).join(' · ')}</p>
              )}
              {r.tags?.length > 0 && <div className="flex flex-wrap gap-1.5 mt-2">{r.tags.map((t) => <span key={t} className="px-2 py-0.5 rounded-full bg-gray-100 text-xs text-gray-600">{t}</span>)}</div>}
              {r.photos?.length > 0 && <div className="flex gap-2 mt-3">{r.photos.map((p) => <img key={p.url} src={getImageUrl(p.url)} alt="" className="w-16 h-16 rounded-lg object-cover border border-gray-100" />)}</div>}

              {r.reply && replyFor !== r.id && (
                <div className="mt-4 bg-gray-50 border border-gray-100 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-gray-700">Your reply · {new Date(r.reply.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                    <div className="flex gap-1">
                      <button type="button" aria-label="Edit reply" onClick={() => { setReplyFor(r.id); setReplyText(r.reply.text); }} className="p-1 text-gray-400 hover:text-brand-700"><Pencil size={14} /></button>
                      <button type="button" aria-label="Delete reply" onClick={() => removeReply(r.id)} className="p-1 text-gray-400 hover:text-red-600"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <p className="text-sm text-gray-700 mt-1 whitespace-pre-line">{r.reply.text}</p>
                </div>
              )}
              {replyFor === r.id ? (
                <div className="mt-4 space-y-2">
                  <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={4} maxLength={2000} aria-label="Your reply"
                    placeholder={`Thank ${r.guest.split(' ')[0]} for staying with you${r.rating < 3 ? ', apologise for what went wrong and say what you have changed' : ''}…`}
                    className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-brand-500 outline-none" />
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-400">Public: shown under the review on your hotel page. No phone numbers, emails or links.</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setReplyFor(null); setReplyText(''); }} className="px-3 py-1.5 text-sm font-semibold text-gray-600">Cancel</button>
                      <button type="button" disabled={busy} onClick={() => sendReply(r.id)} className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-bold disabled:opacity-50">{r.reply ? 'Save reply' : 'Publish reply'}</button>
                    </div>
                  </div>
                </div>
              ) : !r.reply && (
                <button type="button" onClick={() => { setReplyFor(r.id); setReplyText(''); }} className="mt-4 flex items-center gap-1.5 text-sm font-bold text-brand-700 hover:text-brand-700"><Reply size={15} /> Reply</button>
              )}
            </div>
          ))}
        </div>
      )}

      {reportFor && (
        <div className="fixed inset-0 z-[200] bg-black/30 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Report review">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Report this review to Zivo</h3>
                <p className="text-xs text-gray-500">It stays visible until our team decides. We remove reviews that break our guidelines, not ones that are simply negative.</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setReportFor(null)} className="text-gray-400"><X size={18} /></button>
            </div>
            <label className="block text-xs font-semibold text-gray-600">Reason
              <select value={report.reason} onChange={(e) => setReport({ ...report, reason: e.target.value })} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                {REPORT_REASONS.map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>
            <label className="block text-xs font-semibold text-gray-600">Details for our team
              <textarea value={report.details} onChange={(e) => setReport({ ...report, details: e.target.value })} rows={3} maxLength={1000} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="e.g. This guest's booking was cancelled; they never stayed" />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setReportFor(null)} className="px-4 py-2 border rounded-lg text-sm font-semibold">Cancel</button>
              <button type="button" disabled={busy} onClick={sendReport} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold disabled:opacity-50">Send report</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExtranetReviews;
