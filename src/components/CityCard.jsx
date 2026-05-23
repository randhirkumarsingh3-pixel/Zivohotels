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
    <div 
      onClick={handleCityClick}
      className="group relative rounded-2xl overflow-hidden hover-lift cursor-pointer h-72 sm:h-80"
    >
      <div className="absolute inset-0 bg-gray-900/20 group-hover:bg-gray-900/10 transition-colors z-10"></div>
      <div className="absolute inset-0 bg-gradient-to-t from-gray-900/90 via-gray-900/20 to-transparent z-10"></div>
      <img 
        src={city.image} 
        alt={city.name} 
        className="absolute inset-0 w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-700" 
      />
      <div className="absolute bottom-0 left-0 p-6 z-20 w-full">
        <h3 className="text-2xl font-bold text-white mb-1 drop-shadow-md">{city.name}</h3>
        <p className="text-white/90 text-sm font-medium drop-shadow-sm">{city.properties}</p>
      </div>
    </div>
  );
};

export default CityCard;
