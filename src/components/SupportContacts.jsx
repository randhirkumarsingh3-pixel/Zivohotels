import { Phone, Mail, MessageSquare } from 'lucide-react';
import useSupportContacts from '../hooks/useSupportContacts';

/**
 * ZivoPlus support: phone, WhatsApp and email as tappable links, with the numbers also shown as
 * text (links to phone or mail apps don't open everywhere). Nothing when no contacts are set.
 */
const SupportContacts = ({ bookingRef = '', compact = false }) => {
  const s = useSupportContacts();
  if (!s.phone && !s.email && !s.whatsapp) return null;
  const item = `flex items-center gap-2 ${compact ? 'p-2.5' : 'p-3'} rounded-xl bg-gray-50 border border-gray-100 hover:border-brand-500 transition-colors text-sm text-gray-800`;
  const waText = encodeURIComponent(bookingRef ? `Hi, I need help with booking ${bookingRef}` : 'Hi, I need help with a booking');
  return (
    <div className="space-y-2">
      {s.phone && (
        <a href={`tel:${s.phone.replace(/\s/g, '')}`} className={item}>
          <Phone size={16} className="text-brand-700 shrink-0" aria-hidden="true" />
          <span>Call ZivoPlus <span className="font-semibold select-all">{s.phone}</span></span>
        </a>
      )}
      {s.whatsappLink && (
        <a href={`${s.whatsappLink}?text=${waText}`} target="_blank" rel="noreferrer" className={item}>
          <MessageSquare size={16} className="text-emerald-600 shrink-0" aria-hidden="true" />
          <span>WhatsApp <span className="font-semibold select-all">{s.whatsapp}</span></span>
        </a>
      )}
      {s.email && (
        <a href={`mailto:${s.email}${bookingRef ? `?subject=${encodeURIComponent(`Booking ${bookingRef}`)}` : ''}`} className={item}>
          <Mail size={16} className="text-brand-700 shrink-0" aria-hidden="true" />
          <span className="font-semibold break-all select-all">{s.email}</span>
        </a>
      )}
      {s.hours && <p className="text-xs text-gray-500">{s.hours}</p>}
    </div>
  );
};

export default SupportContacts;
