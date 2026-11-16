/**
 * api.js
 * Centralized API service for ZivoHotels.
 * Single Source of Truth for all frontend requests.
 * 
 * Features:
 * - Hybrid Caching (Map & sessionStorage) with explicit TTLs
 * - Request Deduplication (In-flight request sharing)
 * - Endpoint-Specific Timeouts
 * - Exponential Backoff Retries (502, 503, 504, Network only)
 * - Offline Detection & Background Refresh (Stale-while-revalidate)
 * - Request IDs & Correlation Logging
 * - API Versioning & Standardized Response Handling
 */

// ─── BASE URLS ────────────────────────────────────────────────────────────────
const API_URL     = import.meta.env.VITE_API_URL || '/api/v1';
const ADMIN_BASE  = `${API_URL}/admin`;
const PUBLIC_BASE = API_URL;

// ─── CUSTOM ERROR ─────────────────────────────────────────────────────────────
export class ApiError extends Error {
  constructor(message, code = 'API_ERROR', status = 0, data = null) {
    super(message);
    this.name   = 'ApiError';
    this.code   = code;
    this.status = status;
    this.data   = data;
  }
}

// ─── SESSION & AUTH ───────────────────────────────────────────────────────────
export const getAuthHeaders = () => {
  const token = localStorage.getItem('jwt_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const getSessionId = () => {
  let sid = localStorage.getItem('session_id');
  if (!sid) {
    sid = crypto.randomUUID ? crypto.randomUUID() : `session-${Date.now()}`;
    localStorage.setItem('session_id', sid);
  }
  return sid;
};

// ─── HYBRID CACHING STRATEGY ──────────────────────────────────────────────────
const memoryCache = new Map();

const getCacheConfig = (url) => {
  // Never Cache
  if (url.includes('/availability') || url.includes('/pricing') || 
      url.includes('/bookings') || url.includes('/payments') || 
      url.includes('/auth') || url.includes('/wallet') || 
      url.includes('/loyalty') || url.includes('/admin') || url.includes('/membership') || url.includes('/reviews')) {
    return null;
  }

  // Memory Cache (Level 1)
  if (url.includes('/public/search/autocomplete') || url.includes('/public/search/popular')) return { type: 'memory', ttl: 24 * 60 * 60 * 1000 };
  if (url.includes('/amenities')) return { type: 'memory', ttl: 24 * 60 * 60 * 1000 };
  if (url.includes('/system/config') || url.includes('/public/config')) return { type: 'memory', ttl: 30 * 60 * 1000 };
  if (url.includes('/countries')) return { type: 'memory', ttl: 7 * 24 * 60 * 60 * 1000 };
  if (url.includes('/cities')) return { type: 'memory', ttl: 24 * 60 * 60 * 1000 };
  if (url.includes('/hotels/') && !url.includes('/search')) return { type: 'memory', ttl: 5 * 60 * 1000 };
  
  // Session Storage Cache (Level 2)
  if (url.includes('/search/recent') || url.includes('/hotels/search')) return { type: 'session', ttl: 60 * 60 * 1000 };

  return null;
};

const readCache = (url) => {
  const config = getCacheConfig(url);
  if (!config) return null;
  
  let entry;
  if (config.type === 'memory') {
    entry = memoryCache.get(url);
  } else if (config.type === 'session') {
    const raw = sessionStorage.getItem(`zivo_cache_${url}`);
    if (raw) entry = JSON.parse(raw);
  }
  
  if (entry && (Date.now() - entry.timestamp < config.ttl)) {
    return entry.data;
  }
  return null;
};

const writeCache = (url, data) => {
  const config = getCacheConfig(url);
  if (!config) return;
  
  const entry = { timestamp: Date.now(), data };
  if (config.type === 'memory') {
    memoryCache.set(url, entry);
  } else if (config.type === 'session') {
    sessionStorage.setItem(`zivo_cache_${url}`, JSON.stringify(entry));
  }
};

// ─── ENDPOINT-SPECIFIC TIMEOUTS ───────────────────────────────────────────────
const getTimeoutForUrl = (url) => {
  if (url.includes('/nearby/suggest')) return 150000; // one map search per kind of place
  if (url.includes('/nearby/lookup')) return 25000;
  if (url.includes('/search') || url.includes('/autocomplete')) return 5000;
  if (url.includes('/availability')) return 8000;
  if (url.includes('/auth/login') || url.includes('/auth/signup')) return 10000;
  if (url.includes('/bookings') && !url.includes('/history')) return 20000; 
  if (url.includes('/payments/create-order')) return 30000;
  if (url.includes('/payments/verify')) return 45000;
  if (url.includes('/invoices') || url.includes('/voucher')) return 60000;
  if (url.includes('/images') || url.includes('/upload')) return 120000;
  if (url.includes('/hotels/')) return 5000; 
  return 10000; // Default
};

// ─── REQUEST DEDUPLICATION ────────────────────────────────────────────────────
const inFlightRequests = new Map();

// ─── CORE FETCH ───────────────────────────────────────────────────────────────
const performNetworkRequest = async (url, options, retriesLeft, backoff, dedupeKey, requestId, isBackground) => {
  const timeoutMs = getTimeoutForUrl(url);
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  
  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort());
  }

  const startTime = performance.now();

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    
    const duration = Math.round(performance.now() - startTime);

    if (response.status === 401 && !url.includes('/analytics')) {
      localStorage.removeItem('jwt_token');
      localStorage.removeItem('user_data');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login?expired=true';
      }
      throw new ApiError('Session expired. Please log in again.', 'SESSION_EXPIRED', 401);
    }

    let body;
    try {
      if (options.responseType === 'blob') {
        return await response.blob();
      }
      body = await response.json();
    } catch {
      if (!response.ok) throw new ApiError(response.statusText || 'Request failed', 'NETWORK_ERROR', response.status);
      return null;
    }

    const isSuccess = body && body.success !== false;
    
    if (!isBackground) {
       console.log(`[API] ${isSuccess ? '✅' : '❌'} ${options.method || 'GET'} ${url} | ${response.status} | ${duration}ms | ID: ${requestId}`);
    }

    if (!isSuccess || !response.ok) {
      const errorMsg = body?.message || response.statusText || 'Request failed';
      const errorCode = body?.code || 'API_ERROR';
      const status = response.status;
      
      if ([502, 503, 504].includes(status) && retriesLeft > 0) {
        if (!isBackground) console.warn(`[API] ⚠️ RETRYING (${retriesLeft} left) in ${backoff}ms: ${url}`);
        await new Promise(r => setTimeout(r, backoff));
        return performNetworkRequest(url, options, retriesLeft - 1, backoff * 2, dedupeKey, requestId, isBackground);
      }
      
      throw new ApiError(errorMsg, errorCode, status, body?.data);
    }
    
    return body;
  } catch (error) {
    clearTimeout(id);
    
    if (error.name === 'AbortError' && !options.signal?.aborted) {
      if (!isBackground) console.log(`[API] ⏳ TIMEOUT (${timeoutMs}ms) ${options.method || 'GET'} ${url} | ID: ${requestId}`);
      throw new ApiError('Request timed out. Please try again.', 'TIMEOUT', 408);
    }
    
    if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
      if (!isBackground) console.log(`[API] 🔌 NETWORK ERROR ${options.method || 'GET'} ${url} | ID: ${requestId}`);
      if (retriesLeft > 0) {
        if (!isBackground) console.warn(`[API] ⚠️ RETRYING Network Error (${retriesLeft} left) in ${backoff}ms: ${url}`);
        await new Promise(r => setTimeout(r, backoff));
        return performNetworkRequest(url, options, retriesLeft - 1, backoff * 2, dedupeKey, requestId, isBackground);
      }
      throw new ApiError('Network connection failed. Please check your internet connection.', 'NETWORK_ERROR', 0);
    }
    
    throw error;
  }
};

