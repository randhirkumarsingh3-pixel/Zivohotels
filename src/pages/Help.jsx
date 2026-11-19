import { useEffect } from 'react';
import SupportContacts from '../components/SupportContacts';
import { Link, useLocation } from 'react-router-dom';
import { Mail, CalendarX2, CreditCard, Wallet, Award, Building2, ChevronRight } from 'lucide-react';
import usePageTitle from '../hooks/usePageTitle';

/**
 * Help & contact: how cancellations, refunds and payments work on ZivoHotels, and who to write
 * to. Linked from the footer and from checkout ("Cancellation rules").
 */
const Section = ({ id, icon: Icon, title, children }) => (
  <section id={id} className="bg-white border border-gray-200 rounded-card p-6 sm:p-8 scroll-mt-28">
    <h2 className="flex items-center gap-3 text-xl font-bold text-navy-900 mb-4">
      <span className="w-10 h-10 rounded-lg bg-navy-50 text-navy-700 flex items-center justify-center shrink-0"><Icon size={20} /></span>
      {title}
    </h2>
    <div className="space-y-3 text-gray-700 leading-relaxed max-w-3xl">{children}</div>
  </section>
);

const Help = () => {
  usePageTitle('Help centre');
  const { hash } = useLocation();
  useEffect(() => {
    // Footer links point at a topic (/help#cancellations): bring it into view
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
    else window.scrollTo(0, 0);
  }, [hash]);
  return (
  <div className="pt-28 pb-20 bg-gray-50 min-h-screen">
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
      <div className="mb-2">
        <p className="text-sm font-semibold text-brand-700 uppercase tracking-wider">Help centre</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-navy-900 mt-1">How can we help?</h1>
        <p className="text-gray-600 mt-2 max-w-2xl">Cancellations, refunds, payments and your account. For anything about a booking, open it in <Link to="/my-bookings" className="text-navy-700 font-semibold underline">My Bookings</Link> first: you can cancel, download the voucher and see the hotel&apos;s policy there.</p>
      </div>

      <nav aria-label="Help topics" className="flex flex-wrap gap-2">
        {[['cancellations', 'Cancellations & refunds'], ['payments', 'Payments'], ['zivo-cash', 'Zivo Cash'], ['rewards', 'Rewards & membership'], ['hotels', 'For hotels'], ['contact', 'Contact us']].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="px-3 py-1.5 rounded-full bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:border-navy-300 hover:text-navy-800">{label}</a>
        ))}
      </nav>

      <Section id="cancellations" icon={CalendarX2} title="Cancellations & refunds">
        <p>Each rate has its own cancellation policy, shown next to the price on the hotel page and again at checkout before you pay. Free-cancellation rates can be cancelled at no cost until the time shown; after that, or on a non-refundable rate, the hotel&apos;s cancellation charge applies.</p>
        <p>To cancel, go to <Link to="/my-bookings" className="text-navy-700 font-semibold underline">My Bookings</Link>, open the booking and choose <strong>Cancel</strong>. Before you confirm, you&apos;ll see exactly how much comes back.</p>
        <p>You choose where the refund goes: back to your original payment method, or to <strong>Zivo Cash</strong>, where it arrives instantly. Refunds to a card or UPI usually take 5–7 working days, depending on your bank.</p>
        <p>Zivo Prime members get a longer free-cancellation window on eligible rates.</p>
      </Section>

      <Section id="payments" icon={CreditCard} title="Payments">
        <p>Depending on the hotel, you can pay the full amount now (often at a lower price), pay part now and the rest at the hotel, or book now and pay at the hotel.</p>
        <p>The total at checkout includes GST. What you see before you pay is what you pay. If you need a GST invoice for your company, tick <strong>Add company / GST details</strong> at checkout.</p>
      </Section>

      <Section id="zivo-cash" icon={Wallet} title="Zivo Cash">
        <p>Zivo Cash is your ZivoHotels wallet. Refunds you choose to receive there, and the unused part of a payment made with it, are added instantly. Use it on any ZivoHotels booking by ticking <strong>Pay with Zivo Cash</strong> at checkout. It can&apos;t be topped up, withdrawn or transferred.</p>
        <p><Link to="/wallet" className="text-navy-700 font-semibold inline-flex items-center gap-1">See your balance <ChevronRight size={16} /></Link></p>
      </Section>

      <Section id="rewards" icon={Award} title="Rewards & membership">
        <p>You earn Zivo Rewards points on every completed stay and can use them at checkout. Membership is free with your account and unlocks member prices at hotels that offer them; Zivo Prime adds extra savings.</p>
        <p className="flex flex-wrap gap-4">
          <Link to="/rewards" className="text-navy-700 font-semibold inline-flex items-center gap-1">Zivo Rewards <ChevronRight size={16} /></Link>
          <Link to="/membership" className="text-navy-700 font-semibold inline-flex items-center gap-1">Membership <ChevronRight size={16} /></Link>
        </p>
      </Section>

      <Section id="hotels" icon={Building2} title="For hotels">
        <p>List your property, manage rooms, rates and bookings, and track payouts in the ZivoHotels Extranet.</p>
        <p><Link to="/extranet/login" className="text-navy-700 font-semibold inline-flex items-center gap-1">Go to the Extranet <ChevronRight size={16} /></Link></p>
      </Section>

      <Section id="contact" icon={Mail} title="Contact us">
        <p>Call, WhatsApp or write to us and include your booking ID (for example ZIVO-7KQ3MX9P) so we can help faster. For requests about your stay (late arrival, early check-in, airport pickup), use <span className="font-semibold">Requests to the hotel</span> in My Bookings.</p>
        <div className="max-w-md"><SupportContacts /></div>
      </Section>
    </div>
  </div>
  );
};

export default Help;
