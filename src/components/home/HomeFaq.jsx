import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';

/**
 * Questions guests ask before booking, answered from how the platform works (see the Help page and
 * Terms). Also published as FAQPage structured data so search engines can show the answers.
 */
const FAQS = [
  ['Is the price I see the price I pay?', 'Yes. The total at checkout includes GST and any discounts that apply, and that total is what you pay. Prices on search results are per night before GST, and the hotel page shows the full total for your dates.'],
  ['Can I pay at the hotel?', 'Yes. You can pay the full amount now (often at a lower price), pay part now and the rest at the hotel, or book now and pay at the hotel. You choose at checkout.'],
  ['How do I cancel, and how do refunds work?', 'Open the booking in My Bookings and choose Cancel. You see any cancellation charge and your refund before you confirm. Refunds go back to your payment method (usually 5–7 working days) or, if you prefer, to Zivo Cash instantly.'],
  ['Which rates have free cancellation?', 'Each rate shows its cancellation policy next to the price and again at checkout. Free-cancellation rates can be cancelled at no cost until the time shown. Zivo Prime members get extra time on eligible rates.'],
  ['Are hotels couple-friendly, and is a local ID accepted?', 'This depends on each hotel. Its house rules, including whether unmarried couples are welcome and which IDs are accepted (and whether local IDs are allowed), are shown on the hotel page under Policies.'],
  ['Can I get a GST invoice for my company?', 'Yes. Tick "Add company / GST details" at checkout and enter your company name and GSTIN.'],
  ['What is Zivo Cash?', 'Your ZivoHotels balance. Refunds you choose to receive there arrive instantly, and you can use it on any ZivoHotels booking. It can’t be withdrawn or transferred.'],
  ['How do Zivo Rewards points work?', 'You earn points on completed stays and can use them at checkout on a later booking. Membership is free with an account and also unlocks member prices at hotels that offer them.'],
  ['I own a hotel. How can I list it?', 'Write to partners@zivohotels.com. Once listed, you manage rooms, rates, bookings and payouts in the ZivoHotels Extranet.'],
];

const HomeFaq = () => {
  useEffect(() => {
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = 'home-faq-jsonld';
    el.text = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQS.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
    document.getElementById('home-faq-jsonld')?.remove();
    document.head.appendChild(el);
    return () => el.remove();
  }, []);

  return (
    <section className="py-14 bg-white" aria-labelledby="faq-heading">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <h2 id="faq-heading" className="text-2xl md:text-3xl font-bold text-navy-900 mb-6 text-center">Questions guests ask</h2>
        <div className="divide-y divide-gray-200 border-y border-gray-200">
          {FAQS.map(([q, a]) => (
            <details key={q} className="group py-1">
              <summary className="flex items-center justify-between gap-4 cursor-pointer list-none py-4 font-semibold text-gray-900 hover:text-navy-700 [&::-webkit-details-marker]:hidden">
                {q}
                <ChevronDown size={20} className="shrink-0 text-gray-500 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <p className="pb-4 text-gray-700 leading-relaxed">{a}</p>
            </details>
          ))}
        </div>
        <p className="mt-6 text-center text-gray-600">More answers in the <Link to="/help" className="font-semibold text-navy-700 underline">Help centre</Link>.</p>
      </div>
    </section>
  );
};

export default HomeFaq;
