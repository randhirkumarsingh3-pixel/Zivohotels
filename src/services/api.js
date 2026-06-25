/**
 * api.js
 * Centralized API service for ZivoHotels.
 *
 * Design:
 *  - All requests flow through `apiFetch()`, which enforces the standard
 *    backend response shape: { success, message, code, data }.
 *  - On failure the helper throws an `ApiError` so every existing UI
 *    try/catch block continues to work without modification.
 *  - `trackEvent` remains fire-and-forget (no throw).
 *  - Soft-fail helpers (getRecommendations, getExperiments) return null
 *    instead of throwing, preserving progressive-enhancement behaviour.
 */

// ─── BASE URLS ────────────────────────────────────────────────────────────────
const API_URL     = import.meta.env.VITE_API_URL || '/api/v1';
const ADMIN_BASE  = `${API_URL}/admin`;
const PUBLIC_BASE = API_URL;

// ─── CUSTOM ERROR ─────────────────────────────────────────────────────────────
/**
 * ApiError is thrown whenever the backend returns success:false or the
 * HTTP status is ≥ 400. UI components catch it the same way they caught
 * plain Error objects, but now have access to `.code` for fine-grained UX.
 */
export class ApiError extends Error {
  constructor(message, code = 'API_ERROR', status = 0) {
    super(message);
    this.name    = 'ApiError';
    this.code    = code;
    this.status  = status;
  }
}

// ─── AUTH HEADERS ─────────────────────────────────────────────────────────────
export const getAuthHeaders = () => {
  const token = localStorage.getItem('jwt_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

// ─── SESSION ID ───────────────────────────────────────────────────────────────
const getSessionId = () => {
  let sid = localStorage.getItem('session_id');
  if (!sid) {
    sid = crypto.randomUUID ? crypto.randomUUID() : `session-${Date.now()}`;
    localStorage.setItem('session_id', sid);
  }
  return sid;
};

// ─── CORE FETCH ───────────────────────────────────────────────────────────────
/**
 * apiFetch(url, options)
 *
 * Handles:
 *  - 401  → clears session, redirects to /login (except analytics endpoints)
 *  - success:false backend body → throws ApiError(message, code, status)
 *  - HTTP error without JSON body → throws ApiError with HTTP status text
 *
 * Returns the full parsed JSON body so callers can access `.data`, `.token`, etc.
 */
const apiFetch = async (url, options = {}) => {
  const response = await fetch(url, options);

  // 401 – session expired
  if (response.status === 401 && !url.includes('/analytics')) {
    localStorage.removeItem('jwt_token');
    localStorage.removeItem('user_data');
    window.location.href = '/login?expired=true';
    throw new ApiError('Session expired. Please log in again.', 'SESSION_EXPIRED', 401);
  }

  let body;
  try {
    body = await response.json();
  } catch {
    if (!response.ok) {
      throw new ApiError(response.statusText || 'Request failed', 'NETWORK_ERROR', response.status);
    }
    return null;
  }

  // Backend returned success:false explicitly
  if (body && body.success === false) {
    throw new ApiError(
      body.message || 'Request failed',
      body.code    || 'API_ERROR',
      response.status,
    );
  }

  // HTTP error but backend didn't set success:false (legacy endpoint safety net)
  if (!response.ok) {
    throw new ApiError(
      body?.message || 'Request failed',
      body?.code    || 'API_ERROR',
      response.status,
    );
  }

  return body;
};

// ─── AUTHENTICATION ────────────────────────────────────────────────────────────

export const loginUser = (credentials) =>
  apiFetch(`${PUBLIC_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });

export const signupUser = (userData) =>
  apiFetch(`${PUBLIC_BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData),
  });

export const sendVerificationOtp = (email) =>
  apiFetch(`${PUBLIC_BASE}/auth/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, type: 'VERIFICATION' }),
  });

export const verifyOtpApi = (email, otp) =>
  apiFetch(`${PUBLIC_BASE}/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp, type: 'VERIFICATION' }),
  });