export const apiFetch = async (url, options = {}, retries = 3, backoff = 500) => {
  if (!navigator.onLine) {
    throw new ApiError('You are currently offline. Please check your internet connection.', 'OFFLINE', 0);
  }

  const isGet = !options.method || options.method === 'GET';
  const requestId = crypto.randomUUID ? crypto.randomUUID() : `req-${Date.now()}`;
  
  const headers = {
    'Content-Type': 'application/json',
    'X-Request-ID': requestId,
    ...getAuthHeaders(),
    ...options.headers,
  };
  
  const cacheKey = isGet ? url : null;
  const dedupeKey = `${options.method || 'GET'}_${url}_${options.body || ''}`;

  if (cacheKey) {
    const cachedData = readCache(cacheKey);
    if (cachedData) {
      console.log(`[API] ⚡ CACHE HIT: ${url} | ID: ${requestId}`);
      performNetworkRequest(url, { ...options, headers }, 0, 0, dedupeKey, requestId, true)
        .then(freshData => writeCache(cacheKey, freshData))
        .catch(() => {});
      return cachedData; 
    }
  }

  if (inFlightRequests.has(dedupeKey)) {
    console.log(`[API] 🔄 DEDUPLICATING REQUEST: ${url} | ID: ${requestId}`);
    return inFlightRequests.get(dedupeKey);
  }

  // Only reads are retried automatically. Retrying a POST/PATCH (create booking, create payment
  // order, cancel...) after a timeout or 5xx can repeat an action that already happened, and the
  // extra calls used up the booking rate limit so the follow-up "release booking" call was refused.
  const effectiveRetries = isGet ? retries : 0;
  const promise = performNetworkRequest(url, { ...options, headers }, effectiveRetries, backoff, dedupeKey, requestId, false);
  inFlightRequests.set(dedupeKey, promise);

  try {
    const data = await promise;
    if (cacheKey) writeCache(cacheKey, data);
    return data;
  } finally {
    inFlightRequests.delete(dedupeKey);
  }
};

