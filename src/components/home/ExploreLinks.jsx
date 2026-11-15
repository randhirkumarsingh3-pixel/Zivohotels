import { Link } from 'react-router-dom';
import { cityLink, defaultStay } from './searchLinks';

/**
 * "Explore hotels": text links to every city and popular area with live hotels, for guests who
 * browse and for search engines. Area links open the city's results with that area filter on.
 */
const areaLink = (area, city) => `/hotels?${new URLSearchParams({ city, area, ...defaultStay(), guests: '2', rooms: '1' })}`;

const ExploreLinks = ({ cities = [], areas = [] }) => {
  if (!cities.length && !areas.length) return null;
  return (
    <section className="py-12 bg-gray-50 border-t border-gray-200" aria-labelledby="explore-heading">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 id="explore-heading" className="text-xl font-bold text-navy-900 mb-5">Explore hotels</h2>
        <div className="grid gap-8 md:grid-cols-2">
          {cities.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">By city</h3>
              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                {cities.map((c) => <li key={c.name}><Link to={cityLink(c.name)} className="text-gray-700 hover:text-navy-800 hover:underline">Hotels in {c.name}</Link></li>)}
              </ul>
            </div>
          )}
          {areas.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Popular areas</h3>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {areas.map((a) => <li key={`${a.area}-${a.city}`}><Link to={areaLink(a.area, a.city)} className="text-gray-700 hover:text-navy-800 hover:underline">Hotels in {a.area}, {a.city}</Link></li>)}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default ExploreLinks;
