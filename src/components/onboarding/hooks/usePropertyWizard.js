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

  // Progress is kept per property once it exists. A brand-new draft starts under the plain keys
  // and is picked up from there when its id becomes known (see the restore effect), so reloading
  // the page or coming back later resumes where the owner left off.
  const plainDraftKey = `${storageKeyPrefix}_draft`;
  const plainStepKey = `${storageKeyPrefix}_step`;
  const draftKey = effectiveId ? `${plainDraftKey}_${effectiveId}` : plainDraftKey;
  const stepKey = effectiveId ? `${plainStepKey}_${effectiveId}` : plainStepKey;

  const [hasDraftLoaded, setHasDraftLoaded] = useState(false);
  // Start on the saved step straight away (not in an effect), so the effect that stores the step
  // can never overwrite it with 1 before it has been restored (React runs effects twice in dev)
  const [currentStep, setCurrentStep] = useState(() => {
    try {
      if (!localStorage.getItem(draftKey)) return 1;
      return parseInt(localStorage.getItem(stepKey) || '1', 10) || 1;
    } catch {
      return 1;
    }
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [initialRoomIds, setInitialRoomIds] = useState([]);
  const [apiError, setApiError] = useState('');
  
  const [formData, setFormData] = useState(getDefaultFormData());

  const fetchProperty = useCallback(async (draftLoaded = false) => {
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
        if (draftLoaded) {
          // The copy kept in this browser only wins while it is newer than what the server has.
          // It used to win always, so Edit Property showed (and saved back) stale values after
          // the property had been saved elsewhere, e.g. the location from another session.
          setFormData(prev => {
            const serverTime = new Date(mappedData.lastUpdatedAt || 0).getTime();
            const localTime = new Date(prev.lastUpdatedAt || 0).getTime();
            if (!prev.lastUpdatedAt || serverTime > localTime) return mappedData;
            return { ...mappedData, ...prev, lastUpdatedAt: mappedData.lastUpdatedAt };
          });
        } else {
          setFormData(mappedData);
        }
      }
    } catch (err) {
      console.error('Error fetching property:', err);
      setApiError('Failed to load property data.');
    }
  }, [effectiveId, onFetchError]);

  useEffect(() => {
    let draftLoaded = false;
    
    if (location.state?.resetDraft) {
      localStorage.removeItem(draftKey);
      localStorage.removeItem(stepKey);
      setCurrentStep(1);
      if (options.clearCurrentHotelId) {
        options.clearCurrentHotelId();
      }
      navigate(location.pathname, { replace: true, state: {} });
    } else {
      let saved = localStorage.getItem(draftKey);
      let savedStep = localStorage.getItem(stepKey);
      // A draft started before the property had an id lives under the plain keys
      if (!saved && effectiveId) {
        try {
          const plain = JSON.parse(localStorage.getItem(plainDraftKey) || 'null');
          if (plain && plain.id === effectiveId) {
            saved = JSON.stringify(plain);
            savedStep = localStorage.getItem(plainStepKey);
          }
        } catch { /* ignore a corrupt draft */ }
      }
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setFormData(prev => ({ ...prev, ...parsed }));
          setHasDraftLoaded(true);
          draftLoaded = true;
          if (savedStep) {
            setCurrentStep(parseInt(savedStep, 10));
          }
        } catch (e) {
          console.error("Failed to restore draft:", e);
        }
      }
    }

    if (effectiveId && !location.state?.resetDraft) {
      fetchProperty(draftLoaded);
    }
  }, [isEditing, effectiveId, draftKey, stepKey, plainDraftKey, plainStepKey, location.state, fetchProperty, navigate, options.clearCurrentHotelId, location.pathname]);

  const handleResetDraft = () => {
    if (window.confirm("Are you sure you want to clear your current draft and start fresh? All unsaved progress will be lost.")) {
      [plainDraftKey, plainStepKey, draftKey, stepKey].forEach(k => localStorage.removeItem(k));
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
    localStorage.setItem(stepKey, String(currentStep));
  }, [currentStep, stepKey]);

  /** Forget the saved progress (after a successful submission). */
  const clearSavedProgress = useCallback(() => {
    [plainDraftKey, plainStepKey, draftKey, stepKey].forEach(k => localStorage.removeItem(k));
  }, [plainDraftKey, plainStepKey, draftKey, stepKey]);

  const updateForm = (field, value) => {
    if (typeof field === 'object' && field !== null) {
      setFormData(prev => ({ ...prev, ...field }));
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
  };

  const saveDraftIfNeeded = async (customId, setCurrentHotelId) => {
    let targetId = effectiveId || customId;
    let createdId;
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
          setFormData(prev => ({ 
            ...prev, 
            id: resJson.data.id,
            lastUpdatedAt: resJson.data.updatedAt
          }));
          targetId = createdId = resJson.data.id;
        } else {
          return { success: false, error: resJson.message || 'Failed to save the property draft' };
        }
      } catch (err) {
        console.error('Failed to auto-save property draft:', err);
        return { success: false, error: 'Failed to auto-save property draft' };
      }
    }
    // The property exists: save what has been entered so far to the server, so progress isn't
    // only in this browser (rooms, photos and documents are saved by their own steps / on submit)
    try {
      const payload = buildHotelPayload(formData, import.meta.env.VITE_API_URL);
      delete payload.status;
      const res = await fetch(`${API_URL}/hotels/${targetId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      const resJson = await res.json().catch(() => ({}));
      if (!res.ok) {
        const fieldErrors = (resJson.errors || resJson.data?.errors)?.fieldErrors;
        const firstField = fieldErrors && Object.keys(fieldErrors)[0];
        const message = firstField
          ? `${firstField.charAt(0).toUpperCase() + firstField.slice(1)}: ${fieldErrors[firstField][0]}`
          : (resJson.message || 'Could not save your progress');
        return { success: false, error: message };
      }
      if (resJson.data?.updatedAt) {
        setFormData(prev => ({ ...prev, lastUpdatedAt: resJson.data.updatedAt }));
      }
    } catch (err) {
      console.error('Failed to save progress:', err);
      return { success: false, error: 'Could not save your progress. Check your connection and try again.' };
    }
    return createdId ? { success: true, id: createdId } : { success: true };
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
    /** Load the saved property again (after saving one section of a listed property) */
    reloadProperty: fetchProperty,
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
    saveDraftIfNeeded,
    clearSavedProgress
  };
};
