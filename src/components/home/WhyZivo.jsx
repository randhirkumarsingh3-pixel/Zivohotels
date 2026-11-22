import { Receipt, CalendarX2, Building, Wallet, Crown } from 'lucide-react';

/** What every booking on ZivoPlus gets: only promises the platform actually keeps. */
const POINTS = [
  { icon: Receipt, title: 'The price you see', text: 'Totals include GST before you pay. No surprise charges at checkout.' },
  { icon: CalendarX2, title: 'Free cancellation', text: 'On many rates, clearly marked next to the price.' },
  { icon: Building, title: 'Reserve now, pay later', text: 'Hold your rooms now and pay online before the deadline, or pay part now and the rest at the hotel.' },
  { icon: Wallet, title: 'Instant refunds', text: 'Choose Zivo Cash and your refund arrives at once.' },
  { icon: Crown, title: 'Member prices', text: 'Free membership unlocks lower prices and Rewards points.' },
];

const WhyZivo = () => (
  <section className="py-14 bg-navy-900 text-white" aria-labelledby="why-heading">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <h2 id="why-heading" className="text-2xl md:text-3xl font-bold mb-8">Why book with ZivoPlus</h2>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
        {POINTS.map((p) => (
          <li key={p.title} className="flex lg:flex-col gap-3">
            <span className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center shrink-0"><p.icon size={22} aria-hidden="true" /></span>
            <div>
              <h3 className="font-bold">{p.title}</h3>
              <p className="text-sm text-navy-100 mt-1 leading-relaxed">{p.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  </section>
);

export default WhyZivo;
