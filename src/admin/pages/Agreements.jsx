import { useState, useEffect, useCallback } from 'react';
import {
  FileSignature, Mail, XCircle, FileText, FileCheck,
  FileWarning, RefreshCw, Plus, CheckCircle, AlertCircle, X,
  Building2
} from 'lucide-react';

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';
const API_URL = `${BASE_URL}/admin`;
const getAuthHeaders = () => {
  const token = localStorage.getItem('jwt_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

// ─── Status config ─────────────────────────────────────────────────────────────
const STATUS = {
  DRAFT:              { label: 'Draft',            cls: 'bg-gray-100   text-gray-700   border-gray-200' },
  PENDING_SIGNATURE:  { label: 'Pending Signature',cls: 'bg-amber-50   text-amber-700  border-amber-200' },
  SIGNED:             { label: 'Signed',           cls: 'bg-green-50   text-green-700  border-green-200' },
  EXPIRED:            { label: 'Expired',          cls: 'bg-red-50     text-red-700    border-red-200' },
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// ─── Create Agreement Modal ────────────────────────────────────────────────────
const CreateModal = ({ properties, onClose, onSuccess }) => {
  const [hotelId,        setHotelId]        = useState('');
  const [commissionRate, setCommissionRate] = useState(15);
  const [submitting,     setSubmitting]     = useState(false);
  const [error,          setError]          = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!hotelId) { setError('Please select a property.'); return; }
    setSubmitting(true);
    try {
      const res  = await fetch(`${API_URL}/agreements`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ hotelId, commissionRate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to create agreement');
      onSuccess('Agreement created successfully.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-50 rounded-lg flex items-center justify-center">
              <FileSignature size={16} className="text-brand-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Generate Agreement</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />{error}
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Property *</label>
            <select required value={hotelId} onChange={e => setHotelId(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500 bg-white">
              <option value="">— Select property —</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name} ({p.city})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Commission Rate (%)</label>
            <input type="number" min={0} max={50} step={0.5} value={commissionRate}
              onChange={e => setCommissionRate(parseFloat(e.target.value))}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500" />
            <p className="text-[10px] text-gray-400 mt-1">Platform commission deducted per successful booking.</p>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={submitting}
              className="flex-1 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {submitting ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Generate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Agreement Detail Drawer ───────────────────────────────────────────────────
const AgreementDrawer = ({ agreement, onClose, onAction, actionLoading }) => {
  if (!agreement) return null;
  const st = STATUS[agreement.status] || STATUS.DRAFT;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-0.5">Agreement</p>
            <p className="text-xl font-bold text-gray-900">{agreement.hotel?.name}</p>
            <p className="text-sm text-gray-500">{agreement.hotel?.city}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-6 flex-1">
          {/* Status */}
          <div>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold border ${st.cls}`}>
              {st.label}
            </span>
          </div>

          {/* Property Info */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Building2 size={14} className="text-gray-400" />
              <span className="font-semibold text-gray-900">{agreement.hotel?.name}</span>
            </div>
            <div className="text-gray-500">Property Status: <span className="font-medium text-gray-700">{agreement.hotel?.status}</span></div>
            <div className="text-gray-500">Owner: <span className="font-medium text-gray-700">{agreement.hotel?.owner?.name}</span></div>
            <div className="text-gray-400 text-xs">{agreement.hotel?.owner?.email}</div>
          </div>

          {/* Agreement Terms */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider">Terms</div>
            <div className="p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Commission Rate</span><span className="font-bold text-brand-600 text-base">{agreement.commissionRate}%</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Created</span><span>{fmtDate(agreement.createdAt)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Sent</span><span>{fmtDate(agreement.sentAt)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Signed</span><span className={agreement.signedAt ? 'text-green-600 font-semibold' : 'text-gray-400'}>{fmtDate(agreement.signedAt)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Expires</span><span>{fmtDate(agreement.expiryAt)}</span></div>
            </div>
          </div>

          {/* Agreement text */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Agreement Terms & Conditions</p>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-600 space-y-2 leading-relaxed max-h-40 overflow-y-auto">
              <p>1. The Owner agrees to list the property exclusively on ZivoHotels for the duration of this agreement.</p>
              <p>2. The Platform shall deduct a commission of <strong>{agreement.commissionRate}%</strong> on all successful bookings.</p>
              <p>3. Payouts will be processed on a monthly cycle directly to the registered bank account.</p>
              <p>4. This agreement is valid for 12 months from the date of signature.</p>
              <p>5. ZivoHotels reserves the right to suspend properties violating the platform&apos;s policies.</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-6 border-t border-gray-100 bg-gray-50 space-y-2 sticky bottom-0">
          {agreement.status === 'DRAFT' && (
            <button onClick={() => onAction(agreement.id, 'send')} disabled={actionLoading}
              className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-60">
              <Mail size={15} /> Mark as Sent to Owner
            </button>
          )}
          {(agreement.status === 'DRAFT' || agreement.status === 'PENDING_SIGNATURE') && (
            <button onClick={() => onAction(agreement.id, 'sign')} disabled={actionLoading}
              className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-60">
              <FileCheck size={15} /> Override &amp; Mark Signed → Activate Property
            </button>
          )}
          {agreement.status === 'PENDING_SIGNATURE' && (
            <button onClick={() => onAction(agreement.id, 'resend')} disabled={actionLoading}
              className="w-full flex items-center justify-center gap-2 border border-amber-300 hover:bg-amber-50 text-amber-700 text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-60">
              <Mail size={15} /> Re-send to Owner
            </button>
          )}
          <button onClick={() => onAction(agreement.id, 'cancel')} disabled={actionLoading}
            className="w-full flex items-center justify-center gap-2 border-2 border-red-200 hover:bg-red-50 text-red-600 text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-60">
            <XCircle size={15} /> Cancel Agreement
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────────
const Agreements = () => {
  const [agreements,   setAgreements]  = useState([]);
  const [counts,       setCounts]      = useState({});
  const [properties,   setProperties]  = useState([]);
  const [loading,      setLoading]     = useState(true);
  const [error,        setError]       = useState('');
  const [toast,        setToast]       = useState('');
  const [statusFilter, setStatusFilter]= useState('');
  const [search,       setSearch]      = useState('');

  const [showCreate,       setShowCreate]       = useState(false);
  const [selectedAgreement,setSelectedAgreement]= useState(null);
  const [actionLoading,    setActionLoading]    = useState(false);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 4000); };

  // Load properties for the create modal
  useEffect(() => {
    fetch(`${API_URL}/hotels`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(d => setProperties(d.data || []))
      .catch(() => {});
  }, []);

  const fetchAgreements = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (search)       params.set('search', search);

      const res  = await fetch(`${API_URL}/agreements?${params}`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load');

      setAgreements(data.data || []);
      setCounts(data.counts || {});
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => { fetchAgreements(); }, [fetchAgreements]);

  // ─── Actions ─────────────────────────────────────────────────────────────────
  const handleAction = async (id, action) => {
    setActionLoading(true);
    try {
      let url = `${API_URL}/agreements/${id}`;
      let method = 'PATCH';

      if (action === 'sign')   url += '/sign';
      else if (action === 'send' || action === 'resend') url += '/send';
      else if (action === 'cancel') method = 'DELETE';

      const res  = await fetch(url, { method, headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Action failed');

      showToast(data.message || 'Done');
      if (selectedAgreement?.id === id) setSelectedAgreement(null);
      fetchAgreements();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const STAT_CARDS = [
    { label: 'Total',    value: counts.total   || 0, color: 'blue',   icon: <FileText size={18} /> },
    { label: 'Pending',  value: counts.pending  || 0, color: 'amber',  icon: <FileSignature size={18} /> },
    { label: 'Signed',   value: counts.signed   || 0, color: 'green',  icon: <FileCheck size={18} /> },
    { label: 'Expired',  value: counts.expired  || 0, color: 'red',    icon: <FileWarning size={18} /> },
  ];
  const COLOR_MAP = {
    blue: 'bg-blue-50 text-blue-600', amber: 'bg-amber-50 text-amber-600',
    green: 'bg-green-50 text-green-600', red: 'bg-red-50 text-red-600',
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agreements & Contracts</h1>
          <p className="text-gray-500 mt-0.5 text-sm">Manage property onboarding contracts. Signing an agreement activates the property.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={fetchAgreements} disabled={loading}
            className="border border-gray-300 bg-white hover:bg-gray-50 px-3 py-2 rounded-lg text-sm flex items-center gap-1.5 transition-colors disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setShowCreate(true)}
            className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-1.5 transition-colors shadow-sm">
            <Plus size={15} /> Generate Agreement
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {STAT_CARDS.map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm flex items-center gap-4">
            <div className={`p-3 rounded-xl ${COLOR_MAP[s.color]}`}>{s.icon}</div>
            <div>
              <p className="text-xs text-gray-400 font-medium">{s.label}</p>
              <p className="text-2xl font-bold text-gray-900">{loading ? '…' : s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap gap-3">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search property or owner..."
          className="flex-1 min-w-48 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-brand-500 bg-white">
          <option value="">All Statuses</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {(statusFilter || search) && (
          <button onClick={() => { setStatusFilter(''); setSearch(''); }}
            className="flex items-center gap-1 text-xs text-red-600 border border-red-200 bg-red-50 px-3 py-2 rounded-lg">
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48 gap-3">
            <span className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : agreements.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-300 gap-2">
            <FileText size={32} />
            <p className="text-sm">No agreements found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Property', 'Owner', 'Commission', 'Status', 'Property Status', 'Sent', 'Signed', 'Expires', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {agreements.map(a => {
                  const st = STATUS[a.status] || STATUS.DRAFT;
                  return (
                    <tr key={a.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-3">
                        <button onClick={() => setSelectedAgreement(a)}
                          className="font-semibold text-gray-900 hover:text-brand-600 text-left">
                          {a.hotel?.name}
                        </button>
                        <p className="text-xs text-gray-400">{a.hotel?.city}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800">{a.hotel?.owner?.name}</p>
                        <p className="text-xs text-gray-400">{a.hotel?.owner?.email}</p>
                      </td>
                      <td className="px-4 py-3 font-bold text-brand-600">{a.commissionRate}%</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${st.cls}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold ${a.hotel?.status === 'ACTIVE' ? 'text-green-600' : 'text-amber-600'}`}>
                          {a.hotel?.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(a.sentAt)}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(a.signedAt)}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(a.expiryAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setSelectedAgreement(a)}
                            className="p-1.5 text-gray-400 hover:text-brand-600 rounded-md hover:bg-brand-50 transition-colors" title="View">
                            <FileText size={15} />
                          </button>
                          {a.status !== 'SIGNED' && a.status !== 'EXPIRED' && (
                            <button onClick={() => handleAction(a.id, 'sign')} disabled={actionLoading}
                              className="p-1.5 text-gray-400 hover:text-green-600 rounded-md hover:bg-green-50 transition-colors" title="Mark Signed">
                              <FileCheck size={15} />
                            </button>
                          )}
                          {a.status === 'DRAFT' && (
                            <button onClick={() => handleAction(a.id, 'send')} disabled={actionLoading}
                              className="p-1.5 text-gray-400 hover:text-amber-600 rounded-md hover:bg-amber-50 transition-colors" title="Mark Sent">
                              <Mail size={15} />
                            </button>
                          )}
                          <button onClick={() => handleAction(a.id, 'cancel')} disabled={actionLoading}
                            className="p-1.5 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors" title="Cancel">
                            <XCircle size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Drawer */}
      <AgreementDrawer
        agreement={selectedAgreement}
        onClose={() => setSelectedAgreement(null)}
        onAction={handleAction}
        actionLoading={actionLoading}
      />

      {/* Create Modal */}
      {showCreate && (
        <CreateModal
          properties={properties}
          onClose={() => setShowCreate(false)}
          onSuccess={(msg) => { setShowCreate(false); showToast(msg); fetchAgreements(); }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-green-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-semibold">
          <CheckCircle size={16} /> {toast}
        </div>
      )}
    </div>
  );
};

export default Agreements;
