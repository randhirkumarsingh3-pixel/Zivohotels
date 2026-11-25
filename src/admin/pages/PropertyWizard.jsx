import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useParams, useLocation, useSearchParams } from 'react-router-dom';
import { Check, Sparkles } from 'lucide-react';

import PropertyWizardLayout from '../../components/onboarding/PropertyWizardLayout';
import PropertyLoadGate from '../../components/onboarding/PropertyLoadGate';
import BasicInfoStep from '../../components/onboarding/steps/BasicInfoStep';
import LocationStep from '../../components/onboarding/steps/LocationStep';
import AmenitiesStep from '../../components/onboarding/steps/AmenitiesStep';
import RoomsStep from '../../components/onboarding/steps/RoomsStep';
import PhotosStep from '../../components/onboarding/steps/PhotosStep';
import PoliciesStep from '../../components/onboarding/steps/PoliciesStep';
import FinanceStep from '../../components/onboarding/steps/FinanceStep';
import DocumentsStep from '../components/wizard-steps/DocumentsStep';
import { useAuth } from '../../context/AuthContext';
import { usePropertyWizard } from '../../components/onboarding/hooks/usePropertyWizard';
import { validateStep } from '../../components/onboarding/utils/validationHelpers';
import { buildHotelPayload } from '../../components/onboarding/services/onboardingMapper';
import { buildRoomPayload, normalizeRatePlans } from '../../components/onboarding/utils/roomMapper';

const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

/** Editor sections by name, for links like /admin/properties/edit/<id>?section=photos */
const SECTION_STEP = { basics: 1, location: 2, amenities: 3, rooms: 4, photos: 5, policies: 6, finance: 7, documents: 8 };

