import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, History, Sparkles, TrendingUp, Award } from 'lucide-react';
import SmartSearchBar from '../components/search/SmartSearchBar';
import CityCard from '../components/CityCard';
import HotelCard from '../components/HotelCard';
import QuickChips from '../components/home/QuickChips';
import MemberBanner from '../components/home/MemberBanner';
import OffersCarousel from '../components/home/OffersCarousel';
import WhyZivo from '../components/home/WhyZivo';
import GuestReviews from '../components/home/GuestReviews';
import RewardsMembership from '../components/home/RewardsMembership';
import PartnerPanels from '../components/home/PartnerPanels';
import HomeFaq from '../components/home/HomeFaq';
import ExploreLinks from '../components/home/ExploreLinks';
import { getRecommendations, getHomeFeed } from '../services/api';
import { useAuth } from '../context/AuthContext';
import usePageTitle from '../hooks/usePageTitle';

/**
 * Home: search (with quick chips), a sign-up or Prime banner, live offers, top-rated hotels, popular
 * cities, the guest's own rows (recently viewed, recommended), why book with us, guest reviews,
 * Rewards and Prime, panels for hotels and companies, FAQs and links to every city and area.
 * Everything comes from live data (GET /public/home and recommendations); a section with nothing
 * real to show is hidden.
 */
const CITY_PHOTOS = {
  Mumbai: 'https://images.unsplash.com/photo-1529253355930-ddbe423a2ac7?auto=format&fit=crop&w=800&q=80',
  Goa: 'https://images.unsplash.com/photo-1512356181113-853a150f1aa7?auto=format&fit=crop&w=800&q=80',
  Delhi: 'https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&w=800&q=80',
  'New Delhi': 'https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&w=800&q=80',
  Bangalore: 'https://images.unsplash.com/photo-1596176530529-78163a4f7af2?auto=format&fit=crop&w=800&q=80',
  Bengaluru: 'https://images.unsplash.com/photo-1596176530529-78163a4f7af2?auto=format&fit=crop&w=800&q=80',
};
const FALLBACK_CITY_PHOTO = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80';

const Row = ({ icon: Icon, iconClass, title, hotels, action }) => (
  <div>
    <div className="flex items-end justify-between gap-4 mb-5">
      <h2 className="flex items-center gap-2 text-2xl font-bold text-navy-900"><Icon className={iconClass} size={24} aria-hidden="true" /> {title}</h2>
      {action}
    </div>
    <div className="flex gap-5 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
      {hotels.map((hotel) => (
        <div key={hotel.id} className="w-[280px] sm:w-[310px] shrink-0 snap-start"><HotelCard hotel={hotel} /></div>
      ))}
    </div>
  </div>
);

const Home = () => {
  usePageTitle();
  const { isAuthenticated, user } = useAuth();
  const [feed, setFeed] = useState(null);
  const [recommendations, setRecommendations] = useState(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    getHomeFeed().then(setFeed).catch((e) => console.error('Home feed failed:', e));
    getRecommendations().then((r) => r && setRecommendations(r)).catch(() => {});
  }, []);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Each hotel appears once in the personal rows
  const seenIds = new Set((recommendations?.recentlyViewed || []).slice(0, 8).map((h) => h.id));
  const recentRow = (recommendations?.recentlyViewed || []).slice(0, 8);
  const recommendedRow = (recommendations?.recommended || []).filter((h) => !seenIds.has(h.id)).slice(0, 8);
  recommendedRow.forEach((h) => seenIds.add(h.id));
  const trendingRow = (recommendations?.popularInCity || []).filter((h) => !seenIds.has(h.id)).slice(0, 8);

  const topRated = feed?.topRated || [];
  const anyReviewed = topRated.some((h) => h.reviewCount > 0);
  const cityCards = (feed?.cities?.length ? feed.cities.slice(0, 8) : [{ name: 'Mumbai' }, { name: 'Goa' }, { name: 'Delhi' }, { name: 'Bangalore' }])
    .map((c, i) => ({ id: i, name: c.name, image: CITY_PHOTOS[c.name] || FALLBACK_CITY_PHOTO, properties: c.count ? `${c.count} hotel${c.count === 1 ? '' : 's'} →` : undefined }));

  return (
    <>
      {/* Hero. z-20 keeps the search bar's date picker above the sections below */}
      <section className="relative z-20 pt-28 pb-14 lg:pt-40 lg:pb-24 overflow-visible flex items-center justify-center">
        <div className="absolute inset-0 z-0 bg-navy-900">
          <img src="https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=1920&q=70" alt="" className="w-full h-full object-cover opacity-80" />
          <div className="absolute inset-0 bg-gradient-to-b from-navy-950/90 via-navy-900/60 to-navy-950/90"></div>
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full flex flex-col items-center text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-tight mb-4 drop-shadow-lg">
            Find your perfect <span className="text-brand-400">stay.</span>
          </h1>
          <p className="mt-1 text-lg md:text-xl text-navy-50 max-w-2xl mb-8 drop-shadow-md font-medium">
            Hotels across India at the price you see, with GST included before you pay.
          </p>
          <SmartSearchBar isMobile={isMobile} />
          <QuickChips cities={feed?.cities || []} />
        </div>
      </section>

      <MemberBanner signup={feed?.signup} membership={feed?.membership} isAuthenticated={isAuthenticated} role={user?.role} />
      <OffersCarousel offers={feed?.offers} />

      {topRated.length > 0 && (
        <section className="py-12 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <Row icon={Award} iconClass="text-brand-600" title={anyReviewed ? 'Top-rated hotels' : 'Hotels on ZivoPlus'} hotels={topRated}
              action={<Link to="/hotels" className="hidden sm:flex items-center text-navy-700 font-semibold hover:text-navy-900 whitespace-nowrap">See all hotels <ArrowRight className="h-4 w-4 ml-1" aria-hidden="true" /></Link>} />
          </div>
        </section>
      )}

      {/* For companies, travel agents and hotels: high on the page */}
      <PartnerPanels />

      <section className="py-12 bg-white border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-6">
            <h2 className="text-2xl md:text-3xl font-bold text-navy-900 mb-1">Popular destinations</h2>
            <p className="text-gray-600">Cities with ZivoPlus stays.</p>
          </div>
          <div className="flex sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 sm:mx-0 sm:px-0 pb-2 sm:pb-0">
            {cityCards.map((city) => <CityCard key={city.name} city={city} />)}
          </div>
        </div>
      </section>

      {(recentRow.length > 0 || recommendedRow.length > 0 || trendingRow.length > 0) && (
        <section className="py-12 bg-gray-50 border-t border-gray-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
            {recentRow.length > 0 && <Row icon={History} iconClass="text-brand-600" title="Recently viewed" hotels={recentRow} />}
            {recommendedRow.length > 0 && <Row icon={Sparkles} iconClass="text-amber-500" title={recentRow.length ? 'Based on your recent views' : 'Recommended for you'} hotels={recommendedRow} />}
            {trendingRow.length > 0 && <Row icon={TrendingUp} iconClass="text-green-700" title={recommendations?.contextCity ? `Because you searched ${recommendations.contextCity}` : 'Trending right now'} hotels={trendingRow} />}
          </div>
        </section>
      )}

      <WhyZivo />
      <GuestReviews reviews={feed?.reviews} />
      <RewardsMembership rewards={feed?.rewards} membership={feed?.membership} />
      <HomeFaq />
      <ExploreLinks cities={feed?.cities} areas={feed?.areas} />
    </>
  );
};

export default Home;