// ─── AUTHENTICATION ────────────────────────────────────────────────────────────
export const loginUser = (credentials) => apiFetch(`${PUBLIC_BASE}/auth/login`, { method: 'POST', body: JSON.stringify(credentials) });
export const signupUser = (userData) => apiFetch(`${PUBLIC_BASE}/auth/signup`, { method: 'POST', body: JSON.stringify(userData) });
export const sendVerificationOtp = (email) => apiFetch(`${PUBLIC_BASE}/auth/send-otp`, { method: 'POST', body: JSON.stringify({ email, type: 'VERIFICATION' }) });
export const verifyOtpApi = (email, otp) => apiFetch(`${PUBLIC_BASE}/auth/verify-otp`, { method: 'POST', body: JSON.stringify({ email, otp, type: 'VERIFICATION' }) });
export const acceptInvite = (token, password) => apiFetch(`${PUBLIC_BASE}/users/accept-invite`, { method: 'POST', body: JSON.stringify({ token, password }) });

// ─── HOTELS & DESTINATIONS ───────────────────────────────────────────────────
export const getPopularDestinations = (options = {}) => apiFetch(`${PUBLIC_BASE}/public/search/popular`, options).then(res => res?.data);
export const searchDestinations = (query, options = {}) => apiFetch(`${PUBLIC_BASE}/public/search?q=${encodeURIComponent(query)}`, options).then(res => res?.data);
// Home page: cities with live counts, top-rated hotels, live offers, reviews, sign-up and membership
export const getHomeFeed = () => apiFetch(`${PUBLIC_BASE}/public/home`).then(res => res?.data);
export const nearbyDestinations = (lat, lng, options = {}) => apiFetch(`${PUBLIC_BASE}/public/search/nearby?lat=${lat}&lng=${lng}`, options).then(res => res?.data);

