import { FlaskConical } from 'lucide-react';

/**
 * Shown at the top of console pages that aren't connected to live data yet. Their figures are
 * examples, and nobody should act on them (freeze payouts, chase fraud, change prices).
 */
const SampleDataNotice = ({ what = 'This page' }) => (
  <div role="note" className="mb-6 flex items-start gap-3 rounded-card border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
    <FlaskConical size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
    <div className="text-sm leading-relaxed">
      <p className="font-bold">Preview with sample data</p>
      <p>{what} isn&apos;t connected to live data yet. The figures below are examples, not your real numbers. Don&apos;t act on them.</p>
    </div>
  </div>
);

export default SampleDataNotice;
