import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, Sparkles } from 'lucide-react';

import PropertyWizardLayout from '../../components/onboarding/PropertyWizardLayout';
import BasicInfoStep from '../../components/onboarding/steps/BasicInfoStep';
import LocationStep from '../../components/onboarding/steps/LocationStep';
import AmenitiesStep from '../../components/onboarding/steps/AmenitiesStep';
import RoomsStep from '../../components/onboarding/steps/RoomsStep';
import PhotosStep from '../../components/onboarding/steps/PhotosStep';
import PoliciesStep from '../../components/onboarding/steps/PoliciesStep';
import FinanceStep from '../../components/onboarding/steps/FinanceStep';

const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

const getAuthHeaders = () => {
  const token = localStorage.getItem('jwt_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

const mapMealPlanToBackend = (mp) => {
  switch (mp) {
    case 'FREE Breakfast': return 'CP';
    case 'Room Only': return 'EP';
    case 'Breakfast & Dinner': return 'MAP';
    case 'All Meals': return 'AP';
    default: return 'NONE';
  }
};

const mapMealPlanToFrontend = (mp) => {
  switch (mp) {
    case 'CP': return 'FREE Breakfast';
    case 'EP': return 'Room Only';
    case 'MAP': return 'Breakfast & Dinner';
    case 'AP': return 'All Meals';
    default: return 'Room Only';
  }
};

const parseBackendRoomTypes = (roomTypes) => {
  if (!Array.isArray(roomTypes)) return [];
  return roomTypes.map(rt => {
    let beds = [{ type: 'Queen Bed', count: 1 }];
    if (rt.bedType) {
      const parts = rt.bedType.split(',').map(p => p.trim());
      const parsed = parts.map(part => {
        const match = part.match(/^(\d+)x\s+(.+)$/);
        if (match) {
          return { type: match[2], count: parseInt(match[1]) };
        }
        return { type: part, count: 1 };
      });
      if (parsed.length > 0) beds = parsed;
    }

    let size = '';
    let sizeUnit = 'Square Feet';
    if (rt.roomSize) {
      const match = rt.roomSize.match(/^([\d\.]+)\s+(.+)$/);
      if (match) {
        size = match[1];
        sizeUnit = match[2];
      } else {
        size = rt.roomSize;
      }
    }

    const standardRatePlan = rt.ratePlans?.find(rp => rp.isActive) || rt.ratePlans?.[0] || {};

    return {
      id: rt.id,
      code: rt.code || '',
      type: rt.name.includes('Deluxe') ? 'Deluxe' : rt.name.includes('Suite') ? 'Suite' : rt.name.includes('Standard') ? 'Standard' : 'Deluxe',
      view: rt.viewType || 'Airport View',
      size: size,
      sizeUnit: sizeUnit,
      name: rt.name,
      count: rt.totalInventory || 1,
      description: rt.description || '',
      beds: beds,
      allowExtraBed: rt.extraBedAllowed ? 'Yes' : 'No',
      allowAlternateSleeping: 'No',
      baseAdults: rt.baseOccupancy || 2,
      maxAdults: rt.maxOccupancy || 2,
      baseChildren: 1,
      maxChildren: 1,
      maxOccupancy: rt.capacity || 3,
      bathrooms: 1,
      mealPlan: mapMealPlanToFrontend(standardRatePlan.mealPlan),
      basePrice: standardRatePlan.basePrice || '',
      extraAdultPrice: standardRatePlan.extraAdultPrice || '',
      childPrice: standardRatePlan.extraChildPrice || '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
      amenities: Array.isArray(rt.amenities) ? rt.amenities : [],
      ratePlanId: standardRatePlan.id
    };
  });
};

const PropertyWizard = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = Boolean(id);

  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');
  const [initialRoomIds, setInitialRoomIds] = useState([]);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [referenceNumber, setReferenceNumber] = useState('');

  const [formData, setFormData] = useState({
    // Basic Info
    name: '', type: 'Hotel', description: '', rating: '3',
    receptionPhone: '', receptionEmail: '',
    managerName: '', managerPhone: '', managerEmail: '',
    ownerName: '', ownerEmail: '', ownerPhone: '',
    
    // Location
    country: 'India', state: '', city: '', area: '', address: '',
    latitude: '', longitude: '',
    
    // Amenities
    amenities: [],
    
    // Rooms
    rooms: [],

    // Photos
    images: [],
    
    // Policies
    policies: [], checkInTime: '14:00', checkOutTime: '11:00',
    
    // Finance & Legal
    legalName: '', pan: '', gstin: '',
    accountName: '', bankName: '', accountNumber: '', ifscCode: '', branchName: '',
    commission: '',
  });

  useEffect(() => {
    if (isEditing) {
      fetchProperty();
    } else {
      const saved = localStorage.getItem('zivo_onboarding_draft_admin');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setFormData(prev => ({ ...prev, ...parsed }));
          
          const savedStep = localStorage.getItem('zivo_onboarding_step_admin');
          if (savedStep) {
            setCurrentStep(parseInt(savedStep));
          }
        } catch (e) {
          console.error("Failed to restore onboarding draft:", e);
        }
      }
    }
  }, [id]);

  // Auto-save form progress to localStorage in real time (except when editing active property)
  useEffect(() => {
    if (!isEditing && formData.name) {
      localStorage.setItem('zivo_onboarding_draft_admin', JSON.stringify(formData));
    }
  }, [formData, isEditing]);

  useEffect(() => {
    if (!isEditing) {
      localStorage.setItem('zivo_onboarding_step_admin', String(currentStep));
    }
  }, [currentStep, isEditing]);

  const fetchProperty = async () => {
    try {
      const res = await fetch(`${API_URL}/hotels/${id}`, { headers: getAuthHeaders() });
      
      if (res.status === 404) {
        localStorage.removeItem('currentHotelId');
        alert('Saved property draft was not found. Redirecting to start a new property...');
        setTimeout(() => {
          navigate('/admin/properties/new');
        }, 1500);
        return;
      }

      const json = await res.json();
      if (json.success) {
        const hotel = json.data;
        const parsedRooms = parseBackendRoomTypes(hotel.roomTypes);
        setInitialRoomIds(parsedRooms.map(r => r.id));

        setFormData(prev => ({
          ...prev,
          name: hotel.name || '',
          type: hotel.propertyType || 'Hotel',
          description: hotel.description || '',
          rating: String(hotel.rating || '3'),
          
          country: hotel.country || 'India',
          state: hotel.state || '',
          city: hotel.city || '',
          area: hotel.area || '',
          address: hotel.location || '',
          latitude: hotel.latitude || '',
          longitude: hotel.longitude || '',
          
          receptionPhone: hotel.receptionPhone || '',
          receptionEmail: hotel.receptionEmail || '',
          managerName: hotel.managerName || '',
          managerPhone: hotel.managerPhone || '',
          managerEmail: hotel.managerEmail || '',
          ownerName: hotel.owner?.name || '',
          ownerEmail: hotel.owner?.email || '',
          ownerPhone: hotel.owner?.phone || '',
          
          amenities: Array.isArray(hotel.amenities) ? hotel.amenities : [],
          rooms: parsedRooms,
          images: Array.isArray(hotel.media) ? hotel.media : [],
          policies: Array.isArray(hotel.policies) ? hotel.policies : [],
          
          checkInTime: hotel.checkInTime || '14:00',
          checkOutTime: hotel.checkOutTime || '11:00',
          
          legalName: hotel.legalName || '',
          pan: hotel.pan || '',
          gstin: hotel.gstin || '',
          accountName: hotel.bankDetail?.accountName || '',
          bankName: hotel.bankDetail?.bankName || '',
          accountNumber: hotel.bankDetail?.accountNumber || '',
          ifscCode: hotel.bankDetail?.ifscCode || '',
          branchName: hotel.bankDetail?.branchName || '',
          commission: hotel.agreement?.commissionRate || '',
        }));
      }
    } catch (err) {
      console.error('Error fetching property:', err);
      setApiError('Failed to load property data.');
    }
  };

  const updateForm = (field, value) => {
    if (typeof field === 'object' && field !== null) {
      setFormData(prev => ({ ...prev, ...field }));
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
  };

  const validateStep = (stepIndex) => {
    switch (stepIndex) {
      case 1:
        if (!formData.name?.trim()) return "Property Name is required.";
        if (!formData.type?.trim()) return "Property Type is required.";
        if (!formData.rating?.trim()) return "Star Rating is required.";
        if (!(formData.guestEmail || formData.receptionEmail)?.trim()) return "Email ID is required.";
        if (!(formData.guestMobile || formData.receptionPhone)?.trim()) return "Mobile number is required.";
        break;
      case 2:
        if (!formData.houseNo?.trim()) return "House/Building/Apartment No. is required.";
        if (!formData.area?.trim()) return "Locality/Area/Street/Sector is required.";
        if (!formData.pincode?.trim()) return "Pincode is required.";
        if (!formData.country?.trim()) return "Country is required.";
        if (!formData.state?.trim()) return "State is required.";
        if (!formData.city?.trim()) return "City is required.";
        if (!formData.latitude || isNaN(parseFloat(formData.latitude))) return "Latitude is required and must be a valid number.";
        if (!formData.longitude || isNaN(parseFloat(formData.longitude))) return "Longitude is required and must be a valid number.";
        if (formData.agreeAddress !== true) return "You must agree to the terms and confirm the address.";
        break;
      case 4:
        if (!formData.rooms || formData.rooms.length === 0) {
          return "At least one room type configuration must be added.";
        }
        break;
      case 5:
        if (!formData.images || formData.images.length === 0) {
          return "Please upload at least one photo of your property.";
        }
        break;
      case 6:
        if (!formData.checkInTime) return "Check-in time is required.";
        if (!formData.checkOutTime) return "Check-out time is required.";
        break;
      case 7:
        if (!formData.legalName?.trim()) return "Legal Entity Name is required.";
        if (!formData.pan?.trim()) return "PAN Number is required.";
        if (!formData.accountName?.trim()) return "Account Holder Name is required.";
        if (!formData.bankName?.trim()) return "Bank Name is required.";
        if (!formData.accountNumber?.trim()) return "Account Number is required.";
        if (!formData.ifscCode?.trim()) return "IFSC Code is required.";
        if (!formData.commission) return "Platform Commission is required.";
        if (formData.acceptTerms !== true) return "You must accept the terms and conditions to proceed.";
        break;
      default:
        break;
    }
    return null;
  };

  const handleStepChange = async (targetStepOrFn) => {
    let targetStep = typeof targetStepOrFn === 'function' ? targetStepOrFn(currentStep) : targetStepOrFn;
    if (targetStep < currentStep) {
      setCurrentStep(targetStep);
      window.scrollTo(0, 0);
      return;
    }

    for (let step = currentStep; step < targetStep; step++) {
      const errorMsg = validateStep(step);
      if (errorMsg) {
        alert(errorMsg);
        setCurrentStep(step);
        window.scrollTo(0, 0);
        return;
      }
      if (step === 2) {
        const success = await saveDraftIfNeeded();
        if (!success) {
          setCurrentStep(2);
          window.scrollTo(0, 0);
          return;
        }
      }
    }

    setCurrentStep(targetStep);
    window.scrollTo(0, 0);
  };

  const saveDraftIfNeeded = async () => {
    // If not editing and hotel ID is not yet defined, auto-create a draft
    const currentId = id || localStorage.getItem('currentHotelId');
    if (!currentId) {
      if (!formData.name) {
        alert("Please specify a property name on Step 1 before proceeding.");
        return false;
      }
      try {
        const payload = {
          name: formData.name,
          propertyType: formData.type || 'Hotel',
          city: formData.city || 'Default City',
          address: formData.address || 'Default Address',
          description: formData.description || '',
          status: 'DRAFT'
        };
        const res = await fetch(`${API_URL}/hotels`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload)
        });
        const resJson = await res.json();
        if (res.ok && resJson.data && resJson.data.id) {
          localStorage.setItem('currentHotelId', resJson.data.id);
          // Set in form data directly using setFormData since we are inside validation context
          setFormData(prev => ({ ...prev, id: resJson.data.id }));
        }
      } catch (err) {
        console.error('Failed to auto-save property draft:', err);
      }
    }
    return true;
  };

  const handleSubmit = async () => {
    setApiError('');

    // Advance to next step if not on last step
    if (currentStep < 7) {
      const errorMsg = validateStep(currentStep);
      if (errorMsg) {
        alert(errorMsg);
        return;
      }
      if (currentStep === 2) {
        const success = await saveDraftIfNeeded();
        if (!success) return;
      }
      setCurrentStep(prev => prev + 1);
      window.scrollTo(0, 0);
      return;
    }

    // Final Validation before submit
    const errorMsg = validateStep(7);
    if (errorMsg) {
      alert(errorMsg);
      return;
    }
    
    setIsSubmitting(true);

    try {
      const payload = {
        name: formData.name,
        propertyType: formData.type,
        address: formData.address,
        location: formData.address, // Mapping to backend
        city: formData.city,
        state: formData.state,
        country: formData.country,
        description: formData.description || '',
        latitude: formData.latitude,
        longitude: formData.longitude,
        rating: formData.rating,
        
        media: formData.images.map(img => ({
          url: img.url,
          tags: img.tags || []
        })),
        amenities: formData.amenities,
        policies: formData.policies,
        checkInTime: formData.checkInTime,
        checkOutTime: formData.checkOutTime,
        
        receptionPhone: formData.receptionPhone,
        receptionEmail: formData.receptionEmail,
        managerName: formData.managerName,
        managerPhone: formData.managerPhone,
        managerEmail: formData.managerEmail,
        
        legalName: formData.legalName,
        pan: formData.pan,
        gstin: formData.gstin,
        
        bankDetail: formData.accountNumber ? {
          accountName: formData.accountName,
          bankName: formData.bankName,
          accountNumber: formData.accountNumber,
          ifscCode: formData.ifscCode,
          branchName: formData.branchName,
        } : undefined,
        
        commissionRate: formData.commission ? parseFloat(formData.commission) : undefined,
      };

      const draftId = localStorage.getItem('currentHotelId');
      const targetHotelId = id || draftId;
      const usePatch = isEditing || Boolean(draftId);

      const url = usePatch ? `${API_URL}/hotels/${targetHotelId}` : `${API_URL}/hotels`;
      const method = usePatch ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 404 && usePatch) {
          localStorage.removeItem('currentHotelId');
          alert('Saved property draft was not found. Redirecting to start a new property...');
          setTimeout(() => {
            if (id) {
              navigate('/admin/properties/new');
            } else {
              window.location.reload();
            }
          }, 1500);
          return;
        }

        if (data.errors && data.errors.fieldErrors) {
          const fieldErrors = data.errors.fieldErrors;
          const firstField = Object.keys(fieldErrors)[0];
          const firstMsg = fieldErrors[firstField][0];
          throw new Error(`${firstField.charAt(0).toUpperCase() + firstField.slice(1)}: ${firstMsg}`);
        }
        throw new Error(data.message || 'Failed to save property');
      }

      const targetHotelIdForRoom = id || localStorage.getItem('currentHotelId');
      const usePatchForRoom = isEditing || Boolean(localStorage.getItem('currentHotelId'));
      const hotelId = usePatchForRoom ? targetHotelIdForRoom : data.data.id;

      // 1. Delete removed rooms
      const currentRoomIds = new Set(formData.rooms.map(r => r.id).filter(id => id && id.includes('-')));
      const roomsToDelete = initialRoomIds.filter(id => !currentRoomIds.has(id));
      for (const roomId of roomsToDelete) {
        await fetch(`${API_URL}/admin/rooms/${roomId}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
      }

      // 2. Create/Update remaining rooms and rate plans
      for (const room of formData.rooms) {
        const isUUID = typeof room.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(room.id);
        const isNewRoom = !isUUID;

        const roomPayload = {
          name: room.name,
          code: room.code || (room.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).substring(2, 6)),
          description: room.description || '',
          maxOccupancy: parseInt(room.maxOccupancy) || 2,
          baseOccupancy: parseInt(room.baseAdults) || 2,
          totalRooms: parseInt(room.count) || 1,
          hotelId: hotelId,
          amenities: room.amenities || [],
          bedType: room.beds?.map(b => `${b.count}x ${b.type}`).join(', ') || 'King Bed',
          roomSize: room.size ? `${room.size} ${room.sizeUnit}` : 'Standard',
          viewType: room.view || 'Airport View',
          extraBedAllowed: room.allowExtraBed === 'Yes',
          maxExtraBeds: room.allowExtraBed === 'Yes' ? 1 : 0
        };

        let roomTypeId;
        let ratePlanId;

        if (isNewRoom) {
          const res = await fetch(`${API_URL}/admin/rooms`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(roomPayload)
          });
          const resJson = await res.json();
          if (!res.ok) {
            throw new Error(resJson.message || `Failed to create room: ${room.name}`);
          }
          roomTypeId = resJson.data.id;
          ratePlanId = resJson.data.ratePlans?.[0]?.id;
        } else {
          const res = await fetch(`${API_URL}/admin/rooms/${room.id}`, {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify(roomPayload)
          });
          const resJson = await res.json();
          if (!res.ok) {
            throw new Error(resJson.message || `Failed to update room: ${room.name}`);
          }
          roomTypeId = room.id;
          ratePlanId = room.ratePlanId;
        }

        if (ratePlanId) {
          const ratePlanPayload = {
            basePrice: parseFloat(room.basePrice) || 0,
            mealPlan: mapMealPlanToBackend(room.mealPlan),
            extraAdultPrice: parseFloat(room.extraAdultPrice) || 0,
            extraChildPrice: parseFloat(room.childPrice) || 0,
            mealPriceAdult: 0,
            mealPriceChild: 0
          };

          const res = await fetch(`${API_URL}/admin/rate-plans/${ratePlanId}`, {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify(ratePlanPayload)
          });
          const resJson = await res.json();
          if (!res.ok) {
            throw new Error(resJson.message || `Failed to update standard rate plan for room: ${room.name}`);
          }
        }

        // Link locally assigned images to this room type (both new and updated rooms)
        const assignedImages = (formData.images || []).filter(img =>
          img.roomLinks?.some(link => link.roomTypeId === room.id)
        );
        for (const img of assignedImages) {
          try {
            await fetch(`${API_URL}/admin/images/room-types/${roomTypeId}`, {
              method: 'POST',
              headers: getAuthHeaders(),
              body: JSON.stringify({ imageId: img.id, isPrimary: false })
            });
          } catch (err) {
            console.error('Failed to link image to room:', err);
          }
        }
      }

      const refNo = 'ZIVO-PROP-' + (hotelId ? hotelId.substring(0, 8).toUpperCase() : Math.random().toString(36).substring(2, 10).toUpperCase());
      setReferenceNumber(refNo);
      setShowSuccessModal(true);
      
      localStorage.removeItem('zivo_onboarding_draft_admin');
      localStorage.removeItem('zivo_onboarding_step_admin');
      localStorage.removeItem('currentHotelId');
    } catch (err) {
      alert(err.message || 'An error occurred during submission.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return <BasicInfoStep formData={formData} updateForm={updateForm} />;
      case 2:
        return <LocationStep formData={formData} updateForm={updateForm} />;
      case 3:
        return <AmenitiesStep formData={formData} updateForm={updateForm} />;
      case 4:
        return <RoomsStep formData={formData} updateForm={updateForm} />;
      case 5:
        return <PhotosStep formData={formData} updateForm={updateForm} />;
      case 6:
        return <PoliciesStep formData={formData} updateForm={updateForm} />;
      case 7:
        return <FinanceStep formData={formData} updateForm={updateForm} />;
      default:
        return <BasicInfoStep formData={formData} updateForm={updateForm} />;
    }
  };

  return (
    <>
      <PropertyWizardLayout 
        title={isEditing ? 'Edit Property' : 'List New Property'}
        subtitle={isEditing ? `Managing details for: ${formData.name}` : 'Provide property details below'}
        currentStep={currentStep}
        setCurrentStep={handleStepChange}
        onSave={handleSubmit}
        isSubmitting={isSubmitting}
        isEditing={isEditing}
      >
        {renderStepContent()}
      </PropertyWizardLayout>

      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-2xl border border-slate-100 text-center relative overflow-hidden animate-scale-up">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-brand-50 rounded-full blur-2xl opacity-70"></div>
            <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-teal-50 rounded-full blur-2xl opacity-70"></div>

            <div className="mx-auto w-20 h-20 bg-teal-50 rounded-full flex items-center justify-center mb-6 relative">
              <div className="absolute inset-0 bg-teal-100 rounded-full animate-ping opacity-25"></div>
              <Check className="text-teal-600 w-10 h-10 stroke-[3px]" />
            </div>

            <h3 className="text-2xl font-black text-slate-900 mb-2">
              {isEditing ? 'Property Updated!' : 'Property Created!'}
            </h3>
            <p className="text-sm text-slate-500 mb-6 px-4">
              The property details, rooms, and finance settings have been successfully saved.
            </p>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-150 mb-6 font-mono text-center relative overflow-hidden">
              <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                Reference Number
              </span>
              <span className="text-lg font-black text-brand-600 tracking-wider">
                {referenceNumber}
              </span>
            </div>

            <div className="bg-teal-50/50 border border-teal-200/60 rounded-2xl p-4 text-left mb-8 flex gap-3">
              <Sparkles className="text-teal-650 text-teal-600 mt-0.5 shrink-0 w-5 h-5" />
              <div>
                <span className="block text-xs font-bold text-teal-900">Admin Action Complete</span>
                <span className="text-[11px] text-teal-800/80 leading-relaxed block mt-0.5">
                  As an administrator, you have directly created or updated this property. The changes are immediately processed in the backend.
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setShowSuccessModal(false);
                navigate('/admin/properties');
              }}
              className="w-full bg-[#E05A3E] hover:bg-[#c64f35] text-white py-4 rounded-xl font-bold text-sm transition-all shadow-lg hover:shadow-xl shadow-brand-100 hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
            >
              Go to Properties
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default PropertyWizard;
