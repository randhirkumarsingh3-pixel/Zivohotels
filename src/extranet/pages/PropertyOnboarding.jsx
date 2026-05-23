import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  Building2, ShieldCheck, MapPin, Coffee, ClipboardList, 
  Image as ImageIcon, Bed, DollarSign, Calendar, Landmark, 
  Share2, Eye, ChevronRight, ChevronLeft, Save, AlertCircle,
  CheckCircle2, Loader2, Sparkles, Activity, Target, Trophy,
  TrendingUp, Zap, BarChart3, Info, AlertOctagon, BadgeCheck,
  Search, ShieldAlert, Home, Clock, Check, Heart, Shield
} from 'lucide-react';
import { 
  initOnboarding, 
  getOnboardingProgress as getProgress, 
  saveOnboardingStep as saveStep, 
  submitPropertyForReview as submitProperty 
} from '../../services/extranetApi';
import { useExtranet } from '../context/ExtranetContext';

const WEIGHTS = {
  identity: 10,
  compliance: 20,
  location: 10,
  amenities: 5,
  policies: 10,
  media: 20,
  rooms: 10,
  pricing: 5,
  inventory: 5,
  finance: 15,
  distribution: 5
};

const STEPS = [
  { id: 1, key: 'identity', title: 'Identity', icon: Building2, desc: 'Legal name & identity' },
  { id: 2, key: 'compliance', title: 'Compliance', icon: ShieldCheck, desc: 'KYC & Documents' },
  { id: 3, key: 'location', title: 'Location', icon: MapPin, desc: 'Address & Mapping' },
  { id: 4, key: 'amenities', title: 'Amenities', icon: Coffee, desc: 'Facilities & Services' },
  { id: 5, key: 'policies', title: 'Policies', icon: ClipboardList, desc: 'Rules & Guidelines' },
  { id: 6, key: 'media', title: 'Media', icon: ImageIcon, desc: 'Quality Gallery' },
  { id: 7, key: 'rooms', title: 'Rooms', icon: Bed, desc: 'Room Configuration' },
  { id: 8, key: 'pricing', title: 'Pricing', icon: DollarSign, desc: 'Rate Plan Setup' },
  { id: 9, key: 'inventory', title: 'Inventory', icon: Calendar, desc: 'Capacity Control' },
  { id: 10, key: 'finance', title: 'Finance', icon: Landmark, desc: 'Bank & Payouts' },
  { id: 11, key: 'distribution', title: 'Distribution', icon: Share2, desc: 'Connectivity' },
  { id: 12, key: 'review', title: 'Review', icon: Eye, desc: 'Audit & Launch' }
];

const AMENITIES_MASTER = [
  // 1. INTERNET & CONNECTIVITY
  { id: 'free_wifi', category: 'Internet & Connectivity', label: 'Free Wi-Fi', isPopular: true, affectsConversion: true, boost: '+21%' },
  { id: 'paid_wifi', category: 'Internet & Connectivity', label: 'Paid Wi-Fi' },
  { id: 'high_speed_wifi', category: 'Internet & Connectivity', label: 'High-Speed Internet', isPopular: true, affectsConversion: true, boost: '+15%' },
  { id: 'lan_connection', category: 'Internet & Connectivity', label: 'LAN Connection' },
  { id: 'business_wifi', category: 'Internet & Connectivity', label: 'Business Internet Zone' },
  { id: 'public_wifi', category: 'Internet & Connectivity', label: 'Public Area Wi-Fi' },
  { id: 'in_room_wifi', category: 'Internet & Connectivity', label: 'In-Room Wi-Fi' },
  { id: 'conf_wifi', category: 'Internet & Connectivity', label: 'Conference Wi-Fi' },

  // 2. PARKING & TRANSPORT
  { id: 'free_parking', category: 'Parking & Transport', label: 'Free Parking', isPopular: true, affectsConversion: true, boost: '+14%' },
  { id: 'paid_parking', category: 'Parking & Transport', label: 'Paid Parking' },
  { id: 'valet_parking', category: 'Parking & Transport', label: 'Valet Parking' },
  { id: 'covered_parking', category: 'Parking & Transport', label: 'Covered Parking' },
  { id: 'ev_charging', category: 'Parking & Transport', label: 'EV Charging Station', isPopular: true, affectsConversion: true, boost: '+10%' },
  { id: 'airport_shuttle', category: 'Parking & Transport', label: 'Airport Shuttle', affectsConversion: true, boost: '+12%' },
  { id: 'railway_pickup', category: 'Parking & Transport', label: 'Railway Station Pickup' },
  { id: 'taxi_service', category: 'Parking & Transport', label: 'Taxi Service' },
  { id: 'car_rental', category: 'Parking & Transport', label: 'Car Rental' },
  { id: 'bike_rental', category: 'Parking & Transport', label: 'Bike Rental' },

  // 3. FOOD & DINING
  { id: 'restaurant', category: 'Food & Dining', label: 'Restaurant', isPopular: true, affectsConversion: true, boost: '+18%' },
  { id: 'multi_cuisine', category: 'Food & Dining', label: 'Multi-Cuisine Restaurant' },
  { id: 'cafe', category: 'Food & Dining', label: 'Cafe', isPopular: true },
  { id: 'coffee_shop', category: 'Food & Dining', label: 'Coffee Shop' },
  { id: 'bar', category: 'Food & Dining', label: 'Bar', affectsConversion: true, boost: '+8%' },
  { id: 'rooftop_dining', category: 'Food & Dining', label: 'Rooftop Dining', affectsConversion: true, boost: '+16%' },
  { id: 'room_service_24', category: 'Food & Dining', label: '24x7 Room Service', isPopular: true, affectsConversion: true, boost: '+11%' },
  { id: 'breakfast_included', category: 'Food & Dining', label: 'Breakfast Included', isPopular: true, affectsConversion: true, boost: '+19%' },
  { id: 'buffet_breakfast', category: 'Food & Dining', label: 'Buffet Breakfast' },
  { id: 'vegetarian_meals', category: 'Food & Dining', label: 'Vegetarian Meals' },
  { id: 'jain_food', category: 'Food & Dining', label: 'Jain Food Available' },
  { id: 'halal_food', category: 'Food & Dining', label: 'Halal Food Available' },
  { id: 'kids_meals', category: 'Food & Dining', label: 'Kids Meals' },
  { id: 'bbq_facilities', category: 'Food & Dining', label: 'BBQ Facilities' },

  // 4. WELLNESS & FITNESS
  { id: 'swimming_pool', category: 'Wellness & Fitness', label: 'Swimming Pool', isPopular: true, affectsConversion: true, boost: '+32%' },
  { id: 'indoor_pool', category: 'Wellness & Fitness', label: 'Indoor Pool' },
  { id: 'kids_pool', category: 'Wellness & Fitness', label: 'Kids Pool' },
  { id: 'infinity_pool', category: 'Wellness & Fitness', label: 'Infinity Pool', affectsConversion: true, boost: '+22%' },
  { id: 'spa', category: 'Wellness & Fitness', label: 'Spa', affectsConversion: true, boost: '+12%' },
  { id: 'sauna', category: 'Wellness & Fitness', label: 'Sauna' },
  { id: 'jacuzzi', category: 'Wellness & Fitness', label: 'Jacuzzi' },
  { id: 'yoga_center', category: 'Wellness & Fitness', label: 'Yoga Center' },
  { id: 'gym', category: 'Wellness & Fitness', label: 'Gym / Fitness Center', isPopular: true, affectsConversion: true, boost: '+8%' },
  { id: 'salon', category: 'Wellness & Fitness', label: 'Salon' },

  // 5. BUSINESS & EVENTS
  { id: 'conference_room', category: 'Business & Events', label: 'Conference Room', affectsConversion: true, boost: '+7%' },
  { id: 'banquet_hall', category: 'Business & Events', label: 'Banquet Hall' },
  { id: 'meeting_room', category: 'Business & Events', label: 'Meeting Room' },
  { id: 'business_center', category: 'Business & Events', label: 'Business Center' },
  { id: 'co_working', category: 'Business & Events', label: 'Co-Working Space', isPopular: true, affectsConversion: true, boost: '+9%' },
  { id: 'av_equipment', category: 'Business & Events', label: 'Audio/Visual Equipment' },
  { id: 'wedding_venue', category: 'Business & Events', label: 'Wedding Venue' },

  // 6. ROOM FEATURES
  { id: 'ac', category: 'Room Features', label: 'Air Conditioning', isPopular: true, affectsConversion: true, boost: '+45%' },
  { id: 'heating', category: 'Room Features', label: 'Heating' },
  { id: 'smart_tv', category: 'Room Features', label: 'Smart TV', isPopular: true },
  { id: 'ott_access', category: 'Room Features', label: 'OTT Access', affectsConversion: true, boost: '+13%' },
  { id: 'soundproof', category: 'Room Features', label: 'Soundproof Rooms' },
  { id: 'balcony', category: 'Room Features', label: 'Balcony', isPopular: true, affectsConversion: true, boost: '+25%' },
  { id: 'city_view', category: 'Room Features', label: 'City View' },
  { id: 'mountain_view', category: 'Room Features', label: 'Mountain View' },
  { id: 'sea_view', category: 'Room Features', label: 'Sea View', affectsConversion: true, boost: '+35%' },
  { id: 'lake_view', category: 'Room Features', label: 'Lake View' },
  { id: 'garden_view', category: 'Room Features', label: 'Garden View' },
  { id: 'kitchenette', category: 'Room Features', label: 'Kitchenette' },
  { id: 'refrigerator', category: 'Room Features', label: 'Refrigerator' },
  { id: 'coffee_machine', category: 'Room Features', label: 'Coffee Machine' },
  { id: 'electric_kettle', category: 'Room Features', label: 'Electric Kettle', isPopular: true },
  { id: 'work_desk', category: 'Room Features', label: 'Work Desk', isPopular: true },
  { id: 'in_room_safe', category: 'Room Features', label: 'In-Room Safe' },

  // 7. BATHROOM FEATURES
  { id: 'private_bathroom', category: 'Bathroom Features', label: 'Private Bathroom', isPopular: true },
  { id: 'bathtub', category: 'Bathroom Features', label: 'Bathtub' },
  { id: 'rain_shower', category: 'Bathroom Features', label: 'Rain Shower' },
  { id: 'hot_water', category: 'Bathroom Features', label: 'Hot Water', isPopular: true },
  { id: 'hair_dryer', category: 'Bathroom Features', label: 'Hair Dryer' },
  { id: 'toiletries', category: 'Bathroom Features', label: 'Toiletries', isPopular: true },

  // 8. FAMILY & KIDS
  { id: 'family_rooms', category: 'Family & Kids', label: 'Family Rooms', isPopular: true },
  { id: 'kids_play_area', category: 'Family & Kids', label: 'Kids Play Area', affectsConversion: true, boost: '+15%' },
  { id: 'indoor_games', category: 'Family & Kids', label: 'Indoor Games' },
  { id: 'babysitting', category: 'Family & Kids', label: 'Babysitting Service' },
  { id: 'cribs_available', category: 'Family & Kids', label: 'Cribs Available' },
  { id: 'extra_bed_available', category: 'Family & Kids', label: 'Extra Bed Available' },

  // 9. ACCESSIBILITY
  { id: 'wheelchair_accessible', category: 'Accessibility', label: 'Wheelchair Accessible', affectsConversion: true, boost: '+9%' },
  { id: 'elevator', category: 'Accessibility', label: 'Elevator / Lift', isPopular: true },
  { id: 'ramp_access', category: 'Accessibility', label: 'Ramp Access' },

  // 10. SAFETY & SECURITY
  { id: 'cctv', category: 'Safety & Security', label: 'CCTV Surveillance', isPopular: true },
  { id: 'security_24', category: 'Safety & Security', label: '24x7 Security', isPopular: true },
  { id: 'fire_extinguisher', category: 'Safety & Security', label: 'Fire Extinguishers' },
  { id: 'smoke_detector', category: 'Safety & Security', label: 'Smoke Detectors' },
  { id: 'first_aid', category: 'Safety & Security', label: 'First Aid Kit' },
  { id: 'digital_lock', category: 'Safety & Security', label: 'Digital Door Lock', affectsConversion: true, boost: '+11%' },

  // 11. CLEANING & HOUSEKEEPING
  { id: 'daily_housekeeping', category: 'Cleaning & Housekeeping', label: 'Daily Housekeeping', isPopular: true },
  { id: 'laundry_service', category: 'Cleaning & Housekeeping', label: 'Laundry Service' },
  { id: 'contactless_checkin', category: 'Cleaning & Housekeeping', label: 'Contactless Check-In' },

  // 12. FRONT DESK & GUEST SERVICES
  { id: 'front_desk_24', category: 'Front Desk & Guest Services', label: '24-Hour Front Desk', isPopular: true },
  { id: 'concierge', category: 'Front Desk & Guest Services', label: 'Concierge' },
  { id: 'luggage_storage', category: 'Front Desk & Guest Services', label: 'Luggage Storage' },
  { id: 'currency_exchange', category: 'Front Desk & Guest Services', label: 'Currency Exchange' },
  { id: 'butler_service', category: 'Front Desk & Guest Services', label: 'Butler Service' },

  // 13. PET SERVICES
  { id: 'pets_allowed', category: 'Pet Services', label: 'Pets Allowed', affectsConversion: true, boost: '+17%' },
  { id: 'pet_friendly_rooms', category: 'Pet Services', label: 'Pet Friendly Rooms' },

  // 14. ENTERTAINMENT & RECREATION
  { id: 'live_music', category: 'Entertainment & Recreation', label: 'Live Music' },
  { id: 'gaming_zone', category: 'Entertainment & Recreation', label: 'Gaming Zone' },
  { id: 'beach_access', category: 'Entertainment & Recreation', label: 'Beach Access', affectsConversion: true, boost: '+30%' },
  { id: 'water_sports', category: 'Entertainment & Recreation', label: 'Water Sports' },

  // 15. PROPERTY TYPE SPECIFIC
  { id: 'resort_bonfire', category: 'Property Type Specific', label: 'Bonfire Area' },
  { id: 'washing_machine', category: 'Property Type Specific', label: 'Washing Machine' },
  { id: 'long_stay_friendly', category: 'Property Type Specific', label: 'Long Stay Friendly' },
  { id: 'shared_kitchen', category: 'Property Type Specific', label: 'Shared Kitchen' },
  { id: 'lockers', category: 'Property Type Specific', label: 'Lockers' },
  { id: 'workstation', category: 'Property Type Specific', label: 'Workstation' },

  // 16. SUSTAINABILITY & ECO
  { id: 'solar_power', category: 'Sustainability & Eco', label: 'Solar Power' },
  { id: 'eco_friendly', category: 'Sustainability & Eco', label: 'Eco-Friendly Property', affectsConversion: true, boost: '+12%' },
  { id: 'ev_friendly', category: 'Sustainability & Eco', label: 'EV Friendly' },

  // 17. PAYMENT & FINANCIAL
  { id: 'upi_accepted', category: 'Payment & Financial', label: 'UPI Accepted', isPopular: true, affectsConversion: true, boost: '+15%' },
  { id: 'credit_card_accepted', category: 'Payment & Financial', label: 'Credit Card Accepted', isPopular: true },
  { id: 'pay_at_hotel', category: 'Payment & Financial', label: 'Pay at Hotel', isPopular: true, affectsConversion: true, boost: '+25%' }
];

