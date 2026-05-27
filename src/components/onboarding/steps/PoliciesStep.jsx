import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';

/* ── Helpers ────────────────────────────────────────────────── */
const CHECK_IN_TIMES  = ['12:00 am','01:00 am','02:00 am','03:00 am','04:00 am','05:00 am','06:00 am','07:00 am','08:00 am','09:00 am','10:00 am','11:00 am','12:00 pm','01:00 pm','02:00 pm','03:00 pm','04:00 pm','05:00 pm','06:00 pm','07:00 pm','08:00 pm','09:00 pm','10:00 pm','11:00 pm'];
const CHECK_OUT_TIMES = [...CHECK_IN_TIMES];

const IDENTITY_PROOF_OPTIONS = [
  'Passport','Aadhar Card','Driving License','Voter ID','PAN Card','Government ID'
];

/* ── Sub-components ─────────────────────────────────────────── */

// Yes/No radio pair
const YesNo = ({ value, onChange }) => (
  <div className="flex items-center gap-3 shrink-0">
    {['No','Yes'].map(opt => (
      <label key={opt} className="flex items-center gap-1.5 cursor-pointer">
        <div
          onClick={() => onChange(opt)}
          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center cursor-pointer transition-colors ${
            value === opt ? 'border-blue-600' : 'border-gray-300'
          }`}
        >
          {value === opt && <div className="w-2 h-2 rounded-full bg-blue-600" />}
        </div>
        <span className="text-sm text-gray-700">{opt}</span>
      </label>
    ))}
  </div>
);

// Yes/No/Subject-to-availability triple
const YesNoAvail = ({ value, onChange }) => (
  <div className="flex items-center gap-3 shrink-0 flex-wrap">
    {['No','Yes','Subject to availability'].map(opt => (
      <label key={opt} className="flex items-center gap-1.5 cursor-pointer">
        <div
          onClick={() => onChange(opt)}
          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center cursor-pointer transition-colors ${
            value === opt ? 'border-blue-600' : 'border-gray-300'
          }`}
        >
          {value === opt && <div className="w-2 h-2 rounded-full bg-blue-600" />}
        </div>
        <span className="text-sm text-gray-700">{opt}</span>
      </label>
    ))}
  </div>
);

