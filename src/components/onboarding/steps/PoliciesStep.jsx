import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';

/* ── Helpers ────────────────────────────────────────────────── */
const CHECK_IN_TIMES  = ['12:00 am','01:00 am','02:00 am','03:00 am','04:00 am','05:00 am','06:00 am','07:00 am','08:00 am','09:00 am','10:00 am','11:00 am','12:00 pm','01:00 pm','02:00 pm','03:00 pm','04:00 pm','05:00 pm','06:00 pm','07:00 pm','08:00 pm','09:00 pm','10:00 pm','11:00 pm'];
const CHECK_OUT_TIMES = [...CHECK_IN_TIMES];

const IDENTITY_PROOF_OPTIONS = [
  'Passport','Aadhar Card','Driving License','Voter ID','PAN Card','Government ID'
];

/* ── Sub-components ─────────────────────────────────────────── */

const YesNo = ({ value, onChange }) => (
  <div className="flex items-center gap-4 shrink-0">
    {['No','Yes'].map(opt => (
      <label key={opt} className="flex items-center gap-2 cursor-pointer group">
        <div
          onClick={() => onChange(opt)}
          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center cursor-pointer transition-all ${
            value === opt ? 'border-blue-600 bg-blue-50' : 'border-slate-300 group-hover:border-blue-400'
          }`}
        >
          {value === opt && <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />}
        </div>
        <span className="text-sm font-medium text-slate-700 select-none">{opt}</span>
      </label>
    ))}
  </div>
);

const YesNoAvail = ({ value, onChange }) => (
  <div className="flex items-center gap-4 shrink-0 flex-wrap">
    {['No','Yes','Subject to availability'].map(opt => (
      <label key={opt} className="flex items-center gap-2 cursor-pointer group">
        <div
          onClick={() => onChange(opt)}
          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center cursor-pointer transition-all ${
            value === opt ? 'border-blue-600 bg-blue-50' : 'border-slate-300 group-hover:border-blue-400'
          }`}
        >
          {value === opt && <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />}
        </div>
        <span className="text-sm font-medium text-slate-700 select-none">{opt}</span>
      </label>
    ))}
  </div>
);

