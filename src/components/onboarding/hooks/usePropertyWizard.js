import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { validateStep } from '../utils/validationHelpers';
import { mapBackendToFormData, buildHotelPayload } from '../services/onboardingMapper';
import { getDefaultFormData } from '../utils/wizardHelpers';

const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

const getAuthHeaders = () => {
  const token = localStorage.getItem('jwt_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

export const usePropertyWizard = (options) => {
  const { isEditing, effectiveId, storageKeyPrefix, onFetchError } = options;
  
  const navigate = useNavigate();
  const location = useLocation();

  const draftKey = isEditing && effectiveId 
    ? `${storageKeyPrefix}_draft_${effectiveId}` 
    : `${storageKeyPrefix}_draft`;
  const stepKey = `${storageKeyPrefix}_step`;

  const [hasDraftLoaded, setHasDraftLoaded] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [initialRoomIds, setInitialRoomIds] = useState([]);
  const [apiError, setApiError] = useState('');
  
  const [formData, setFormData] = useState(getDefaultFormData());

  const fetchProperty = useCallback(async () => {
    if (!effectiveId) return;
    try {
      const res = await fetch(`${API_URL}/hotels/${effectiveId}`, { headers: getAuthHeaders() });
      if (res.status === 404) {
        if (onFetchError) onFetchError();
        return;
      }
      const json = await res.json();
      if (json.success) {
        const mappedData = mapBackendToFormData(json.data);
        setInitialRoomIds(mappedData.rooms.map(r => r.id));
        setFormData(prev => ({ ...prev, ...mappedData }));
      }
    } catch (err) {
      console.error('Error fetching property:', err);
      setApiError('Failed to load property data.');
    }
  }, [effectiveId, onFetchError]);

  useEffect(() => {
    if (isEditing) {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setFormData(prev => ({ ...prev, ...parsed }));
        } catch (e) {
          fetchProperty();
        }
      } else {
        fetchProperty();
      }
    } else {
      if (location.state?.resetDraft) {
        localStorage.removeItem(draftKey);
        localStorage.removeItem(stepKey);
        if (options.clearCurrentHotelId) {
          options.clearCurrentHotelId();
        }
        navigate(location.pathname, { replace: true, state: {} });
      } else {
        const saved = localStorage.getItem(draftKey);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            setFormData(prev => ({ ...prev, ...parsed }));
            setHasDraftLoaded(true);
            const savedStep = localStorage.getItem(stepKey);
            if (savedStep) {
              setCurrentStep(parseInt(savedStep, 10));
            }
          } catch (e) {
            console.error("Failed to restore onboarding draft:", e);
          }
        }
      }
    }
  }, [isEditing, effectiveId, draftKey, stepKey, location.state, fetchProperty, navigate, options.clearCurrentHotelId, location.pathname]);

  const handleResetDraft = () => {
    if (window.confirm("Are you sure you want to clear your current draft and start fresh? All unsaved progress will be lost.")) {
      localStorage.removeItem(draftKey);
      localStorage.removeItem(stepKey);
      if (options.clearCurrentHotelId) {
        options.clearCurrentHotelId();
      }
      window.location.reload();
    }
  };

  useEffect(() => {
    if (formData.name) {
      localStorage.setItem(draftKey, JSON.stringify(formData));
    }
  }, [formData, draftKey]);

  useEffect(() => {
    if (!isEditing) {
      localStorage.setItem(stepKey, String(currentStep));
    }
  }, [currentStep, isEditing, stepKey]);

  const updateForm = (field, value) => {
    if (typeof field === 'object' && field !== null) {
      setFormData(prev => ({ ...prev, ...field }));
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
  };

  const saveDraftIfNeeded = async (customId, setCurrentHotelId) => {
    const targetId = effectiveId || customId;
    if (!targetId) {
      if (!formData.name) return { success: false, error: "Please specify a property name on Step 1 before proceeding." };
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
          if (setCurrentHotelId) setCurrentHotelId(resJson.data.id);
          setFormData(prev => ({ ...prev, id: resJson.data.id }));
          return { success: true, id: resJson.data.id };
        }
      } catch (err) {
        console.error('Failed to auto-save property draft:', err);
        return { success: false, error: 'Failed to auto-save property draft' };
      }
    }
    return { success: true };
  };

  const handleStepChange = async (targetStepOrFn, onValidateError, beforeStepChange) => {
    let targetStep = typeof targetStepOrFn === 'function' ? targetStepOrFn(currentStep) : targetStepOrFn;
    if (targetStep < currentStep) {
      setCurrentStep(targetStep);
      window.scrollTo(0, 0);
      return;
    }

    for (let step = currentStep; step < targetStep; step++) {
      const { valid, firstError } = validateStep(step, formData);
      if (!valid) {
        if (onValidateError) onValidateError(firstError);
        setCurrentStep(step);
        window.scrollTo(0, 0);
        return;
      }
      
      if (beforeStepChange) {
        const success = await beforeStepChange(step, formData);
        if (!success) {
          setCurrentStep(step);
          window.scrollTo(0, 0);
          return;
        }
      }
    }

    setCurrentStep(targetStep);
    window.scrollTo(0, 0);
  };

  return {
    formData,
    setFormData,
    updateForm,
    currentStep,
    setCurrentStep,
    handleStepChange,
    isSubmitting,
    setIsSubmitting,
    apiError,
    setApiError,
    initialRoomIds,
    hasDraftLoaded,
    handleResetDraft,
    saveDraftIfNeeded
  };
};