export const getHotels = async (searchParams = {}, filters = {}) => {
  const params = new URLSearchParams();
  // Near me sends the location; otherwise the place typed (city, area, hotel's state...)
  const near = searchParams.lat != null && searchParams.lng != null;
  if (near) { params.set('lat', searchParams.lat); params.set('lng', searchParams.lng); }
  else if (searchParams.destination) params.set('city', searchParams.destination);
  if (searchParams.checkIn) params.set('checkIn', searchParams.checkIn);
  if (searchParams.checkOut) params.set('checkOut', searchParams.checkOut);
  if (searchParams.guests) params.set('guests', searchParams.guests);
  if (filters.priceMin) params.set('minPrice', filters.priceMin);
  if (filters.priceMax) params.set('maxPrice', filters.priceMax);
  if (filters.stars) params.set('minStars', filters.stars); // star category (not the review score)
  if (filters.sortBy) params.set('sort', filters.sortBy);
  if (filters.includeSoldOut !== undefined) params.set('includeSoldOut', filters.includeSoldOut);

  const hasSearch = (near || searchParams.destination) && searchParams.checkIn && searchParams.checkOut;
  const baseUrl   = hasSearch ? `${PUBLIC_BASE}/hotels/search` : `${PUBLIC_BASE}/hotels`;
  const url       = `${baseUrl}${params.toString() ? '?' + params.toString() : ''}`;
  
  return apiFetch(url).then(res => res?.data);
};

// With stay dates the response includes each rate plan's price for those nights and room availability
export const getHotelById = (id, stay = {}) => {
  const q = stay.checkIn && stay.checkOut ? `?${new URLSearchParams({ checkin: stay.checkIn, checkout: stay.checkOut })}` : '';
  return apiFetch(`${PUBLIC_BASE}/hotels/${id}${q}`).then(res => res?.data);
};
export const getHotelAvailability = (id, params) => {
  const qs = new URLSearchParams(params).toString();
  return apiFetch(`${PUBLIC_BASE}/hotels/${id}/availability?${qs}`).then(res => res?.data);
};
// What's nearby (onboarding Location step)
export const suggestNearbyPlaces = (lat, lng) => apiFetch(`${PUBLIC_BASE}/hotels/nearby/suggest`, { method: 'POST', body: JSON.stringify({ lat, lng }) }).then(res => res?.data || []);
export const lookupNearbyPlace = (q, lat, lng) => apiFetch(`${PUBLIC_BASE}/hotels/nearby/lookup`, { method: 'POST', body: JSON.stringify({ q, lat, lng }) }).then(res => res?.data || []);
export const getHotelAmenities = (id) => apiFetch(`${PUBLIC_BASE}/hotels/${id}/amenities`).then(res => res?.data);
export const getHotelImages = (id) => apiFetch(`${PUBLIC_BASE}/hotels/${id}/images`).then(res => res?.data);

// ─── WISHLIST ────────────────────────────────────────────────────────────────
export const getWishlist = () => apiFetch(`${PUBLIC_BASE}/wishlist`).then(res => res?.data);
export const addToWishlist = (hotelId) => apiFetch(`${PUBLIC_BASE}/wishlist/${hotelId}`, { method: 'POST' });
export const removeFromWishlist = (hotelId) => apiFetch(`${PUBLIC_BASE}/wishlist/${hotelId}`, { method: 'DELETE' });

// ─── PROFILE ─────────────────────────────────────────────────────────────────
export const getProfile = () => apiFetch(`${PUBLIC_BASE}/profile`).then(res => res?.data);
export const updateProfile = (data) => apiFetch(`${PUBLIC_BASE}/profile`, { method: 'PUT', body: JSON.stringify(data) });
// Passwords: change while signed in (returns a new token); forgot / reset by emailed link
export const changePassword = (data) => apiFetch(`${PUBLIC_BASE}/auth/password`, { method: 'PUT', body: JSON.stringify(data) });
export const requestPasswordReset = (email) => apiFetch(`${PUBLIC_BASE}/auth/forgot-password`, { method: 'POST', body: JSON.stringify({ email }) });
export const resetPassword = (token, password) => apiFetch(`${PUBLIC_BASE}/auth/reset-password`, { method: 'POST', body: JSON.stringify({ token, password }) });
export const getNotifications = () => apiFetch(`${PUBLIC_BASE}/profile/notifications`).then(res => res?.data);