const Section = ({ icon, title, badge, badgeCount, badgeTotal, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-2 border-slate-200 rounded-xl overflow-hidden mb-4 shadow-sm bg-white">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 bg-white hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-4">
          <span className="text-2xl">{icon}</span>
          <span className="font-extrabold text-slate-800 text-base">{title}</span>
          {badgeCount !== undefined && (
            <span className="text-xs font-black text-red-500 bg-red-50 border border-red-100 rounded-md px-2 py-1 ml-2 tracking-wider">
              {badgeCount}/{badgeTotal} RULES ADDED
            </span>
          )}
        </div>
        <div className="p-1.5 rounded-full bg-slate-100 text-slate-500">
          {open ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </div>
      </button>
      {open && (
        <div className="border-t-2 border-slate-100 divide-y-2 divide-slate-100 pb-2">
          {children}
        </div>
      )}
    </div>
  );
};

const RuleRow = ({ label, children }) => (
  <div className="flex items-center justify-between px-6 py-5 gap-6 hover:bg-slate-50/50 transition-colors">
    <span className="text-sm font-medium text-slate-700 leading-relaxed flex-1">{label}</span>
    {children}
  </div>
);

/* ── Main Component ─────────────────────────────────────────── */
const PoliciesStep = ({ formData, updateForm }) => {

  /* ── local state for all policy sub-fields ── */
  const [cancellationPolicy, setCancellationPolicy] = useState(
    formData.cancellationPolicy || 'FREE_CANCEL_24H'
  );

  // Helper to read/write nested policy rules from formData.policyRules object
  const rules = formData.policyRules || {};
  const setRule = (key, val) => updateForm('policyRules', { ...rules, [key]: val });

  // Check-in / check-out formatted time helpers
  const timeToLabel = (t24) => {
    if (!t24) return '';
    const [h, m] = t24.split(':').map(Number);
    const suffix = h < 12 ? 'am' : 'pm';
    const hr = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${String(hr).padStart(2,'0')}:${String(m).padStart(2,'0')} ${suffix}`;
  };
  const labelToTime = (label) => {
    const [time, suffix] = label.split(' ');
    let [h, m] = time.split(':').map(Number);
    if (suffix === 'pm' && h !== 12) h += 12;
    if (suffix === 'am' && h === 12) h = 0;
    return `${String(h).padStart(2,'0')}:${m || '00'}`;
  };

  // Count answered rules per section
  const countAnswered = (keys) => keys.filter(k => rules[k] !== undefined && rules[k] !== '').length;

  // Meal prices
  const mealPrices = formData.mealPrices || {};
  const setMealPrice = (key, val) => updateForm('mealPrices', { ...mealPrices, [key]: val });

  return (
    <div className="p-4 sm:p-8 space-y-8 animate-fade-in pb-24">
      <div className="mb-8">
        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">House Rules</h2>
        <p className="text-lg text-slate-500 mt-2">Mention all the policies applicable at your property.</p>
      </div>

      {/* ── 1. Check-in & Check-out Time ─────────────────── */}
      <div className="border-2 border-slate-200 rounded-2xl p-6 bg-white shadow-sm">
        <h3 className="font-extrabold text-slate-800 text-lg mb-1">Check-in &amp; Check-out Time</h3>
        <p className="text-sm text-slate-500 mb-6 font-medium">Specify the check-in &amp; check-out time at your property</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Check-in Time</label>
            <div className="relative">
              <select
                value={timeToLabel(formData.checkInTime || '14:00')}
                onChange={e => updateForm('checkInTime', labelToTime(e.target.value))}
                className="w-full appearance-none border-2 border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 bg-slate-50 focus:bg-white focus:ring-0 focus:border-blue-500 outline-none pr-10 transition-colors shadow-sm cursor-pointer"
              >
                {CHECK_IN_TIMES.map(t => <option key={t}>{t}</option>)}
              </select>
              <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Check-out Time</label>
            <div className="relative">
              <select
                value={timeToLabel(formData.checkOutTime || '11:00')}
                onChange={e => updateForm('checkOutTime', labelToTime(e.target.value))}
                className="w-full appearance-none border-2 border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 bg-slate-50 focus:bg-white focus:ring-0 focus:border-blue-500 outline-none pr-10 transition-colors shadow-sm cursor-pointer"
              >
                {CHECK_OUT_TIMES.map(t => <option key={t}>{t}</option>)}
              </select>
              <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. Cancellation Policy ───────────────────────── */}
      <div className="border-2 border-slate-200 rounded-2xl p-6 bg-white shadow-sm">
        <h3 className="font-extrabold text-slate-800 text-lg mb-1">Cancellation Policy</h3>
        <p className="text-sm text-slate-500 mb-6 font-medium">Offering a flexible cancellation policy helps travellers book in advance.</p>

        <div className="space-y-4">
          {[
            { id: 'FREE_CANCEL_CHECKIN', label: 'Free Cancellation till check-in', recommended: true, refundEnd: 100, nonRefundStart: 100 },
            { id: 'FREE_CANCEL_24H',     label: 'Free Cancellation till 24 hours before check-in', showBar: true },
            { id: 'FREE_CANCEL_48H',     label: 'Free Cancellation till 48 hours before check-in' },
            { id: 'FREE_CANCEL_72H',     label: 'Free Cancellation till 72 hours before check-in' },
            { id: 'NON_REFUNDABLE',      label: 'Non-Refundable' },
          ].map(opt => (
            <div key={opt.id}>
              <label className="flex items-center gap-3 cursor-pointer group select-none">
                <div
                  onClick={() => {
                    setCancellationPolicy(opt.id);
                    updateForm('cancellationPolicy', opt.id);
                  }}
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 cursor-pointer transition-all ${
                    cancellationPolicy === opt.id ? 'border-blue-600 bg-blue-50' : 'border-slate-300 group-hover:border-blue-400'
                  }`}
                >
                  {cancellationPolicy === opt.id && <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />}
                </div>
                <span className="text-sm font-semibold text-slate-800">{opt.label}</span>
                {opt.recommended && (
                  <span className="text-[10px] font-black tracking-wider text-green-700 border border-green-300 bg-green-50 px-2.5 py-1 rounded-md ml-2">RECOMMENDED</span>
                )}
              </label>

              {/* Visual refund timeline bar for selected 24h option */}
              {opt.showBar && cancellationPolicy === opt.id && (
                <div className="ml-8 mt-4 mb-2 max-w-lg">
                  <div className="rounded-lg overflow-hidden flex h-8 text-[11px] font-black tracking-widest shadow-inner">
                    <div className="flex-1 bg-amber-500 flex items-center justify-center text-white">100% REFUND</div>
                    <div className="flex-1 bg-slate-200 flex items-center justify-center text-slate-600">NON-REFUNDABLE</div>
                  </div>
                  <div className="flex justify-between text-[11px] font-bold text-slate-500 mt-2 px-1">
                    <span>Booking Date</span>
                    <span className="text-center">24 hours before<br/>check-in</span>
                    <span>Check-in</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Info banner */}
        <div className="mt-8 bg-blue-50 border-2 border-blue-100 rounded-xl px-5 py-4 flex items-start gap-3 shadow-sm">
          <Info size={18} className="text-blue-500 shrink-0 mt-0.5" />
          <p className="text-sm font-medium text-blue-900 leading-snug">Selected policy would be applicable to 2 rateplans created. You can modify this policy after completing the listing.</p>
        </div>
      </div>

      {/* ── 3. Property Rules ─────────────────────────────── */}
      <div className="border-2 border-slate-200 rounded-2xl bg-white overflow-hidden shadow-sm">
        <div className="px-6 py-5 border-b-2 border-slate-100">
          <h3 className="font-extrabold text-slate-900 text-lg">Property Rules <span className="text-slate-400 font-medium">(optional)</span></h3>
          <p className="text-sm text-slate-500 mt-1 font-medium">Add property rules based on the requirements of your property listing.</p>
        </div>

        <div className="p-6">

          {/* Guest Profile */}
          <Section icon="🚶" title="Guest Profile" badgeCount={countAnswered(['unmarriedCouples','guestsBelow18','maleGroupsAllowed'])} badgeTotal={3}>
            <RuleRow label="Do you allow unmarried couples?">
              <YesNo value={rules.unmarriedCouples} onChange={v => setRule('unmarriedCouples', v)} />
            </RuleRow>
            <RuleRow label="Do you allow guests below 18 years of age at your property?">
              <YesNo value={rules.guestsBelow18} onChange={v => setRule('guestsBelow18', v)} />
            </RuleRow>
            <RuleRow label="Groups with only male guests are allowed at your property?">
              <YesNo value={rules.maleGroupsAllowed} onChange={v => setRule('maleGroupsAllowed', v)} />
            </RuleRow>
          </Section>

          {/* Acceptable Identity Proofs */}
          <Section icon="🪪" title="Acceptable Identity Proofs" badgeCount={countAnswered(['identityProofs','sameCityId'])} badgeTotal={2}>
            <div className="px-6 py-5 space-y-3">
              <label className="block text-sm font-bold text-slate-700 mb-2">Acceptable Identity Proofs</label>
              <div className="relative">
                <select
                  multiple
                  value={rules.identityProofs || []}
                  onChange={e => setRule('identityProofs', Array.from(e.target.selectedOptions, o => o.value))}
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 bg-slate-50 focus:bg-white focus:ring-0 focus:border-blue-500 outline-none custom-scrollbar"
                  size={4}
                >
                  {IDENTITY_PROOF_OPTIONS.map(p => <option key={p} value={p} className="py-1 px-2 rounded hover:bg-blue-50 font-medium mb-1">{p}</option>)}
                </select>
                <p className="text-xs font-semibold text-slate-400 mt-2 flex items-center gap-1.5">
                  <Info size={14} /> Hold Ctrl/Cmd to select multiple
                </p>
              </div>
            </div>
            <RuleRow label="Are IDs of the same city at the property allowed?">
              <YesNo value={rules.sameCityId} onChange={v => setRule('sameCityId', v)} />
            </RuleRow>
          </Section>

          {/* Property Restrictions */}
          <Section icon="🚫" title="Property Restrictions" badgeCount={countAnswered(['smokingAllowed','partiesAllowed','wheelchairAccessible','outsideVisitors', 'alcoholAllowed'])} badgeTotal={5}>
            <RuleRow label="Is smoking allowed anywhere within the premises?">
              <YesNo value={rules.smokingAllowed} onChange={v => setRule('smokingAllowed', v)} />
            </RuleRow>
            <RuleRow label="Are private parties or events allowed at the property?">
              <YesNo value={rules.partiesAllowed} onChange={v => setRule('partiesAllowed', v)} />
            </RuleRow>
            <RuleRow label="Is alcohol consumption allowed on the property?">
              <YesNo value={rules.alcoholAllowed} onChange={v => setRule('alcoholAllowed', v)} />
            </RuleRow>
            <RuleRow label="Is your property accessible for guests who use a wheelchair?">
              <YesNo value={rules.wheelchairAccessible} onChange={v => setRule('wheelchairAccessible', v)} />
            </RuleRow>
            <RuleRow label="Can guests invite any outside visitors in the room during their stay?">
              <YesNo value={rules.outsideVisitors} onChange={v => setRule('outsideVisitors', v)} />
            </RuleRow>
          </Section>

          {/* Pet Policy */}
          <Section icon="🐾" title="Pet Policy" badgeCount={countAnswered(['petsOnProperty','petsAllowed'])} badgeTotal={2}>
            <RuleRow label="Any Pet(s) living on the property?">
              <YesNo value={rules.petsOnProperty} onChange={v => setRule('petsOnProperty', v)} />
            </RuleRow>
            <RuleRow label="Are Pets Allowed?">
              <YesNo value={rules.petsAllowed} onChange={v => setRule('petsAllowed', v)} />
            </RuleRow>
          </Section>

          {/* Checkin and Checkout Policies */}
          <Section icon="🛎" title="Check-in and Check-out Policies" badgeCount={countAnswered(['has24HrCheckin'])} badgeTotal={1}>
            <RuleRow label="Do you have a 24-hour check-in?">
              <YesNo value={rules.has24HrCheckin} onChange={v => setRule('has24HrCheckin', v)} />
            </RuleRow>
          </Section>

          {/* Infant Policy */}
          <Section icon="👶" title="Infant Policy" badgeCount={countAnswered(['infantIncluded','infantFood'])} badgeTotal={2}>
            <RuleRow label="Do you want to include 1 infant (0-2 yrs) per room without counting them in total room occupancy?">
              <YesNo value={rules.infantIncluded} onChange={v => setRule('infantIncluded', v)} />
            </RuleRow>
            <RuleRow label="Do you provide complimentary food item(s) like warm milk for infants (0-2 yrs) on request?">
              <YesNo value={rules.infantFood} onChange={v => setRule('infantFood', v)} />
            </RuleRow>
          </Section>

          {/* Extra Bed Inclusion Policy */}
          <Section icon="🛏" title="Extra Bed Inclusion Policy" badgeCount={countAnswered(['extraBedInRates'])} badgeTotal={1}>
            <div className="px-6 py-4 bg-slate-50 border-b-2 border-slate-100">
              <p className="text-sm font-medium text-slate-600 leading-relaxed">This confirms whether extra bed/mattress is included in the extra adult/paid child rates defined for each rate plan.</p>
            </div>
            <RuleRow label="Is extra bed/mattress included in extra adult/paid child rates?">
              <YesNo value={rules.extraBedInRates} onChange={v => setRule('extraBedInRates', v)} />
            </RuleRow>
          </Section>

          {/* Extra Bed Policies */}
          <Section icon="🛌" title="Extra Bed Policies" badgeCount={countAnswered(['extraBedAdults','extraBedKids'])} badgeTotal={2}>
            <RuleRow label="Do you provide bed to extra adults?">
              <YesNoAvail value={rules.extraBedAdults} onChange={v => setRule('extraBedAdults', v)} />
            </RuleRow>
            <RuleRow label="Do you provide bed to extra kids?">
              <YesNoAvail value={rules.extraBedKids} onChange={v => setRule('extraBedKids', v)} />
            </RuleRow>
          </Section>

          {/* Custom Policy */}
          <Section icon="📝" title="Custom Policy" badgeCount={countAnswered(['customPolicy'])} badgeTotal={1}>
            <div className="px-6 py-5">
              <label className="block text-sm font-bold text-slate-700 mb-3">Custom Policy</label>
              <textarea
                rows={4}
                maxLength={3000}
                value={rules.customPolicy || ''}
                onChange={e => setRule('customPolicy', e.target.value)}
                placeholder="Please add details..."
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 resize-none focus:bg-white focus:ring-0 focus:border-blue-500 outline-none bg-slate-50 placeholder-slate-400 transition-colors shadow-sm"
              />
              <p className="text-right text-xs font-bold text-slate-400 mt-2 tracking-wider">{(rules.customPolicy || '').length} / 3000</p>
            </div>
          </Section>

          {/* Meal Rack Prices */}
          <Section icon="🍽" title="Meal Rack Prices" badgeCount={[mealPrices.breakfast, mealPrices.lunch, mealPrices.dinner].filter(Boolean).length} badgeTotal={3}>
            {[
              { key: 'breakfast', label: 'Breakfast' },
              { key: 'lunch',     label: 'Lunch' },
              { key: 'dinner',    label: 'Dinner' },
            ].map(item => (
              <div key={item.key} className="flex items-center justify-between px-6 py-4 gap-4 hover:bg-slate-50 transition-colors">
                <span className="text-sm font-bold text-slate-700">{item.label}</span>
                <div className="relative w-48">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400 text-sm">₹</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="Enter Price"
                    value={mealPrices[item.key] || ''}
                    onChange={e => setMealPrice(item.key, e.target.value)}
                    className="w-full border-2 border-slate-200 rounded-xl pl-8 pr-4 py-2.5 text-sm font-bold text-slate-800 focus:bg-white focus:ring-0 focus:border-blue-500 outline-none bg-slate-50 transition-colors shadow-sm"
                  />
                </div>
              </div>
            ))}
          </Section>

        </div>
      </div>
    </div>
  );
};

export default PoliciesStep;
