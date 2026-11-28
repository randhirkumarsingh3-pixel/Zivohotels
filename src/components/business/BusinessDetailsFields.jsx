import { GST_STATE_CODES, STATES, TYPES, ACCREDITATION_BODIES, MONTHLY_BOOKINGS, PRICING_PREFERENCES } from './orgOptions';

/**
 * A company's or travel agent's details, the same for the public application and the admin
 * "Add" / edit forms: business and tax, registered address, the person applying, the agency's
 * credentials, and the "not registered under GST" declaration for agents without a GSTIN.
 * `f` is the form state, `set(key, value)` changes it.
 */
const input = 'mt-1 w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-navy-500 focus:border-navy-500 outline-none disabled:bg-gray-50';
const label = 'block text-sm font-semibold text-gray-800';
const Section = ({ title, hint, children }) => (
  <fieldset className="space-y-4">
    <legend className="text-base font-bold text-gray-900">{title}</legend>
    {hint && <p className="text-xs text-gray-500 -mt-2">{hint}</p>}
    <div className="grid gap-4 sm:grid-cols-2">{children}</div>
  </fieldset>
);

const BusinessDetailsFields = ({ kind, f, set, requireGstin = false }) => {
  const agent = kind === 'AGENCY';
  const text = (k, l, props = {}) => {
    const { wide, ...rest } = props;
    return <label key={k} className={`${label} ${wide ? 'sm:col-span-2' : ''}`}>{l}<input className={input} value={f[k] ?? ''} onChange={(e) => set(k, e.target.value)} {...rest} /></label>;
  };
  const onGstin = (v) => {
    const g = v.toUpperCase().replace(/\s/g, '');
    set('gstin', g);
    // The state comes from the GSTIN's first two digits; its PAN is characters 3-12
    if (g.length >= 2 && GST_STATE_CODES[g.slice(0, 2)] && !f.state) set('state', GST_STATE_CODES[g.slice(0, 2)]);
    if (g.length >= 12 && !f.pan) set('pan', g.slice(2, 12));
    if (g) set('gstDeclaration', false);
  };
  const acc = f.accreditation || {}; const prof = f.businessProfile || {};
  const gstState = f.gstin?.length >= 2 ? GST_STATE_CODES[f.gstin.slice(0, 2)] : null;
  return (
    <div className="space-y-7">
      <Section title={agent ? 'Your agency' : 'Your company'} hint="As on the PAN card and GST certificate.">
        {text('name', agent ? 'Agency name (shown to customers)' : 'Company name (shown on ZivoPlus)', { required: true, autoComplete: 'organization' })}
        {text('legalName', 'Legal name', { required: true, placeholder: 'As on the PAN card' })}
        <label className={label}>Type of business
          <select className={input} value={f.incorporationType || ''} onChange={(e) => set('incorporationType', e.target.value)} required>
            <option value="">Choose…</option>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className={label}>GSTIN{requireGstin ? '' : <span className="font-normal text-gray-500"> (optional)</span>}
          <input className={`${input} uppercase`} value={f.gstin ?? ''} onChange={(e) => onGstin(e.target.value)} maxLength={15} required={requireGstin} placeholder="27ABCDE1234F1Z5" />
          {gstState && <span className="block mt-1 text-xs font-normal text-gray-500">Registered in {gstState}</span>}
        </label>
        {text('pan', 'PAN', { required: true, maxLength: 10, className: `${input} uppercase`, placeholder: 'ABCDE1234F' })}
        {text('website', <>Website <span className="font-normal text-gray-500">(optional)</span></>, { type: 'url', placeholder: 'https://' })}
        {agent && !f.gstin && (
          <label className="sm:col-span-2 flex items-start gap-2.5 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-950">
            <input type="checkbox" className="mt-0.5" checked={Boolean(f.gstDeclaration)} onChange={(e) => set('gstDeclaration', e.target.checked)} />
            <span><b>We are not registered under GST.</b> Our turnover is below the registration limit (or we are otherwise exempt). We will tell ZivoPlus if we register.</span>
          </label>
        )}
      </Section>

      <Section title="Registered address">
        {text('address', 'Address', { required: true, wide: true, autoComplete: 'street-address' })}
        {text('city', 'City', { required: true })}
        <label className={label}>State
          <select className={input} value={f.state || ''} onChange={(e) => set('state', e.target.value)} required>
            <option value="">Choose…</option>{STATES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        {text('pincode', 'PIN code', { required: true, inputMode: 'numeric', maxLength: 6, pattern: '[1-9][0-9]{5}' })}
      </Section>

      <Section title="Contact" hint="Invoices and statements go to this email.">
        {text('contactName', 'Your name', { required: true, autoComplete: 'name' })}
        {text('contactDesignation', 'Your role', { placeholder: agent ? 'e.g. Owner, Operations manager' : 'e.g. Director, Travel manager' })}
        {text('billingEmail', 'Email for invoices and statements', { required: true, type: 'email' })}
        {text('phone', 'Phone', { required: true, type: 'tel', autoComplete: 'tel' })}
        <label className="sm:col-span-2 flex items-start gap-2.5 text-sm text-gray-800">
          <input type="checkbox" className="mt-0.5" checked={f.isSignatory !== false} onChange={(e) => set('isSignatory', e.target.checked)} />
          <span>I am an owner, director or partner of this business <span className="block text-xs text-gray-500">Otherwise, upload a letter from one of them authorising you to apply.</span></span>
        </label>
      </Section>

      <Section title={agent ? 'About your agency' : 'About your travel'}>
        {agent && (
          <>
            <label className={label}>Accreditation
              <select className={input} value={acc.body || ''} onChange={(e) => set('accreditation', { ...acc, body: e.target.value })}>{ACCREDITATION_BODIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </label>
            <label className={label}>Accreditation number
              <input className={input} value={acc.number || ''} onChange={(e) => set('accreditation', { ...acc, number: e.target.value })} disabled={!acc.body} required={Boolean(acc.body)} />
            </label>
          </>
        )}
        <label className={label}>Years in business
          <input type="number" min="0" max="100" className={input} value={prof.yearsInBusiness ?? ''} onChange={(e) => set('businessProfile', { ...prof, yearsInBusiness: e.target.value })} />
        </label>
        <label className={label}>{agent ? 'Hotel bookings a month (roughly)' : 'Hotel stays a month (roughly)'}
          <select className={input} value={prof.monthlyBookings || ''} onChange={(e) => set('businessProfile', { ...prof, monthlyBookings: e.target.value })}>
            <option value="">Choose…</option>{MONTHLY_BOOKINGS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
        {agent && (
          <label className={label}>How you'd like to sell
            <select className={input} value={prof.pricingPreference || ''} onChange={(e) => set('businessProfile', { ...prof, pricingPreference: e.target.value })}>{PRICING_PREFERENCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </label>
        )}
      </Section>
    </div>
  );
};

export default BusinessDetailsFields;