// ─── REVIEWS ─────────────────────────────────────────────────────────────────
// Membership (free Member + paid plans)
export const getMembershipPlans = () => apiFetch(`${PUBLIC_BASE}/membership/plans`).then(res => res?.data || []);
export const getMyMembership = () => apiFetch(`${PUBLIC_BASE}/membership/me`).then(res => res?.data);
export const buyMembership = (planId, method) => apiFetch(`${PUBLIC_BASE}/membership/buy`, { method: 'POST', body: JSON.stringify({ planId, method }) }).then(res => res?.data);
export const verifyMembership = (data) => apiFetch(`${PUBLIC_BASE}/membership/verify`, { method: 'POST', body: JSON.stringify(data) }).then(res => res?.data);

// Zivo Cash (guest wallet)
export const getMyWallet = () => apiFetch(`${PUBLIC_BASE}/wallet`).then(res => res?.data);

// Zivo Rewards (loyalty)
export const getRewardsProgram = () => apiFetch(`${PUBLIC_BASE}/loyalty/program`).then(res => res?.data);
export const getMyRewards = () => apiFetch(`${PUBLIC_BASE}/loyalty/me`).then(res => res?.data);
export const getRewardsHistory = (page = 1) => apiFetch(`${PUBLIC_BASE}/loyalty/me/history?page=${page}`).then(res => res?.data || []);

// Reviews: public list for a hotel, and the guest's own reviews (write / edit)
export const getReviews = (hotelId, params = {}) => apiFetch(`${PUBLIC_BASE}/hotels/${hotelId}/reviews?${new URLSearchParams(params)}`).then(res => res?.data);
export const getReviewOptions = () => apiFetch(`${PUBLIC_BASE}/reviews/options`).then(res => res?.data);
export const getMyReviews = () => apiFetch(`${PUBLIC_BASE}/reviews/mine`).then(res => res?.data || []);
// (It posted to /hotels/:id/reviews, which has no such route, so no review could be submitted.)
export const submitReview = (data) => apiFetch(`${PUBLIC_BASE}/reviews`, { method: 'POST', body: JSON.stringify(data) });
export const updateReview = (reviewId, data) => apiFetch(`${PUBLIC_BASE}/reviews/${reviewId}`, { method: 'PUT', body: JSON.stringify(data) });

// ─── COUPONS ─────────────────────────────────────────────────────────────────
export const validateCoupon = (code, hotelId) => apiFetch(`${PUBLIC_BASE}/coupons/validate?code=${code}&hotelId=${hotelId}`).then(res => res?.data);

// ─── ANALYTICS & EXPERIMENTS ─────────────────────────────────────────────────
export const trackEvent = (eventType, metadata = {}, hotelId = null, city = null, experiments = {}) => {
  const sessionId = getSessionId();
  apiFetch(`${PUBLIC_BASE}/analytics/track`, { // Using apiFetch fire-and-forget
    method: 'POST',
    headers: { 'x-session-id': sessionId },
    body: JSON.stringify({ eventType, metadata, hotelId, city, experiments })
  }).catch(() => {});
};

export const getRecommendations = async (city = null) => {
  try {
    const url = city ? `${PUBLIC_BASE}/recommendations?city=${encodeURIComponent(city)}` : `${PUBLIC_BASE}/recommendations`;
    const res = await apiFetch(url);
    return res?.data ?? null;
  } catch {
    return null;
  }
};

export const getExperiments = async () => {
  try {
    const res = await apiFetch(`${PUBLIC_BASE}/experiments`, { headers: { 'x-session-id': getSessionId() } });
    return res?.data ?? null;
  } catch {
    return null;
  }
};

