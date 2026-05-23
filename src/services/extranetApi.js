import { getAuthHeaders } from './api';

const EXTRANET_API_URL = import.meta.env.VITE_API_URL 
  ? `${import.meta.env.VITE_API_URL}/extranet` 
  : '/api/v1/extranet';

/**
 * Generates an Idempotency Key to prevent duplicate mutations.
 */
const generateIdempotencyKey = () => {
  return crypto.randomUUID();
};

/**
 * Extranet-specific fetch interceptor to handle specialized headers and error normalization.
 */
const extranetFetch = async (endpoint, options = {}) => {
  const headers = getAuthHeaders();
  
  // Inject Idempotency-Key for mutations
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method)) {
    headers['Idempotency-Key'] = generateIdempotencyKey();
  }

  // Ensure JSON content type if body exists and not FormData
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${EXTRANET_API_URL}${endpoint}`, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  });

  const data = await response.json();

  // Normalize errors (Feature Gate, State Machine, Validations)
  if (!response.ok || !data.success) {
    const errorMsg = data.message || 'An operational error occurred.';
    // We throw a standardized error object
    throw {
      status: response.status,
      message: errorMsg,
      isFeatureGateError: response.status === 403,
      isStateTransitionError: response.status === 400 && errorMsg.includes('Invalid transition'),
      raw: data
    };
  }

  // Return data.data if it exists, otherwise return the whole data object
  // This handles both wrapped and top-level response patterns
  return data.data !== undefined ? data.data : data;
};

// --- PROPERTY ---
export const fetchProperty = () => extranetFetch('/property', { method: 'GET' });
export const updateProperty = (data) => extranetFetch('/property', { method: 'PUT', body: JSON.stringify(data) });

// --- ROOMS ---
export const fetchRooms = () => extranetFetch('/rooms', { method: 'GET' });
export const updateRoom = (roomId, data) => extranetFetch(`/rooms/${roomId}`, { method: 'PUT', body: JSON.stringify(data) });

// --- BOOKINGS ---
export const fetchBookings = () => extranetFetch('/bookings', { method: 'GET' });
export const transitionBookingStatus = (bookingId, status) => extranetFetch(`/bookings/${bookingId}/status`, { method: 'PUT', body: JSON.stringify({ status }) });

// --- REVIEWS ---
export const fetchReviews = () => extranetFetch('/reviews', { method: 'GET' });
export const replyToReview = (reviewId, replyText) => extranetFetch(`/reviews/${reviewId}/reply`, { method: 'POST', body: JSON.stringify({ replyText }) });

// --- FINANCE ---
export const fetchFinanceOverview = () => extranetFetch('/finance/overview', { method: 'GET' });
export const fetchSettlementDetails = (settlementId) => extranetFetch(`/finance/settlements/${settlementId}`, { method: 'GET' });
export const fetchPayoutHistory = () => extranetFetch('/finance/payouts', { method: 'GET' });

// --- PROMOTIONS ---
export const fetchPromotions = () => extranetFetch('/promotions', { method: 'GET' });
export const createPromotion = (data) => extranetFetch('/promotions', { method: 'POST', body: JSON.stringify(data) });

// --- NOTIFICATIONS & ACTIVITY ---
export const fetchNotifications = () => extranetFetch('/notifications', { method: 'GET' });
export const markNotificationsRead = (notificationIds) => extranetFetch('/notifications/read', { method: 'PUT', body: JSON.stringify({ notificationIds }) });
export const fetchActivityTimeline = () => extranetFetch('/activity', { method: 'GET' });

// --- ONBOARDING ---
export const initOnboarding = () => extranetFetch('/onboarding/init', { method: 'POST' });
export const getOnboardingProgress = (hotelId) => extranetFetch(`/onboarding/${hotelId}/progress`, { method: 'GET' });
export const saveOnboardingStep = (hotelId, step, data) => extranetFetch(`/onboarding/${hotelId}/step/${step}`, { method: 'PUT', body: JSON.stringify(data) });
export const submitPropertyForReview = (hotelId) => extranetFetch(`/onboarding/${hotelId}/submit`, { method: 'POST' });

