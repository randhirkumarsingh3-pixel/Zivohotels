import Icon from './Icons';

/* global Icon */
// js/components/Navbar.jsx
const Navbar = () => {
    return (
        <nav className="fixed w-full z-50 transition-all duration-300 bg-white/90 backdrop-blur-md shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-20">
                    {/* Logo */}
                    <div className="flex-shrink-0 flex items-center cursor-pointer">
                        <Icon name="Building2" className="h-8 w-8 text-brand-600 mr-2" />
                        <span className="text-2xl font-bold tracking-tight text-gray-900">
                            Zivo<span className="text-brand-600">Hotels</span>
                        </span>
                    </div>

                    {/* Desktop Menu */}
                    <div className="hidden md:flex items-center space-x-8">
                        <a href="#" className="text-gray-600 hover:text-brand-600 font-medium transition-colors">Offers</a>
                        <a href="#" className="text-gray-600 hover:text-brand-600 font-medium transition-colors">Corporate</a>
                        <a href="#" className="text-gray-600 hover:text-brand-600 font-medium transition-colors">Travel Agents</a>
                        
                        <div className="flex items-center space-x-4 ml-4 border-l border-gray-200 pl-4">
                            <button className="text-gray-700 hover:text-brand-600 font-medium px-4 py-2 rounded-full transition-colors">
                                Log in
                            </button>
                            <button className="bg-brand-600 hover:bg-brand-700 text-white font-medium px-6 py-2 rounded-full transition-colors shadow-md hover:shadow-lg transform hover:-translate-y-0.5">
                                Sign up
                            </button>
                        </div>
                    </div>

                    {/* Mobile menu button */}
                    <div className="md:hidden flex items-center">
                        <button className="p-2 rounded-md text-gray-600 hover:text-brand-600 hover:bg-gray-100 focus:outline-none">
                            <Icon name="Menu" className="h-6 w-6" />
                        </button>
                    </div>
                </div>
            </div>
        </nav>
    );
};

window.Navbar = Navbar;