// Collapsible section
const Section = ({ icon, title, badge, badgeCount, badgeTotal, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 bg-white hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{icon}</span>
          <span className="font-semibold text-gray-800 text-sm">{title}</span>
          {badgeCount !== undefined && (
            <span className="text-[11px] font-bold text-red-500 bg-red-50 border border-red-100 rounded px-1.5 py-0.5 ml-1">
              {badgeCount}/{badgeTotal} RULES ADDED
            </span>
          )}
        </div>
        {open ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
      </button>
      {open && (
        <div className="border-t border-gray-100 divide-y divide-gray-100">
          {children}
        </div>
      )}
    </div>
  );
};

// A rule row: question + yes/no (or custom)
const RuleRow = ({ label, children }) => (
  <div className="flex items-center justify-between px-5 py-4 gap-4">
    <span className="text-sm text-gray-700 leading-snug flex-1">{label}</span>
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
    <div className="p-6 md:p-8 space-y-6 animate-fade-in">
      <div className="mb-2">
        <h2 className="text-xl font-bold text-gray-900">Policies</h2>
        <p className="text-sm text-gray-500 mt-1">Mention all the policies applicable at your property.</p>
      </div>

      {/* ── 1. Check-in & Check-out Time ─────────────────── */}
      <div className="border border-gray-200 rounded-lg p-5 bg-white">
        <h3 className="font-semibold text-gray-800 text-sm mb-1">Check-in &amp; Check-out Time</h3>
        <p className="text-xs text-gray-500 mb-5">Specify the check-in &amp; check-out time at your property</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm text-gray-600 mb-1.5">Check-in Time</label>
            <div className="relative">
              <select
                value={timeToLabel(formData.checkInTime || '14:00')}
                onChange={e => updateForm('checkInTime', labelToTime(e.target.value))}
                className="w-full appearance-none border border-gray-300 rounded-md px-4 py-2.5 text-sm text-gray-800 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none pr-10"
              >
                {CHECK_IN_TIMES.map(t => <option key={t}>{t}</option>)}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1.5">Check-out Time</label>
            <div className="relative">
              <select
                value={timeToLabel(formData.checkOutTime || '11:00')}
                onChange={e => updateForm('checkOutTime', labelToTime(e.target.value))}
                className="w-full appearance-none border border-gray-300 rounded-md px-4 py-2.5 text-sm text-gray-800 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none pr-10"
              >
                {CHECK_OUT_TIMES.map(t => <option key={t}>{t}</option>)}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. Cancellation Policy ───────────────────────── */}
      <div className="border border-gray-200 rounded-lg p-5 bg-white">
        <h3 className="font-semibold text-gray-800 text-sm mb-1">Cancellation Policy</h3>
        <p className="text-xs text-gray-500 mb-5">Offering a flexible cancellation policy helps traveller book in advance.</p>

        <div className="space-y-3">
          {[
            { id: 'FREE_CANCEL_CHECKIN', label: 'Free Cancellation till check-in', recommended: true, refundEnd: 100, nonRefundStart: 100 },
            { id: 'FREE_CANCEL_24H',     label: 'Free Cancellation till 24 hours before check-in', showBar: true },
            { id: 'FREE_CANCEL_48H',     label: 'Free Cancellation till 48 hours before check-in' },
            { id: 'FREE_CANCEL_72H',     label: 'Free Cancellation till 72 hours before check-in' },
            { id: 'NON_REFUNDABLE',      label: 'Non-Refundable' },
          ].map(opt => (
            <div key={opt.id}>
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => {
                    setCancellationPolicy(opt.id);
                    updateForm('cancellationPolicy', opt.id);
                  }}
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 cursor-pointer ${
                    cancellationPolicy === opt.id ? 'border-blue-600' : 'border-gray-300'
                  }`}
                >
                  {cancellationPolicy === opt.id && <div className="w-2 h-2 rounded-full bg-blue-600" />}
                </div>
                <span className="text-sm text-gray-800">{opt.label}</span>
                {opt.recommended && (
                  <span className="text-[10px] font-bold text-green-600 border border-green-200 bg-green-50 px-2 py-0.5 rounded">RECOMMENDED</span>
                )}
              </label>

              {/* Visual refund timeline bar for selected 24h option */}
              {opt.showBar && cancellationPolicy === opt.id && (
                <div className="ml-7 mt-3 mb-1">
                  <div className="rounded overflow-hidden flex h-7 text-[11px] font-semibold">
                    <div className="flex-1 bg-orange-400 flex items-center justify-center text-white">100% Refund</div>
                    <div className="flex-1 bg-gray-200 flex items-center justify-center text-gray-600">Non-refundable</div>
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-500 mt-1 px-1">
                    <span className="font-semibold text-gray-700">Booking Date</span>
                    <span className="text-center">24 hours before<br/>check-in</span>
                    <span>Check-in</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Info banner */}
        <div className="mt-5 bg-blue-50 border border-blue-100 rounded-md px-4 py-3 flex items-start gap-2.5">
          <Info size={15} className="text-blue-500 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-800">Selected policy would be applicable to 2 rateplans created. You can modify this policy after completing the listing.</p>
        </div>
      </div>

      {/* ── 3. Property Rules ─────────────────────────────── */}
      <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800 text-sm">Property Rules <span className="text-gray-400 font-normal">(optional)</span></h3>
          <p className="text-xs text-gray-500 mt-0.5">Add property rules basis the requirement of your property listing</p>
        </div>

        <div className="p-4 space-y-3">

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
            <div className="px-5 py-4 space-y-3">
              <label className="block text-sm text-gray-700 mb-1">Acceptable Identity Proofs</label>
              <div className="relative">
                <select
                  multiple
                  value={rules.identityProofs || []}
                  onChange={e => setRule('identityProofs', Array.from(e.target.selectedOptions, o => o.value))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-700 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  size={3}
                >
                  {IDENTITY_PROOF_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <p className="text-[10px] text-gray-400 mt-1">Hold Ctrl/Cmd to select multiple</p>
              </div>
            </div>
            <RuleRow label="Are IDs of the same city at the property allowed?">
              <YesNo value={rules.sameCityId} onChange={v => setRule('sameCityId', v)} />
            </RuleRow>
          </Section>

          {/* Property Restrictions */}
          <Section icon="🚫" title="Property Restrictions" badgeCount={countAnswered(['smokingAllowed','partiesAllowed','wheelchairAccessible','outsideVisitors'])} badgeTotal={4}>
            <RuleRow label="Is smoking allowed anywhere within the premises? (Select 'No' if it's not permitted, even in outdoor spaces like balconies or lawns, or any designated smoking area)">
              <YesNo value={rules.smokingAllowed} onChange={v => setRule('smokingAllowed', v)} />
            </RuleRow>
            <RuleRow label="Are Private parties or events allowed at the property?">
              <YesNo value={rules.partiesAllowed} onChange={v => setRule('partiesAllowed', v)} />
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
          <Section icon="🛎" title="Checkin and Checkout Policies" badgeCount={countAnswered(['has24HrCheckin'])} badgeTotal={1}>
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
            <div className="px-5 py-3">
              <p className="text-xs text-gray-500 leading-relaxed">This confirms whether extra bed/mattress is included in the extra adult/paid child rates defined for each rate plan</p>
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
            <div className="px-5 py-4">
              <label className="block text-sm text-gray-700 mb-2">Custom Policy</label>
              <textarea
                rows={4}
                maxLength={3000}
                value={rules.customPolicy || ''}
                onChange={e => setRule('customPolicy', e.target.value)}
                placeholder="Please add details"
                className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm text-gray-700 resize-none focus:ring-2 focus:ring-blue-500 outline-none bg-white placeholder-gray-400"
              />
              <p className="text-right text-xs text-gray-400 mt-1">{(rules.customPolicy || '').length} of 3000</p>
            </div>
          </Section>

          {/* Meal Rack Prices */}
          <Section icon="🍽" title="Meal rack prices" badgeCount={[mealPrices.breakfast, mealPrices.lunch, mealPrices.dinner].filter(Boolean).length} badgeTotal={3}>
            {[
              { key: 'breakfast', label: 'Breakfast' },
              { key: 'lunch',     label: 'Lunch' },
              { key: 'dinner',    label: 'Dinner' },
            ].map(item => (
              <div key={item.key} className="flex items-center justify-between px-5 py-4 gap-4">
                <span className="text-sm text-gray-700">{item.label}</span>
                <div className="relative w-48">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="Enter"
                    value={mealPrices[item.key] || ''}
                    onChange={e => setMealPrice(item.key, e.target.value)}
                    className="w-full border border-gray-300 rounded-md pl-7 pr-3 py-2 text-sm text-gray-700 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
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
