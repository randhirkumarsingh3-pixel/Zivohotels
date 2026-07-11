import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, CheckCircle, XCircle, AlertCircle, Eye, Power, FileSignature, Clock, FileText } from 'lucide-react';
import ReviewDocuments from '../components/ReviewDocuments';

const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

const getAuthHeaders = () => {
  const token = localStorage.getItem('jwt_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export default function PropertyReview() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/properties/queue`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load queue');
      setQueue(data.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const handleAction = async (id, actionStr, payload = {}) => {
    setActionLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/properties/${id}/${actionStr}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      
      setSelectedProperty(null);
      setRejectReason('');
      fetchQueue();
    } catch (err) {
      alert(`Action failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const StatusBadge = ({ status }) => {
    const colors = {
      DRAFT: 'bg-gray-100 text-gray-800',
      SUBMITTED: 'bg-blue-100 text-blue-800',
      IN_REVIEW: 'bg-yellow-100 text-yellow-800',
      PENDING_AGREEMENT: 'bg-orange-100 text-orange-800',
      READY_FOR_GO_LIVE: 'bg-purple-100 text-purple-800',
      LIVE: 'bg-green-100 text-green-800',
      PAUSED: 'bg-gray-100 text-gray-800',
      INFORMATION_REQUESTED: 'bg-red-100 text-red-800'
    };
    return (
      <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
        {status === 'DRAFT' ? 'DRAFT' : status.replace(/_/g, ' ')}
      </span>
    );
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Property Review & Lifecycle Console</h1>
          <p className="text-gray-500 mt-1">Manage property approvals, agreements, and live status.</p>
        </div>
        <button
          onClick={fetchQueue}
          disabled={loading}
          className="flex items-center gap-2 text-sm text-gray-600 border border-gray-300 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* SLA KPI Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center gap-3 text-gray-500 mb-1">
            <FileText size={18} />
            <h3 className="text-sm font-medium">Total Properties</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900">{queue.length}</p>
          <p className="text-xs text-gray-400 mt-1">{queue.filter(q => q.status === 'DRAFT').length} drafts • {queue.filter(q => ['SUBMITTED', 'IN_REVIEW', 'INFORMATION_REQUESTED'].includes(q.status)).length} in review</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center gap-3 text-gray-500 mb-1">
            <Clock size={18} />
            <h3 className="text-sm font-medium">Pending Agreements</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900">{queue.filter(q => q.status === 'PENDING_AGREEMENT').length}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center gap-3 text-gray-500 mb-1">
            <CheckCircle size={18} />
            <h3 className="text-sm font-medium">Ready for Go Live</h3>
          </div>
          <p className="text-2xl font-bold text-green-600">{queue.filter(q => q.status === 'READY_FOR_GO_LIVE').length}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-semibold tracking-wide">
              <tr>
                <th className="px-6 py-4">Property</th>
                <th className="px-6 py-4">City</th>
                <th className="px-6 py-4">Owner</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={5} className="text-center py-12">Loading...</td></tr>
              ) : queue.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-gray-500">No properties found.</td></tr>
              ) : (
                queue.map((hotel) => (
                  <tr key={hotel.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-6 py-4 font-semibold">{hotel.name}</td>
                    <td className="px-6 py-4">{hotel.city}</td>
                    <td className="px-6 py-4">
                      {hotel.owner?.name}<br/>
                      <span className="text-xs text-gray-400">{hotel.owner?.email}</span>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={hotel.status} />
                    </td>
                    <td className="px-6 py-4 flex gap-2">
                      <button
                        onClick={() => setSelectedProperty(hotel)}
                        className="px-3 py-1.5 text-xs font-medium text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg"
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Management Modal */}
      {selectedProperty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-xl font-bold">{selectedProperty.name}</h2>
                <p className="text-gray-500 text-sm">Status: {selectedProperty.status}</p>
              </div>
              <button onClick={() => setSelectedProperty(null)} className="text-gray-400 hover:text-gray-700">✕</button>
            </div>

            {/* Workflow Actions */}
            <div className="space-y-4">
              
              {/* Draft Submit Action */}
              {selectedProperty.status === 'DRAFT' && (
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                  <h3 className="font-semibold text-gray-900 mb-2">Draft Property</h3>
                  <p className="text-sm text-gray-600 mb-4">This property is still in draft. Submit it for review to begin the approval process.</p>
                  <button
                    disabled={actionLoading}
                    onClick={() => handleAction(selectedProperty.id, 'submit')}
                    className="btn bg-brand-600 hover:bg-brand-700 text-white px-5 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50 transition-colors"
                  >
                    {actionLoading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                    <Eye size={16} /> Submit for Review
                  </button>
                </div>
              )}

              {/* Review Actions */}
              {['SUBMITTED', 'IN_REVIEW', 'INFORMATION_REQUESTED'].includes(selectedProperty.status) && (
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                  <h3 className="font-semibold text-blue-900 mb-2">Review Phase</h3>
                  <div className="flex gap-2 mb-4">
                    {selectedProperty.status !== 'IN_REVIEW' && (
                      <button onClick={() => handleAction(selectedProperty.id, 'review')} className="btn bg-blue-600 text-white px-4 py-2 rounded">
                        Start Review
                      </button>
                    )}
                    {selectedProperty.status === 'IN_REVIEW' && (
                      <button onClick={() => handleAction(selectedProperty.id, 'approve')} className="btn bg-green-600 text-white px-4 py-2 rounded flex items-center gap-1">
                        <CheckCircle size={16} /> Approve
                      </button>
                    )}
                  </div>
                  {selectedProperty.status === 'IN_REVIEW' && (
                    <div className="mt-4 border-t border-blue-200 pt-4">
                      <p className="text-sm text-blue-800 mb-2">Or request more information:</p>
                      <textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Reason for requesting info..."
                        className="w-full border rounded p-2 text-sm"
                        rows={3}
                      />
                      <button
                        disabled={!rejectReason}
                        onClick={() => handleAction(selectedProperty.id, 'request-info', { reason: rejectReason })}
                        className="mt-2 btn bg-red-600 text-white px-4 py-2 rounded disabled:opacity-50"
                      >
                        Request Info / Reject
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Document Review */}
              {selectedProperty && <ReviewDocuments hotelId={selectedProperty.id} />}

              {/* Agreement Actions */}
              {selectedProperty.status === 'PENDING_AGREEMENT' && (
                <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-orange-900">Agreement Pending</h3>
                    <p className="text-sm text-orange-700">Waiting for owner signature.</p>
                  </div>
                  <button onClick={() => handleAction(selectedProperty.id, 'agreement-signed')} className="btn bg-orange-600 text-white px-4 py-2 rounded flex items-center gap-1">
                    <FileSignature size={16} /> Mark as Signed
                  </button>
                </div>
              )}

              {/* Live Actions */}
              {['READY_FOR_GO_LIVE', 'PAUSED'].includes(selectedProperty.status) && (
                <div className="bg-green-50 p-4 rounded-xl border border-green-100 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-green-900">Ready to Publish</h3>
                    <p className="text-sm text-green-700">Agreement is signed. Property can be published.</p>
                  </div>
                  <button onClick={() => handleAction(selectedProperty.id, 'go-live')} className="btn bg-green-600 text-white px-4 py-2 rounded flex items-center gap-1">
                    <Power size={16} /> Go Live
                  </button>
                </div>
              )}

              {selectedProperty.status === 'LIVE' && (
                <div className="bg-red-50 p-4 rounded-xl border border-red-100 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-red-900">Currently Live</h3>
                    <p className="text-sm text-red-700">Property is visible to customers.</p>
                  </div>
                  <button onClick={() => handleAction(selectedProperty.id, 'unlist')} className="btn bg-red-600 text-white px-4 py-2 rounded flex items-center gap-1">
                    <XCircle size={16} /> Unlist (Pause)
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
