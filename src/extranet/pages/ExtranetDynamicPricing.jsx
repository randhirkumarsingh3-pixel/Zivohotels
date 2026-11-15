import DynamicPricingManager from '../../components/pricing/DynamicPricingManager';
import { useExtranet } from '../context/ExtranetContext';

/**
 * Extranet -> Dynamic Pricing for the active property. (The menu item opened the inventory
 * calendar; there was no way to set pricing rules.)
 */
const ExtranetDynamicPricing = () => {
  const { hotelId, property } = useExtranet();
  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Dynamic Pricing</h1>
        <p className="text-gray-500 font-medium mt-1">
          Let prices for {property?.name || 'your property'} follow demand: weekends, occupancy, booking window and seasons.
        </p>
      </div>
      {hotelId ? <DynamicPricingManager key={hotelId} hotelId={hotelId} inventoryLink="/extranet/inventory" /> : <p className="text-gray-400">Loading…</p>}
    </div>
  );
};

export default ExtranetDynamicPricing;