// ─── HOTELS ───────────────────────────────────────────────────────────────────

export const getHotels = async (searchParams = {}, filters = {}) => {
  const params = new URLSearchParams();

  if (searchParams.destination) params.set('city',         searchParams.destination);
  if (searchParams.checkIn)     params.set('checkIn',      searchParams.checkIn);
  if (searchParams.checkOut)    params.set('checkOut',     searchParams.checkOut);
  if (searchParams.guests)      params.set('guests',       searchParams.guests);
  if (filters.priceMin)         params.set('minPrice',     filters.priceMin);
  if (filters.priceMax)         params.set('maxPrice',     filters.priceMax);
  if (filters.stars)            params.set('minRating',    filters.stars);
  if (filters.sortBy)           params.set('sort',         filters.sortBy);
  if (filters.includeSoldOut !== undefined)
    params.set('includeSoldOut', filters.includeSoldOut);

  const hasSearch = searchParams.destination && searchParams.checkIn && searchParams.checkOut;
  const baseUrl   = hasSearch ? `${PUBLIC_BASE}/hotels/search` : `${PUBLIC_BASE}/hotels`;
  const url       = `${baseUrl}${params.toString() ? '?' + params.toString() : ''}`;

  const body = await apiFetch(url);
  return body?.data;
};

export const getHotelById = async (id) => {
  const body = await apiFetch(`${PUBLIC_BASE}/hotels/${id}`);
  return body?.data;
};

// ─── ANALYTICS & EXPERIMENTS ─────────────────────────────────────────────────

/** Fire-and-forget – never throws, never blocks the UI. */
export const trackEvent = (eventType, metadata = {}, hotelId = null, city = null, experiments = {}) => {
  const sessionId = getSessionId();
  fetch(`${PUBLIC_BASE}/analytics`, {
    method:  'POST',
    headers: { ...getAuthHeaders(), 'x-session-id': sessionId },
    body:    JSON.stringify({ eventType, metadata, hotelId, city, experiments }),
  }).catch(console.error);
};

/** Soft-fail: returns null instead of throwing so UI degrades gracefully. */
export const getRecommendations = async (city = null) => {
  try {
    const url  = city
      ? `${PUBLIC_BASE}/recommendations?city=${encodeURIComponent(city)}`
      : `${PUBLIC_BASE}/recommendations`;
    const body = await apiFetch(url, { headers: getAuthHeaders() });
    return body?.data ?? null;
  } catch {
    return null;
  }
};

/** Soft-fail: returns null instead of throwing so experiments degrade gracefully. */
export const getExperiments = async () => {
  try {
    const body = await apiFetch(`${PUBLIC_BASE}/experiments`, {
      headers: { ...getAuthHeaders(), 'x-session-id': getSessionId() },
    });
    return body?.data ?? null;
  } catch {
    return null;
  }
};

// ─── ADMIN ────────────────────────────────────────────────────────────────────

export const getAdminHotels = async () => {
  const body = await apiFetch(`${ADMIN_BASE}/hotels`, { headers: getAuthHeaders() });
  return body?.data;
};

export const getAdminAnalytics = async (days = 30) => {
  const [kBody, rBody] = await Promise.all([
    apiFetch(`${ADMIN_BASE}/analytics/kpis`,              { headers: getAuthHeaders() }),
    apiFetch(`${ADMIN_BASE}/analytics/revenue?days=${days}`, { headers: getAuthHeaders() }),
  ]);
  return { kpis: kBody?.data, revenue: rBody?.data };
};

// ─── BOOKINGS ─────────────────────────────────────────────────────────────────

export const createBooking = (bookingData) =>
  apiFetch(`${PUBLIC_BASE}/bookings`, {
    method:  'POST',
    headers: getAuthHeaders(),
    body:    JSON.stringify(bookingData),
  });

