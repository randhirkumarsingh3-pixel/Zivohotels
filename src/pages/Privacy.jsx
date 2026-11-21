import { Link } from 'react-router-dom';
import LegalPage, { LegalSection, Who, GrievanceOfficer } from '../components/legal/LegalPage';
import { LEGAL } from '../constants/legal';

/**
 * Privacy Policy. Written from what the platform actually collects and who it shares it with
 * (hotel booked, Razorpay, Resend email, map providers). Keep it in step with the code: a new
 * data use or service provider needs a line here.
 */
const SECTIONS = [
  ['who', 'Who we are'],
  ['collect', 'What we collect'],
  ['use', 'How we use it'],
  ['share', 'Who we share it with'],
  ['browser', 'Your browser and device'],
  ['keep', 'How long we keep it'],
  ['rights', 'Your rights'],
  ['security', 'Security'],
  ['children', 'Children'],
  ['changes', 'Changes to this policy'],
  ['contact', 'Contact and grievances'],
];

const Privacy = () => (
  <LegalPage
    title="Privacy Policy"
    intro="This policy explains what personal data ZivoHotels collects when you search, book or list a property with us, why we need it, who we share it with and the choices you have. It applies to the ZivoHotels website, the Extranet for hotel partners and our emails."
    sections={SECTIONS}
  >
    <LegalSection id="who" title="1. Who we are">
      <p><Who /> (&quot;ZivoHotels&quot;, &quot;we&quot;) runs this platform and decides how your personal data is used for it. For each booking, the hotel you book also receives your details and uses them to host your stay.</p>
    </LegalSection>

    <LegalSection id="collect" title="2. What we collect">
      <p><strong>Your account:</strong> name, email address, phone number (if you add it) and your password, which we store only as a secure hash.</p>
      <p><strong>Your bookings:</strong> the hotel, room, dates and guests; the lead guest&apos;s name, email and phone (yours, or the person you book for); company name, GSTIN and address if you ask for a GST invoice; promo codes, Zivo Rewards points, membership and Zivo Cash used; and cancellations and refunds.</p>
      <p><strong>Payments:</strong> card, UPI and net-banking details are entered on and processed by our payment provider, Razorpay. We receive the payment reference, amount and status, not your card number.</p>
      <p><strong>Reviews:</strong> the ratings and text you write about a stay, and any report you make about a review.</p>
      <p><strong>Hotel partners:</strong> the owner&apos;s and staff contact details; property details and photos; legal and tax details (legal name, PAN, GSTIN); bank account details for payouts; and documents uploaded for verification.</p>
      <p><strong>How you use the platform:</strong> searches, pages and hotels you view, and actions such as starting a booking, linked to a random session ID in your browser and to your account once you log in. For security we also record the IP address and device type for sign-ins and important actions (for example, accepting a hotel agreement).</p>
    </LegalSection>

    <LegalSection id="use" title="3. How we use it">
      <ul className="list-disc pl-5 space-y-1">
        <li>To create and run your account, take bookings and payments, send confirmations, vouchers and invoices, and handle cancellations and refunds.</li>
        <li>To give you Zivo Rewards points, member prices and Zivo Cash, and to show you hotels you viewed recently.</li>
        <li>To publish reviews after a stay and keep them fair (moderation and reports).</li>
        <li>To pay hotel partners, raise GST-compliant documents and keep accounting records.</li>
        <li>To keep the platform secure: detect fraud and abuse, and investigate problems.</li>
        <li>To improve search results and the site, using usage data in aggregate.</li>
        <li>To meet legal duties, such as tax law and requests from authorities that the law requires us to answer.</li>
      </ul>
      <p>We use your data because you asked for a service (a booking or an account), because the law requires it, or for the legitimate uses above. We send marketing only if you agree, and you can stop it at any time.</p>
    </LegalSection>

    <LegalSection id="share" title="4. Who we share it with">
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>The hotel you book</strong> receives the guest&apos;s name, contact details, stay details and any requests, so it can host you.</li>
        <li><strong>Razorpay</strong> processes payments and refunds.</li>
        <li><strong>Resend</strong> delivers our emails (confirmations, password resets, account notices).</li>
        <li><strong>Map services</strong> (OpenStreetMap, and Google Maps where enabled) show maps and look up places near a hotel. Hotel locations are sent to them, not your personal details.</li>
        <li><strong>Authorities</strong>, when the law requires it, and professional advisers under confidentiality.</li>
      </ul>
      <p>We don&apos;t sell your personal data, and we don&apos;t use third-party advertising trackers.</p>
    </LegalSection>

    <LegalSection id="browser" title="5. Your browser and device">
      <p>We use your browser&apos;s local storage, not advertising cookies, to keep you signed in (a sign-in token), remember recent searches and unfinished property forms, and hold a random session ID for the usage data above. You can clear these in your browser settings; you&apos;ll be signed out and lose those saved items.</p>
    </LegalSection>

    <LegalSection id="keep" title="6. How long we keep it">
      <p>We keep your account while it&apos;s open. Booking, payment and invoice records are kept for as long as tax and accounting law requires (generally 8 years in India). Security logs are kept for a limited period. When data is no longer needed, we delete or anonymise it.</p>
    </LegalSection>

    <LegalSection id="rights" title="7. Your rights">
      <p>Under India&apos;s Digital Personal Data Protection Act, 2023 you can ask us to: tell you what personal data we hold and how we use it; correct or update it; delete it where we no longer need it or the law doesn&apos;t require us to keep it; and withdraw consent you gave. You can also nominate someone to exercise these rights for you, and complain to us and then to the Data Protection Board of India.</p>
      <p>Write to the grievance officer below from the email on your account. We may ask you to confirm your identity.</p>
    </LegalSection>

    <LegalSection id="security" title="8. Security">
      <p>Passwords are stored as hashes, connections are encrypted, access to personal data is limited to people who need it, and changing or resetting a password signs your account out on other devices. No system is perfectly secure; if a breach affects your data, we will tell you and the authorities as the law requires.</p>
    </LegalSection>

    <LegalSection id="children" title="9. Children">
      <p>You must be 18 or older to create an account or book. Children&apos;s details are collected only as guests on a booking made by an adult.</p>
      <p>How guests are counted when you book:</p>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Adults</strong> are guests aged 13 or above; <strong>children</strong> are aged 0–12. Hotels may price and limit rooms by these ages.</li>
        <li>Every room needs an adult aged 18 or older, who is the lead guest for that room.</li>
        <li>Guests aged 13–17 count as adults for the room but can stay only with an adult (18 or older) in the same room, never alone.</li>
        <li>The hotel may ask for photo ID for every guest at check-in, including proof of age.</li>
      </ul>
    </LegalSection>

    <LegalSection id="changes" title="10. Changes to this policy">
      <p>We will update this page when our practices change and show the date at the top. For significant changes we will also tell you by email or on the site.</p>
    </LegalSection>

    <LegalSection id="contact" title="11. Contact and grievances">
      <p>Grievance officer:</p>
      <GrievanceOfficer />
      <p>For bookings and refunds write to <span className="font-semibold select-all">{LEGAL.contacts.bookings}</span>. See also our <Link to="/terms" className="text-navy-700 underline">Terms of Service</Link>.</p>
    </LegalSection>
  </LegalPage>
);

export default Privacy;
