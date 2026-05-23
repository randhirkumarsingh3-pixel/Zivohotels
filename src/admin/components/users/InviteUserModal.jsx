import { useState } from 'react';
import { X, Mail, Copy, Check, AlertCircle, Clock } from 'lucide-react';

const API_URL = '/api/v1';
const getAuthHeaders = () => {
  const token = localStorage.getItem('jwt_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

const ROLES = ['CUSTOMER', 'OWNER', 'ADMIN'];

const InviteUserModal = ({ properties = [], onClose, onSuccess }) => {
  const [form, setForm] = useState({ name: '', email: '', role: 'CUSTOMER', propertyId: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);

  const handleChange = (e) => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const payload = { ...form };
      if (form.role !== 'OWNER') delete payload.propertyId;

      const res = await fetch(`${API_URL}/users/invite`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to send invite');

      // If dev mode, backend returns the invite link
      if (data.inviteLink) setInviteLink(data.inviteLink);
      else onSuccess('Invitation sent successfully!');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDone = () => {
    onSuccess('Invitation sent successfully!');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center">
              <Mail size={16} className="text-amber-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Invite User</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        {!inviteLink ? (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />{error}
              </div>
            )}

            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2.5 rounded-lg">
              <Clock size={13} className="mt-0.5 shrink-0" />
              Invite link expires in 24 hours. The user must set their password before then.
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Full Name (optional)</label>
                <input name="name" value={form.name} onChange={handleChange}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="John Doe" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Email *</label>
                <input required type="email" name="email" value={form.email} onChange={handleChange}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="john@example.com" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Role *</label>
                <select name="role" value={form.role} onChange={handleChange}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {form.role === 'OWNER' && properties.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Assign Property (optional)</label>
                  <select name="propertyId" value={form.propertyId} onChange={handleChange}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                    <option value="">— No property assigned —</option>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={submitting}
                className="flex-1 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {submitting
                  ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : 'Send Invite'}
              </button>
            </div>
          </form>
        ) : (
          /* Success view — show invite link to copy */
          <div className="p-6 space-y-5">
            <div className="text-center">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Mail size={22} className="text-green-600" />
              </div>
              <h3 className="font-bold text-gray-900 mb-1">Invite Created!</h3>
              <p className="text-sm text-gray-500">Copy and share this link with <strong>{form.email}</strong>.</p>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
              <p className="text-[11px] text-gray-500 font-semibold mb-1.5 uppercase tracking-wide">Invite Link</p>
              <p className="text-xs text-gray-700 break-all font-mono leading-relaxed">{inviteLink}</p>
            </div>

            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 px-3 py-2 rounded-lg">
              <Clock size={12} /> This link expires in 24 hours.
            </div>

            <div className="flex gap-3">
              <button onClick={copyLink}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors ${copied ? 'bg-green-100 text-green-700 border border-green-200' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy Link</>}
              </button>
              <button onClick={handleDone}
                className="flex-1 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg transition-colors">
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InviteUserModal;
