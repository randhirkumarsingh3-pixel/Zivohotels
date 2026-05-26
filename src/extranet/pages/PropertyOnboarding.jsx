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

const PropertyOnboarding = () => {
  const navigate = useNavigate();
  const { hotelId: urlHotelId } = useParams();
  const { addToast, hotelId: contextHotelId } = useExtranet();
  
  // Either we have an ID in the URL, or one already provided by ExtranetContext
  const effectiveId = urlHotelId || contextHotelId;
  const isEditing = Boolean(effectiveId);

  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    }
  }, [effectiveId]);

  const fetchProperty = async () => {
    try {
      // Re-use the main backend API which fully supports nested models for Owners
      const res = await fetch(`${API_URL}/hotels/${effectiveId}`, { headers: getAuthHeaders() });
      const json = await res.json();
      if (json.success) {
        const hotel = json.data;
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
          rooms: Array.isArray(hotel.rooms) ? hotel.rooms : [],
          images: Array.isArray(hotel.images) ? hotel.images : [],
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
      addToast('Failed to load property data.', 'error');
    }
  };

  const updateForm = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    // Advance to next step if not on last step
    if (currentStep < 7) {
      setCurrentStep(prev => prev + 1);
      window.scrollTo(0, 0);
      return;
    }

    // Final Validation before submit
    if (!formData.name || !formData.city || !formData.address) {
      addToast('Name, City, and Address are required.', 'warning');
      setCurrentStep(1);
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
        rooms: formData.rooms,
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
      setCurrentStep={setCurrentStep}
      onSave={handleSubmit}
      isSubmitting={isSubmitting}
      isEditing={isEditing}
    >
      {renderStepContent()}
    </PropertyWizardLayout>
  );
};

export default PropertyOnboarding;
