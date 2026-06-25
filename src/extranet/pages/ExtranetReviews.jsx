import { useState, useEffect, useCallback } from 'react';
import { 
  Star, MessageSquare, 
  Reply,
  AlertCircle,
  Smile, Frown, Meh, Loader2
} from 'lucide-react';
import { fetchReviews, replyToReview } from '../../services/extranetApi';
import { useExtranet } from '../context/ExtranetContext';

const ExtranetReviews = () => {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [showReplyFor, setShowReplyFor] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const { addToast } = useExtranet();

  const loadReviews = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchReviews();
      setReviews(data);
    } catch (error) {
      addToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  const handleReply = async (reviewId) => {
    if (!replyText.trim()) return;
    try {
      setActionLoading(true);
      await replyToReview(reviewId, replyText);
      addToast('Reply posted successfully', 'success');
      setReplyText('');
      setShowReplyFor(null);
      loadReviews();
    } catch (error) {
      addToast(error.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const avgRating = reviews.length > 0 
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : '0.0';
  const unreplied = reviews.filter(r => !r.replied).length;

  if (loading && reviews.length === 0) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-brand-600" size={32} /></div>;
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Guest Reviews</h1>
          <p className="text-gray-500 font-medium mt-1">Monitor and respond to guest feedback.</p>
        </div>
        <div className="flex items-center gap-3">
          {unreplied > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-orange-50 text-orange-700 rounded-xl border border-orange-100">
              <AlertCircle size={14} />
              <span className="text-[10px] font-black uppercase tracking-widest">{unreplied} Awaiting Reply</span>
            </div>
          )}
        </div>
      </div>

      {/* Review Score Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="bg-gray-900 rounded-3xl p-8 text-white shadow-xl lg:col-span-1">
          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Overall Rating</p>
          <div className="flex items-end gap-3 mb-4">
            <h2 className="text-5xl font-black">{avgRating}</h2>
            <span className="text-lg text-gray-500 font-bold mb-1">/ 5.0</span>
          </div>
          <div className="flex items-center gap-1 mb-4">
            {[1,2,3,4,5].map(s => (
              <Star key={s} size={18} className={s <= Math.round(Number(avgRating)) ? 'text-amber-400 fill-amber-400' : 'text-gray-700'} />
            ))}
          </div>
          <p className="text-xs text-gray-500 font-medium">{reviews.length} reviews total</p>
        </div>

        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-50 rounded-xl text-green-600"><Smile size={20} /></div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Positive</p>
              <p className="text-2xl font-black text-gray-900">{reviews.filter(r => r.rating >= 4).length}</p>
            </div>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full" style={{ width: `${reviews.length > 0 ? (reviews.filter(r => r.rating >= 4).length / reviews.length) * 100 : 0}%` }} />
          </div>
        </div>

        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-amber-50 rounded-xl text-amber-600"><Meh size={20} /></div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Neutral</p>
              <p className="text-2xl font-black text-gray-900">{reviews.filter(r => r.rating === 3).length}</p>
            </div>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-amber-500 rounded-full" style={{ width: `${reviews.length > 0 ? (reviews.filter(r => r.rating === 3).length / reviews.length) * 100 : 0}%` }} />
          </div>
        </div>

        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-red-50 rounded-xl text-red-600"><Frown size={20} /></div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Negative</p>
              <p className="text-2xl font-black text-gray-900">{reviews.filter(r => r.rating <= 2).length}</p>
            </div>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-red-500 rounded-full" style={{ width: `${reviews.length > 0 ? (reviews.filter(r => r.rating <= 2).length / reviews.length) * 100 : 0}%` }} />
          </div>
        </div>
      </div>

      {/* Review List */}
      <div className="space-y-4">
        {reviews.length === 0 && (
          <div className="text-center py-12 bg-white rounded-[2rem] border border-gray-100">
            <MessageSquare className="mx-auto text-gray-300 mb-4" size={48} />
            <h3 className="text-lg font-black text-gray-900">No Reviews Yet</h3>
            <p className="text-sm text-gray-500">Reviews will appear here once guests start giving feedback.</p>
          </div>
        )}

        {reviews.map(review => (
          <div key={review.id} className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center font-black text-lg border border-brand-100">
                    {review.guestName?.charAt(0) || '?'}
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <h4 className="text-sm font-black text-gray-900">{review.guestName}</h4>
                      {review.replied ? (
                        <span className="px-2 py-0.5 bg-green-50 text-green-600 border border-green-100 rounded-full text-[9px] font-black uppercase tracking-widest">Replied</span>
                      ) : (
                        <span className="px-2 py-0.5 bg-orange-50 text-orange-600 border border-orange-100 rounded-full text-[9px] font-black uppercase tracking-widest animate-pulse">Needs Reply</span>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400 font-medium mt-0.5">
                      {new Date(review.createdAt).toLocaleDateString()} • {review.booking?.roomType?.name || 'Stayed'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {[1,2,3,4,5].map(s => (
                    <Star key={s} size={14} className={s <= review.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200'} />
                  ))}
                </div>
              </div>

              <p className="text-sm text-gray-600 leading-relaxed font-medium">{review.comment}</p>

              {/* Hotel Reply */}
              {review.replied && review.reply && (
                <div className="mt-4 ml-6 pl-4 border-l-2 border-brand-200 bg-brand-50/50 p-4 rounded-r-xl">
                  <p className="text-[10px] font-black text-brand-600 uppercase tracking-widest mb-1">Your Reply</p>
                  <p className="text-sm text-brand-800 font-medium leading-relaxed">{review.reply}</p>
                </div>
              )}

              {/* Reply Input */}
              {showReplyFor === review.id && !review.replied && (
                <div className="mt-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <textarea 
                    rows={3}
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder="Write your response to this guest..."
                    className="w-full bg-white border border-gray-200 rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-brand-500/20 outline-none resize-none"
                  />
                  <div className="flex justify-end gap-3 mt-3">
                    <button onClick={() => setShowReplyFor(null)} className="px-4 py-2 text-xs font-black text-gray-500 hover:text-gray-700">Cancel</button>
                    <button 
                      onClick={() => handleReply(review.id)}
                      disabled={actionLoading || !replyText.trim()}
                      className="px-5 py-2 bg-brand-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-700 transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                      {actionLoading ? <Loader2 size={12} className="animate-spin" /> : <Reply size={14} />}
                      Post Reply
                    </button>
                  </div>
                </div>
              )}

              {!review.replied && showReplyFor !== review.id && (
                <div className="mt-4 flex items-center gap-3">
                  <button 
                    onClick={() => { setShowReplyFor(review.id); setReplyText(''); }}
                    className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-700 transition-all"
                  >
                    <Reply size={14} /> Reply
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ExtranetReviews;
