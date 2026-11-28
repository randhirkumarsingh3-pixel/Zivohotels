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
/** Header details, guest rating and content score of the active property */
export const fetchPropertyOverview = () => extranetFetch('/property/overview', { method: 'GET' });
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

// Guests' date changes: list, approve / decline
export const fetchDateChanges = () => extranetFetch('/date-changes', { method: 'GET' });
export const respondToDateChange = (id, decision, reply) => extranetFetch(`/date-changes/${id}`, { method: 'PATCH', body: JSON.stringify({ decision, reply }) });

// --- HOURLY STAYS ---
export const fetchHourlySetup = () => extranetFetch('/hourly', { method: 'GET' });
export const saveHourlySetup = (data) => extranetFetch('/hourly', { method: 'PUT', body: JSON.stringify(data) });
export const fetchHourlyAllocations = (from, days = 14) => extranetFetch(`/hourly/allocations?from=${from}&days=${days}`, { method: 'GET' });
export const setHourlyAllocation = (data) => extranetFetch('/hourly/allocations', { method: 'PUT', body: JSON.stringify(data) });
export const fetchHourlyTimeline = (date) => extranetFetch(`/hourly/timeline?date=${date}`, { method: 'GET' });

/** The property's team and roles (Team page); same shape as adminTeamApi in services/api.js */
export const teamApi = {
  get: () => extranetFetch('/team', { method: 'GET' }),
  invite: (body) => extranetFetch('/team/invite', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => extranetFetch(`/team/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id) => extranetFetch(`/team/${id}`, { method: 'DELETE' }),
  resend: (id) => extranetFetch(`/team/${id}/resend`, { method: 'POST' }),
  saveRole: (role) => extranetFetch(role.id ? `/team/roles/${role.id}` : '/team/roles', { method: role.id ? 'PUT' : 'POST', body: JSON.stringify(role) }),
  deleteRole: (id) => extranetFetch(`/team/roles/${id}`, { method: 'DELETE' }),
};

/** Google Hotels: whether this property appears on Google (the hotel's own choice) */
/** Downloads a file (PDF / Excel) for the property in scope. */
const extranetFile = async (endpoint) => {
  const response = await fetch(`${EXTRANET_API_URL}${withActiveHotel(endpoint)}`, { headers: getAuthHeaders() });
  if (!response.ok) {
    let message = 'Download failed';
    try { message = (await response.json()).message || message; } catch { /* not JSON */ }
    throw { status: response.status, message };
  }
  return response.blob();
};

export const financeHubApi = {
  hub: (period) => extranetFetch(`/finance/hub?period=${encodeURIComponent(period)}`, { method: 'GET' }),
  documentPdf: (id) => extranetFile(`/finance/documents/${id}/pdf`),
  statement: (period, format) => extranetFile(`/finance/statement?period=${encodeURIComponent(period)}&format=${format}`),
  invoicesZip: (fy) => extranetFile(`/finance/documents/zip?fy=${encodeURIComponent(fy)}`),
  feedbackQrPng: () => extranetFile('/reviews/qr.png'),
  feedbackQrPdf: () => extranetFile('/reviews/qr.pdf'),
  monthlyReportCsv: (month) => extranetFile(`/performance/monthly.csv?month=${encodeURIComponent(month)}`),
};

export const googleHotelsApi = {
  get: () => extranetFetch('/google', { method: 'GET' }),
  set: (optIn) => extranetFetch('/google', { method: 'PUT', body: JSON.stringify({ optIn }) }),
};