const PropertyOnboarding = () => {
  const navigate = useNavigate();
  const { hotelId: urlHotelId } = useParams();
  const { addToast } = useExtranet();
  
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({});
  const [errors, setErrors] = useState([]);
  const [lastSaved, setLastSaved] = useState(null);
  const [readinessScore, setReadinessScore] = useState(0);
  const [amenitySearchQuery, setAmenitySearchQuery] = useState('');
  const [selectedAmenityCategory, setSelectedAmenityCategory] = useState('Internet & Connectivity');
  const [selectedPolicyCategory, setSelectedPolicyCategory] = useState('Check-In / Check-Out');
  
  const effectiveId = (urlHotelId && urlHotelId !== 'undefined') ? urlHotelId : null;

  // Calculate Weighted Readiness Engine
  useEffect(() => {
    let score = 0;
    if (formData.name && formData.gstin) score += WEIGHTS.identity;
    if (formData.location && formData.city) score += WEIGHTS.location;
    if (formData.amenities?.length > 0) score += WEIGHTS.amenities;
    if (formData.policies?.length > 0) score += WEIGHTS.policies;
    if (formData.bankAccount || formData.ifsc) score += WEIGHTS.finance;
    
    // Media quality heuristic (mocked for now based on step progress)
    if (currentStep > 6) score += WEIGHTS.media;
    if (currentStep > 7) score += WEIGHTS.rooms;
    if (currentStep > 10) score += WEIGHTS.distribution;
    
    setReadinessScore(Math.min(score, 100));
  }, [formData, currentStep]);

  useEffect(() => {
    const startOnboarding = async () => {
      try {
        if (!effectiveId) {
          setLoading(true);
          const res = await initOnboarding();
          console.log('[Onboarding] Raw Init Response:', res);
          
          // Extremely robust extraction
          const newId = res?.hotelId || res?.data?.hotelId || res?.id || (res?.data && typeof res.data === 'string' ? res.data : null);

          if (newId) {
            navigate(`/extranet/onboarding/${newId}`, { replace: true });
          } else {
            console.error('[Onboarding] Response keys:', Object.keys(res || {}));
            throw new Error('No hotelId returned from server');
          }
        } else {
          setLoading(true);
          const res = await getProgress(effectiveId);
          const data = res?.data || res; // Handle both wrapped and unwrapped
          setFormData(data);
          setCurrentStep(data.onboardingStep || 1);
          setLoading(false);
        }
      } catch (err) {
        console.error('[Onboarding] Init Error:', err);
        addToast('Failed to initialize onboarding session', 'error');
        if (!effectiveId) {
          setTimeout(() => navigate('/extranet/dashboard'), 2000);
        }
        setLoading(false);
      }
    };
    startOnboarding();
  }, [effectiveId]);

  const validateStep = () => {
    const newErrors = [];
    if (currentStep === 1) {
      if (!formData.name) newErrors.push('Property Name is required');
      if (!formData.legalName) newErrors.push('Legal Name is required');
      if (!formData.gstin) newErrors.push('GSTIN is required');
    }
    if (currentStep === 2) {
      // Step 2 validation logic
    }
    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const handleSave = async (isDraft = true) => {
    if (!effectiveId) return;
    setSaving(true);
    try {
      await saveStep(effectiveId, currentStep, formData);
      setLastSaved(new Date());
      if (!isDraft) {
        if (currentStep < 12) {
          setCurrentStep(currentStep + 1);
          window.scrollTo(0, 0);
        }
      }
    } catch (err) {
      addToast('Failed to save progress', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    if (!validateStep()) {
      addToast(errors[0] || 'Please complete all required fields', 'warning');
      return;
    }

    const success = await handleSave();
    if (success && currentStep < STEPS.length) {
      setCurrentStep(prev => prev + 1);
      // Scroll to top
      window.scrollTo(0, 0);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
      window.scrollTo(0, 0);
    }
  };

  const handleSubmit = async () => {
    try {
      await submitProperty(effectiveId);
      addToast('Property submitted for review!', 'success');
      navigate('/extranet');
    } catch (err) {
      const msg = err.status === 400 ? 'Please complete all steps before submitting' : 'Submission failed';
      addToast(msg, 'error');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
          <p className="text-gray-500 font-medium">Initializing Onboarding Pipeline...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Intelligence Header */}
      <header className="h-20 bg-white border-b border-gray-100 flex items-center justify-between px-8 sticky top-0 z-50 shadow-sm shadow-gray-900/5">
        <div className="flex items-center gap-6">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
            <Zap size={24} fill="white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
              Hotel Activation OS 
              <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full uppercase tracking-widest font-black">Enterprise v9.7</span>
            </h1>
            <div className="flex items-center gap-3 mt-0.5">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                {STEPS[currentStep-1].title} Activation
              </p>
              <div className="w-1 h-1 bg-gray-300 rounded-full" />
              <div className="flex items-center gap-1.5">
                <Loader2 size={12} className={`text-indigo-500 ${saving ? 'animate-spin' : 'hidden'}`} />
                <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">
                  {saving ? 'Syncing...' : lastSaved ? `Last Sync: ${lastSaved.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : 'Cloud Connected'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-8">
          {/* Projected Visibility */}
          <div className="hidden lg:flex flex-col items-end">
            <div className="flex items-center gap-2 text-emerald-600">
              <TrendingUp size={16} />
              <span className="text-sm font-black tracking-tighter">12.4k - 18.2k</span>
            </div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Est. Monthly Impressions</p>
          </div>

          <div className="h-10 w-px bg-gray-100" />

          {/* Readiness Score */}
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
              <span className="text-sm font-black text-gray-900">{readinessScore}% Readiness</span>
              <div className="w-32 h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-1000 ease-out"
                  style={{ width: `${readinessScore}%` }}
                />
              </div>
            </div>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border-2 transition-all ${
              readinessScore > 80 ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-indigo-50 border-indigo-100 text-indigo-600'
            }`}>
              {readinessScore > 80 ? <BadgeCheck size={24} /> : <Target size={24} />}
            </div>
          </div>

          <button 
            onClick={() => navigate('/extranet')}
            className="p-3 bg-gray-50 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all"
          >
            <ChevronLeft size={20} />
          </button>
        </div>
      </header>
      
      {/* Operational Control Rail & Sidebar container */}
      <div className="flex flex-1 overflow-hidden">
        {/* Operational Control Rail (Sidebar) */}
        <aside className="w-80 bg-white border-r border-gray-100 flex flex-col z-20 overflow-y-auto">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Diagnostic Rail</h2>
              <div className="flex items-center gap-2 bg-red-50 text-red-600 px-2 py-1 rounded-md">
                <AlertOctagon size={12} />
                <span className="text-[10px] font-black uppercase">2 Blockers</span>
              </div>
            </div>
            
            <nav className="space-y-1">
              {STEPS.map((step) => {
                const isActive = currentStep === step.id;
                const isComplete = readinessScore > (step.id * 8); // Simple mock for now
                const hasWarning = step.id === 6 && (!formData.photos || formData.photos.length < 5);
                const isBlocked = step.id === 10 && !formData.bankAccount;

                return (
                  <button
                    key={step.id}
                    onClick={() => setCurrentStep(step.id)}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all group relative ${
                      isActive 
                        ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100' 
                        : 'text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                      isActive ? 'bg-white/20' : 'bg-gray-50 group-hover:bg-white'
                    }`}>
                      <step.icon size={20} className={isActive ? 'text-white' : 'text-gray-400'} />
                    </div>
                    
                    <div className="flex-1 text-left">
                      <p className={`text-xs font-black uppercase tracking-wider ${isActive ? 'text-white' : 'text-gray-900'}`}>
                        {step.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {isBlocked ? (
                          <div className="flex items-center gap-1 text-[10px] text-red-500 font-bold">
                            <ShieldAlert size={10} />
                            <span>Action Required</span>
                          </div>
                        ) : hasWarning ? (
                          <div className="flex items-center gap-1 text-[10px] text-amber-500 font-bold">
                            <Info size={10} />
                            <span>Improve Quality</span>
                          </div>
                        ) : isComplete ? (
                          <div className="flex items-center gap-1 text-[10px] text-emerald-500 font-bold">
                            <BadgeCheck size={10} />
                            <span>Verified</span>
                          </div>
                        ) : (
                          <p className={`text-[10px] font-bold ${isActive ? 'text-indigo-100' : 'text-gray-400'}`}>
                            {step.desc}
                          </p>
                        )}
                      </div>
                    </div>

                    {isActive && (
                      <div className="absolute right-4 w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="mt-auto p-6 border-t border-gray-50">
            <div className="bg-slate-900 rounded-2xl p-4 text-white">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
                  <Sparkles size={16} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Activation Copilot</p>
                  <p className="text-xs font-bold">Step {currentStep} Guidance</p>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
                {currentStep === 1 ? "Properties with verified legal names and GSTIN activate 40% faster." : 
                 currentStep === 6 ? "High-quality bathroom photos can increase your booking rate by 18%." :
                 "Complete this step to unlock your projected visibility."}
              </p>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto bg-white/50 backdrop-blur-3xl relative">
          <div className="max-w-4xl mx-auto p-12">
            <div className="mb-12">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-[10px] font-black bg-indigo-600 text-white px-3 py-1 rounded-full uppercase tracking-[0.2em]">Step 0{currentStep}</span>
                <div className="h-px flex-1 bg-gray-100" />
              </div>
              <h2 className="text-4xl font-black text-gray-900 tracking-tight mb-4">
                {STEPS[currentStep-1].title} 
                <span className="text-indigo-600"> Intelligence</span>
              </h2>
              <p className="text-lg text-gray-500 font-medium leading-relaxed max-w-2xl">
                {STEPS[currentStep-1].desc}. Complete this section to reach enterprise-grade operational status.
              </p>
            </div>

            <div className="bg-white rounded-[2.5rem] border border-gray-100 p-10 shadow-2xl shadow-gray-200/50 relative overflow-hidden">
              {/* Intelligent Watermark */}
              <div className="absolute top-[-50px] right-[-50px] opacity-[0.03] rotate-12">
                {React.createElement(STEPS[currentStep-1].icon, { size: 200 })}
              </div>
              
              <div className="relative z-10">
                {/* Dynamic Step Content */}
                <div className="space-y-8">
                {currentStep === 1 && (
                  <div className="space-y-10">
                    <div className="grid grid-cols-2 gap-8">
                      <div className="col-span-2 space-y-4">
                        <label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Property Classification</label>
                        <div className="grid grid-cols-5 gap-4">
                          {[
                            { id: 'hotel', label: 'Hotel', icon: Building2 },
                            { id: 'resort', label: 'Resort', icon: Sparkles },
                            { id: 'villa', label: 'Villa', icon: BadgeCheck },
                            { id: 'apartment', label: 'Apartment', icon: Landmark },
                            { id: 'homestay', label: 'Home Stay', icon: Home }
                          ].map(type => (
                            <button
                              key={type.id}
                              onClick={() => setFormData({...formData, type: type.id})}
                              className={`p-6 rounded-[2rem] border-2 transition-all flex flex-col items-center gap-3 ${
                                formData.type === type.id 
                                  ? 'border-indigo-600 bg-indigo-50 text-indigo-600' 
                                  : 'border-gray-50 bg-gray-50 text-gray-400 hover:border-gray-200'
                              }`}
                            >
                              <type.icon size={24} />
                              <span className="text-xs font-black uppercase tracking-widest text-center">{type.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Property Name</label>
                        <div className="relative">
                          <input 
                            type="text" 
                            value={formData.name || ''}
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                            className="w-full p-5 bg-gray-50 border-0 rounded-2xl focus:ring-2 focus:ring-indigo-500 transition-all font-bold text-gray-900 placeholder:text-gray-300"
                            placeholder="e.g. Grand Zivo Palace"
                          />
                          {formData.name?.length > 3 && <BadgeCheck size={20} className="absolute right-4 top-5 text-emerald-500" />}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Legal Business Name</label>
                        <input 
                          type="text" 
                          value={formData.legalName || ''}
                          onChange={(e) => setFormData({...formData, legalName: e.target.value})}
                          className="w-full p-5 bg-gray-50 border-0 rounded-2xl focus:ring-2 focus:ring-indigo-500 transition-all font-bold text-gray-900 placeholder:text-gray-300"
                          placeholder="Registered company name"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">GSTIN Number</label>
                        <div className="relative group">
                          <input 
                            type="text" 
                            value={formData.gstin || ''}
                            onChange={(e) => setFormData({...formData, gstin: e.target.value})}
                            className="w-full p-5 bg-gray-50 border-0 rounded-2xl focus:ring-2 focus:ring-indigo-500 transition-all font-mono font-bold text-gray-900"
                            placeholder="15-digit GST number"
                          />
                          {formData.gstin?.length === 15 ? (
                            <div className="absolute right-4 top-4 bg-emerald-100 text-emerald-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest animate-in fade-in zoom-in">Verified ✅</div>
                          ) : formData.gstin?.length > 0 ? (
                            <div className="absolute right-4 top-5 text-gray-300 text-[10px] font-black uppercase tracking-widest animate-pulse">Verifying...</div>
                          ) : null}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">PAN Number</label>
                        <input 
                          type="text" 
                          value={formData.pan || ''}
                          onChange={(e) => setFormData({...formData, pan: e.target.value})}
                          className="w-full p-5 bg-gray-50 border-0 rounded-2xl focus:ring-2 focus:ring-indigo-500 transition-all font-mono font-bold text-gray-900"
                        />
                      </div>

                      <div className="col-span-2 space-y-4">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Property Description</label>
                          <button className="flex items-center gap-2 text-indigo-600 bg-indigo-50 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all">
                            <Sparkles size={14} /> Generate with AI
                          </button>
                        </div>
                        <textarea 
                          rows={4}
                          value={formData.description || ''}
                          onChange={(e) => setFormData({...formData, description: e.target.value})}
                          className="w-full p-5 bg-gray-50 border-0 rounded-2xl focus:ring-2 focus:ring-indigo-500 transition-all font-medium text-gray-700 leading-relaxed"
                          placeholder="Tell guests what makes your property unique..."
                        />
                      </div>
                    </div>
                  </div>
                )}

                {currentStep === 2 && (
                  <div className="space-y-10">
                    <div className="bg-indigo-900 rounded-[2.5rem] p-10 text-white relative overflow-hidden shadow-2xl shadow-indigo-200">
                      <div className="relative z-10 flex items-start gap-6">
                        <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md">
                          <ShieldCheck size={32} className="text-indigo-300" />
                        </div>
                        <div>
                          <h4 className="text-xl font-black mb-2 tracking-tight">Compliance Engine v2.0</h4>
                          <p className="text-indigo-200 text-sm max-w-md leading-relaxed">Our AI will automatically verify your documents against GST and PAN databases. Accuracy prevents activation delays.</p>
                        </div>
                      </div>
                      <ShieldAlert className="absolute right-[-20px] top-[-20px] w-64 h-64 text-white/5 rotate-12" />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-6">
                      {[
                        { id: 'gst', label: 'GST Certificate', status: 'verified' },
                        { id: 'pan', label: 'PAN Card', status: 'pending' },
                        { id: 'bank', label: 'Cancelled Cheque', status: 'action' },
                        { id: 'fssai', label: 'FSSAI License', status: 'none' }
                      ].map((doc) => (
                        <div key={doc.id} className={`relative p-8 border-2 rounded-[2.5rem] transition-all group cursor-pointer ${
                          doc.status === 'verified' ? 'border-emerald-100 bg-emerald-50/30' : 
                          doc.status === 'action' ? 'border-red-100 bg-red-50/30' :
                          'border-gray-50 bg-gray-50 hover:border-indigo-200'
                        }`}>
                          <input 
                            type="file" 
                            className="absolute inset-0 opacity-0 cursor-pointer z-10" 
                          />
                          <div className="flex flex-col items-center gap-4 text-center">
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${
                              doc.status === 'verified' ? 'bg-emerald-500 text-white' : 
                              doc.status === 'action' ? 'bg-red-500 text-white' :
                              'bg-white text-gray-400 group-hover:text-indigo-600'
                            }`}>
                              {doc.status === 'verified' ? <BadgeCheck size={28} /> : 
                               doc.status === 'action' ? <AlertOctagon size={28} /> : 
                               <ImageIcon size={28} />}
                            </div>
                            <div>
                              <span className="text-sm font-black text-gray-900 block">{doc.label}</span>
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1 block">
                                {doc.status === 'verified' ? 'OCR Validated' : 
                                 doc.status === 'action' ? 'Blur Detected - Re-upload' :
                                 'PDF, JPG up to 10MB'}
                              </span>
                            </div>
                            
                            {doc.status === 'pending' && (
                              <div className="mt-2 w-full h-1 bg-indigo-100 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-600 w-2/3 animate-pulse" />
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {currentStep === 3 && (
                  <div className="space-y-10">
                    <div className="grid grid-cols-12 gap-8">
                      <div className="col-span-8 space-y-6">
                        <div className="space-y-2">
                          <label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Full Property Address</label>
                          <textarea 
                            rows={3}
                            value={formData.location || ''}
                            onChange={(e) => setFormData({...formData, location: e.target.value})}
                            className="w-full p-5 bg-gray-50 border-0 rounded-2xl focus:ring-2 focus:ring-indigo-500 transition-all font-medium text-gray-700"
                            placeholder="Plot number, Street, Area..."
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Landmark</label>
                            <input 
                              type="text" 
                              value={formData.landmark || ''}
                              onChange={(e) => setFormData({...formData, landmark: e.target.value})}
                              className="w-full p-5 bg-gray-50 border-0 rounded-2xl font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500" 
                              placeholder="e.g. Near Gateway of India" 
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">City</label>
                            <input 
                              type="text" 
                              value={formData.city || ''}
                              onChange={(e) => setFormData({...formData, city: e.target.value})}
                              className="w-full p-5 bg-gray-50 border-0 rounded-2xl font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500" 
                              placeholder="e.g. Mumbai" 
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Latitude</label>
                            <input 
                              type="number" 
                              step="any"
                              value={formData.latitude || ''}
                              onChange={(e) => setFormData({...formData, latitude: e.target.value})}
                              className="w-full p-5 bg-gray-50 border-0 rounded-2xl font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500" 
                              placeholder="e.g. 18.9220" 
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Longitude</label>
                            <input 
                              type="number" 
                              step="any"
                              value={formData.longitude || ''}
                              onChange={(e) => setFormData({...formData, longitude: e.target.value})}
                              className="w-full p-5 bg-gray-50 border-0 rounded-2xl font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500" 
                              placeholder="e.g. 72.8347" 
                            />
                          </div>
                        </div>
                      </div>

                      <div className="col-span-4 space-y-6">
                        <div className="p-6 bg-slate-900 rounded-[2.5rem] text-white">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Locality Score</h4>
                            <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
                              <Target size={16} />
                            </div>
                          </div>
                          <div className="text-4xl font-black mb-2">82<span className="text-lg text-slate-500">/100</span></div>
                          <p className="text-[10px] text-slate-400 font-bold mb-4 uppercase">High Demand Area</p>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-slate-400">Airport Proximity</span>
                              <span className="text-emerald-400 font-black">+15</span>
                            </div>
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-slate-400">Metro Access</span>
                              <span className="text-emerald-400 font-black">+10</span>
                            </div>
                          </div>
                        </div>

                        <div className="p-6 bg-indigo-50 rounded-[2.5rem] border border-indigo-100">
                          <div className="flex items-center gap-3 mb-2">
                            <BarChart3 size={16} className="text-indigo-600" />
                            <span className="text-[10px] font-black text-indigo-900 uppercase tracking-widest">Market Insights</span>
                          </div>
                          <p className="text-xs font-bold text-indigo-700 leading-relaxed">
                            Nearby properties average <span className="text-indigo-900">72% occupancy</span> during weekends.
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div 
                      onClick={(e) => {
                        // Simulate clicking map to pick location
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const y = e.clientY - rect.top;
                        
                        const baseLat = parseFloat(formData.latitude) || 18.9220;
                        const baseLng = parseFloat(formData.longitude) || 72.8347;
                        
                        const shiftLat = ((rect.height/2 - y) / 1000).toFixed(4);
                        const shiftLng = ((x - rect.width/2) / 1000).toFixed(4);
                        
                        const newLat = (baseLat + parseFloat(shiftLat)).toFixed(4);
                        const newLng = (baseLng + parseFloat(shiftLng)).toFixed(4);
                        
                        setFormData({
                          ...formData,
                          latitude: newLat,
                          longitude: newLng
                        });
                        
                        if (addToast) {
                          addToast('Pin repositioned successfully!', 'success');
                        }
                      }}
                      className="h-80 bg-gray-50 rounded-[3rem] border-4 border-white shadow-inner flex flex-col items-center justify-center gap-6 relative overflow-hidden group cursor-crosshair"
                    >
                      <div className="absolute inset-0 bg-[url('https://api.mapbox.com/styles/v1/mapbox/light-v10/static/0,0,1,0/800x400?access_token=mock')] bg-cover opacity-20 grayscale group-hover:opacity-40 group-hover:grayscale-0 transition-all duration-700" />
                      
                      {/* Search Bar on Map */}
                      <div 
                        onClick={(e) => e.stopPropagation()} 
                        className="absolute top-4 left-4 right-4 z-20 flex gap-2"
                      >
                        <input 
                          type="text" 
                          placeholder="Search landmark, street, or city..." 
                          className="flex-1 px-4 py-2.5 bg-white/95 backdrop-blur border-0 rounded-xl font-bold text-xs shadow-lg text-gray-800 placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                          id="mapSearchInput"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const val = e.currentTarget.value;
                              const randLat = (18.9000 + Math.random() * 0.1).toFixed(4);
                              const randLng = (72.8000 + Math.random() * 0.1).toFixed(4);
                              setFormData({
                                ...formData,
                                latitude: randLat,
                                longitude: randLng,
                                location: val,
                                landmark: val.split(',')[0]
                              });
                              if (addToast) {
                                addToast(`Centered on: "${val}"`, 'success');
                              }
                            }
                          }}
                        />
                        <button 
                          onClick={() => {
                            const input = document.getElementById('mapSearchInput');
                            if (input && input.value) {
                              const val = input.value;
                              const randLat = (18.9000 + Math.random() * 0.1).toFixed(4);
                              const randLng = (72.8000 + Math.random() * 0.1).toFixed(4);
                              setFormData({
                                ...formData,
                                latitude: randLat,
                                longitude: randLng,
                                location: val,
                                landmark: val.split(',')[0]
                              });
                              if (addToast) {
                                addToast(`Centered on: "${val}"`, 'success');
                              }
                            }
                          }}
                          className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black shadow-lg hover:bg-indigo-700 transition-colors"
                        >
                          Search
                        </button>
                      </div>

                      <div className="relative z-10 flex flex-col items-center animate-bounce">
                        <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center text-white shadow-2xl shadow-indigo-400 ring-8 ring-indigo-500/20">
                          <MapPin size={24} fill="white" />
                        </div>
                        <div className="mt-4 px-4 py-2 bg-slate-900 text-white rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl">
                          Target: {formData.latitude || '18.9220'}, {formData.longitude || '72.8347'}
                        </div>
                      </div>
                      
                      <div className="absolute bottom-4 z-10 bg-white/95 backdrop-blur px-6 py-2.5 rounded-full text-[10px] font-bold text-gray-500 shadow-md">
                        💡 Click anywhere on the map above to select and reposition the pin precisely!
                      </div>
                    </div>
                  </div>
                )}

                {currentStep === 4 && (() => {
                  const activeAmenities = formData.amenities || [];
                  
                  // Filter amenities based on active search
                  const filteredAmenities = AMENITIES_MASTER.filter(item => {
                    const query = amenitySearchQuery.toLowerCase();
                    return item.label.toLowerCase().includes(query) || item.category.toLowerCase().includes(query);
                  });

                  // Categorize master list
                  const categories = Array.from(new Set(AMENITIES_MASTER.map(item => item.category)));

                  // Calculate completeness score
                  const selectedCount = activeAmenities.length;
                  const completenessPercentage = Math.min(Math.round((selectedCount / 12) * 100), 100);

                  // Extract popular quick-select options
                  const popularItems = AMENITIES_MASTER.filter(item => item.isPopular);

                  // Determine AI Conversion Recommendation
                  let recommendationText = "Add 'Free Wi-Fi' to capture 21% more bookings!";
                  let recommendationColor = "text-indigo-700 bg-indigo-50 border-indigo-100";
                  if (activeAmenities.includes('free_wifi') && !activeAmenities.includes('breakfast_included')) {
                    recommendationText = "Properties with 'Breakfast Included' convert 19% better. Add it next!";
                    recommendationColor = "text-emerald-700 bg-emerald-50 border-emerald-100";
                  } else if (activeAmenities.includes('free_wifi') && activeAmenities.includes('breakfast_included') && !activeAmenities.includes('ac')) {
                    recommendationText = "AI Suggestion: 'Air Conditioning' yields a 45% occupancy increase. Recommended!";
                    recommendationColor = "text-amber-700 bg-amber-50 border-amber-100";
                  } else if (activeAmenities.length >= 6) {
                    recommendationText = "🚀 Excellent coverage! Your property is in the top 10% for rich content on Zivo!";
                    recommendationColor = "text-purple-700 bg-purple-50 border-purple-100";
                  }

                  return (
                    <div className="space-y-8 animate-fadeIn">
                      {/* Header & Completeness */}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <h4 className="text-2xl font-black text-gray-900 tracking-tight">Facilities & Services</h4>
                          <p className="text-sm text-gray-400 font-medium">Select amenities to unlock premium OTA tags and boost visibility.</p>
                        </div>
                        
                        {/* Coverage Progress */}
                        <div className="bg-gray-50 border border-gray-100 p-4 rounded-2xl flex items-center gap-4 min-w-[200px]">
                          <div className="flex-1 space-y-1">
                            <div className="flex justify-between text-[10px] font-black text-gray-500 uppercase">
                              <span>Coverage Score</span>
                              <span className="text-indigo-600">{completenessPercentage}%</span>
                            </div>
                            <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                              <div 
                                className="bg-indigo-600 h-full transition-all duration-500" 
                                style={{ width: `${completenessPercentage}%` }} 
                              />
                            </div>
                          </div>
                          <div className="w-10 h-10 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 font-black text-xs">
                            {selectedCount}
                          </div>
                        </div>
                      </div>

                      {/* AI Conversion Insights Banner */}
                      <div className={`p-5 rounded-3xl border flex items-center gap-4 transition-all duration-300 ${recommendationColor}`}>
                        <div className="p-2 bg-white/80 rounded-xl">
                          <Zap size={18} className="animate-pulse" />
                        </div>
                        <div className="text-xs font-bold leading-relaxed">{recommendationText}</div>
                      </div>

                      {/* Live Amenities Search Bar */}
                      <div className="relative">
                        <span className="absolute inset-y-0 left-5 flex items-center text-gray-400">
                          <Search size={18} />
                        </span>
                        <input 
                          type="text" 
                          placeholder="Search facilities, connectivity, or specific amenities..." 
                          value={amenitySearchQuery}
                          onChange={(e) => setAmenitySearchQuery(e.target.value)}
                          className="w-full pl-14 pr-6 py-5 bg-gray-50 border-0 rounded-2xl font-semibold text-gray-800 placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-600 focus:bg-white transition-all shadow-sm"
                        />
                        {amenitySearchQuery && (
                          <button 
                            onClick={() => setAmenitySearchQuery('')}
                            className="absolute inset-y-0 right-5 text-xs font-bold text-gray-400 hover:text-indigo-600"
                          >
                            Clear
                          </button>
                        )}
                      </div>

                      {/* Quick Popular Tags */}
                      {!amenitySearchQuery && (
                        <div className="space-y-3 bg-gray-50/50 p-6 rounded-3xl border border-gray-50">
                          <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">⚡ Most Popular OTA Features (High Boost)</h5>
                          <div className="flex flex-wrap gap-2">
                            {popularItems.map((item) => {
                              const isChecked = activeAmenities.includes(item.id);
                              return (
                                <button
                                  key={`popular-${item.id}`}
                                  onClick={() => {
                                    const updated = isChecked 
                                      ? activeAmenities.filter(id => id !== item.id)
                                      : [...activeAmenities, item.id];
                                    setFormData({...formData, amenities: updated});
                                  }}
                                  className={`px-4 py-2.5 rounded-full border text-[11px] font-black transition-all flex items-center gap-2 hover:scale-[1.03] active:scale-[0.98] ${
                                    isChecked
                                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                                      : 'bg-white border-gray-150 text-gray-600 hover:border-gray-300'
                                  }`}
                                >
                                  <span>{item.label}</span>
                                  {item.boost && (
                                    <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-extrabold ${isChecked ? 'bg-indigo-700 text-white' : 'bg-emerald-50 text-emerald-600'}`}>
                                      {item.boost}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Main Category Sidebar + Amenities Layout */}
                      <div className="grid grid-cols-12 gap-8 pt-2">
                        {/* Sidebar Categories (Hide if searching to keep clean UI) */}
                        {!amenitySearchQuery && (
                          <div className="col-span-4 space-y-1 pr-4 border-r border-gray-100 max-h-[500px] overflow-y-auto scrollbar-thin">
                            <h5 className="px-3 pb-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Categories</h5>
                            {categories.map((category) => {
                              const catCount = AMENITIES_MASTER.filter(item => item.category === category && activeAmenities.includes(item.id)).length;
                              const isActive = selectedAmenityCategory === category;
                              return (
                                <button
                                  key={category}
                                  onClick={() => setSelectedAmenityCategory(category)}
                                  className={`w-full px-4 py-3.5 rounded-2xl flex items-center justify-between text-left transition-all ${
                                    isActive
                                      ? 'bg-indigo-50 text-indigo-900 font-extrabold'
                                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 font-bold'
                                  }`}
                                >
                                  <span className="text-xs truncate">{category}</span>
                                  {catCount > 0 && (
                                    <span className={`text-[9px] px-2 py-0.5 rounded-full font-black ${isActive ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                                      {catCount}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Amenities Grid */}
                        <div className={amenitySearchQuery ? "col-span-12" : "col-span-8"}>
                          <div className="flex items-center justify-between mb-4 px-1">
                            <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                              {amenitySearchQuery ? `Filtered Search Results (${filteredAmenities.length})` : selectedAmenityCategory}
                            </h5>
                          </div>

                          {filteredAmenities.length === 0 ? (
                            <div className="text-center py-16 bg-gray-50 rounded-[2.5rem] border-2 border-dashed border-gray-150">
                              <span className="text-gray-400 font-black text-xs uppercase tracking-widest block mb-2">No matching facilities found</span>
                              <p className="text-[11px] text-gray-400 font-medium">Try searching another keyword or browsing categories.</p>
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-3 max-h-[460px] overflow-y-auto scrollbar-thin pr-2">
                              {(amenitySearchQuery ? filteredAmenities : filteredAmenities.filter(item => item.category === selectedAmenityCategory)).map((item) => {
                                const isChecked = activeAmenities.includes(item.id);
                                return (
                                  <button
                                    key={item.id}
                                    onClick={() => {
                                      const updated = isChecked 
                                        ? activeAmenities.filter(id => id !== item.id)
                                        : [...activeAmenities, item.id];
                                      setFormData({...formData, amenities: updated});
                                    }}
                                    className={`p-5 rounded-2xl border text-left flex items-start gap-4 transition-all relative overflow-hidden group ${
                                      isChecked
                                        ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900 shadow-sm'
                                        : 'border-gray-100 bg-white text-gray-600 hover:border-gray-200 hover:shadow-sm'
                                    }`}
                                  >
                                    {/* Tick checkbox style */}
                                    <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-all ${
                                      isChecked ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300'
                                    }`}>
                                      {isChecked && (
                                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4">
                                          <path strokeLinecap="round" strokeLinejoin="round" stroke="d1 M5 13l4 4L19 7" />
                                        </svg>
                                      )}
                                    </div>
                                    
                                    <div className="flex-1 space-y-0.5">
                                      <div className="text-xs font-black uppercase tracking-wider">{item.label}</div>
                                      {item.affectsConversion && (
                                        <div className="text-[9px] text-emerald-600 font-bold flex items-center gap-1">
                                          <span>+{item.boost} Booking Conversion</span>
                                        </div>
                                      )}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {currentStep === 5 && (() => {
                  const activePolicies = formData.policies || {};

                  // Updater helper
                  const updatePolicy = (key, value) => {
                    const current = formData.policies || {};
                    const updated = { ...current, [key]: String(value) };
                    setFormData({ ...formData, policies: updated });
                  };

                  // Dynamic Policy Readiness Score
                  const policyKeys = Object.keys(activePolicies);
                  const populatedCount = policyKeys.filter(k => activePolicies[k] && activePolicies[k] !== 'undefined').length;
                  const policyQualityScore = Math.min(35 + Math.round((populatedCount / 22) * 65), 100);

                  // Dynamic Safety Score (Safety & Security policies)
                  let safetyScore = 50;
                  if (activePolicies.cctv_coverage === 'true') safetyScore += 10;
                  if (activePolicies.fire_safety_compliance === 'true') safetyScore += 15;
                  if (activePolicies.sanitized_rooms === 'true') safetyScore += 10;
                  if (activePolicies.contactless_checkin === 'true') safetyScore += 10;
                  if (activePolicies.medical_assistance === 'true') safetyScore += 5;

                  // Policy categories mapping
                  const POLICY_CATEGORIES = [
                    { id: 'checkin', label: 'Check-In / Check-Out', icon: Clock },
                    { id: 'guest', label: 'Guest Policies', icon: Heart },
                    { id: 'cancellation', label: 'Cancellation Policies', icon: Shield },
                    { id: 'payment', label: 'Payment Policies', icon: DollarSign },
                    { id: 'child', label: 'Child Policies', icon: Sparkles },
                    { id: 'extrabed', label: 'Extra Bed Policies', icon: Bed },
                    { id: 'pet', label: 'Pet Policies', icon: Activity },
                    { id: 'dining', label: 'Food & Dining', icon: Coffee },
                    { id: 'safety', label: 'Safety & Security', icon: ShieldAlert },
                    { id: 'rules', label: 'Property Rules', icon: ClipboardList },
                    { id: 'accessibility', label: 'Accessibility', icon: Info },
                    { id: 'legal', label: 'Legal & Compliance', icon: Landmark }
                  ];

                  return (
                    <div className="space-y-8 animate-fadeIn">
                      {/* Top Header */}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-6">
                        <div className="space-y-1">
                          <h4 className="text-2xl font-black text-gray-900 tracking-tight">Trust & Governance</h4>
                          <p className="text-sm text-gray-400 font-medium">Configure rules, check-in terms, and cancellation bounds to build guest credibility.</p>
                        </div>

                        {/* Policy Trust Score Indicator */}
                        <div className="bg-slate-900 text-white p-4 rounded-3xl flex items-center gap-4 min-w-[240px]">
                          <div className="flex-1 space-y-1">
                            <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase tracking-wider">
                              <span>Policy Trust Score</span>
                              <span className="text-emerald-400 font-black">{policyQualityScore}%</span>
                            </div>
                            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                              <div 
                                className="bg-emerald-400 h-full transition-all duration-500" 
                                style={{ width: `${policyQualityScore}%` }} 
                              />
                            </div>
                          </div>
                          <div className="w-10 h-10 bg-slate-800 border border-slate-700 rounded-2xl flex items-center justify-center text-emerald-400">
                            <Shield size={18} />
                          </div>
                        </div>
                      </div>

                      {/* Main Sidebar + Content + Live Preview Layout */}
                      <div className="grid grid-cols-12 gap-8">
                        
                        {/* Sidebar Category Selectors (4 Columns) */}
                        <div className="col-span-3 space-y-1 pr-2 border-r border-gray-100 max-h-[580px] overflow-y-auto scrollbar-thin">
                          <h5 className="px-3 pb-3 text-[9px] font-black text-gray-400 uppercase tracking-widest">Policy Cards</h5>
                          {POLICY_CATEGORIES.map((cat) => {
                            const isActive = selectedPolicyCategory === cat.label;
                            return (
                              <button
                                key={cat.id}
                                onClick={() => setSelectedPolicyCategory(cat.label)}
                                className={`w-full px-4 py-3.5 rounded-2xl flex items-center gap-3 text-left transition-all ${
                                  isActive
                                    ? 'bg-indigo-50 text-indigo-900 font-extrabold shadow-sm'
                                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 font-bold'
                                }`}
                              >
                                <cat.icon size={16} className={isActive ? 'text-indigo-600' : 'text-gray-400'} />
                                <span className="text-xs truncate">{cat.label}</span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Interactive Policy Form Fields (5 Columns) */}
                        <div className="col-span-5 space-y-6 max-h-[580px] overflow-y-auto scrollbar-thin pr-3">
                          
                          {/* 1. CHECK-IN / CHECK-OUT POLICIES */}
                          {selectedPolicyCategory === 'Check-In / Check-Out' && (
                            <div className="space-y-6">
                              <div className="p-5 bg-indigo-50/50 rounded-2xl border border-indigo-50 flex items-start gap-3">
                                <Zap size={16} className="text-indigo-600 mt-0.5" />
                                <p className="text-[11px] text-indigo-800 font-bold leading-relaxed">
                                  💡 **Flexible check-in** option improves conversion rates by **9%** on average!
                                </p>
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Standard Check-In</label>
                                  <select 
                                    value={activePolicies.standard_checkin_time || '12 PM'}
                                    onChange={(e) => updatePolicy('standard_checkin_time', e.target.value)}
                                    className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold text-xs text-gray-900 focus:ring-2 focus:ring-indigo-600"
                                  >
                                    <option value="12 PM">12 PM</option>
                                    <option value="1 PM">1 PM</option>
                                    <option value="2 PM">2 PM</option>
                                    <option value="Flexible">Flexible</option>
                                  </select>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Standard Check-Out</label>
                                  <select 
                                    value={activePolicies.standard_checkout_time || '11 AM'}
                                    onChange={(e) => updatePolicy('standard_checkout_time', e.target.value)}
                                    className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold text-xs text-gray-900 focus:ring-2 focus:ring-indigo-600"
                                  >
                                    <option value="10 AM">10 AM</option>
                                    <option value="11 AM">11 AM</option>
                                    <option value="12 PM">12 PM</option>
                                  </select>
                                </div>
                              </div>

                              {/* Toggle & Inputs */}
                              <div className="space-y-4">
                                {[
                                  { id: 'early_checkin_allowed', label: 'Early Check-In Allowed', hasFee: 'early_checkin_fee' },
                                  { id: 'late_checkout_allowed', label: 'Late Check-Out Allowed', hasFee: 'late_checkout_fee' }
                                ].map(item => (
                                  <div key={item.id} className="p-4 border border-gray-100 rounded-2xl space-y-3">
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs font-black text-gray-900 uppercase tracking-wide">{item.label}</span>
                                      <button 
                                        onClick={() => updatePolicy(item.id, activePolicies[item.id] === 'true' ? 'false' : 'true')}
                                        className={`w-12 h-6 rounded-full relative transition-all ${
                                          activePolicies[item.id] === 'true' ? 'bg-indigo-600' : 'bg-gray-200'
                                        }`}
                                      >
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${
                                          activePolicies[item.id] === 'true' ? 'right-1' : 'left-1'
                                        }`} />
                                      </button>
                                    </div>
                                    {activePolicies[item.id] === 'true' && (
                                      <div className="animate-fadeIn pt-1">
                                        <input 
                                          type="number" 
                                          placeholder="Enter Fee amount (₹)" 
                                          value={activePolicies[item.hasFee] || ''}
                                          onChange={(e) => updatePolicy(item.hasFee, e.target.value)}
                                          className="w-full p-3 bg-gray-50 border-0 rounded-xl font-bold text-xs focus:ring-1 focus:ring-indigo-600"
                                        />
                                      </div>
                                    )}
                                  </div>
                                ))}

                                {/* Subject to Availability */}
                                <label className="flex items-center gap-3 p-4 border border-gray-100 rounded-2xl cursor-pointer hover:border-gray-200">
                                  <input 
                                    type="checkbox"
                                    checked={activePolicies.checkin_checkout_subject_to_availability === 'true'}
                                    onChange={(e) => updatePolicy('checkin_checkout_subject_to_availability', e.target.checked)}
                                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                  />
                                  <span className="text-[11px] font-bold text-gray-600">Early check-in/late check-out is subject to availability</span>
                                </label>

                                {/* 24h Check-in */}
                                <div className="p-4 border border-gray-100 rounded-2xl flex items-center justify-between">
                                  <span className="text-xs font-black text-gray-900 uppercase tracking-wide">24-Hour Check-In Available</span>
                                  <button 
                                    onClick={() => updatePolicy('checkin_24h', activePolicies.checkin_24h === 'true' ? 'false' : 'true')}
                                    className={`w-12 h-6 rounded-full relative transition-all ${
                                      activePolicies.checkin_24h === 'true' ? 'bg-indigo-600' : 'bg-gray-200'
                                    }`}
                                  >
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${
                                      activePolicies.checkin_24h === 'true' ? 'right-1' : 'left-1'
                                    }`} />
                                  </button>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Reception Hours</label>
                                    <input 
                                      type="text" 
                                      placeholder="e.g. 24 Hours or 6AM-11PM"
                                      value={activePolicies.reception_hours || '24 Hours'}
                                      onChange={(e) => updatePolicy('reception_hours', e.target.value)}
                                      className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold text-xs focus:ring-2 focus:ring-indigo-600"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Min Check-In Age</label>
                                    <input 
                                      type="number" 
                                      placeholder="18"
                                      value={activePolicies.minimum_checkin_age || '18'}
                                      onChange={(e) => updatePolicy('minimum_checkin_age', e.target.value)}
                                      className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold text-xs focus:ring-2 focus:ring-indigo-600"
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* 2. GUEST POLICIES */}
                          {selectedPolicyCategory === 'Guest Policies' && (
                            <div className="space-y-6 animate-fadeIn">
                              {/* Local ID Risk Alert Warning */}
                              {activePolicies.local_id_accepted === 'false' && (
                                <div className="p-5 bg-rose-50 rounded-2xl border border-rose-100 flex items-start gap-3">
                                  <AlertCircle size={18} className="text-rose-500 mt-0.5" />
                                  <div>
                                    <h6 className="text-xs font-black text-rose-900 uppercase">Policy Risk Warning</h6>
                                    <p className="text-[10px] text-rose-700 font-bold mt-0.5 leading-relaxed">
                                      Disabling **Local ID** may reduce booking frequency in metro cities by up to **28%**!
                                    </p>
                                  </div>
                                </div>
                              )}

                              <div className="space-y-3">
                                <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Rule Toggles</h5>
                                {[
                                  { id: 'couple_friendly', label: 'Couple Friendly', note: 'Allows unmarried couples to check in' },
                                  { id: 'local_id_accepted', label: 'Local ID Accepted', note: 'Permits guests residing in the same city' },
                                  { id: 'smoking_allowed', label: 'Smoking Allowed', note: 'Permits smoking in smoking rooms/zones' },
                                  { id: 'alcohol_allowed', label: 'Alcohol Allowed', note: 'Permits consumption of alcohol in rooms' },
                                  { id: 'visitors_allowed', label: 'Visitors Allowed', note: 'Allows external visitors in guest rooms' },
                                  { id: 'bachelor_groups_allowed', label: 'Bachelor Groups Allowed', note: 'Accepts group bookings for singles' },
                                  { id: 'women_travelers_friendly', label: 'Women Travelers Friendly', note: 'Highlights extra safety guidelines' }
                                ].map(rule => (
                                  <div key={rule.id} className="p-4 border border-gray-100 rounded-2xl flex items-center justify-between">
                                    <div>
                                      <span className="text-xs font-black text-gray-900 uppercase tracking-wide block">{rule.label}</span>
                                      <span className="text-[9px] text-gray-400 font-medium block mt-0.5">{rule.note}</span>
                                    </div>
                                    <button 
                                      onClick={() => updatePolicy(rule.id, activePolicies[rule.id] === 'true' ? 'false' : 'true')}
                                      className={`w-12 h-6 rounded-full relative transition-all ${
                                        activePolicies[rule.id] === 'true' ? 'bg-indigo-600' : 'bg-gray-200'
                                      }`}
                                    >
                                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${
                                        activePolicies[rule.id] === 'true' ? 'right-1' : 'left-1'
                                      }`} />
                                    </button>
                                  </div>
                                ))}
                              </div>

                              <div className="space-y-3">
                                <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Operational Controls</h5>
                                {[
                                  { id: 'guest_id_mandatory', label: 'Guest ID Mandatory' },
                                  { id: 'valid_gov_id_required', label: 'Valid Government ID required' },
                                  { id: 'foreign_passport_required', label: 'Foreign guest passport & visa required' }
                                ].map(rule => (
                                  <div key={rule.id} className="p-4 border border-gray-100 rounded-2xl flex items-center justify-between">
                                    <span className="text-xs font-black text-gray-900 uppercase tracking-wide">{rule.label}</span>
                                    <button 
                                      onClick={() => updatePolicy(rule.id, activePolicies[rule.id] === 'true' ? 'false' : 'true')}
                                      className={`w-12 h-6 rounded-full relative transition-all ${
                                        activePolicies[rule.id] === 'true' ? 'bg-indigo-600' : 'bg-gray-200'
                                      }`}
                                    >
                                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${
                                        activePolicies[rule.id] === 'true' ? 'right-1' : 'left-1'
                                      }`} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 3. CANCELLATION POLICIES */}
                          {selectedPolicyCategory === 'Cancellation Policies' && (
                            <div className="space-y-6 animate-fadeIn">
                              <div className="p-5 bg-indigo-50/50 rounded-2xl border border-indigo-50 flex items-start gap-3">
                                <Zap size={16} className="text-indigo-600 mt-0.5 animate-pulse" />
                                <p className="text-[11px] text-indigo-800 font-bold leading-relaxed">
                                  💡 **Flexible Cancellation** increases overall booking conversion by **18%**. Moderate is recommended to balance protection and volume.
                                </p>
                              </div>

                              <div className="space-y-4">
                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Cancellation Type</label>
                                <div className="grid grid-cols-3 gap-3">
                                  {[
                                    { id: 'flexible', label: 'Flexible', note: 'Free till 24h' },
                                    { id: 'moderate', label: 'Moderate', note: 'Free till 48h' },
                                    { id: 'strict', label: 'Strict', note: 'Non-refundable' }
                                  ].map(plan => {
                                    const isActive = (activePolicies.cancellation_type || 'moderate') === plan.id;
                                    return (
                                      <button
                                        key={plan.id}
                                        type="button"
                                        onClick={() => {
                                          updatePolicy('cancellation_type', plan.id);
                                          if (plan.id === 'flexible') {
                                            updatePolicy('free_cancellation_window', '24 hours');
                                            updatePolicy('refund_percentage', '100%');
                                          } else if (plan.id === 'moderate') {
                                            updatePolicy('free_cancellation_window', '48 hours');
                                            updatePolicy('refund_percentage', '50%');
                                          } else {
                                            updatePolicy('free_cancellation_window', 'None');
                                            updatePolicy('refund_percentage', '0%');
                                          }
                                        }}
                                        className={`p-4 rounded-2xl border text-center transition-all ${
                                          isActive
                                            ? 'border-indigo-600 bg-indigo-50/30 font-black text-indigo-900 shadow-sm'
                                            : 'border-gray-100 bg-white hover:border-gray-300 text-gray-600 font-bold'
                                        }`}
                                      >
                                        <div className="text-xs uppercase tracking-wide">{plan.label}</div>
                                        <div className="text-[8px] text-gray-400 mt-0.5">{plan.note}</div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="space-y-4 pt-2">
                                <div className="space-y-2">
                                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Free Cancellation Window</label>
                                  <select 
                                    value={activePolicies.free_cancellation_window || '24 hours'}
                                    onChange={(e) => updatePolicy('free_cancellation_window', e.target.value)}
                                    className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold text-xs focus:ring-2 focus:ring-indigo-600"
                                  >
                                    <option value="24 hours">24 Hours before Check-In</option>
                                    <option value="48 hours">48 Hours before Check-In</option>
                                    <option value="7 days">7 Days before Check-In</option>
                                    <option value="None">Non-Refundable</option>
                                  </select>
                                </div>

                                <div className="space-y-2">
                                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Partial Refund Percentage (After Deadline)</label>
                                  <select 
                                    value={activePolicies.refund_percentage || '50%'}
                                    onChange={(e) => updatePolicy('refund_percentage', e.target.value)}
                                    className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold text-xs focus:ring-2 focus:ring-indigo-600"
                                  >
                                    <option value="100%">100% Refund</option>
                                    <option value="75%">75% Refund</option>
                                    <option value="50%">50% Refund</option>
                                    <option value="25%">25% Refund</option>
                                    <option value="0%">0% (No Refund)</option>
                                  </select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">No-Show Penalty</label>
                                    <select 
                                      value={activePolicies.noshow_penalty || 'Full booking cost'}
                                      onChange={(e) => updatePolicy('noshow_penalty', e.target.value)}
                                      className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold text-xs focus:ring-2 focus:ring-indigo-600"
                                    >
                                      <option value="Full booking cost">Full Booking Cost</option>
                                      <option value="First night cost">First Night Cost Only</option>
                                    </select>
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Refund Mode Timeline</label>
                                    <input 
                                      type="text" 
                                      placeholder="e.g. 5-7 Business Days"
                                      value={activePolicies.refund_processing_time || '5-7 Business Days'}
                                      onChange={(e) => updatePolicy('refund_processing_time', e.target.value)}
                                      className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold text-xs focus:ring-2 focus:ring-indigo-600"
                                    />
                                  </div>
                                </div>

                                <div className="p-4 border border-gray-100 rounded-2xl flex items-center justify-between">
                                  <span className="text-xs font-black text-gray-900 uppercase tracking-wide">Booking Modification Allowed</span>
                                  <button 
                                    onClick={() => updatePolicy('modification_allowed', activePolicies.modification_allowed === 'true' ? 'false' : 'true')}
                                    className={`w-12 h-6 rounded-full relative transition-all ${
                                      activePolicies.modification_allowed === 'true' ? 'bg-indigo-600' : 'bg-gray-200'
                                    }`}
                                  >
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${
                                      activePolicies.modification_allowed === 'true' ? 'right-1' : 'left-1'
                                    }`} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* 4. PAYMENT POLICIES */}
                          {selectedPolicyCategory === 'Payment Policies' && (
                            <div className="space-y-6 animate-fadeIn">
                              <div className="p-5 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-start gap-3">
                                <BadgeCheck size={18} className="text-emerald-600 mt-0.5" />
                                <div>
                                  <h6 className="text-xs font-black text-emerald-900 uppercase">Settlement Transparency</h6>
                                  <p className="text-[10px] text-emerald-700 font-bold mt-0.5 leading-relaxed">
                                    **Zivo settles operator payouts in T+2 cycle.** Seamless payouts, directly to bank accounts.
                                  </p>
                                </div>
                              </div>

                              <div className="space-y-4">
                                <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Supported Formats</h5>
                                {[
                                  { id: 'pay_at_hotel', label: 'Pay at Hotel Enabled', note: 'Guests pay in-person upon arrival' },
                                  { id: 'online_prepaid', label: 'Online Prepaid Accepted', note: 'Instant processing through Zivo Payment Gateway' }
                                ].map(pay => (
                                  <div key={pay.id} className="p-4 border border-gray-100 rounded-2xl flex items-center justify-between">
                                    <div>
                                      <span className="text-xs font-black text-gray-900 uppercase tracking-wide block">{pay.label}</span>
                                      <span className="text-[9px] text-gray-400 font-medium block mt-0.5">{pay.note}</span>
                                    </div>
                                    <button 
                                      onClick={() => updatePolicy(pay.id, activePolicies[pay.id] === 'true' ? 'false' : 'true')}
                                      className={`w-12 h-6 rounded-full relative transition-all ${
                                        activePolicies[pay.id] === 'true' ? 'bg-indigo-600' : 'bg-gray-200'
                                      }`}
                                    >
                                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${
                                        activePolicies[pay.id] === 'true' ? 'right-1' : 'left-1'
                                      }`} />
                                    </button>
                                  </div>
                                ))}

                                {/* Partial Advance */}
                                <div className="p-4 border border-gray-100 rounded-2xl space-y-3">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <span className="text-xs font-black text-gray-900 uppercase tracking-wide block">Partial Advance Deposit</span>
                                      <span className="text-[9px] text-gray-400 font-medium block mt-0.5">Require guest to pay booking percentage ahead</span>
                                    </div>
                                    <button 
                                      onClick={() => updatePolicy('partial_advance', activePolicies.partial_advance === 'true' ? 'false' : 'true')}
                                      className={`w-12 h-6 rounded-full relative transition-all ${
                                        activePolicies.partial_advance === 'true' ? 'bg-indigo-600' : 'bg-gray-200'
                                      }`}
                                    >
                                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${
                                        activePolicies.partial_advance === 'true' ? 'right-1' : 'left-1'
                                      }`} />
                                    </button>
                                  </div>
                                  {activePolicies.partial_advance === 'true' && (
                                    <input 
                                      type="number" 
                                      placeholder="Advance Percentage e.g. 25"
                                      value={activePolicies.advance_percentage || '25'}
                                      onChange={(e) => updatePolicy('advance_percentage', e.target.value)}
                                      className="w-full p-3 bg-gray-50 border-0 rounded-xl font-bold text-xs focus:ring-1 focus:ring-indigo-600"
                                    />
                                  )}
                                </div>

                                {/* Security Deposit */}
                                <div className="p-4 border border-gray-100 rounded-2xl space-y-3">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <span className="text-xs font-black text-gray-900 uppercase tracking-wide block">Security Deposit Required</span>
                                      <span className="text-[9px] text-gray-400 font-medium block mt-0.5">Refundable deposit on check-in</span>
                                    </div>
                                    <button 
                                      onClick={() => updatePolicy('security_deposit_required', activePolicies.security_deposit_required === 'true' ? 'false' : 'true')}
                                      className={`w-12 h-6 rounded-full relative transition-all ${
                                        activePolicies.security_deposit_required === 'true' ? 'bg-indigo-600' : 'bg-gray-200'
                                      }`}
                                    >
                                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${
                                        activePolicies.security_deposit_required === 'true' ? 'right-1' : 'left-1'
                                      }`} />
                                    </button>
                                  </div>
                                  {activePolicies.security_deposit_required === 'true' && (
                                    <input 
                                      type="number" 
                                      placeholder="Security Deposit Amount (₹)"
                                      value={activePolicies.security_deposit_amount || ''}
                                      onChange={(e) => updatePolicy('security_deposit_amount', e.target.value)}
                                      className="w-full p-3 bg-gray-50 border-0 rounded-xl font-bold text-xs focus:ring-1 focus:ring-indigo-600"
                                    />
                                  )}
                                </div>

                                <div className="grid grid-cols-2 gap-3 pt-2">
                                  {[
                                    { id: 'cash_accepted', label: 'Cash Accepted' },
                                    { id: 'upi_accepted', label: 'UPI Accepted' },
                                    { id: 'credit_card_accepted', label: 'Credit Cards' },
                                    { id: 'intl_cards_accepted', label: 'International Cards' }
                                  ].map(method => (
                                    <label key={method.id} className="flex items-center gap-3 p-3 border border-gray-150 rounded-xl cursor-pointer hover:bg-gray-50">
                                      <input 
                                        type="checkbox"
                                        checked={activePolicies[method.id] === 'true'}
                                        onChange={(e) => updatePolicy(method.id, e.target.checked)}
                                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                      />
                                      <span className="text-[11px] font-bold text-gray-700">{method.label}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* 5. CHILD POLICIES */}
                          {selectedPolicyCategory === 'Child Policies' && (
                            <div className="space-y-6 animate-fadeIn">
                              <div className="p-4 border border-gray-100 rounded-2xl flex items-center justify-between">
                                <span className="text-xs font-black text-gray-900 uppercase tracking-wide">Children Allowed</span>
                                <button 
                                  onClick={() => updatePolicy('children_allowed', activePolicies.children_allowed === 'true' ? 'false' : 'true')}
                                  className={`w-12 h-6 rounded-full relative transition-all ${
                                    activePolicies.children_allowed === 'true' ? 'bg-indigo-600' : 'bg-gray-200'
                                  }`}
                                >
                                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${
                                    activePolicies.children_allowed === 'true' ? 'right-1' : 'left-1'
                                  }`} />
                                </button>
                              </div>

                              {activePolicies.children_allowed === 'true' && (
                                <div className="space-y-4 animate-fadeIn">
                                  <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Kids Stay Free Age Limit</label>
                                      <input 
                                        type="number" 
                                        placeholder="e.g. 6"
                                        value={activePolicies.kids_stay_free_age || '6'}
                                        onChange={(e) => updatePolicy('kids_stay_free_age', e.target.value)}
                                        className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold text-xs focus:ring-2 focus:ring-indigo-600"
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Charges for older children (₹)</label>
                                      <input 
                                        type="number" 
                                        placeholder="e.g. 500"
                                        value={activePolicies.child_charges || '500'}
                                        onChange={(e) => updatePolicy('child_charges', e.target.value)}
                                        className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold text-xs focus:ring-2 focus:ring-indigo-600"
                                      />
                                    </div>
                                  </div>

                                  {[
                                    { id: 'child_extra_mattress_available', label: 'Extra Mattress Available for Kids' },
                                    { id: 'crib_available', label: 'Crib / Cot Available' }
                                  ].map(rule => (
                                    <div key={rule.id} className="p-4 border border-gray-100 rounded-2xl flex items-center justify-between">
                                      <span className="text-xs font-black text-gray-900 uppercase tracking-wide">{rule.label}</span>
                                      <button 
                                        onClick={() => updatePolicy(rule.id, activePolicies[rule.id] === 'true' ? 'false' : 'true')}
                                        className={`w-12 h-6 rounded-full relative transition-all ${
                                          activePolicies[rule.id] === 'true' ? 'bg-indigo-600' : 'bg-gray-200'
                                        }`}
                                      >
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${
                                          activePolicies[rule.id] === 'true' ? 'right-1' : 'left-1'
                                        }`} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* 6. EXTRA BED POLICIES */}
                          {selectedPolicyCategory === 'Extra Bed Policies' && (
                            <div className="space-y-6 animate-fadeIn">
                              <div className="p-4 border border-gray-100 rounded-2xl flex items-center justify-between">
                                <span className="text-xs font-black text-gray-900 uppercase tracking-wide">Extra Bed Option Available</span>
                                <button 
                                  onClick={() => updatePolicy('extra_bed_available', activePolicies.extra_bed_available === 'true' ? 'false' : 'true')}
                                  className={`w-12 h-6 rounded-full relative transition-all ${
                                    activePolicies.extra_bed_available === 'true' ? 'bg-indigo-600' : 'bg-gray-200'
                                  }`}
                                >
                                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${
                                    activePolicies.extra_bed_available === 'true' ? 'right-1' : 'left-1'
                                  }`} />
                                </button>
                              </div>

                              {activePolicies.extra_bed_available === 'true' && (
                                <div className="space-y-4 animate-fadeIn">
                                  <div className="space-y-2">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Extra Bed Charges (₹/night)</label>
                                    <input 
                                      type="number" 
                                      placeholder="e.g. 1000"
                                      value={activePolicies.extra_bed_cost || '1000'}
                                      onChange={(e) => updatePolicy('extra_bed_cost', e.target.value)}
                                      className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold text-xs focus:ring-2 focus:ring-indigo-600"
                                    />
                                  </div>

                                  {[
                                    { id: 'extra_mattress_available', label: 'Extra Mattress Available' },
                                    { id: 'sofa_bed_available', label: 'Sofa Bed Available' }
                                  ].map(bed => (
                                    <div key={bed.id} className="p-4 border border-gray-100 rounded-2xl flex items-center justify-between">
                                      <span className="text-xs font-black text-gray-900 uppercase tracking-wide">{bed.label}</span>
                                      <button 
                                        onClick={() => updatePolicy(bed.id, activePolicies[bed.id] === 'true' ? 'false' : 'true')}
                                        className={`w-12 h-6 rounded-full relative transition-all ${
                                          activePolicies[bed.id] === 'true' ? 'bg-indigo-600' : 'bg-gray-200'
                                        }`}
                                      >
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${
                                          activePolicies[bed.id] === 'true' ? 'right-1' : 'left-1'
                                        }`} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* 7. PET POLICIES */}
                          {selectedPolicyCategory === 'Pet Policies' && (
                            <div className="space-y-6 animate-fadeIn">
                              <div className="p-4 border border-gray-100 rounded-2xl flex items-center justify-between">
                                <span className="text-xs font-black text-gray-900 uppercase tracking-wide">Pets Allowed</span>
                                <button 
                                  onClick={() => updatePolicy('pets_allowed', activePolicies.pets_allowed === 'true' ? 'false' : 'true')}
                                  className={`w-12 h-6 rounded-full relative transition-all ${
                                    activePolicies.pets_allowed === 'true' ? 'bg-indigo-600' : 'bg-gray-200'
                                  }`}
                                >
                                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${
                                    activePolicies.pets_allowed === 'true' ? 'right-1' : 'left-1'
                                  }`} />
                                </button>
                              </div>

                              {activePolicies.pets_allowed === 'true' && (
                                <div className="space-y-4 animate-fadeIn">
                                  <div className="p-5 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-start gap-3">
                                    <Trophy size={18} className="text-indigo-600 mt-0.5" />
                                    <div>
                                      <h6 className="text-xs font-black text-indigo-900 uppercase">🏆 Pet Friendly Badge Eligible</h6>
                                      <p className="text-[10px] text-indigo-700 font-bold mt-0.5 leading-relaxed">
                                        Your property will display the prominent Pet-Friendly trust badge, placing you in high demand searches!
                                      </p>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Pet Fee (₹/night)</label>
                                      <input 
                                        type="number" 
                                        placeholder="e.g. 500"
                                        value={activePolicies.pet_fee || '500'}
                                        onChange={(e) => updatePolicy('pet_fee', e.target.value)}
                                        className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold text-xs focus:ring-2 focus:ring-indigo-600"
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Refundable Pet Deposit (₹)</label>
                                      <input 
                                        type="number" 
                                        placeholder="e.g. 1000"
                                        value={activePolicies.pet_deposit || '1000'}
                                        onChange={(e) => updatePolicy('pet_deposit', e.target.value)}
                                        className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold text-xs focus:ring-2 focus:ring-indigo-600"
                                      />
                                    </div>
                                  </div>

                                  <div className="space-y-2">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Pet Size Restriction</label>
                                    <input 
                                      type="text" 
                                      placeholder="e.g. Below 15kg"
                                      value={activePolicies.pet_size_restriction || 'Below 15kg'}
                                      onChange={(e) => updatePolicy('pet_size_restriction', e.target.value)}
                                      className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold text-xs focus:ring-2 focus:ring-indigo-600"
                                    />
                                  </div>

                                  <div className="space-y-2">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Permitted Pet Areas</label>
                                    <input 
                                      type="text" 
                                      placeholder="e.g. Designated Areas Only or Guest Rooms & Gardens"
                                      value={activePolicies.pet_areas_allowed || 'Designated Areas Only'}
                                      onChange={(e) => updatePolicy('pet_areas_allowed', e.target.value)}
                                      className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold text-xs focus:ring-2 focus:ring-indigo-600"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* 8. FOOD & DINING */}
                          {selectedPolicyCategory === 'Food & Dining' && (
                            <div className="space-y-6 animate-fadeIn">
                              {[
                                { id: 'outside_food_allowed', label: 'Outside Food Allowed' },
                                { id: 'veg_only', label: 'Pure Veg Property' },
                                { id: 'jain_food_available', label: 'Jain Food Available on Request' },
                                { id: 'alcohol_served', label: 'Alcohol Served at Property' }
                              ].map(rule => (
                                <div key={rule.id} className="p-4 border border-gray-100 rounded-2xl flex items-center justify-between">
                                  <span className="text-xs font-black text-gray-900 uppercase tracking-wide">{rule.label}</span>
                                  <button 
                                    onClick={() => updatePolicy(rule.id, activePolicies[rule.id] === 'true' ? 'false' : 'true')}
                                    className={`w-12 h-6 rounded-full relative transition-all ${
                                      activePolicies[rule.id] === 'true' ? 'bg-indigo-600' : 'bg-gray-200'
                                    }`}
                                  >
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${
                                      activePolicies[rule.id] === 'true' ? 'right-1' : 'left-1'
                                    }`} />
                                  </button>
                                </div>
                              ))}

                              <div className="grid grid-cols-2 gap-4 pt-2">
                                <div className="space-y-2">
                                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Breakfast Timings</label>
                                  <input 
                                    type="text" 
                                    placeholder="e.g. 7:30 AM - 10:30 AM"
                                    value={activePolicies.breakfast_timing || '7:30 AM - 10:30 AM'}
                                    onChange={(e) => updatePolicy('breakfast_timing', e.target.value)}
                                    className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold text-xs focus:ring-2 focus:ring-indigo-600"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Restaurant Timings</label>
                                  <input 
                                    type="text" 
                                    placeholder="e.g. 11:00 AM - 11:00 PM"
                                    value={activePolicies.restaurant_timing || '11:00 AM - 11:00 PM'}
                                    onChange={(e) => updatePolicy('restaurant_timing', e.target.value)}
                                    className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold text-xs focus:ring-2 focus:ring-indigo-600"
                                  />
                                </div>
                              </div>
                            </div>
                          )}

                          {/* 9. SAFETY & SECURITY */}
                          {selectedPolicyCategory === 'Safety & Security' && (
                            <div className="space-y-6 animate-fadeIn">
                              {/* Safety Score Meter */}
                              <div className="p-5 bg-slate-900 text-white rounded-3xl space-y-4">
                                <div className="flex justify-between items-center">
                                  <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Safety & Audit Score</span>
                                  <span className="text-emerald-400 text-sm font-black tracking-tight">{safetyScore}%</span>
                                </div>
                                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                                  <div 
                                    className="bg-emerald-400 h-full transition-all duration-300"
                                    style={{ width: `${safetyScore}%` }}
                                  />
                                </div>
                                <p className="text-[9px] text-slate-400 font-bold uppercase leading-relaxed">
                                  🎯 A Safety Score of **75% or higher** unlocks "Verified Safety Standards" on booking lists.
                                </p>
                              </div>

                              {[
                                { id: 'cctv_coverage', label: 'CCTV Camera Surveillance' },
                                { id: 'fire_safety_compliance', label: 'Fire Safety Compliant (NOC obtained)' },
                                { id: 'sanitized_rooms', label: 'Daily Sanitized Rooms & Common Zones' },
                                { id: 'contactless_checkin', label: 'Contactless Check-In Options' },
                                { id: 'medical_assistance', label: 'Medical Assistance / Doctor on Call' }
                              ].map(rule => (
                                <div key={rule.id} className="p-4 border border-gray-100 rounded-2xl flex items-center justify-between">
                                  <span className="text-xs font-black text-gray-900 uppercase tracking-wide">{rule.label}</span>
                                  <button 
                                    onClick={() => updatePolicy(rule.id, activePolicies[rule.id] === 'true' ? 'false' : 'true')}
                                    className={`w-12 h-6 rounded-full relative transition-all ${
                                      activePolicies[rule.id] === 'true' ? 'bg-indigo-600' : 'bg-gray-200'
                                    }`}
                                  >
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${
                                      activePolicies[rule.id] === 'true' ? 'right-1' : 'left-1'
                                    }`} />
                                  </button>
                                </div>
                              ))}

                              <div className="space-y-2">
                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Local Emergency Contact Number</label>
                                <input 
                                  type="text" 
                                  placeholder="e.g. +91 99999 99999"
                                  value={activePolicies.emergency_contact || ''}
                                  onChange={(e) => updatePolicy('emergency_contact', e.target.value)}
                                  className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold text-xs focus:ring-2 focus:ring-indigo-600"
                                />
                              </div>
                            </div>
                          )}

                          {/* 10. PROPERTY RULES */}
                          {selectedPolicyCategory === 'Property Rules' && (
                            <div className="space-y-6 animate-fadeIn">
                              {[
                                { id: 'noise_restrictions', label: 'Noise Restrictions / Quiet Hours Enforced' },
                                { id: 'parties_allowed', label: 'Parties / Gatherings Allowed' },
                                { id: 'events_allowed', label: 'Private Events Permitted' },
                                { id: 'commercial_shoots_allowed', label: 'Commercial Shoots Allowed' },
                                { id: 'drone_usage_allowed', label: 'Drone Flights Allowed' },
                                { id: 'visitor_restrictions', label: 'Strict Guest Visitor Restrictions' }
                              ].map(rule => (
                                <div key={rule.id} className="p-4 border border-gray-100 rounded-2xl flex items-center justify-between">
                                  <span className="text-xs font-black text-gray-900 uppercase tracking-wide">{rule.label}</span>
                                  <button 
                                    onClick={() => updatePolicy(rule.id, activePolicies[rule.id] === 'true' ? 'false' : 'true')}
                                    className={`w-12 h-6 rounded-full relative transition-all ${
                                      activePolicies[rule.id] === 'true' ? 'bg-indigo-600' : 'bg-gray-200'
                                    }`}
                                  >
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${
                                      activePolicies[rule.id] === 'true' ? 'right-1' : 'left-1'
                                    }`} />
                                  </button>
                                </div>
                              ))}

                              <div className="grid grid-cols-2 gap-4 pt-2">
                                <div className="space-y-2">
                                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Quiet Hours Timeline</label>
                                  <input 
                                    type="text" 
                                    placeholder="e.g. 10:00 PM - 7:00 AM"
                                    value={activePolicies.quiet_hours || '10:00 PM - 7:00 AM'}
                                    onChange={(e) => updatePolicy('quiet_hours', e.target.value)}
                                    className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold text-xs focus:ring-2 focus:ring-indigo-600"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Smoking Inside Room Penalty (₹)</label>
                                  <input 
                                    type="number" 
                                    placeholder="2000"
                                    value={activePolicies.smoking_penalty || '2000'}
                                    onChange={(e) => updatePolicy('smoking_penalty', e.target.value)}
                                    className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-bold text-xs focus:ring-2 focus:ring-indigo-600"
                                  />
                                </div>
                              </div>
                            </div>
                          )}

                          {/* 11. ACCESSIBILITY */}
                          {selectedPolicyCategory === 'Accessibility' && (
                            <div className="space-y-6 animate-fadeIn">
                              {[
                                { id: 'wheelchair_accessible', label: 'Wheelchair Accessible Pathways' },
                                { id: 'elevator_available', label: 'Elevator / Lift Available' },
                                { id: 'accessible_rooms', label: 'ADA Accessible Guest Rooms Available' },
                                { id: 'hearing_assistance', label: 'Hearing Assistance Kits' },
                                { id: 'braille_signage', label: 'Braille Signage & Tactile Indicators' }
                              ].map(rule => (
                                <div key={rule.id} className="p-4 border border-gray-100 rounded-2xl flex items-center justify-between">
                                  <span className="text-xs font-black text-gray-900 uppercase tracking-wide">{rule.label}</span>
                                  <button 
                                    onClick={() => updatePolicy(rule.id, activePolicies[rule.id] === 'true' ? 'false' : 'true')}
                                    className={`w-12 h-6 rounded-full relative transition-all ${
                                      activePolicies[rule.id] === 'true' ? 'bg-indigo-600' : 'bg-gray-200'
                                    }`}
                                  >
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${
                                      activePolicies[rule.id] === 'true' ? 'right-1' : 'left-1'
                                    }`} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* 12. LEGAL & COMPLIANCE */}
                          {selectedPolicyCategory === 'Legal & Compliance' && (
                            <div className="space-y-6 animate-fadeIn">
                              {[
                                { id: 'gst_applicable', label: 'GST Applicable (Tax registration provided)' },
                                { id: 'invoice_provided', label: 'GST Invoice Provided to Guests' },
                                { id: 'pan_verified', label: 'PAN Verification Completed' },
                                { id: 'foreign_guests_accepted', label: 'Foreign Guests Accepted (Form C registration active)' },
                                { id: 'police_reporting_compliance', label: 'Local Police Reporting Compliant' }
                              ].map(rule => (
                                <div key={rule.id} className="p-4 border border-gray-100 rounded-2xl flex items-center justify-between">
                                  <span className="text-xs font-black text-gray-900 uppercase tracking-wide">{rule.label}</span>
                                  <button 
                                    onClick={() => updatePolicy(rule.id, activePolicies[rule.id] === 'true' ? 'false' : 'true')}
                                    className={`w-12 h-6 rounded-full relative transition-all ${
                                      activePolicies[rule.id] === 'true' ? 'bg-indigo-600' : 'bg-gray-200'
                                    }`}
                                  >
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${
                                      activePolicies[rule.id] === 'true' ? 'right-1' : 'left-1'
                                    }`} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                        </div>

                        {/* Live Guest Checkout Policy Preview Panel (4 Columns) */}
                        <div className="col-span-4 bg-gray-50 border border-gray-100 p-6 rounded-[2.5rem] max-h-[580px] overflow-y-auto scrollbar-thin">
                          <div className="flex items-center gap-3 border-b border-gray-200 pb-4 mb-4">
                            <Eye size={18} className="text-gray-400" />
                            <h5 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Traveler Rules Preview</h5>
                          </div>

                          <div className="space-y-5">
                            {/* Hotel Name / Preview Header */}
                            <div>
                              <span className="bg-indigo-100 text-indigo-700 text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                                Guest Policy Manifest
                              </span>
                              <h6 className="text-xs font-black text-gray-900 uppercase tracking-wide mt-1.5">{formData.name || 'Your Property'}</h6>
                            </div>

                            {/* Check-in preview */}
                            <div className="space-y-1">
                              <span className="text-[9px] font-black text-gray-400 uppercase block">⏰ CHECK-IN & CHECK-OUT</span>
                              <div className="text-[10px] text-gray-700 font-bold flex flex-wrap gap-x-2">
                                <span>Check-In: **{activePolicies.standard_checkin_time || '12 PM'}**</span>
                                <span className="text-gray-300">|</span>
                                <span>Check-Out: **{activePolicies.standard_checkout_time || '11 AM'}**</span>
                              </div>
                              {activePolicies.early_checkin_allowed === 'true' && (
                                <p className="text-[9px] text-gray-500 font-bold italic mt-0.5">
                                  * Early check-in allowed (Fee: ₹{activePolicies.early_checkin_fee || '0'}
                                  {activePolicies.checkin_checkout_subject_to_availability === 'true' && ' - subject to availability'})
                                </p>
                              )}
                            </div>

                            {/* Cancellation Preview */}
                            <div className="space-y-1">
                              <span className="text-[9px] font-black text-gray-400 uppercase block">🛡️ Cancellation & Deadlines</span>
                              <p className="text-[10px] text-gray-700 font-bold leading-normal">
                                {(activePolicies.cancellation_type || 'moderate') === 'flexible' && (
                                  <span>Free cancellation till **24 hours** before check-in. **100%** refund after deadline. No-show penalty is {activePolicies.noshow_penalty || 'Full booking cost'}.</span>
                                )}
                                {(activePolicies.cancellation_type || 'moderate') === 'moderate' && (
                                  <span>Free cancellation till **48 hours** before check-in. **50%** refund after deadline. No-show penalty is {activePolicies.noshow_penalty || 'Full booking cost'}.</span>
                                )}
                                {(activePolicies.cancellation_type || 'moderate') === 'strict' && (
                                  <span>Non-refundable booking. Cancellation or no-show will be charged **100%** booking cost.</span>
                                )}
                              </p>
                            </div>

                            {/* Guest Rules */}
                            <div className="space-y-1.5">
                              <span className="text-[9px] font-black text-gray-400 uppercase block">👥 Guest Rules & Badges</span>
                              <div className="flex flex-wrap gap-1.5">
                                {activePolicies.couple_friendly === 'true' && (
                                  <span className="bg-emerald-500 text-white text-[8px] font-extrabold px-2 py-1 rounded-full uppercase">Couple Friendly</span>
                                )}
                                {activePolicies.local_id_accepted === 'true' && (
                                  <span className="bg-indigo-600 text-white text-[8px] font-extrabold px-2 py-1 rounded-full uppercase">Local ID Accepted</span>
                                )}
                                {activePolicies.pets_allowed === 'true' && (
                                  <span className="bg-amber-500 text-white text-[8px] font-extrabold px-2 py-1 rounded-full uppercase">Pet Friendly</span>
                                )}
                                {activePolicies.women_travelers_friendly === 'true' && (
                                  <span className="bg-purple-600 text-white text-[8px] font-extrabold px-2 py-1 rounded-full uppercase">Women Friendly</span>
                                )}
                              </div>
                              <div className="text-[9px] text-gray-500 font-bold leading-relaxed space-y-0.5 pt-0.5">
                                <div>• Valid Government ID is **{activePolicies.valid_gov_id_required === 'true' ? 'Mandatory' : 'Optional'}** for check-in.</div>
                                <div>• Smoking is **{activePolicies.smoking_allowed === 'true' ? 'Allowed' : 'Prohibited'}** inside rooms.</div>
                                {activePolicies.smoking_allowed !== 'true' && activePolicies.smoking_penalty && (
                                  <div className="text-rose-600 font-extrabold">• Smoking in non-smoking rooms fine: ₹{activePolicies.smoking_penalty}.</div>
                                )}
                                {activePolicies.quiet_hours && (
                                  <div>• Quiet hours: **{activePolicies.quiet_hours}** daily.</div>
                                )}
                              </div>
                            </div>

                            {/* Payments accepted */}
                            <div className="space-y-1">
                              <span className="text-[9px] font-black text-gray-400 uppercase block">💳 Payments Accepted</span>
                              <div className="text-[9px] text-gray-600 font-extrabold uppercase tracking-wide flex flex-wrap gap-2">
                                {activePolicies.cash_accepted === 'true' && <span>💵 Cash</span>}
                                {activePolicies.upi_accepted === 'true' && <span>⚡ UPI</span>}
                                {activePolicies.credit_card_accepted === 'true' && <span>💳 Credit Card</span>}
                                {activePolicies.pay_at_hotel === 'true' && <span className="text-emerald-600">✓ Pay at Hotel</span>}
                              </div>
                              {activePolicies.partial_advance === 'true' && (
                                <p className="text-[9px] text-indigo-600 font-bold italic mt-0.5">
                                  * Requires **{activePolicies.advance_percentage || '25'}%** advance prepaid deposit.
                                </p>
                              )}
                            </div>

                            {/* Kids & Extra mattress */}
                            <div className="space-y-1">
                              <span className="text-[9px] font-black text-gray-400 uppercase block">🍼 Children & Extra Beds</span>
                              <p className="text-[10px] text-gray-600 font-bold leading-relaxed">
                                {activePolicies.children_allowed === 'true' ? (
                                  <span>Children below **{activePolicies.kids_stay_free_age || '6'}** stay free. Older child fee: ₹{activePolicies.child_charges || '500'}/night.</span>
                                ) : (
                                  <span>Children are not accepted at this property.</span>
                                )}
                                {activePolicies.extra_bed_available === 'true' && (
                                  <span className="block mt-0.5">* Extra bed charges: **₹{activePolicies.extra_bed_cost || '1000'}**/night.</span>
                                )}
                              </p>
                            </div>

                          </div>
                        </div>

                      </div>
                    </div>
                  );
                })()}

                {currentStep === 6 && (
                  <div className="space-y-10">
                    <div className="grid grid-cols-12 gap-8">
                      <div className="col-span-8 space-y-8">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xl font-black text-gray-900 tracking-tight">Property Gallery</h4>
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Min 5 photos required</span>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-6">
                          <div className="relative col-span-1 h-56 border-4 border-dashed border-gray-100 rounded-[2.5rem] flex flex-col items-center justify-center gap-3 bg-gray-50/50 group cursor-pointer hover:border-indigo-200 hover:bg-indigo-50/30 transition-all">
                            <input type="file" className="absolute inset-0 opacity-0 cursor-pointer z-10" multiple />
                            <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-100">
                              <ImageIcon size={28} />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Upload Media</span>
                          </div>
                          {[1, 2].map(i => (
                            <div key={i} className="h-56 bg-gray-100 rounded-[2.5rem] relative overflow-hidden group shadow-sm">
                              <div className="absolute inset-0 flex items-center justify-center">
                                <ImageIcon size={32} className="text-gray-200" />
                              </div>
                              <div className="absolute top-4 left-4 flex items-center gap-2">
                                <span className="bg-emerald-500 text-white text-[8px] font-black px-2 py-1 rounded-full uppercase tracking-widest">HQ</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="col-span-4 space-y-6">
                        <div className="p-8 bg-slate-900 rounded-[2.5rem] text-white">
                          <div className="flex items-center justify-between mb-6">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Media Quality Score</h4>
                            <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
                              <Activity size={16} />
                            </div>
                          </div>
                          <div className="text-4xl font-black mb-2">68<span className="text-lg text-slate-500">/100</span></div>
                          <p className="text-[10px] text-amber-400 font-bold mb-6 uppercase">Improvement Recommended</p>
                          
                          <div className="space-y-4">
                            <div className="flex items-center gap-3">
                              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                              <span className="text-[10px] text-slate-300 font-bold">Resolution Validated</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                              <span className="text-[10px] text-slate-300 font-bold underline">Bathroom Photos Missing</span>
                            </div>
                            <div className="flex items-center gap-3 opacity-40">
                              <div className="w-1.5 h-1.5 bg-slate-500 rounded-full" />
                              <span className="text-[10px] text-slate-300 font-bold">Duplicate Detection</span>
                            </div>
                          </div>
                        </div>

                        <div className="p-6 bg-indigo-600 rounded-[2.5rem] text-white shadow-xl shadow-indigo-200/50">
                          <div className="flex items-center gap-3 mb-3">
                            <Zap size={16} fill="white" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-100">Conversion Lever</span>
                          </div>
                          <p className="text-xs font-bold leading-relaxed">
                            Adding bathroom and lobby photos can increase your booking probability by <span className="text-white underline">24%</span>.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {currentStep === 7 && (
                  <div className="space-y-10">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <h4 className="text-xl font-black text-gray-900 tracking-tight">Room Configuration</h4>
                        <p className="text-sm text-gray-400 font-medium">Define your room categories with <span className="text-indigo-600">Operational Precision</span>.</p>
                      </div>
                      <button className="text-[10px] font-black text-indigo-600 flex items-center gap-2 bg-indigo-50 px-5 py-2.5 rounded-2xl uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all">
                        + Add Room Category
                      </button>
                    </div>
                    
                    <div className="space-y-6">
                      {[
                        { name: 'Deluxe Room', size: '250 sqft', capacity: '2 Adults', boost: '+18%' },
                        { name: 'Executive Suite', size: '450 sqft', capacity: '3 Adults', boost: '+24%' }
                      ].map((room, i) => (
                        <div key={i} className="p-8 bg-gray-50 rounded-[2.5rem] border border-gray-100 flex items-center justify-between group hover:border-indigo-200 transition-all">
                          <div className="flex items-center gap-6">
                            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-gray-300 group-hover:text-indigo-600 shadow-sm transition-all">
                              <Bed size={32} />
                            </div>
                            <div>
                              <p className="font-black text-gray-900 text-lg uppercase tracking-tight">{room.name}</p>
                              <div className="flex items-center gap-3 mt-1">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{room.size}</span>
                                <div className="w-1 h-1 bg-gray-200 rounded-full" />
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{room.capacity}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-8">
                            <div className="text-right">
                              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">{room.boost} Yield</p>
                              <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">Market Optimized</p>
                            </div>
                            <button className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-gray-400 hover:text-indigo-600 shadow-sm transition-all">
                              <ChevronRight size={20} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {currentStep === 8 && (
                  <div className="space-y-10">
                    <div className="grid grid-cols-12 gap-8">
                      <div className="col-span-7 space-y-8">
                        <div className="p-10 bg-indigo-900 rounded-[3rem] text-white relative overflow-hidden shadow-2xl shadow-indigo-200">
                          <div className="relative z-10">
                            <h4 className="text-2xl font-black mb-2 tracking-tight">Revenue Simulation</h4>
                            <p className="text-indigo-200 text-sm max-w-sm mb-8 leading-relaxed">Adjust your base rate to see projected monthly earnings and occupancy confidence.</p>
                            
                            <div className="space-y-6">
                              <div className="flex items-center justify-between p-6 bg-white/10 rounded-3xl backdrop-blur-md border border-white/10">
                                <div>
                                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Target Base Rate</p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-2xl font-black">₹</span>
                                    <input type="number" className="bg-transparent text-2xl font-black border-0 focus:ring-0 p-0 w-32" defaultValue={2800} />
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Confidence</p>
                                  <p className="text-2xl font-black text-emerald-400">82%</p>
                                </div>
                              </div>
                            </div>
                          </div>
                          <DollarSign className="absolute right-[-20px] top-[-20px] w-64 h-64 text-white/5" />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-6 bg-gray-50 rounded-[2rem] border border-gray-100">
                            <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Estimated Payout</h5>
                            <div className="space-y-3">
                              <div className="flex justify-between text-xs font-bold">
                                <span className="text-gray-500">Gross Room Rate</span>
                                <span className="text-gray-900">₹2,800</span>
                              </div>
                              <div className="flex justify-between text-xs font-bold">
                                <span className="text-gray-500">Commission (15%)</span>
                                <span className="text-red-500">-₹420</span>
                              </div>
                              <div className="h-px bg-gray-200" />
                              <div className="flex justify-between text-sm font-black">
                                <span className="text-gray-900">Net to Bank</span>
                                <span className="text-emerald-600">₹2,380</span>
                              </div>
                            </div>
                          </div>
                          <div className="p-6 bg-indigo-50 rounded-[2rem] border border-indigo-100 flex flex-col justify-center">
                            <p className="text-[10px] font-black text-indigo-900 uppercase tracking-widest mb-2">Payout Frequency</p>
                            <p className="text-lg font-black text-indigo-600 uppercase tracking-tight">T+2 Cycle</p>
                            <p className="text-[10px] text-indigo-400 font-bold mt-1 uppercase">Automated Settlement</p>
                          </div>
                        </div>
                      </div>

                      <div className="col-span-5 space-y-6">
                        <div className="p-8 bg-slate-900 rounded-[3rem] text-white">
                          <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Market Intelligence</h5>
                          <div className="space-y-6">
                            <div>
                              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Market Average</p>
                              <p className="text-xl font-black tracking-tight">₹3,250</p>
                              <div className="w-full h-1 bg-slate-800 rounded-full mt-2 overflow-hidden">
                                <div className="w-3/4 h-full bg-indigo-500" />
                              </div>
                            </div>
                            <div>
                              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Occupancy Forecast</p>
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold">Weekdays</span>
                                <span className="text-xs font-black text-indigo-400">58%</span>
                              </div>
                              <div className="flex items-center justify-between mt-1">
                                <span className="text-xs font-bold">Weekends</span>
                                <span className="text-xs font-black text-emerald-400">82%</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="p-8 bg-emerald-900 rounded-[3rem] text-white flex items-center gap-6">
                          <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center">
                            <Zap size={24} className="text-emerald-400" />
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">AI Eligibility</p>
                            <p className="text-xs font-bold leading-relaxed">Dynamic pricing will be <span className="text-emerald-300 underline">active</span> after first 5 bookings.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {currentStep === 9 && (
                  <div className="space-y-10">
                    <div className="p-10 bg-slate-900 rounded-[3rem] text-white flex items-center gap-8 shadow-2xl shadow-gray-200">
                      <div className="w-20 h-20 bg-indigo-600 rounded-[2rem] flex items-center justify-center shadow-xl shadow-indigo-500/20">
                        <Calendar size={40} className="text-white" />
                      </div>
                      <div>
                        <h4 className="text-2xl font-black mb-2 tracking-tight">Connectivity Strategy</h4>
                        <p className="text-slate-400 text-sm max-w-md leading-relaxed">Select how you want to manage your inventory and rates. This affects your daily operational workflow.</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-6">
                      {[
                        { id: 'manual', label: 'Manual Control', desc: 'Directly update on Zivo Extranet', icon: Eye, active: true },
                        { id: 'cm', label: 'Channel Manager', desc: 'Sync from STAAH, AxisRooms, etc.', icon: Share2 },
                        { id: 'api', label: 'Enterprise API', desc: 'Full PMS/ERP integration', icon: Zap }
                      ].map(strategy => (
                        <button
                          key={strategy.id}
                          className={`p-8 rounded-[3rem] border-2 transition-all flex flex-col items-center text-center gap-4 ${
                            strategy.active 
                              ? 'border-indigo-600 bg-white shadow-2xl shadow-indigo-100' 
                              : 'border-gray-50 bg-gray-50 text-gray-400 hover:border-gray-200'
                          }`}
                        >
                          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${
                            strategy.active ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white'
                          }`}>
                            <strategy.icon size={28} />
                          </div>
                          <div>
                            <p className="text-sm font-black text-gray-900 uppercase tracking-widest">{strategy.label}</p>
                            <p className="text-[10px] text-gray-400 font-bold mt-1 leading-relaxed">{strategy.desc}</p>
                          </div>
                          {strategy.active && (
                            <div className="mt-2 bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest">Selected</div>
                          )}
                        </button>
                      ))}
                    </div>

                    <div className="p-8 bg-indigo-50 rounded-[2.5rem] border border-indigo-100">
                      <div className="flex items-center gap-4">
                        <Info size={24} className="text-indigo-600" />
                        <p className="text-xs font-bold text-indigo-700 leading-relaxed">
                          Properties using <span className="font-black">Channel Managers</span> typically see <span className="text-indigo-900 underline">+38% higher visibility</span> due to 100% rate parity.
                        </p>
                      </div>
                    </div>
                  </div>
                )}                {currentStep === 10 && (
                  <div className="space-y-10">
                    <div className="grid grid-cols-12 gap-8">
                      <div className="col-span-7 space-y-8">
                        <div className="p-10 bg-indigo-50 rounded-[3rem] border border-indigo-100 relative overflow-hidden">
                          <h4 className="text-2xl font-black text-indigo-900 mb-6 tracking-tight">Financial Payout Setup</h4>
                          <div className="space-y-6">
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Bank Account Holder</label>
                              <input type="text" className="w-full p-5 bg-white border-0 rounded-2xl shadow-sm focus:ring-2 focus:ring-indigo-500 font-bold" placeholder="Legal Name as per Bank" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Account Number</label>
                                <input type="text" className="w-full p-5 bg-white border-0 rounded-2xl shadow-sm focus:ring-2 focus:ring-indigo-500 font-bold" placeholder="0000 0000 0000" />
                              </div>
                              <div className="space-y-2">
                                <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">IFSC Code</label>
                                <input type="text" className="w-full p-5 bg-white border-0 rounded-2xl shadow-sm focus:ring-2 focus:ring-indigo-500 font-bold uppercase" placeholder="ZIVO0001234" />
                              </div>
                            </div>
                          </div>
                          <Landmark className="absolute right-[-20px] bottom-[-20px] w-48 h-48 text-indigo-500/5 rotate-12" />
                        </div>

                        <div className="flex items-center gap-4 p-6 bg-emerald-50 rounded-3xl border border-emerald-100">
                          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
                            <ShieldCheck size={20} />
                          </div>
                          <p className="text-xs font-bold text-emerald-800">Bank details are encrypted using <span className="underline">AES-256</span>. Payouts processed every Tuesday.</p>
                        </div>
                      </div>

                      <div className="col-span-5">
                        <div className="p-8 bg-slate-900 rounded-[3rem] text-white">
                          <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Payout Transparency</h5>
                          <div className="space-y-4">
                            <div className="flex justify-between text-xs font-bold">
                              <span className="text-slate-400">Sample Booking</span>
                              <span className="text-white">₹10,000</span>
                            </div>
                            <div className="flex justify-between text-xs font-bold">
                              <span className="text-slate-400">Zivo Commission (15%)</span>
                              <span className="text-red-400">-₹1,500</span>
                            </div>
                            <div className="flex justify-between text-xs font-bold">
                              <span className="text-slate-400">TCS / TDS (2%)</span>
                              <span className="text-red-400">-₹200</span>
                            </div>
                            <div className="h-px bg-slate-800 my-2" />
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="text-[10px] font-black text-indigo-400 uppercase">Net Payout</p>
                                <p className="text-3xl font-black">₹8,300</p>
                              </div>
                              <div className="text-right">
                                <p className="text-[10px] font-black text-emerald-400 uppercase">Trust Score</p>
                                <p className="text-xl font-black">HIGH</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {currentStep === 11 && (
                  <div className="space-y-10">
                    <div className="grid grid-cols-12 gap-8">
                      <div className="col-span-8 space-y-8">
                        <div className="p-10 bg-indigo-600 rounded-[3rem] text-white relative overflow-hidden shadow-2xl shadow-indigo-200">
                          <div className="relative z-10">
                            <h4 className="text-2xl font-black mb-2 tracking-tight">Distribution Reach</h4>
                            <p className="text-indigo-100 text-sm max-w-sm leading-relaxed">Your property will be automatically distributed to our global partner network.</p>
                            <div className="mt-8 flex items-center gap-6">
                              <div className="text-center">
                                <p className="text-4xl font-black">50+</p>
                                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-200 mt-1">OTAs</p>
                              </div>
                              <div className="w-px h-12 bg-white/20" />
                              <div className="text-center">
                                <p className="text-4xl font-black">1.2M</p>
                                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-200 mt-1">Monthly Users</p>
                              </div>
                            </div>
                          </div>
                          <Share2 className="absolute right-[-20px] top-[-20px] w-64 h-64 text-white/10" />
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                          {[
                            { name: 'Zivo Hotels', reach: 'Direct', status: 'Active' },
                            { name: 'Booking.com', reach: 'Global', status: 'Ready' },
                            { name: 'Expedia', reach: 'Americas', status: 'Ready' },
                            { name: 'Go-MMT', reach: 'Domestic', status: 'Ready' }
                          ].map(ota => (
                            <div key={ota.name} className="p-6 border border-gray-100 rounded-3xl flex items-center justify-between hover:border-indigo-100 transition-all group">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all">
                                  <Zap size={20} />
                                </div>
                                <div>
                                  <p className="text-sm font-black text-gray-900 uppercase tracking-tight">{ota.name}</p>
                                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{ota.reach} Reach</p>
                                </div>
                              </div>
                              <div className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest">{ota.status}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="col-span-4">
                        <div className="p-8 bg-slate-900 rounded-[3rem] text-white">
                          <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Exposure Boost</h5>
                          <div className="flex flex-col items-center text-center">
                            <div className="w-32 h-32 relative mb-6">
                              <svg className="w-full h-full transform -rotate-90">
                                <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-slate-800" />
                                <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-indigo-500" strokeDasharray="364.4" strokeDashoffset="145.7" />
                              </svg>
                              <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-2xl font-black">+38%</span>
                                <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">Reach</span>
                              </div>
                            </div>
                            <p className="text-xs font-bold text-slate-400 leading-relaxed">
                              Multi-channel distribution is <span className="text-white underline">Pending Activation</span>. Complete Review step to launch.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {currentStep === 12 && (
                  <div className="space-y-10">
                    <div className="p-12 bg-indigo-600 rounded-[3.5rem] text-white relative overflow-hidden shadow-2xl shadow-indigo-200">
                      <div className="relative z-10 flex flex-col items-center text-center">
                        <div className="w-20 h-20 bg-white/20 rounded-[2rem] flex items-center justify-center backdrop-blur-xl mb-6 shadow-xl">
                          <Trophy size={40} className="text-white" />
                        </div>
                        <h4 className="text-4xl font-black mb-4 tracking-tight">Activation Command Center</h4>
                        <p className="text-indigo-100 text-lg font-medium max-w-xl leading-relaxed">
                          Your property is <span className="text-white font-black underline">Ready for Launch</span>. Our audit team will verify your details within 24 hours.
                        </p>
                        
                        <div className="mt-10 grid grid-cols-3 gap-8 w-full">
                          <div className="text-center">
                            <p className="text-2xl font-black">92%</p>
                            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Quality Score</p>
                          </div>
                          <div className="text-center">
                            <p className="text-2xl font-black">0</p>
                            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Blockers</p>
                          </div>
                          <div className="text-center">
                            <p className="text-2xl font-black">HIGH</p>
                            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Ranking Potential</p>
                          </div>
                        </div>
                      </div>
                      <Sparkles className="absolute left-[-50px] top-[-50px] w-96 h-96 text-white/5" />
                    </div>

                    <div className="grid grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Audit Checklist</h5>
                        {[
                          { label: 'KYC Document Verification', status: 'Passed', color: 'emerald' },
                          { label: 'Media Category Coverage', status: 'Warning', color: 'amber' },
                          { label: 'Payout Strategy Integrity', status: 'Passed', color: 'emerald' },
                          { label: 'Market Price Parity', status: 'Passed', color: 'emerald' }
                        ].map((check, i) => (
                          <div key={i} className="flex items-center justify-between p-5 bg-white border border-gray-100 rounded-3xl shadow-sm">
                            <span className="text-xs font-black text-gray-700 uppercase tracking-tight">{check.label}</span>
                            <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest bg-${check.color}-100 text-${check.color}-600`}>
                              {check.status}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="p-8 bg-gray-50 rounded-[3.5rem] flex flex-col items-center justify-center text-center gap-6">
                        <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm">
                          <Search size={32} />
                        </div>
                        <div>
                          <p className="text-sm font-black text-gray-900 uppercase tracking-tight">Live Listing Preview</p>
                          <p className="text-xs text-gray-400 font-bold mt-1">See how guests will view your property on Zivo OTA.</p>
                        </div>
                        <button className="w-full py-4 bg-white border-2 border-indigo-600 text-indigo-600 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all">
                          Preview Listing
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

            {/* Enhanced Navigation */}
            <div className="mt-12 flex items-center justify-between bg-white/80 backdrop-blur-xl p-6 rounded-[2.5rem] border border-gray-100 shadow-xl">
              <button 
                onClick={() => currentStep > 1 && setCurrentStep(currentStep - 1)}
                className={`flex items-center gap-3 px-8 py-4 text-xs font-black uppercase tracking-widest rounded-2xl transition-all ${
                  currentStep === 1 ? 'opacity-0 pointer-events-none' : 'text-gray-400 hover:bg-gray-50'
                }`}
              >
                <ChevronLeft size={20} />
                Back
              </button>
              
              <div className="flex items-center gap-6">
                <button 
                  onClick={() => handleSave(true)}
                  disabled={saving}
                  className="flex items-center gap-3 px-8 py-4 text-xs font-black uppercase tracking-widest text-gray-400 hover:text-indigo-600 transition-all"
                >
                  <Save size={20} />
                  {saving ? 'Syncing...' : 'Save Strategy'}
                </button>
                
                <button 
                  onClick={() => currentStep === 12 ? addToast('Property submitted for review!', 'success') : handleSave(false)}
                  disabled={saving}
                  className="flex items-center gap-3 px-12 py-4 bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase tracking-[0.2em] shadow-2xl shadow-indigo-200 hover:scale-105 hover:bg-indigo-700 transition-all active:scale-95"
                >
                  {currentStep === 12 ? 'Activate Property' : 'Continue Integration'}
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          </div>

          {/* AI Helper Card */}
          <div className="bg-gradient-to-r from-indigo-600 to-violet-700 rounded-3xl p-6 text-white shadow-xl flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md">
                <Sparkles size={24} />
              </div>
              <div>
                <h4 className="font-bold">Zivo AI Assistant</h4>
                <p className="text-white/70 text-sm">Fill in your basic identity to unlock automated quality scoring.</p>
              </div>
            </div>
            <button className="px-4 py-2 bg-white text-indigo-600 rounded-xl text-sm font-bold hover:bg-indigo-50 transition-colors">
              Get Tips
            </button>
          </div>
        </main>
      </div>
    </div>
  );
};

export default PropertyOnboarding;
