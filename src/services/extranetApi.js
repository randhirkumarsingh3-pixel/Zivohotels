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

// The property the owner picked in the "Active property" switcher. Every extranet request carries
// it as ?hotelId= (the server checks the owner owns it). Without it the server always used the
// owner's first hotel, so owners with several properties could only manage one.
const ACTIVE_HOTEL_KEY = 'extranet_active_hotel';
export const getActiveHotelId = () => { try { return localStorage.getItem(ACTIVE_HOTEL_KEY); } catch { return null; } };
export const setActiveHotelId = (id) => {
  try { id ? localStorage.setItem(ACTIVE_HOTEL_KEY, id) : localStorage.removeItem(ACTIVE_HOTEL_KEY); } catch { /* private mode */ }
};

const withActiveHotel = (endpoint) => {
  const id = getActiveHotelId();
  if (!id || endpoint.startsWith('/properties') || endpoint.startsWith('/onboarding/init') || /[?&]hotelId=/.test(endpoint)) return endpoint;
  return `${endpoint}${endpoint.includes('?') ? '&' : '?'}hotelId=${encodeURIComponent(id)}`;
};

/**
 * Extranet-specific fetch interceptor to handle specialized headers and error normalization.
 */
const extranetFetch = async (endpoint, options = {}) => {
  endpoint = withActiveHotel(endpoint);
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
export const fetchMyProperties = () => extranetFetch('/properties', { method: 'GET' });
export const fetchProperty = () => extranetFetch('/property', { method: 'GET' });
export const updateProperty = (data) => extranetFetch('/property', { method: 'PUT', body: JSON.stringify(data) });
export const updateBookingEmails = (emails) => extranetFetch('/property/booking-emails', { method: 'PUT', body: JSON.stringify({ emails }) });

// --- ROOMS ---
export const fetchRooms = () => extranetFetch('/rooms', { method: 'GET' });

// --- BOOKINGS ---
export const fetchBookings = () => extranetFetch('/bookings', { method: 'GET' });
export const transitionBookingStatus = (bookingId, status) => extranetFetch(`/bookings/${bookingId}/status`, { method: 'PUT', body: JSON.stringify({ status }) });

// --- REVIEWS ---
/** Generic GET for the active property (e.g. '/wallet'). */
export const extranetGet = (endpoint) => extranetFetch(endpoint, { method: 'GET' });
export const extranetPut = (endpoint, body) => extranetFetch(endpoint, { method: 'PUT', body: JSON.stringify(body) });
export const fetchReviews = (params = {}) => extranetFetch(`/reviews?${new URLSearchParams(params)}`, { method: 'GET' });
export const replyToReview = (reviewId, replyText) => extranetFetch(`/reviews/${reviewId}/reply`, { method: 'POST', body: JSON.stringify({ replyText }) });
export const deleteReviewReply = (reviewId) => extranetFetch(`/reviews/${reviewId}/reply`, { method: 'DELETE' });
export const reportReview = (reviewId, reason, details) => extranetFetch(`/reviews/${reviewId}/report`, { method: 'POST', body: JSON.stringify({ reason, details }) });

// --- FINANCE ---
export const fetchFinanceOverview = () => extranetFetch('/finance/overview', { method: 'GET' });
export const fetchSettlementDetails = (settlementId) => extranetFetch(`/finance/settlements/${settlementId}`, { method: 'GET' });
export const fetchPayoutHistory = () => extranetFetch('/finance/payouts', { method: 'GET' });

// --- PROMOTIONS ---

// --- NOTIFICATIONS & ACTIVITY ---
export const fetchNotifications = () => extranetFetch('/notifications', { method: 'GET' });
export const markNotificationsRead = (notificationIds) => extranetFetch('/notifications/read', { method: 'PUT', body: JSON.stringify({ notificationIds }) });
export const fetchActivityTimeline = () => extranetFetch('/activity', { method: 'GET' });

// --- ONBOARDING ---
export const initOnboarding = () => extranetFetch('/onboarding/init', { method: 'POST' });
export const getOnboardingProgress = (hotelId) => extranetFetch(`/onboarding/${hotelId}/progress`, { method: 'GET' });
export const saveOnboardingStep = (hotelId, step, data) => extranetFetch(`/onboarding/${hotelId}/step/${step}`, { method: 'PUT', body: JSON.stringify(data) });
export const submitPropertyForReview = (hotelId) => extranetFetch(`/onboarding/${hotelId}/submit`, { method: 'POST' });


// --- GUEST REQUESTS (concierge) ---
/** Confirm or decline a guest's request: status CONFIRMED | DECLINED, reply shown to the guest. */
export const respondToStayRequest = (requestId, status, reply) => extranetFetch(`/requests/${requestId}`, { method: 'PATCH', body: JSON.stringify({ status, reply }) });
