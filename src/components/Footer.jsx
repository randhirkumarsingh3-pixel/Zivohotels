import { Link } from 'react-router-dom';
import Logo from './brand/Logo';

/**
 * Guest site footer (navy). Every link goes somewhere real: links to pages that don't exist yet
 * (careers, press, app stores, social accounts) were removed rather than left as "#".
 */
const Column = ({ title, links }) => (
  <div>
    <h2 className="text-base font-bold mb-4 text-white">{title}</h2>
    <ul className="space-y-3 text-sm">
      {links.map(([to, label]) => (
        <li key={label}><Link to={to} className="text-navy-100 hover:text-white transition-colors">{label}</Link></li>
      ))}
    </ul>
  </div>
);

const Footer = () => (
  <footer className="bg-navy-950 text-white pt-14 pb-8 mt-auto">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">
        <div className="col-span-2 md:col-span-1">
          <Link to="/" className="inline-flex mb-5" aria-label="ZivoHotels home">
            <Logo size="md" onDark />
          </Link>
          <p className="text-navy-100 text-sm leading-relaxed max-w-xs">
            Hotel stays across India at the price you see, with member prices, free cancellation on many rates and Zivo Rewards on every booking.
          </p>
        </div>
        <Column title="Explore" links={[['/hotels', 'All hotels'], ['/rewards', 'Zivo Rewards'], ['/membership', 'Membership'], ['/my-bookings', 'My bookings']]} />
        <Column title="Help" links={[['/help', 'Help centre'], ['/help#cancellations', 'Cancellations & refunds'], ['/help#payments', 'Payments'], ['/help#contact', 'Contact us']]} />
        <Column title="For hotels" links={[['/extranet/login', 'Extranet log in'], ['/help#hotels', 'List your property']]} />
      </div>
      <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row justify-between gap-3 text-sm text-navy-200">
        <p>© {new Date().getFullYear()} ZivoHotels. All rights reserved.</p>
      </div>
    </div>
  </footer>
);

export default Footer;
