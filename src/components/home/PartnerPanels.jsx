import { Link } from 'react-router-dom';
import { Check, ArrowRight } from 'lucide-react';
import { FOR_BUSINESS } from '../../constants/forBusiness';

/**
 * "ZivoPlus for business" band on the home page: ZivoPlus for Business (companies), ZivoPlus
 * Partner Hub (travel agents) and List your property (hotels), each with what it offers and where
 * to start. Navy band with the brand red for the actions, like the rest of the site.
 */
const PartnerPanels = () => (
  <section className="py-16 bg-navy-950 relative overflow-hidden" aria-labelledby="fb-h">
    <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-brand-600/20 blur-3xl" aria-hidden="true" />
    <div className="absolute -bottom-32 -left-24 w-96 h-96 rounded-full bg-navy-600/30 blur-3xl" aria-hidden="true" />
    <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl">
        <p className="text-sm font-bold uppercase tracking-widest text-brand-300">ZivoPlus for business</p>
        <h2 id="fb-h" className="mt-2 text-3xl md:text-4xl font-black text-white tracking-tight">Travel, sell or host with ZivoPlus</h2>
        <p className="mt-3 text-gray-300">One platform for companies booking work trips, travel agents booking for their customers, and hotels reaching guests across India.</p>
      </div>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {FOR_BUSINESS.map(({ to, name, Icon, short, line, points, cta }, i) => (
          <article key={to} className="bg-white rounded-2xl p-6 flex flex-col shadow-xl shadow-black/20">
            <div className="flex items-center gap-3">
              <span className={`w-12 h-12 rounded-xl flex items-center justify-center ${i === 2 ? 'bg-brand-50 text-brand-600' : 'bg-navy-50 text-navy-800'}`}><Icon size={24} aria-hidden="true" /></span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500">{short}</p>
                <h3 className="text-lg font-bold text-gray-900">{name}</h3>
              </div>
            </div>
            <p className="mt-3 text-sm text-gray-600">{line}</p>
            <ul className="mt-4 space-y-2 text-sm text-gray-800 flex-1">
              {points.map((pt) => <li key={pt} className="flex gap-2"><Check size={16} className="text-green-700 shrink-0 mt-0.5" aria-hidden="true" />{pt}</li>)}
            </ul>
            <Link to={to} className={`mt-6 inline-flex items-center justify-center gap-1.5 px-5 py-3 rounded-xl font-semibold text-white transition-colors ${i === 2 ? 'bg-navy-800 hover:bg-navy-900' : 'bg-brand-600 hover:bg-brand-700'}`}>
              {cta}<ArrowRight size={16} aria-hidden="true" />
            </Link>
          </article>
        ))}
      </div>
      <p className="mt-6 text-sm text-gray-300">
        Already with us? <Link to="/business" className="font-semibold text-white hover:text-brand-300 underline-offset-2 hover:underline">Company log in</Link> · <Link to="/partners" className="font-semibold text-white hover:text-brand-300 underline-offset-2 hover:underline">Agent log in</Link> · <Link to="/extranet/login" className="font-semibold text-white hover:text-brand-300 underline-offset-2 hover:underline">Hotel log in</Link>
        <span className="block sm:inline sm:ml-3 mt-1 sm:mt-0">Questions: <span className="select-all text-white">partners@zivoplus.com</span></span>
      </p>
    </div>
  </section>
);

export default PartnerPanels;
