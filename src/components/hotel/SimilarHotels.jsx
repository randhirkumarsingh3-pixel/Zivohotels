import { useEffect, useState } from 'react';
import { getHotels } from '../../services/api';
import HotelCard from '../HotelCard';

/** Other bookable hotels in the same city for the same stay (up to 4), at the end of the page. */
const SimilarHotels = ({ hotel, searchParams }) => {
  const [list, setList] = useState([]);
  const { checkIn, checkOut, occupancy, guests } = searchParams;
  useEffect(() => {
    if (!hotel?.city) return undefined;
    let live = true;
    getHotels({ destination: hotel.city, checkIn, checkOut, occupancy, guests }, { sortBy: 'RECOMMENDED' })
      .then((d) => {
        const all = d?.hotels || d || [];
        if (live) setList((Array.isArray(all) ? all : []).filter((h) => h.id !== hotel.id && !h.badges?.isSoldOut).slice(0, 4));
      })
      .catch(() => {});
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotel?.id, hotel?.city, checkIn, checkOut]);
  if (!list.length) return null;
  return (
    <section aria-labelledby="similar-h" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12">
      <h2 id="similar-h" className="text-xl font-bold text-gray-900 mb-4">Similar hotels in {hotel.city}</h2>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{list.map((h) => <HotelCard key={h.id} hotel={h} />)}</div>
    </section>
  );
};

export default SimilarHotels;
