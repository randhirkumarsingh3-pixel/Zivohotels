import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useExtranet } from '../context/ExtranetContext';
import { Check, Sparkles } from 'lucide-react';

import PropertyWizardLayout from '../../components/onboarding/PropertyWizardLayout';
import BasicInfoStep from '../../components/onboarding/steps/BasicInfoStep';
import LocationStep from '../../components/onboarding/steps/LocationStep';
import AmenitiesStep from '../../components/onboarding/steps/AmenitiesStep';
import RoomsStep from '../../components/onboarding/steps/RoomsStep';
import PhotosStep from '../../components/onboarding/steps/PhotosStep';
import PoliciesStep from '../../components/onboarding/steps/PoliciesStep';
import FinanceStep from '../../components/onboarding/steps/FinanceStep';
import { getImageUrl } from '../../utils/image';

import { usePropertyWizard } from '../../components/onboarding/hooks/usePropertyWizard';
import { buildHotelPayload } from '../../components/onboarding/services/onboardingMapper';
import { buildRoomPayload, normalizeRatePlans } from '../../components/onboarding/utils/roomMapper';

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
  const location = useLocation();
  const { hotelId: urlHotelId } = useParams();
  const { addToast, hotelId: contextHotelId } = useExtranet();
  
  // Either we have an ID in the URL, or one already provided by ExtranetContext
  const effectiveId = urlHotelId || contextHotelId;
  const isEditing = Boolean(effectiveId);

  const handleFetchError = useCallback(() => {
    localStorage.removeItem('currentHotelId_extranet');
    addToast('Saved property draft was not found. Redirecting to start a new property...', 'error');
    navigate('/extranet');
  }, [navigate, addToast]);

  const handleClearHotelId = useCallback(() => {
    localStorage.removeItem('currentHotelId_extranet');
  }, []);

  const {
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
  } = usePropertyWizard({
    isEditing,
    effectiveId,
    storageKeyPrefix: 'zivo_onboarding',
    onFetchError: handleFetchError,
    clearCurrentHotelId: handleClearHotelId
  });

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [referenceNumber, setReferenceNumber] = useState('');

  const syncDraftToBackend = async () => {
    const currentId = effectiveId || localStorage.getItem('currentHotelId_extranet');
    const { success, id: newId, error } = await saveDraftIfNeeded(currentId, (id) => {
      localStorage.setItem('currentHotelId_extranet', id);
    });
    if (!success) {
      if (error) addToast(error, 'error');
    }
    return success;
  };

  const handleSaveDraft = async () => {
    setIsSubmitting(true);
    try {
      const payload = buildHotelPayload(formData, import.meta.env.VITE_API_URL);

      // The backend strictly requires city for creation
      if (!payload.city) payload.city = 'Default City';
      if (!payload.address) payload.address = 'Default Address';

      const draftId = localStorage.getItem('currentHotelId_extranet');
      const targetHotelId = effectiveId || draftId;
      
      if (!targetHotelId) {
        if (!formData.name) {
          addToast('Please specify a property name before saving a draft.', 'warning');
          setIsSubmitting(false);
          return;
        }
        payload.status = 'DRAFT';
        const res = await fetch(`${API_URL}/hotels`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload)
        });
        const resJson = await res.json();
        if (res.ok && resJson.data?.id) {
          localStorage.setItem('currentHotelId_extranet', resJson.data.id);
          setFormData(prev => ({ ...prev, id: resJson.data.id }));
          addToast('Draft saved successfully!', 'success');
        } else {
          addToast(resJson.message || 'Failed to auto-save property draft', 'error');
        }
        setIsSubmitting(false);
        return;
      }

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
          addToast('Property was not found. It may have been deleted.', 'error');
          navigate('/extranet');
          return;
        } else {
          localStorage.removeItem('currentHotelId_extranet');
          wasDraftDeleted = true;
          response = await fetch(`${API_URL}/hotels`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
          });
        }
      }

      const data = await response.json();
      if (response.ok) {
        addToast('Draft saved successfully!', 'success');
      } else {
        addToast(data.message || 'Failed to save draft', 'error');
      }
    } catch (err) {
      addToast(err.message || 'An error occurred while saving draft.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    // Advance to next step if not on last step
    if (currentStep < 7) {
      return handleStepChange(
        currentStep + 1,
        (error) => addToast(error, 'warning'),
        async (step) => {
          return await syncDraftToBackend();
        }
      );
    }

    // Final Validation before submit
    return handleStepChange(
      7,
      (error) => addToast(error, 'warning'),
      async () => {
        setIsSubmitting(true);

        try {
          const payload = buildHotelPayload(formData, import.meta.env.VITE_API_URL);
          payload.status = 'PENDING';

      const draftId = localStorage.getItem('currentHotelId_extranet');
      const targetHotelId = effectiveId || draftId;
      const usePatch = isEditing || Boolean(draftId);

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
          addToast('Property was not found. It may have been deleted.', 'error');
          navigate('/extranet');
          return;
        } else {
          localStorage.removeItem('currentHotelId_extranet');
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
        if (data.errors && data.errors.fieldErrors) {
          const fieldErrors = data.errors.fieldErrors;
          const firstField = Object.keys(fieldErrors)[0];
          const firstMsg = fieldErrors[firstField][0];
          throw new Error(`${firstField.charAt(0).toUpperCase() + firstField.slice(1)}: ${firstMsg}`);
        }
        throw new Error(data.message || 'Failed to save property');
      }

      // Always prefer the ID returned from the server response; fall back to known IDs
      const savedHotelId = data.data?.id || effectiveId || localStorage.getItem('currentHotelId_extranet');
      if (data.data?.id) localStorage.setItem('currentHotelId_extranet', data.data.id);
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

      // Final Submission (KYC Trigger)
      if (hotelId) {
        try {
          await fetch(`${API_URL}/extranet/onboarding/${hotelId}/submit`, {
            method: 'POST',
            headers: getAuthHeaders()
          });
        } catch (err) {
          console.error('Failed to trigger KYC submission:', err);
        }
      }

      const refNo = 'ZIVO-PROP-' + (hotelId ? hotelId.substring(0, 8).toUpperCase() : Math.random().toString(36).substring(2, 10).toUpperCase());
      setReferenceNumber(refNo);
      setShowSuccessModal(true);
      
      localStorage.removeItem('zivo_onboarding_draft');
      localStorage.removeItem('zivo_onboarding_step');
      localStorage.removeItem('currentHotelId_extranet');
      
    } catch (err) {
      addToast(err.message || 'An error occurred during submission.', 'error');
    } finally {
      setIsSubmitting(false);
    }
      }
    );
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
        title={isEditing ? 'Property Settings' : 'List New Property'}
        subtitle={isEditing ? `Managing details for: ${formData.name}` : 'Provide property details below'}
        currentStep={currentStep}
        setCurrentStep={handleStepChange}
        onSaveDraft={handleSaveDraft}
        onSave={handleSubmit}
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

            <h3 className="text-2xl font-black text-slate-900 mb-2">Onboarding Submitted!</h3>
            <p className="text-sm text-slate-500 mb-6 px-4">
              Your property details, bank configurations, and statutory documents have been uploaded successfully.
            </p>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-150 mb-6 font-mono text-center relative overflow-hidden">
              <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                Reference Number
              </span>
              <span className="text-lg font-black text-brand-600 tracking-wider">
                {referenceNumber}
              </span>
            </div>

            <div className="bg-amber-50/50 border border-amber-200/60 rounded-2xl p-4 text-left mb-8 flex gap-3">
              <Sparkles className="text-amber-600 mt-0.5 shrink-0 w-5 h-5" />
              <div>
                <span className="block text-xs font-bold text-amber-900">Awaiting Admin Approval</span>
                <span className="text-[11px] text-amber-800/80 leading-relaxed block mt-0.5">
                  As this is submitted by an extranet owner, our Super Admin team will verify the PAN/GST records, trade licenses, and payout details. Status updates are processed within 12-24 hours.
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setShowSuccessModal(false);
                navigate('/extranet/dashboard');
              }}
              className="w-full bg-[#E05A3E] hover:bg-[#c64f35] text-white py-4 rounded-xl font-bold text-sm transition-all shadow-lg hover:shadow-xl shadow-brand-100 hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default PropertyOnboarding;
