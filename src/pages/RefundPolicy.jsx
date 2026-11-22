import { Link } from 'react-router-dom';
import LegalPage, { LegalSection, Who, GrievanceOfficer } from '../components/legal/LegalPage';
import { LEGAL } from '../constants/legal';

/**
 * Cancellation and refund policy for guests, written from how cancellations, refunds, reserve now
 * pay later, part payments and Zivo Cash actually work on the platform.
 */
const SECTIONS = [
  ['summary', 'In short'],
  ['cancel', 'Cancelling a booking'],
  ['paylater', 'Reserve now, pay later'],
  ['partial', 'Part payments'],
  ['refunds', 'How refunds are paid'],
  ['noshow', 'No-shows and early departure'],
  ['hotel', 'If the hotel can’t honour your booking'],
  ['payments', 'Failed or duplicate payments'],
  ['help', 'Questions and complaints'],
];

const RefundPolicy = () => (
  <LegalPage
    title="Cancellation & Refund Policy"
    intro="How cancellations and refunds work for bookings made on ZivoPlus. The cancellation terms of your rate are shown on the hotel page, at checkout and in your booking, and those terms apply to your booking."
    sections={SECTIONS}
  >
    <LegalSection id="summary" title="1. In short">
      <ul className="list-disc pl-5 space-y-1">
        <li>Your rate&apos;s cancellation policy decides whether a cancellation is free or has a charge. You see the charge and the refund before you confirm a cancellation.</li>
        <li>A <strong>reserve now, pay later</strong> booking is not confirmed until you pay it. If it isn&apos;t paid by the deadline, it is cancelled automatically and nothing is charged.</li>
        <li>Refunds go to your original payment method (usually 5–7 working days) or to Zivo Cash (instant), as you choose.</li>
      </ul>
    </LegalSection>

    <LegalSection id="cancel" title="2. Cancelling a booking">
      <p>Cancel from <Link to="/my-bookings" className="text-navy-700 underline">My Bookings</Link>. Before you confirm, we show the cancellation charge (if any) and the amount refunded.</p>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Free cancellation rates:</strong> no charge before the deadline shown (for example until 24 or 48 hours before check-in). After it, the rate&apos;s charge applies.</li>
        <li><strong>Non-refundable rates:</strong> the amount paid isn&apos;t refunded if you cancel, except where the law or the hotel allows.</li>
        <li><strong>Zivo Prime members</strong> get extra free-cancellation time on eligible rates, as shown at checkout.</li>
        <li>A booking with several rooms is cancelled as a whole.</li>
      </ul>
    </LegalSection>

    <LegalSection id="paylater" title="3. Reserve now, pay later">
      <p>When you choose to reserve now and pay later, we hold the rooms but the booking is <strong>tentative</strong>. Pay online from My Bookings (or the link in our email) by the deadline shown at checkout and in your booking. The deadline is always before your check-in day starts, and we email a reminder before it.</p>
      <ul className="list-disc pl-5 space-y-1">
        <li>Once paid, the booking is confirmed and the rate&apos;s cancellation policy applies like any paid booking.</li>
        <li>If it isn&apos;t paid in time, it is cancelled automatically, the rooms are released and nothing is charged.</li>
        <li>You can cancel a tentative booking yourself at any time before paying, free of charge.</li>
      </ul>
    </LegalSection>

    <LegalSection id="partial" title="4. Part payments">
      <p>If you paid part of the amount online and the rest is due at the hotel, a cancellation charge is taken first from what you paid online; anything paid above the charge is refunded. The part due at the hotel is never charged after a cancellation.</p>
    </LegalSection>

    <LegalSection id="refunds" title="5. How refunds are paid">
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Original payment method:</strong> we start the refund straight away; your bank or card issuer usually shows it within 5–7 working days.</li>
        <li><strong>Zivo Cash:</strong> credited instantly and usable on your next booking.</li>
        <li>Zivo Cash used on a booking is returned to Zivo Cash; reward points used come back to your account.</li>
      </ul>
    </LegalSection>

    <LegalSection id="noshow" title="6. No-shows and early departure">
      <p>If you don&apos;t arrive and haven&apos;t cancelled, the hotel may mark the booking as a no-show and the rate&apos;s cancellation charge applies (for non-refundable rates, the full amount). Leaving early is treated under the hotel&apos;s policy; any refund for unused nights is at the hotel&apos;s discretion.</p>
    </LegalSection>

    <LegalSection id="hotel" title="7. If the hotel can’t honour your booking">
      <p>If the hotel cancels or can&apos;t provide what you booked, you get a full refund of everything you paid, and we&apos;ll help you find another stay.</p>
    </LegalSection>

    <LegalSection id="payments" title="8. Failed or duplicate payments">
      <p>If money is taken but the booking wasn&apos;t confirmed (for example the payment arrived after the booking expired), it is refunded automatically to the original payment method. If you were charged twice, write to us with your booking ID and we&apos;ll refund the duplicate.</p>
    </LegalSection>

    <LegalSection id="help" title="9. Questions and complaints">
      <p>Write to <span className="font-semibold select-all">{LEGAL.contacts.bookings}</span> with your booking ID, or see the <Link to="/help#contact" className="text-navy-700 underline">Help centre</Link>. If you aren&apos;t satisfied with the answer, contact the grievance officer of <Who />:</p>
      <GrievanceOfficer />
      <p>See also our <Link to="/terms" className="text-navy-700 underline">Terms of Service</Link> and <Link to="/privacy" className="text-navy-700 underline">Privacy Policy</Link>.</p>
    </LegalSection>
  </LegalPage>
);

export default RefundPolicy;
