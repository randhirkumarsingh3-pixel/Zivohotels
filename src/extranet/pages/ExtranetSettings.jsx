import { User, Building2, Landmark, LifeBuoy, LogOut, Loader2, KeyRound } from 'lucide-react';
import ChangePasswordForm from '../../components/account/ChangePasswordForm';
import { useAuth } from '../../context/AuthContext';
import { useExtranet } from '../context/ExtranetContext';
import BookingEmailsCard from '../components/BookingEmailsCard';
import GoogleHotelsCard from '../components/GoogleHotelsCard';

/**
 * Extranet -> Settings: the signed-in partner's account and the active property's legal, contact
 * and payout details, as saved on ZivoHotels. The page used to show a made-up owner ("Rajesh
 * Kumar"), GSTIN and phone, with notification toggles and a password form that saved nothing.
 * Details are edited in Property Info or, for legal and bank details, through partner support.
 * The password can be changed here.
 */
const Row = ({ label, value, mono = false }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-3 border-b border-gray-100 last:border-0">
    <dt className="text-sm text-gray-500">{label}</dt>
    <dd className={`text-sm font-semibold text-gray-900 break-all sm:text-right ${mono ? 'font-mono' : ''}`}>{value || <span className="font-normal text-gray-400">Not added</span>}</dd>
  </div>
);

const Card = ({ icon: Icon, title, note, children }) => (
  <section className="bg-white rounded-card border border-gray-200 shadow-sm">
    <div className="px-6 py-5 border-b border-gray-100 flex items-start gap-3">
      <span className="w-10 h-10 rounded-lg bg-navy-50 text-navy-700 flex items-center justify-center shrink-0"><Icon size={20} /></span>
      <div>
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        {note && <p className="text-sm text-gray-500 mt-0.5">{note}</p>}
      </div>
    </div>
    <dl className="px-6 py-2">{children}</dl>
  </section>
);

const mask = (v, keep = 4) => (v ? `${'•'.repeat(Math.max(0, String(v).length - keep))}${String(v).slice(-keep)}` : '');

const ExtranetSettings = () => {
  const { user, logout } = useAuth();
  const { property } = useExtranet();
  if (!property) return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-navy-700" size={32} /></div>;
  const contact = property.integrationSettings?.contactInfo || {};

  return (
    <div className="space-y-6 pb-12 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Settings</h1>
        <p className="text-gray-500 mt-1">Your account and the details ZivoHotels holds for {property.name}.</p>
      </div>

      <Card icon={User} title="Your account">
        <Row label="Name" value={user?.name} />
        <Row label="Email (used to log in)" value={user?.email} />
        <Row label="Role" value={user?.role === 'OWNER' ? 'Property owner' : String(user?.role || '').toLowerCase()} />
      </Card>

      <section className="bg-white rounded-card border border-gray-200 shadow-sm">
        <div className="px-6 py-5 border-b border-gray-100 flex items-start gap-3">
          <span className="w-10 h-10 rounded-lg bg-navy-50 text-navy-700 flex items-center justify-center shrink-0"><KeyRound size={20} /></span>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Password</h2>
            <p className="text-sm text-gray-500 mt-0.5">Changing it signs you out on your other devices. Forgot it? Use &quot;Forgot password&quot; on the log-in page.</p>
          </div>
        </div>
        <div className="px-6 py-5"><ChangePasswordForm /></div>
      </section>

      <Card icon={Building2} title="Property contacts" note="Shown to guests. Change these in Property Info.">
        <Row label="Reception email" value={contact.receptionEmail} />
        <Row label="Reception phone" value={contact.receptionPhone} />
        <Row label="Manager" value={[contact.managerName, contact.managerPhone].filter(Boolean).join(' · ')} />
      </Card>

      <BookingEmailsCard property={property} ownerEmail={user?.email} />
      <GoogleHotelsCard />

      <Card icon={Landmark} title="Legal & payout details" note="Locked after your property is submitted. Write to partner support to change them.">
        <Row label="Legal name" value={property.legalName} />
        <Row label="GSTIN" value={property.gstin} mono />
        <Row label="PAN" value={mask(property.pan)} mono />
        <Row label="Payout account" value={property.bankAccount ? `${property.bankAccount.bankName} ···· ${property.bankAccount.last4}` : ''} />
        <Row label="Commission" value={property.agreement?.commissionRate != null ? `${property.agreement.commissionRate}% (agreement ${String(property.agreement.status || '').toLowerCase()})` : ''} />
      </Card>

      <section className="bg-navy-900 text-white rounded-card p-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <LifeBuoy size={28} className="text-navy-200 shrink-0" aria-hidden="true" />
        <div className="flex-1">
          <h2 className="font-bold">Need to change your legal or payout details?</h2>
          <p className="text-sm text-navy-100 mt-1">Write to <span className="font-semibold text-white select-all">partners@zivohotels.com</span> from your login email.</p>
        </div>
        <button type="button" onClick={logout} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-semibold">
          <LogOut size={16} aria-hidden="true" /> Log out
        </button>
      </section>
    </div>
  );
};

export default ExtranetSettings;