const getAuthHeaders = () => {
  const token = localStorage.getItem('jwt_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

/** One readable line from a failed save (first field error, or the message). */
const saveErrorMessage = (json, fallback) => {
  // The API's response wrapper puts details under data.errors
  const fieldErrors = (json?.errors || json?.data?.errors)?.fieldErrors;
  const field = fieldErrors && Object.keys(fieldErrors)[0];
  if (field) return `${field.charAt(0).toUpperCase() + field.slice(1)}: ${fieldErrors[field][0]}`;
  return json?.message || fallback;
};

const PropertyWizard = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const _location = useLocation();
  const { user } = useAuth();
  
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  
  const isEditing = Boolean(id);

  const handleFetchError = useCallback(() => {
    localStorage.removeItem('currentHotelId_admin');
    alert('Saved property draft was not found. Redirecting to start a new property...');
    navigate('/admin/properties');
  }, [navigate]);

  const handleClearHotelId = useCallback(() => {
    localStorage.removeItem('currentHotelId_admin');
  }, []);

  const {
    formData,
    setFormData,
    updateForm,
    currentStep,
    setCurrentStep: _setCurrentStep,
    handleStepChange,
    isSubmitting,
    setIsSubmitting,
    apiError: _apiError,
    setApiError,
    initialRoomIds,
    hasDraftLoaded,
    handleResetDraft,
    saveDraftIfNeeded: hookSaveDraftIfNeeded,
    clearSavedProgress,
    reloadProperty,
    propertyLoad,
    retryLoadProperty
  } = usePropertyWizard({
    isEditing,
    effectiveId: id || localStorage.getItem('currentHotelId_admin'),
    storageKeyPrefix: 'zivo_onboarding_admin',
    onFetchError: handleFetchError,
    clearCurrentHotelId: handleClearHotelId
  });

  // Editing an existing property section by section (from Content Scores or a ?section= link):
  // every section is a tab and "Save changes" saves without the step-by-step flow
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = searchParams.get('section');
  const sectionMode = isEditing && (Boolean(requestedSection) || Boolean(formData.status && !['DRAFT', 'INFORMATION_REQUESTED'].includes(formData.status)));
  useEffect(() => {
    const step = SECTION_STEP[requestedSection];
    if (isEditing && step) _setCurrentStep(step);
  }, [requestedSection, isEditing]); // eslint-disable-line react-hooks/exhaustive-deps
  const jumpTo = (step) => {
    const key = Object.keys(SECTION_STEP).find((k) => SECTION_STEP[k] === step);
    if (key) setSearchParams({ section: key }, { replace: true });
    _setCurrentStep(step);
    window.scrollTo(0, 0);
  };

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [referenceNumber, setReferenceNumber] = useState('');

  const _saveDraftIfNeeded = async () => {
    const draftId = localStorage.getItem('currentHotelId_admin');
    const { success, id: _newId, error } = await hookSaveDraftIfNeeded(draftId, (id) => {
      localStorage.setItem('currentHotelId_admin', id);
    });
    if (!success) {
      if (error) alert(error);
    }
    return success;
  };

  const syncDraftToBackend = async () => {
    setIsSubmitting(true);
    setApiError('');
    try {
      const payload = buildHotelPayload(formData, import.meta.env.VITE_API_URL);

      // The backend strictly requires city for creation
      if (!payload.city) payload.city = 'Default City';
      if (!payload.address) payload.address = 'Default Address';

      const draftId = localStorage.getItem('currentHotelId_admin');
      const targetHotelId = id || formData.id || draftId;
      
      // If we don't have a target ID, create it as DRAFT
      if (!targetHotelId) {
        if (!formData.name) {
          alert('Please specify a property name before saving a draft.');
          setIsSubmitting(false);
          return false;
        }
        payload.status = 'DRAFT';
        const res = await fetch(`${API_URL}/hotels`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload)
        });
        const resJson = await res.json();
        if (res.ok && resJson.data?.id) {
          localStorage.setItem('currentHotelId_admin', resJson.data.id);
          setFormData(prev => ({ 
            ...prev, 
            id: resJson.data.id,
            lastUpdatedAt: resJson.data.updatedAt
          }));
          // Silently succeed on step transition auto-save
        } else {
          alert(saveErrorMessage(resJson, 'Could not save the property draft'));
        }
        setIsSubmitting(false);
        return res.ok;
      }

      // If we do have an ID (we are editing), just patch the current fields
      const usePatch = isEditing || Boolean(targetHotelId);
      const url = usePatch ? `${API_URL}/hotels/${targetHotelId}` : `${API_URL}/hotels`;
      const method = usePatch ? 'PATCH' : 'POST';

      let response = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });

      if (response.status === 404 && usePatch) {
        if (isEditing) {
          alert('Property was not found. It may have been deleted.');
          navigate('/admin/properties');
          return false;
        } else {
          // The drafted hotel was deleted on the backend. Let's create a new one instead of failing.
          localStorage.removeItem('currentHotelId_admin');
          payload.status = 'DRAFT';
          response = await fetch(`${API_URL}/hotels`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
          });
        }
      }

      const data = await response.json();
      if (!response.ok) {
        // Shown, not just logged: a rejected save (e.g. an invalid PAN or IFSC) used to look like
        // it worked, and the changes were missing after reloading
        alert(saveErrorMessage(data, 'Could not save your changes'));
        return false;
      }
      if (data.data?.updatedAt) {
        setFormData(prev => ({ ...prev, lastUpdatedAt: data.data.updatedAt }));
      }
      return true;
    } catch (err) {
      alert(err.message || 'Could not save your changes. Check your connection and try again.');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveDraft = async () => {
    const success = await syncDraftToBackend();
    if (success) {
      alert('Draft saved successfully!');
    }
  };

  const handleSubmit = async (opts) => {
    setApiError('');
    // Section mode: save everything and stay here; never the step-by-step flow or a submit
    const sectionSave = opts?.sectionSave === true;

    // Advance to next step if not on last step
    if (!sectionSave && currentStep < 8) {
      return handleStepChange(
        currentStep + 1,
        (error) => alert(error),
        async (_step) => {
          return await syncDraftToBackend();
        }
      );
    }

    // Final Validation before submit (section mode: the section being saved)
    const { valid, firstError } = sectionSave
      ? (currentStep <= 7 ? validateStep(currentStep, formData) : { valid: true })
      : validateStep(8, formData);
    if (!valid) {
      alert(firstError);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = buildHotelPayload(formData, import.meta.env.VITE_API_URL);

      const draftId = localStorage.getItem('currentHotelId_admin');
      const targetHotelId = id || formData.id || draftId;
      const usePatch = isEditing || Boolean(targetHotelId);

      const url = usePatch ? `${API_URL}/hotels/${targetHotelId}` : `${API_URL}/hotels`;
      const method = usePatch ? 'PATCH' : 'POST';

      let response = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });

      let wasDraftDeleted = false;
      if (response.status === 404 && usePatch) {
        if (isEditing) {
          alert('Property was not found. It may have been deleted.');
          navigate('/admin/properties');
          return;
        } else {
          // The drafted hotel was deleted on the backend. Let's create a new one instead of failing.
          localStorage.removeItem('currentHotelId_admin');
          wasDraftDeleted = true;
          response = await fetch(`${API_URL}/hotels`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
          });
        }
      }

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          alert('This property has been modified by another user. Please refresh the page before saving to prevent overwriting their changes.');
          setIsSubmitting(false);
          return;
        }

        const errs = data.errors || data.data?.errors;
        if (errs && errs.fieldErrors && Object.keys(errs.fieldErrors).length) {
          const fieldErrors = errs.fieldErrors;
          const firstField = Object.keys(fieldErrors)[0];
          const firstMsg = fieldErrors[firstField][0];
          throw new Error(`${firstField.charAt(0).toUpperCase() + firstField.slice(1)}: ${firstMsg}`);
        }
        throw new Error(data.message || 'Failed to save property');
      }

      // Always prefer the ID returned from the server response; fall back to known IDs
      const savedHotelId = data.data?.id || id || localStorage.getItem('currentHotelId_admin');
      if (data.data?.id) localStorage.setItem('currentHotelId_admin', data.data.id);
      const hotelId = savedHotelId;

      // 1. Delete removed rooms
      if (!wasDraftDeleted) {
        const currentRoomIds = new Set(formData.rooms.map(r => r.id).filter(id => id && id.includes('-')));
        const roomsToDelete = initialRoomIds.filter(id => !currentRoomIds.has(id));
        for (const roomId of roomsToDelete) {
          await fetch(`${API_URL}/admin/rooms/${roomId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
          });
        }
      }

      // 2. Create/Update remaining rooms and rate plans
      for (const room of formData.rooms) {
        const isUUID = typeof room.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(room.id);
        const isNewRoom = !isUUID || wasDraftDeleted;

        const roomPayload = buildRoomPayload(room, hotelId, isNewRoom);
        roomPayload.imageIds = (formData.images || [])
          .filter(img => img.roomLinks?.some(link => link.roomTypeId === room.id))
          .map(img => img.id);

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
          const ratePlanPayload = normalizeRatePlans(room);

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

      if (sectionSave) {
        clearSavedProgress();
        await reloadProperty();
        alert('Saved.');
        return;
      }

      // Submit the property for review
      // Details are saved above; if the property isn't ready (e.g. bank details or KYC
      // documents missing), stop here and show why instead of the success screen.
      // Edits to a property that's already in review, approved or live are just saved.
      const savedStatus = data.data?.status;
      const needsSubmit = !savedStatus || ['DRAFT', 'INFORMATION_REQUESTED'].includes(savedStatus);
      const submitRes = needsSubmit
        ? await fetch(`${API_URL}/admin/properties/${hotelId}/submit`, {
            method: 'PATCH',
            headers: getAuthHeaders()
          })
        : { ok: true };
      if (!submitRes.ok) {
        const submitJson = await submitRes.json().catch(() => ({}));
        throw new Error(submitJson.message || 'The property could not be submitted for review.');
      }

      const refNo = 'ZIVO-PROP-' + (hotelId ? hotelId.substring(0, 8).toUpperCase() : Math.random().toString(36).substring(2, 10).toUpperCase());
      setReferenceNumber(refNo);
      setShowSuccessModal(true);
      
      clearSavedProgress();
      localStorage.removeItem('currentHotelId_admin');
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
        return <FinanceStep formData={formData} updateForm={updateForm} isAdmin={isAdmin} />;
      case 8:
        return <DocumentsStep hotelId={id || formData.id || localStorage.getItem('currentHotelId_admin')} />;
      default:
        return <BasicInfoStep formData={formData} updateForm={updateForm} isAdmin={isAdmin} />;
    }
  };

  // Editing: no form until the property has loaded (a failed load must never show an empty form)
  if (propertyLoad === 'loading' || propertyLoad === 'failed') {
    return <PropertyLoadGate state={propertyLoad} onRetry={retryLoadProperty} onBack={() => navigate('/admin/properties')} />;
  }

  return (
    <>
      <PropertyWizardLayout 
        title={isEditing ? 'Edit Property' : 'List New Property'}
        subtitle={isEditing ? `Managing details for: ${formData.name}` : 'Provide property details below'}
        currentStep={currentStep}
        setCurrentStep={handleStepChange}
        onSaveDraft={sectionMode ? () => handleSubmit({ sectionSave: true }) : handleSaveDraft}
        onSave={sectionMode ? () => handleSubmit({ sectionSave: true }) : handleSubmit}
        sectionMode={sectionMode}
        onJump={jumpTo}
        onBackToProperty={() => navigate('/admin/content-scores')}
        isSubmitting={isSubmitting}
        isEditing={isEditing}
      >
        {!isEditing && hasDraftLoaded && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl mb-6 flex justify-between items-center">
            <p className="text-sm">You are continuing a previously saved draft.</p>
            <button type="button" onClick={handleResetDraft} className="text-sm font-semibold text-amber-700 hover:text-amber-900 bg-amber-100/50 hover:bg-amber-200/50 px-3 py-1.5 rounded-lg transition-colors">
              Start Fresh
            </button>
          </div>
        )}
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
              <span className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1">
                Reference Number
              </span>
              <span className="text-lg font-black text-brand-700 tracking-wider">
                {referenceNumber}
              </span>
            </div>

            <div className="bg-teal-50/50 border border-teal-200/60 rounded-2xl p-4 text-left mb-8 flex gap-3">
              <Sparkles className="text-teal-650 text-teal-600 mt-0.5 shrink-0 w-5 h-5" />
              <div>
                <span className="block text-xs font-bold text-teal-900">Admin Action Complete</span>
                <span className="text-xs text-teal-800/80 leading-relaxed block mt-0.5">
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
