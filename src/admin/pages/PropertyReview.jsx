import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, CheckCircle, XCircle, AlertCircle, Eye, Power, FileSignature, Clock, FileText, MapPin, Phone, Mail, Building, Star, Shield, CreditCard, Image } from 'lucide-react';
import ReviewDocuments from '../components/ReviewDocuments';

const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

const getAuthHeaders = () => {
  const token = localStorage.getItem('jwt_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

// ── Property Details Panel ──────────────────────────────────────────────────
const DetailRow = ({ label, value, badge }) => (
  <div className="flex justify-between items-start py-2.5 border-b border-gray-50 last:border-0">
    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
    {badge ? (
      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${badge.color}`}>{badge.text}</span>
    ) : (
      <span className="text-sm text-gray-900 font-medium text-right max-w-[60%]">{value || <span className="text-gray-300 italic">Not provided</span>}</span>
    )}
  </div>
);

const SectionCard = ({ title, icon: Icon, children, accent = 'gray' }) => {
  const accentColors = {
    gray: 'border-gray-200',
    blue: 'border-blue-200 bg-blue-50/30',
    green: 'border-green-200 bg-green-50/30',
    amber: 'border-amber-200 bg-amber-50/30',
    purple: 'border-purple-200 bg-purple-50/30',
  };
  return (
    <div className={`rounded-xl border p-4 ${accentColors[accent]}`}>
      <div className="flex items-center gap-2 mb-3">
        {Icon && <Icon size={16} className="text-gray-500" />}
        <h4 className="text-sm font-bold text-gray-800">{title}</h4>
      </div>
      {children}
    </div>
  );
};

function PropertyDetailsPanel({ property }) {
  const contact = property.integrationSettings?.contactInfo || {};
  const commercials = property.integrationSettings?.commercials || {};
  const addressDetails = property.integrationSettings?.addressDetails || {};

  return (
    <div className="space-y-4">
      {/* Property Images */}
      {property.media && property.media.length > 0 && (
        <SectionCard title={`Property Photos (${property.media.length})`} icon={Image} accent="purple">
          <div className="grid grid-cols-3 gap-2">
            {property.media.slice(0, 6).map((img, i) => (
              <a key={i} href={img.url} target="_blank" rel="noreferrer" className="block">
                <img
                  src={img.url}
                  alt={`Property photo ${i + 1}`}
                  className="w-full h-20 object-cover rounded-lg border border-gray-200 hover:opacity-80 transition-opacity"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              </a>
            ))}
          </div>
          {property.media.length > 6 && (
            <p className="text-xs text-gray-500 mt-2">+ {property.media.length - 6} more photos</p>
          )}
        </SectionCard>
      )}

      {/* Basic Info + Location */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SectionCard title="Basic Information" icon={Building} accent="blue">
          <DetailRow label="Property Name" value={property.name} />
          <DetailRow label="Property Type" value={property.type || property.propertyType} />
          <DetailRow label="Rating" value={property.rating ? `⭐ ${property.rating}` : null} />
          <DetailRow label="Description" value={property.description ? (property.description.length > 80 ? property.description.substring(0, 80) + '…' : property.description) : null} />
          <DetailRow label="Check-in" value={property.checkInTime} />
          <DetailRow label="Check-out" value={property.checkOutTime} />
        </SectionCard>

        <SectionCard title="Location & Address" icon={MapPin} accent="green">
          <DetailRow label="City" value={property.city} />
          <DetailRow label="State" value={property.state || addressDetails.state} />
          <DetailRow label="Pincode" value={property.pincode || addressDetails.pincode} />
          <DetailRow label="Full Address" value={property.location} />
          <DetailRow label="Landmark" value={property.landmark} />
          {property.latitude && property.longitude && (
            <DetailRow label="GPS" value={`${property.latitude}, ${property.longitude}`} />
          )}
        </SectionCard>
      </div>

      {/* Contact Information */}
      <SectionCard title="Contact Information" icon={Phone} accent="amber">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 mt-1">Owner</p>
            <DetailRow label="Name" value={contact.ownerName || property.owner?.name} />
            <DetailRow label="Email" value={contact.ownerEmail || property.owner?.email} />
            <DetailRow label="Phone" value={contact.ownerPhone || property.owner?.phone} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 mt-1">Property Staff</p>
            <DetailRow label="Reception Phone" value={contact.receptionPhone} />
            <DetailRow label="Reception Email" value={contact.receptionEmail} />
            <DetailRow label="Manager" value={contact.managerName} />
            <DetailRow label="Manager Phone" value={contact.managerPhone} />
          </div>
        </div>
      </SectionCard>

      {/* Rooms */}
      {property.roomTypes && property.roomTypes.length > 0 && (
        <SectionCard title={`Room Types (${property.roomTypes.length})`} icon={Building}>
          <div className="space-y-2">
            {property.roomTypes.map((room, i) => (
              <div key={i} className="flex items-center justify-between bg-white rounded-lg p-2.5 border border-gray-100">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{room.name}</p>
                  <p className="text-xs text-gray-500">Max Occupancy: {room.maxOccupancy || 'N/A'} • Beds: {room.bedType || 'N/A'}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-900">₹{room.basePrice || room.price || '—'}</p>
                  <p className="text-xs text-gray-400">per night</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Amenities & Policies */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SectionCard title="Amenities" icon={Star}>
          {property.amenities && property.amenities.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {property.amenities.map((a, i) => (
                <span key={i} className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-md font-medium">{a}</span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">No amenities listed</p>
          )}
        </SectionCard>

        <SectionCard title="Policies" icon={FileText}>
          {property.policies && property.policies.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {property.policies.map((p, i) => (
                <span key={i} className="px-2 py-1 bg-amber-50 text-amber-700 text-xs rounded-md font-medium">{p}</span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">No policies listed</p>
          )}
        </SectionCard>
      </div>

      {/* Legal & Compliance */}
      <SectionCard title="Legal & Compliance" icon={Shield} accent="blue">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <div>
            <DetailRow label="Legal Name" value={property.legalName} />
            <DetailRow label="PAN" value={property.pan} />
            <DetailRow label="GSTIN" value={property.gstin} />
            <DetailRow label="Incorporation" value={property.incorporationType} />
          </div>
          <div>
            <DetailRow label="Compliance Score" badge={
              property.complianceScore != null
                ? {
                    text: `${property.complianceScore}%`,
                    color: property.complianceScore >= 80 ? 'bg-green-100 text-green-700' : property.complianceScore >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                  }
                : null
            } value={property.complianceScore == null ? 'N/A' : undefined} />
            <DetailRow label="Payout Cycle" value={property.payoutCycle} />
            <DetailRow label="MSME" value={commercials.msme} />
            <DetailRow label="Built Year" value={commercials.builtYear} />
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────
export default function PropertyReview() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('details');

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
      setActiveTab('details');
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
        {(status || 'DRAFT').replace(/_/g, ' ')}
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
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
            <Eye size={18} />
            <h3 className="text-sm font-medium">Awaiting Review</h3>
          </div>
          <p className="text-2xl font-bold text-blue-600">{queue.filter(q => ['SUBMITTED', 'IN_REVIEW'].includes(q.status)).length}</p>
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
                <th className="px-6 py-4">Compliance</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12">Loading...</td></tr>
              ) : queue.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-500">No properties found.</td></tr>
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
                      {hotel.complianceScore != null ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${hotel.complianceScore >= 80 ? 'bg-green-100 text-green-700' : hotel.complianceScore >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                          {hotel.complianceScore}%
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={hotel.status} />
                    </td>
                    <td className="px-6 py-4 flex gap-2">
                      <button
                        onClick={() => { setSelectedProperty(hotel); setActiveTab('details'); }}
                        className="px-3 py-1.5 text-xs font-medium text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg"
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Management Modal ────────────────────────────────────────────────── */}
      {selectedProperty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex justify-between items-start p-6 border-b border-gray-100 shrink-0">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{selectedProperty.name}</h2>
                <div className="flex items-center gap-3 mt-1.5">
                  <StatusBadge status={selectedProperty.status} />
                  <span className="text-xs text-gray-400">{selectedProperty.city} • Owner: {selectedProperty.owner?.name || '—'}</span>
                </div>
              </div>
              <button onClick={() => { setSelectedProperty(null); setActiveTab('details'); }} className="text-gray-400 hover:text-gray-700 p-1">✕</button>
            </div>

            {/* Tab Navigation */}
            <div className="flex border-b border-gray-100 px-6 shrink-0">
              {[
                { id: 'details', label: 'Property Details', icon: Building },
                { id: 'documents', label: 'Documents', icon: FileText },
                { id: 'actions', label: 'Review Actions', icon: Shield },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-brand-600 text-brand-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <tab.icon size={15} />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Tab: Property Details */}
              {activeTab === 'details' && (
                <PropertyDetailsPanel property={selectedProperty} />
              )}

              {/* Tab: Documents */}
              {activeTab === 'documents' && (
                <ReviewDocuments hotelId={selectedProperty.id} />
              )}

              {/* Tab: Review Actions */}
              {activeTab === 'actions' && (
                <div className="space-y-4">
                  {/* Draft Submit Action */}
                  {selectedProperty.status === 'DRAFT' && (
                    <div className="bg-gray-50 p-5 rounded-xl border border-gray-200">
                      <h3 className="font-semibold text-gray-900 mb-2">📝 Draft Property</h3>
                      <p className="text-sm text-gray-600 mb-4">This property is still in draft. Submit it for review to begin the approval process. An email will be sent to the property owner.</p>
                      <button
                        disabled={actionLoading}
                        onClick={() => handleAction(selectedProperty.id, 'submit')}
                        className="bg-brand-600 hover:bg-brand-700 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 disabled:opacity-50 transition-colors font-medium text-sm"
                      >
                        {actionLoading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                        <Eye size={16} /> Submit for Review
                      </button>
                    </div>
                  )}

                  {/* Review Actions */}
                  {['SUBMITTED', 'IN_REVIEW', 'INFORMATION_REQUESTED'].includes(selectedProperty.status) && (
                    <div className="bg-blue-50 p-5 rounded-xl border border-blue-100">
                      <h3 className="font-semibold text-blue-900 mb-3">🔍 Review Phase</h3>
                      <div className="flex gap-3 mb-4">
                        {selectedProperty.status !== 'IN_REVIEW' && (
                          <button 
                            disabled={actionLoading}
                            onClick={() => handleAction(selectedProperty.id, 'review')} 
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-sm disabled:opacity-50 transition-colors"
                          >
                            Start Review
                          </button>
                        )}
                        {selectedProperty.status === 'IN_REVIEW' && (
                          <button 
                            disabled={actionLoading}
                            onClick={() => handleAction(selectedProperty.id, 'approve')} 
                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-1.5 font-medium text-sm disabled:opacity-50 transition-colors"
                          >
                            <CheckCircle size={16} /> Approve Property
                          </button>
                        )}
                      </div>
                      {selectedProperty.status === 'IN_REVIEW' && (
                        <div className="mt-4 border-t border-blue-200 pt-4">
                          <p className="text-sm font-medium text-blue-800 mb-2">Or reject / request more information:</p>
                          <textarea
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="Enter the reason for rejection or what additional information is needed..."
                            className="w-full border border-blue-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            rows={3}
                          />
                          <button
                            disabled={!rejectReason || actionLoading}
                            onClick={() => handleAction(selectedProperty.id, 'request-info', { reason: rejectReason })}
                            className="mt-3 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg disabled:opacity-50 font-medium text-sm flex items-center gap-1.5 transition-colors"
                          >
                            <XCircle size={16} /> Reject / Request Info
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Agreement Actions */}
                  {selectedProperty.status === 'PENDING_AGREEMENT' && (
                    <div className="bg-orange-50 p-5 rounded-xl border border-orange-100 flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-orange-900">📄 Agreement Pending</h3>
                        <p className="text-sm text-orange-700 mt-1">Waiting for the property owner to digitally sign the listing agreement.</p>
                      </div>
                      <button 
                        disabled={actionLoading}
                        onClick={() => handleAction(selectedProperty.id, 'agreement-signed')} 
                        className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg flex items-center gap-1.5 font-medium text-sm disabled:opacity-50 transition-colors shrink-0"
                      >
                        <FileSignature size={16} /> Mark as Signed
                      </button>
                    </div>
                  )}

                  {/* Live Actions */}
                  {['READY_FOR_GO_LIVE', 'PAUSED'].includes(selectedProperty.status) && (
                    <div className="bg-green-50 p-5 rounded-xl border border-green-100 flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-green-900">🚀 Ready to Publish</h3>
                        <p className="text-sm text-green-700 mt-1">Agreement is signed. Property can be published to go live.</p>
                      </div>
                      <button 
                        disabled={actionLoading}
                        onClick={() => handleAction(selectedProperty.id, 'go-live')} 
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-1.5 font-medium text-sm disabled:opacity-50 transition-colors shrink-0"
                      >
                        <Power size={16} /> Go Live
                      </button>
                    </div>
                  )}

                  {selectedProperty.status === 'LIVE' && (
                    <div className="bg-red-50 p-5 rounded-xl border border-red-100 flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-red-900">🔴 Currently Live</h3>
                        <p className="text-sm text-red-700 mt-1">Property is visible to customers on ZivoHotels.</p>
                      </div>
                      <button 
                        disabled={actionLoading}
                        onClick={() => handleAction(selectedProperty.id, 'unlist')} 
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg flex items-center gap-1.5 font-medium text-sm disabled:opacity-50 transition-colors shrink-0"
                      >
                        <XCircle size={16} /> Unlist (Pause)
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
