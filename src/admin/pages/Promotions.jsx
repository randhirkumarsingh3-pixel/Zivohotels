import { Ticket } from 'lucide-react';
import PromotionsManager from '../../components/promotions/PromotionsManager';

/** Admin -> Promotions: Zivo platform offers and every property's offers. */
const Promotions = () => (
  <div className="space-y-6">
    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
      <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Ticket className="text-brand-700" size={22} /> Promotions</h1>
      <p className="text-gray-500 mt-1">Zivo offers for all or chosen properties, and offers run by each property. Choose who funds each discount.</p>
    </div>
    <PromotionsManager mode="admin" />
  </div>
);

export default Promotions;
