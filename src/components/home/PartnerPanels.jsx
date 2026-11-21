import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Briefcase, Copy, Check } from 'lucide-react';

/**
 * Two panels for hotels and companies. Both go to the real teams by email (there's no form yet);
 * the address is shown as text with a copy button, because mail links don't work for everyone.
 */
const Email = ({ address }) => {
  const [done, setDone] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(address); setDone(true); setTimeout(() => setDone(false), 2000); } catch { /* visible to select */ } };
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-semibold text-navy-900 select-all">{address}</span>
      <button type="button" onClick={copy} aria-label={`Copy ${address}`} className="p-1.5 rounded-md text-navy-700 hover:bg-navy-100">{done ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}</button>
    </span>
  );
};

const PartnerPanels = () => (
  <section className="py-14 bg-gray-50" aria-label="For hotels and companies">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid gap-5 md:grid-cols-2">
      <article className="bg-white rounded-card border border-gray-200 p-6">
        <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900"><Building2 className="text-navy-700" size={24} aria-hidden="true" /> List your property</h2>
        <p className="text-gray-600 mt-2">Reach guests across India. Manage rooms, rates, bookings, reviews and payouts in the ZivoHotels Extranet, on your laptop or phone.</p>
        <p className="text-sm text-gray-700 mt-4">Questions? Write to our partner team: <Email address="partners@zivohotels.com" /></p>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Link to="/list-your-property" className="inline-block px-5 py-2.5 rounded-lg bg-navy-800 hover:bg-navy-900 text-white font-semibold">List your property</Link>
          <Link to="/extranet/login" className="text-sm font-semibold text-navy-700 hover:text-navy-900">Already a partner? Log in</Link>
        </div>
      </article>
      <article className="bg-white rounded-card border border-gray-200 p-6">
        <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900"><Briefcase className="text-navy-700" size={24} aria-hidden="true" /> Stays for your company</h2>
        <p className="text-gray-600 mt-2">Add your company&apos;s GSTIN at checkout for a GST invoice in its name, and choose to pay now or reserve now and pay later.</p>
        <p className="text-sm text-gray-700 mt-4">Ask about business rates: <Email address="bookings@zivohotels.com" /></p>
        <Link to="/help#payments" className="mt-4 inline-block px-5 py-2.5 rounded-lg border border-navy-200 text-navy-800 font-semibold hover:bg-navy-50">How payments work</Link>
      </article>
    </div>
  </section>
);

export default PartnerPanels;
