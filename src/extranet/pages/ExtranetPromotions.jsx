import PromotionsManager from '../../components/promotions/PromotionsManager';
import { useExtranet } from '../context/ExtranetContext';

/**
 * Extranet -> Promotions for the active property: the owner's own offers (automatic or with a
 * code) and the Zivo offers that apply to the property. (The old page saved nothing.)
 */
const ExtranetPromotions = () => {
  const { hotelId, property } = useExtranet();
  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Promotions</h1>
        <p className="text-gray-500 font-medium mt-1">
          Offers guests see in search, on your hotel page and at checkout for {property?.name || 'your property'}.
        </p>
      </div>
      {hotelId ? <PromotionsManager key={hotelId} mode="owner" hotelId={hotelId} /> : <p className="text-gray-400">Loading…</p>}
    </div>
  );
};

export default ExtranetPromotions;
