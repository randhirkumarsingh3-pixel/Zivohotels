import { useNavigate } from 'react-router-dom';
import { useBooking } from '../context/BookingContext';

const CityCard = ({ city }) => {
  const navigate = useNavigate();
  const { updateSearchParams } = useBooking();

  const handleCityClick = () => {
    updateSearchParams({ destination: city.name });
    navigate('/hotels');
  };

  return (
    <button
      type="button"
      onClick={handleCityClick}
      className="group relative rounded-card overflow-hidden hover-lift cursor-pointer h-64 sm:h-80 w-[72vw] sm:w-auto shrink-0 snap-start text-left"
      aria-label={`Hotels in ${city.name}`}
    >
      <div className="absolute inset-0 bg-navy-950/10 group-hover:bg-transparent transition-colors z-10"></div>
      <div className="absolute inset-0 bg-gradient-to-t from-navy-950/90 via-navy-950/20 to-transparent z-10"></div>
      <img 
        src={city.image} 
        alt=""
        loading="lazy" 
        className="absolute inset-0 w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-700" 
      />
      <div className="absolute bottom-0 left-0 p-6 z-20 w-full">
        <h3 className="text-2xl font-bold text-white mb-1 drop-shadow-md">{city.name}</h3>
        <p className="text-white/90 text-sm font-medium drop-shadow-sm">{city.properties || 'See hotels →'}</p>
      </div>
    </button>
  );
};

export default CityCard;
