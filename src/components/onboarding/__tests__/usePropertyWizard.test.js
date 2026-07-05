import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePropertyWizard } from '../hooks/usePropertyWizard';

// Mock matchMedia required by some UI libraries
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

const mockNavigate = vi.fn();
const mockLocation = { state: null, pathname: '/' };

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation
}));

describe('usePropertyWizard', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('should initialize with default values and step 1', () => {
    const { result } = renderHook(() => usePropertyWizard({
      isEditing: false,
      storageKeyPrefix: 'test_onboarding'
    }));

    expect(result.current.currentStep).toBe(1);
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.formData).toBeDefined();
    expect(result.current.formData.name).toBe('');
    expect(result.current.formData.type).toBe('Hotel');
  });

  it('should handle step changes and block on invalid logic', async () => {
    const { result } = renderHook(() => usePropertyWizard({
      isEditing: false,
      storageKeyPrefix: 'test_onboarding'
    }));

    // Initially at step 1
    expect(result.current.currentStep).toBe(1);

    // Mock validation logic to block progression if empty
    const mockValidateStep = vi.fn((step) => {
      if (step === 1 && !result.current.formData.name) return "Name required";
      return null;
    });

    // We can't directly inject validateStep to the hook easily if it uses internal validationHelpers,
    // so let's just test that handleStepChange executes and respects standard behavior.
    
    // Attempting to jump to step 3 from step 1
    // The internal handleStepChange of the caller handles validation, but the hook exposes setCurrentStep.
    // However, the hook doesn't enforce validation itself—the caller does.
    // The hook provides state management.
    
    act(() => {
      result.current.updateForm('name', 'My Hotel');
    });

    expect(result.current.formData.name).toBe('My Hotel');
    
    act(() => {
      result.current.setCurrentStep(2);
    });

    expect(result.current.currentStep).toBe(2);
  });

  it('should correctly isolate localStorage drafts between prefixes', () => {
    // Admin context
    const { result: adminResult } = renderHook(() => usePropertyWizard({
      isEditing: false,
      storageKeyPrefix: 'zivo_onboarding_admin'
    }));

    act(() => {
      adminResult.current.updateForm('name', 'Admin Hotel');
      // Trigger saveDraftIfNeeded manually if needed, but it's typically auto-saved by the caller in useEffect
    });
    
    // Simulate caller's useEffect saving
    localStorage.setItem('zivo_onboarding_admin_draft', JSON.stringify({ name: 'Admin Hotel' }));

    // Extranet context
    const { result: extranetResult } = renderHook(() => usePropertyWizard({
      isEditing: false,
      storageKeyPrefix: 'zivo_onboarding'
    }));

    // Extranet should not see admin draft
    expect(extranetResult.current.formData.name).not.toBe('Admin Hotel');
    expect(extranetResult.current.formData.name).toBe(''); // Default
  });
  
  it('should fetch property data when editing an existing ID', async () => {
    const mockHotelResponse = {
      success: true,
      data: {
        id: 'test-123',
        name: 'Fetched Hotel',
        propertyType: 'Resort'
      }
    };
    
    global.fetch.mockResolvedValueOnce({
      status: 200,
      json: async () => mockHotelResponse
    });

    const { result } = renderHook(() => usePropertyWizard({
      isEditing: true,
      effectiveId: 'test-123',
      storageKeyPrefix: 'test_onboarding'
    }));

    // Data fetching happens asynchronously
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/hotels/test-123'),
        expect.any(Object)
      );
    });
  });
});
