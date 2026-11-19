import { useState, useEffect } from 'react';
import { Save, Loader2, Phone, Mail, MessageSquare, Clock } from 'lucide-react';
import { getSystemConfig, updateSystemConfig } from '../../../services/api';

/**
 * ZivoHotels guest support contacts. Shown on the Help page, in My Bookings, in booking emails and
 * on vouchers. Empty fields fall back to the server's ZIVO_SUPPORT_PHONE / ZIVO_SUPPORT_EMAIL.
 */
const FIELDS = [
  { key: 'phone', label: 'Support phone', icon: Phone, type: 'tel', placeholder: '9663035520', hint: 'Shown with "Call us". 10-digit mobile or with +91.' },
  { key: 'whatsapp', label: 'WhatsApp number', icon: MessageSquare, type: 'tel', placeholder: 'Same as the support phone', hint: 'Leave empty to use the support phone.' },
  { key: 'email', label: 'Support email', icon: Mail, type: 'email', placeholder: 'support@zivohotels.com', hint: 'Guests write here about bookings, refunds and invoices.' },
  { key: 'hours', label: 'Support hours', icon: Clock, type: 'text', placeholder: 'Every day, 9 am to 9 pm', hint: 'Optional. Shown next to the contacts.' },
];

const SupportSettings = () => {
  const [form, setForm] = useState({ phone: '', whatsapp: '', email: '', hours: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState(null);

  useEffect(() => {
    getSystemConfig()
      .then((config) => { if (config?.support_settings) setForm((f) => ({ ...f, ...config.support_settings })); })
      .catch(() => setNote({ ok: false, text: 'Could not load the saved support details.' }))
      .finally(() => setLoading(false));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setNote(null);
    try {
      await updateSystemConfig({ support_settings: form });
      setNote({ ok: true, text: 'Saved. Guests see the new details within a minute.' });
    } catch (err) {
      setNote({ ok: false, text: err?.message || 'Could not save. Check the details and try again.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 text-brand-700 animate-spin" aria-label="Loading" /></div>
  );

  return (
    <form onSubmit={save} className="space-y-6 max-w-2xl">
      <div>
        <h3 className="text-lg font-bold text-gray-800">Guest support</h3>
        <p className="text-sm text-gray-500">Shown on the Help page, in My Bookings, in booking emails and on vouchers.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {FIELDS.map(({ key, label, icon: Icon, type, placeholder, hint }) => (
          <div key={key}>
            <label htmlFor={`support-${key}`} className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1"><Icon size={14} aria-hidden="true" /> {label}</label>
            <input id={`support-${key}`} type={type} value={form[key] || ''} placeholder={placeholder} maxLength={120}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
            <p className="text-xs text-gray-500 mt-1">{hint}</p>
          </div>
        ))}
      </div>
      {note && <p role="status" className={`text-sm px-3 py-2 rounded-lg ${note.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{note.text}</p>}
      <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
        {saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />} Save support details
      </button>
    </form>
  );
};

export default SupportSettings;
