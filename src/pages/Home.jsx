import { useState, useEffect } from 'react';
import SmartSearchBar from '../components/search/SmartSearchBar';
import CityCard from '../components/CityCard';
import HotelCard from '../components/HotelCard';
import { getRecommendations, getHotels } from '../services/api';
import { CheckCircle2, ArrowRight, History, Sparkles, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import usePageTitle from '../hooks/usePageTitle';

const Home = () => {
  usePageTitle();
  const [recommendations, setRecommendations] = useState(null);
  const [fallbackHotels, setFallbackHotels] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const recs = await getRecommendations();
        if (recs) {
          setRecommendations(recs);
        } else {
          // Fallback to basic search
          const data = await getHotels();
          setFallbackHotels(data?.slice(0, 3) || []);
        }
      } catch (error) {
        console.error("Failed to fetch homepage data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const cities = [
    { id: 1, name: "Mumbai", image: "https://images.unsplash.com/photo-1529253355930-ddbe423a2ac7?auto=format&fit=crop&w=800&q=80" },
    { id: 2, name: "Goa", image: "https://images.unsplash.com/photo-1512356181113-853a150f1aa7?auto=format&fit=crop&w=800&q=80" },
    { id: 3, name: "Delhi", image: "https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&w=800&q=80" },
    { id: 4, name: "Bangalore", image: "https://images.unsplash.com/photo-1596176530529-78163a4f7af2?auto=format&fit=crop&w=800&q=80" },
  ];

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Each hotel appears once on the page: rows further down skip hotels already shown above
  const seenIds = new Set((recommendations?.recentlyViewed || []).slice(0, 8).map((h) => h.id));
  const recommendedRow = (recommendations?.recommended || []).filter((h) => !seenIds.has(h.id)).slice(0, 8);
  recommendedRow.forEach((h) => seenIds.add(h.id));
  const trendingRow = (recommendations?.popularInCity || []).filter((h) => !seenIds.has(h.id)).slice(0, 8);

  return (
    <>
      {/* Hero Section */}
      {/* z-20: keeps the search bar's date picker above the destination cards below (it opened behind them) */}
      <section className="relative z-20 pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-visible flex items-center justify-center min-h-[600px]">
        <div className="absolute inset-0 z-0 bg-navy-900">
          <img 
            src="https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=1920&q=70"
            alt=""
            className="w-full h-full object-cover opacity-80"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-navy-950/90 via-navy-900/60 to-navy-950/90"></div>
        </div>
        
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full flex flex-col items-center text-center mt-[-40px]">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-tight mb-4 animate-fade-in-up drop-shadow-lg">
            Find your perfect <span className="text-brand-400">stay.</span>
          </h1>
          <p className="mt-2 text-lg md:text-xl text-navy-50 max-w-2xl mb-10 animate-fade-in-up drop-shadow-md font-medium" style={{ animationDelay: '0.2s' }}>
            Hotels across India at the price you see. Member prices, free cancellation on many stays and pay-at-hotel options.
          </p>
          
          <SmartSearchBar isMobile={isMobile} />
          
          <div className="mt-12 flex flex-wrap justify-center gap-4 md:gap-8 text-sm md:text-base font-medium text-white/95 animate-fade-in drop-shadow-md" style={{ animationDelay: '0.4s' }}>
            <div className="flex items-center"><CheckCircle2 className="text-green-300 h-5 w-5 mr-2" /> Book in 30 seconds</div>
            <div className="flex items-center"><CheckCircle2 className="text-green-300 h-5 w-5 mr-2" /> No hidden charges</div>
            <div className="flex items-center"><CheckCircle2 className="text-green-300 h-5 w-5 mr-2" /> Pay at hotel available</div>
          </div>
        </div>
      </section>

      {/* Popular Cities Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-end mb-10 gap-4">
            <div>
              <h2 className="text-3xl font-bold text-navy-900 mb-2">Popular destinations</h2>
              <p className="text-gray-600 text-lg">Hotels in India&apos;s most visited cities.</p>
            </div>
            <Link to="/hotels" className="hidden md:flex items-center text-navy-700 font-semibold hover:text-navy-900 transition-colors">
              See all hotels <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </div>
          
          <div className="flex sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 sm:mx-0 sm:px-0 pb-2 sm:pb-0">
            {cities.map(city => (
              <CityCard key={city.id} city={city} />
            ))}
          </div>
        </div>
      </section>

      {/* Featured Hotels Section */}
      <section className="py-20 bg-gray-50 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold text-navy-900 mb-4">Hotels picked for you</h2>
            <p className="text-gray-500 text-lg">Discover our top-rated properties offering unparalleled luxury, comfort, and service.</p>
          </div>
          
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand-600"></div>
            </div>
          ) : (
            <div className="space-y-16">
              
              {/* Recently Viewed */}
              {recommendations?.recentlyViewed?.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-6">
                    <History className="text-brand-700" size={24} />
                    <h2 className="text-2xl font-bold text-navy-900">Recently viewed</h2>
                  </div>
                  <div className="flex gap-5 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
                    {recommendations.recentlyViewed.slice(0, 8).map(hotel => (
                      <div key={hotel.id} className="w-[280px] sm:w-[310px] shrink-0 snap-start"><HotelCard hotel={hotel} /></div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommended For You */}
              {recommendedRow.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-6">
                    <Sparkles className="text-amber-500" size={24} />
                    <h2 className="text-2xl font-bold text-navy-900">
                      {recommendations.recentlyViewed?.length > 0 ? 'Based on your recent views' : 'Recommended for you'}
                    </h2>
                  </div>
                  <div className="flex gap-5 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
                    {recommendedRow.map(hotel => (
                      <div key={hotel.id} className="w-[280px] sm:w-[310px] shrink-0 snap-start"><HotelCard hotel={hotel} /></div>
                    ))}
                  </div>
                </div>
              )}

              {/* Trending in City */}
              {trendingRow.length > 0 ? (
                <div>
                  <div className="flex items-center gap-2 mb-6">
                    <TrendingUp className="text-green-500" size={24} />
                    <h2 className="text-2xl font-bold text-navy-900">
                      {recommendations.contextCity ? `Because you searched ${recommendations.contextCity}` : 'Trending right now'}
                    </h2>
                  </div>
                  <div className="flex gap-5 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
                    {trendingRow.map(hotel => (
                      <div key={hotel.id} className="w-[280px] sm:w-[310px] shrink-0 snap-start"><HotelCard hotel={hotel} /></div>
                    ))}
                  </div>
                </div>
              ) : !recommendations && fallbackHotels.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-6">
                    <TrendingUp className="text-green-500" size={24} />
                    <h2 className="text-2xl font-bold text-navy-900">Featured hotels</h2>
                  </div>
                  <div className="flex gap-5 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
                    {fallbackHotels.map(hotel => (
                      <div key={hotel.id} className="w-[280px] sm:w-[310px] shrink-0 snap-start"><HotelCard hotel={hotel} /></div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </section>
    </>
  );
};

export default Home;
