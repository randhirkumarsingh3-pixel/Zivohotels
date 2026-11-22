import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { LEGAL, missingLegalFields } from '../../constants/legal';
import { BRAND_NAME } from '../../config/brand';

/** Layout for the Privacy Policy and Terms: title, draft notice, contents list, sections. */
export const LegalSection = ({ id, title, children }) => (
  <section id={id} className="scroll-mt-28 space-y-3">
    <h2 className="text-xl font-bold text-navy-900">{title}</h2>
    <div className="space-y-3 text-gray-700 leading-relaxed">{children}</div>
  </section>
);

export const Who = () => (
  <>{LEGAL.legalEntity || LEGAL.brand}{LEGAL.registeredAddress ? `, ${LEGAL.registeredAddress}` : ''}{LEGAL.cin ? ` (CIN ${LEGAL.cin})` : ''}</>
);

export const GrievanceOfficer = () => {
  const g = LEGAL.grievanceOfficer;
  return (
    <ul className="list-none space-y-1">
      <li>Name: <strong>{g.name || 'to be published'}</strong></li>
      <li>Email: <strong className="select-all">{g.email || LEGAL.contacts.bookings}</strong></li>
      {g.phone && <li>Phone: <strong>{g.phone}</strong></li>}
      <li>We acknowledge complaints within 24 hours and resolve them within 15 days.</li>
    </ul>
  );
};

const LegalPage = ({ title, intro, sections, children }) => {
  useEffect(() => { document.title = `${title} | ${BRAND_NAME}`; window.scrollTo(0, 0); }, [title]);
  const missing = missingLegalFields();
  return (
    <div className="pt-28 pb-20 bg-gray-50 min-h-screen">
      <article className="max-w-3xl mx-auto px-4 sm:px-6">
        <p className="text-sm font-semibold text-brand-700 uppercase tracking-wider">Legal</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-navy-900 mt-1">{title}</h1>
        <p className="text-sm text-gray-500 mt-2">Last updated {new Date(LEGAL.lastUpdated).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>

        {!LEGAL.reviewed && (
          <div role="note" className="mt-6 flex items-start gap-3 rounded-card border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 text-sm">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <p><strong>Draft.</strong> This page is being reviewed and may change.{missing.length > 0 && <> Still to be added: {missing.join(', ')}.</>}</p>
          </div>
        )}

        <p className="mt-6 text-gray-700 leading-relaxed">{intro}</p>

        <nav aria-label="Contents" className="mt-6 bg-white border border-gray-200 rounded-card p-5">
          <p className="text-sm font-semibold text-gray-900 mb-2">Contents</p>
          <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm list-decimal list-inside">
            {sections.map(([id, label]) => <li key={id}><a href={`#${id}`} className="text-navy-700 hover:underline">{label}</a></li>)}
          </ol>
        </nav>

        <div className="mt-8 bg-white border border-gray-200 rounded-card p-6 sm:p-10 space-y-10">{children}</div>
      </article>
    </div>
  );
};

export default LegalPage;