// ─── BOOKINGS ─────────────────────────────────────────────────────────────────
export const createBooking = (bookingData) => apiFetch(`${PUBLIC_BASE}/bookings`, { method: 'POST', body: JSON.stringify(bookingData) });
export const previewBookingApi = (bookingData) => apiFetch(`${PUBLIC_BASE}/bookings/preview`, { method: 'POST', body: JSON.stringify(bookingData) });
// refundTo: 'WALLET' (Zivo Cash, instant) or 'SOURCE' (original payment method), chosen by the guest
export const cancelBooking = (bookingId, refundTo = 'SOURCE') => apiFetch(`${PUBLIC_BASE}/bookings/${bookingId}/cancel`, { method: 'POST', body: JSON.stringify({ refundTo }) });
export const getCancelPreview = (bookingId) => apiFetch(`${PUBLIC_BASE}/bookings/${bookingId}/cancel-preview`, {}, 0);
export const modifyBooking = (bookingId, data) => apiFetch(`${PUBLIC_BASE}/bookings/${bookingId}`, { method: 'PUT', body: JSON.stringify(data) });
export const getUserBookings = () => apiFetch(`${PUBLIC_BASE}/bookings/my-bookings`).then(res => res?.data);
export const getBooking = (bookingId) => apiFetch(`${PUBLIC_BASE}/bookings/${bookingId}`).then(res => res?.data);
export const downloadInvoice = (invoiceId) => apiFetch(`${PUBLIC_BASE}/invoices/${invoiceId}/download`, { responseType: 'blob' });
// Booking voucher PDF: type 'guest' (booking confirmation) or 'hotelier' (owner/admin only)
export const downloadVoucher = (bookingId, type = 'guest') => apiFetch(`${PUBLIC_BASE}/bookings/${bookingId}/voucher?type=${type}`, { responseType: 'blob' }, 0);
// The signed-in user's profile (name, email, phone)
export const getMyProfile = () => apiFetch(`${PUBLIC_BASE}/auth/me`, {}, 0).then(res => res?.data?.user);

// ─── PAYMENTS ─────────────────────────────────────────────────────────────────
export const createPaymentOrder = (bookingId) => apiFetch(`${PUBLIC_BASE}/payments/create-order`, { method: 'POST', body: JSON.stringify({ bookingId }) });
export const verifyPaymentApi = (verificationData) => apiFetch(`${PUBLIC_BASE}/payments/verify`, { method: 'POST', body: JSON.stringify(verificationData) });

// ─── ADMIN ────────────────────────────────────────────────────────────────────
export const getAdminHotels = async () => apiFetch(`${ADMIN_BASE}/hotels`).then(res => res?.data);
export const getAdminBookings = async (params = {}) => apiFetch(`${ADMIN_BASE}/bookings?${new URLSearchParams(params).toString()}`);
export const getSystemStats = async () => apiFetch(`${ADMIN_BASE}/system/stats`).then(res => res?.data);
export const getSecurityLogs = async (params = {}) => apiFetch(`${ADMIN_BASE}/system/security-logs?${new URLSearchParams(params).toString()}`);
export const getIntegrityResult = async () => apiFetch(`${ADMIN_BASE}/system/integrity`).then(res => res?.data);
export const triggerSystemAction = (actionData) => apiFetch(`${ADMIN_BASE}/system/actions`, { method: 'POST', body: JSON.stringify(actionData) });
export const getSystemConfig = async () => apiFetch(`${ADMIN_BASE}/system/config`).then(res => res?.data);
export const updateSystemConfig = (config) => apiFetch(`${ADMIN_BASE}/system/config`, { method: 'PUT', body: JSON.stringify(config) });
export const getTaxRules = async () => apiFetch(`${ADMIN_BASE}/system/tax-rules`).then(res => res?.data);
export const updateTaxRules = (slabs) => apiFetch(`${ADMIN_BASE}/system/tax-rules`, { method: 'PUT', body: JSON.stringify({ slabs }) });

export const getAdminAnalyticsKpis = () => apiFetch(`${ADMIN_BASE}/analytics/kpis`);
export const getAdminAnalyticsRevenue = (days) => apiFetch(`${ADMIN_BASE}/analytics/revenue?days=${days}`);
export const getAdminAnalyticsBookings = (days) => apiFetch(`${ADMIN_BASE}/analytics/bookings?days=${days}`);
export const getAdminAnalyticsTopProperties = (days) => apiFetch(`${ADMIN_BASE}/analytics/top-properties?days=${days}`);
export const getAdminAnalytics = async (days = 30) => {
  const [kBody, rBody] = await Promise.all([
    getAdminAnalyticsKpis(),
    getAdminAnalyticsRevenue(days),
  ]);
  return { kpis: kBody?.data, revenue: rBody?.data };
};

// ─── PUBLIC SYSTEM CONFIG ─────────────────────────────────────────────────────
export const getPublicConfig = () => apiFetch(`${PUBLIC_BASE}/system/config`);