export const previewBookingApi = (bookingData) =>
  apiFetch(`${PUBLIC_BASE}/bookings/preview`, {
    method:  'POST',
    headers: getAuthHeaders(),
    body:    JSON.stringify(bookingData),
  });

export const cancelBooking = (bookingId) =>
  apiFetch(`${PUBLIC_BASE}/bookings/${bookingId}/fail`, {
    method:  'POST',
    headers: getAuthHeaders(),
  });

export const getAdminBookings = async (params = {}) => {
  const qs   = new URLSearchParams(params).toString();
  const body = await apiFetch(`${ADMIN_BASE}/bookings?${qs}`, { headers: getAuthHeaders() });
  return body;
};

// ─── PAYMENTS ─────────────────────────────────────────────────────────────────

export const createPaymentOrder = (bookingId) =>
  apiFetch(`${PUBLIC_BASE}/payments/create-order`, {
    method:  'POST',
    headers: getAuthHeaders(),
    body:    JSON.stringify({ bookingId }),
  });

export const verifyPaymentApi = (verificationData) =>
  apiFetch(`${PUBLIC_BASE}/payments/verify`, {
    method:  'POST',
    headers: getAuthHeaders(),
    body:    JSON.stringify(verificationData),
  });

// ─── SYSTEM ADMINISTRATION ────────────────────────────────────────────────────

export const getSystemStats = async () => {
  const body = await apiFetch(`${ADMIN_BASE}/system/stats`, { headers: getAuthHeaders() });
  return body?.data;
};

export const getSecurityLogs = async (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return apiFetch(`${ADMIN_BASE}/system/security-logs?${qs}`, { headers: getAuthHeaders() });
};

export const getIntegrityResult = async () => {
  const body = await apiFetch(`${ADMIN_BASE}/system/integrity`, { headers: getAuthHeaders() });
  return body?.data;
};

export const triggerSystemAction = (actionData) =>
  apiFetch(`${ADMIN_BASE}/system/actions`, {
    method:  'POST',
    headers: getAuthHeaders(),
    body:    JSON.stringify(actionData),
  });

export const getSystemConfig = async () => {
  const body = await apiFetch(`${ADMIN_BASE}/system/config`, { headers: getAuthHeaders() });
  return body?.data;
};

export const updateSystemConfig = (config) =>
  apiFetch(`${ADMIN_BASE}/system/config`, {
    method:  'PUT',
    headers: getAuthHeaders(),
    body:    JSON.stringify(config),
  });

export const getTaxRules = async () => {
  const body = await apiFetch(`${ADMIN_BASE}/system/tax-rules`, { headers: getAuthHeaders() });
  return body?.data;
};

export const updateTaxRules = (slabs) =>
  apiFetch(`${ADMIN_BASE}/system/tax-rules`, {
    method:  'PUT',
    headers: getAuthHeaders(),
    body:    JSON.stringify({ slabs }),
  });

// ─── ADMIN ANALYTICS (granular) ───────────────────────────────────────────────

export const getAdminAnalyticsKpis = () =>
  apiFetch(`${ADMIN_BASE}/analytics/kpis`, { headers: getAuthHeaders() });

export const getAdminAnalyticsRevenue = (days) =>
  apiFetch(`${ADMIN_BASE}/analytics/revenue?days=${days}`, { headers: getAuthHeaders() });

export const getAdminAnalyticsBookings = (days) =>
  apiFetch(`${ADMIN_BASE}/analytics/bookings?days=${days}`, { headers: getAuthHeaders() });

export const getAdminAnalyticsTopProperties = (days) =>
  apiFetch(`${ADMIN_BASE}/analytics/top-properties?days=${days}`, { headers: getAuthHeaders() });

// ─── PUBLIC SYSTEM CONFIG ─────────────────────────────────────────────────────

export const getPublicConfig = () => apiFetch(`${PUBLIC_BASE}/system/config`);
