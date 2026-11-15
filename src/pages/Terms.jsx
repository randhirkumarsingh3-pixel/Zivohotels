import { Link } from 'react-router-dom';
import LegalPage, { LegalSection, Who, GrievanceOfficer } from '../components/legal/LegalPage';
import { LEGAL } from '../constants/legal';

/**
 * Terms of Service for guests (with a short section for hotel partners, whose commercial terms are
 * in their signed agreement). Written from how bookings, payments, refunds, Zivo Cash, Rewards,
 * membership and reviews actually work on the platform.
 */
const SECTIONS = [
  ['about', 'About ZivoHotels'],
  ['account', 'Your account'],
  ['booking', 'Bookings and prices'],
  ['payment', 'Paying'],
  ['cancel', 'Changes, cancellations and refunds'],
  ['stay', 'At the hotel'],
  ['cash', 'Zivo Cash'],
  ['rewards', 'Zivo Rewards and membership'],
  ['reviews', 'Reviews'],
  ['conduct', 'Using the platform fairly'],
  ['partners', 'Hotel partners'],
  ['liability', 'Our responsibility'],
  ['law', 'Law and disputes'],
  ['contact', 'Contact and grievances'],
];

const Terms = () => (
  <LegalPage
    title="Terms of Service"
    intro="These terms apply when you use ZivoHotels to search for, book or manage hotel stays. By creating an account or making a booking you accept them, together with the hotel's own policies shown when you book."
    sections={SECTIONS}
  >
    <LegalSection id="about" title="1. About ZivoHotels">
      <p>The platform is run by <Who />. We let you find and book stays at independent hotels. When you book, your contract for the stay is with the hotel; we arrange the booking and take payment as the hotel&apos;s agent where you pay online.</p>
    </LegalSection>

    <LegalSection id="account" title="2. Your account">
      <p>You must be 18 or older and give accurate details. Keep your password private; you&apos;re responsible for bookings made from your account. If you think someone else has used it, change your password (this signs out other devices) and tell us. We may suspend accounts used for fraud or abuse.</p>
    </LegalSection>

    <LegalSection id="booking" title="3. Bookings and prices">
      <ul className="list-disc pl-5 space-y-1">
        <li>Prices are per room for the dates and guests you choose. The total at checkout includes GST and any discounts that apply (offers, member prices, Zivo Rewards points, pay-now savings). That total is what you pay.</li>
        <li>Each rate shows its meal plan and cancellation policy next to the price and again at checkout. Read them before you book.</li>
        <li>A booking is confirmed when you receive a confirmation with a booking ID (for example ZIVO-123456). Unpaid online bookings that aren&apos;t completed within the payment window are released.</li>
        <li>If a price or availability is clearly wrong because of a technical error, we may cancel the booking and refund you in full.</li>
      </ul>
    </LegalSection>

    <LegalSection id="payment" title="4. Paying">
      <p>Depending on the hotel you can pay in full now, pay part now and the rest at the hotel, or pay at the hotel. Online payments are processed by Razorpay. You can use Zivo Cash for all or part of an online payment.</p>
    </LegalSection>

    <LegalSection id="cancel" title="5. Changes, cancellations and refunds">
      <ul className="list-disc pl-5 space-y-1">
        <li>Cancel from <Link to="/my-bookings" className="text-navy-700 underline">My Bookings</Link>. Before you confirm, you&apos;ll see the cancellation charge (if any) and the refund.</li>
        <li>The rate&apos;s cancellation policy decides the charge. Free-cancellation rates have no charge before the deadline shown. Zivo Prime members get extra free-cancellation time on eligible rates.</li>
        <li>You choose where a refund goes: your original payment method (usually 5–7 working days, depending on your bank) or Zivo Cash (instant).</li>
        <li>If you don&apos;t arrive and haven&apos;t cancelled, the hotel may treat it as a no-show and charge as its policy says.</li>
        <li>If the hotel can&apos;t honour your booking, we&apos;ll refund you in full and help you find another stay.</li>
      </ul>
      <p>More detail: <Link to="/help#cancellations" className="text-navy-700 underline">Cancellations &amp; refunds</Link>.</p>
    </LegalSection>

    <LegalSection id="stay" title="6. At the hotel">
      <p>Hotels may ask for valid photo ID at check-in and apply their house rules (for example check-in times, ID requirements, couples, pets, smoking), which are shown on the hotel page. Extra charges at the hotel, such as minibar or extra services, are between you and the hotel.</p>
    </LegalSection>

    <LegalSection id="cash" title="7. Zivo Cash">
      <p>Zivo Cash is a ZivoHotels balance made up of refunds you chose to receive there and unused amounts returned from bookings. It can be used only for ZivoHotels bookings. It can&apos;t be topped up, withdrawn, transferred or exchanged for cash, and it isn&apos;t a bank account or a prepaid payment instrument.</p>
    </LegalSection>

    <LegalSection id="rewards" title="8. Zivo Rewards and membership">
      <ul className="list-disc pl-5 space-y-1">
        <li>Zivo Rewards points are earned on completed stays and become available after check-out. They can be used at checkout within the limits shown, have no cash value and expire as shown on the <Link to="/rewards" className="text-navy-700 underline">Rewards page</Link>. Points from a cancelled booking are reversed; points you used on it are returned.</li>
        <li>Membership is free with an account. Paid plans such as Zivo Prime run for the period and price shown on the <Link to="/membership" className="text-navy-700 underline">Membership page</Link>; benefits apply to bookings made while the plan is active.</li>
        <li>We may change these programmes with notice. Points and benefits gained through fraud or abuse can be removed.</li>
      </ul>
    </LegalSection>

    <LegalSection id="reviews" title="9. Reviews">
      <p>Only guests who stayed can review, from the day after check-in. Reviews must be honest, about the stay, and free of abusive, discriminatory or personal information. We moderate reviews and may remove ones that break these rules; hotels may reply publicly. By posting, you let us show your review on ZivoHotels with your first name and last initial.</p>
    </LegalSection>

    <LegalSection id="conduct" title="10. Using the platform fairly">
      <p>Don&apos;t make bookings you don&apos;t intend to use, use someone else&apos;s payment details without permission, scrape or overload the site, or try to get around security or pricing. We may cancel bookings and close accounts involved in such use.</p>
    </LegalSection>

    <LegalSection id="partners" title="11. Hotel partners">
      <p>Hotels that list on ZivoHotels also accept the agreement they sign in the Extranet, which sets out commission, payouts and obligations. Hotels must keep rates, availability, photos, policies and legal details accurate and honour confirmed bookings.</p>
    </LegalSection>

    <LegalSection id="liability" title="12. Our responsibility">
      <p>We take care to show accurate information supplied by hotels and to process your bookings and payments correctly. The hotel is responsible for the stay itself. As far as the law allows, we aren&apos;t liable for losses we couldn&apos;t reasonably foresee or that the hotel caused, and our total liability for a booking is limited to the amount you paid for it. Nothing in these terms limits your rights as a consumer under Indian law.</p>
    </LegalSection>

    <LegalSection id="law" title="13. Law and disputes">
      <p>These terms are governed by the laws of India. Please contact us first so we can try to resolve any problem. Disputes not resolved this way go to the courts{LEGAL.jurisdictionCity ? ` at ${LEGAL.jurisdictionCity}` : ''}, without affecting your right to approach a consumer commission.</p>
      <p>We may update these terms; the date at the top shows the latest version, and the version in force when you booked applies to that booking.</p>
    </LegalSection>

    <LegalSection id="contact" title="14. Contact and grievances">
      <p>Grievance officer:</p>
      <GrievanceOfficer />
      <p>Bookings and refunds: <span className="font-semibold select-all">{LEGAL.contacts.bookings}</span> · Hotel partners: <span className="font-semibold select-all">{LEGAL.contacts.partners}</span>. See also our <Link to="/privacy" className="text-navy-700 underline">Privacy Policy</Link>.</p>
    </LegalSection>
  </LegalPage>
);

export default Terms;
