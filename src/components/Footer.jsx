import { Building2, Twitter, Instagram, Facebook, Apple, Smartphone } from 'lucide-react';
import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <footer className="bg-gray-900 text-white pt-16 pb-8 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          <div className="col-span-1 md:col-span-1">
            <Link to="/" className="flex items-center mb-6">
              <Building2 className="h-8 w-8 text-brand-500 mr-2" />
              <span className="text-2xl font-bold tracking-tight text-white">
                Zivo<span className="text-brand-500">Hotels</span>
              </span>
            </Link>
            <p className="text-gray-400 mb-6 text-sm leading-relaxed">
              Your trusted partner for booking premium hotel stays across the globe. Experience luxury like never before.
            </p>
            <div className="flex space-x-4">
              <a href="#" className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center hover:bg-brand-600 transition-colors"><Twitter className="h-5 w-5" /></a>
              <a href="#" className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center hover:bg-brand-600 transition-colors"><Instagram className="h-5 w-5" /></a>
              <a href="#" className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center hover:bg-brand-600 transition-colors"><Facebook className="h-5 w-5" /></a>
            </div>
          </div>
          
          <div>
            <h4 className="text-lg font-bold mb-6">Company</h4>
            <ul className="space-y-4 text-sm text-gray-400">
              <li><Link to="/hotels" className="hover:text-white transition-colors">Our Hotels</Link></li>
              <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Press & Media</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Sustainability</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="text-lg font-bold mb-6">Support</h4>
            <ul className="space-y-4 text-sm text-gray-400">
              <li><a href="#" className="hover:text-white transition-colors">Help Center</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Cancellation Options</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Trust & Safety</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Contact Us</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-lg font-bold mb-6">Get the App</h4>
            <p className="text-gray-400 text-sm mb-4">Book your stays faster with the ZivoHotels app.</p>
            <div className="space-y-3">
              <button className="w-full bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white flex items-center justify-center py-2.5 rounded-lg transition-colors">
                <Apple className="h-5 w-5 mr-2" /> App Store
              </button>
              <button className="w-full bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white flex items-center justify-center py-2.5 rounded-lg transition-colors">
                <Smartphone className="h-5 w-5 mr-2" /> Google Play
              </button>
            </div>
          </div>
        </div>
        
        <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row justify-between items-center text-sm text-gray-500">
          <p>© 2026 ZivoHotels. All rights reserved.</p>
          <div className="flex space-x-6 mt-4 md:mt-0">
            <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
