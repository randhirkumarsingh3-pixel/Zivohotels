import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useExtranet } from '../context/ExtranetContext';

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

const PropertyOnboarding = () => {
  const navigate = useNavigate();
  const { hotelId: urlHotelId } = useParams();
  const { addToast, hotelId: contextHotelId } = useExtranet();
  
  // Either we have an ID in the URL, or one already provided by ExtranetContext
  const effectiveId = urlHotelId || contextHotelId;
  const isEditing = Boolean(effectiveId);

  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [initialRoomIds, setInitialRoomIds] = useState([]);

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
    cancellationPolicy: 'FREE_CANCEL_24H',
    policyRules: {},
    mealPrices: {},
    
    // Finance & Legal
    legalName: '', pan: '', gstin: '',
    accountName: '', bankName: '', accountNumber: '', ifscCode: '', branchName: '',
    commission: '',
  });

  useEffect(() => {
    if (isEditing) {
      fetchProperty();
    }
  }, [effectiveId]);

  const fetchProperty = async () => {
    try {
      // Re-use the main backend API which fully supports nested models for Owners
      const res = await fetch(`${API_URL}/hotels/${effectiveId}`, { headers: getAuthHeaders() });
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
          cancellationPolicy: hotel.cancellationPolicy || 'FREE_CANCEL_24H',
          policyRules: hotel.policyRules || {},
          mealPrices: hotel.mealPrices || {},
          
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
      addToast('Failed to load property data.', 'error');
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
        addToast(errorMsg, 'warning');
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
    const currentId = effectiveId || localStorage.getItem('currentHotelId');
    if (!currentId) {
      if (!formData.name) {
        addToast("Please specify a property name on Step 1 before proceeding.", "warning");
        return false;
      }
      try {
        const payload = {
          name: formData.name,
          propertyType: formData.type || 'Hotel',
          city: formData.city || 'Default City',
          address: formData.address || 'Default Address',
          description: formData.description || ''
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
    // Advance to next step if not on last step
    if (currentStep < 7) {
      const errorMsg = validateStep(currentStep);
      if (errorMsg) {
        addToast(errorMsg, 'warning');
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
      addToast(errorMsg, 'warning');
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
        cancellationPolicy: formData.cancellationPolicy,
        policyRules: formData.policyRules,
        mealPrices: formData.mealPrices,
        
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

      const url = isEditing ? `${API_URL}/hotels/${effectiveId}` : `${API_URL}/hotels`;
      const method = isEditing ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.errors && data.errors.fieldErrors) {
          const fieldErrors = data.errors.fieldErrors;
          const firstField = Object.keys(fieldErrors)[0];
          const firstMsg = fieldErrors[firstField][0];
          throw new Error(`${firstField.charAt(0).toUpperCase() + firstField.slice(1)}: ${firstMsg}`);
        }
        throw new Error(data.message || 'Failed to save property');
      }

      const hotelId = isEditing ? effectiveId : data.data.id;

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

      addToast(isEditing ? 'Property updated successfully!' : 'Property created successfully!', 'success');
      navigate('/extranet/dashboard');
      
    } catch (err) {
      addToast(err.message || 'An error occurred during submission.', 'error');
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
    <PropertyWizardLayout 
      title={isEditing ? 'Property Settings' : 'List New Property'}
      subtitle={isEditing ? `Managing details for: ${formData.name}` : 'Provide property details below'}
      currentStep={currentStep}
      setCurrentStep={handleStepChange}
      onSave={handleSubmit}
      isSubmitting={isSubmitting}
      isEditing={isEditing}
    >
      {renderStepContent()}
    </PropertyWizardLayout>
  );
};

export default PropertyOnboarding;
