/**
 * api.js
 * Centralized API service for ZivoPlus.
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
import { reportPasswordChangeRequired } from './authEvents';

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
// The login session travels in an HTTP-only cookie the browser sends by itself (same site), so
// no token is kept in the page or added here.
export const getAuthHeaders = () => ({ 'Content-Type': 'application/json' });

const getSessionId = () => {
  try {
    let sid = localStorage.getItem('session_id');
    if (!sid) {
      sid = crypto.randomUUID ? crypto.randomUUID() : `session-${Date.now()}`;
      localStorage.setItem('session_id', sid);
    }
    return sid;
  } catch {
    return 'anonymous';
  }
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

    // A 401 from a sign-in attempt is a wrong password / code, not an ended session
    const isSignIn = /\/auth\/(login|signup|google|logout)/.test(url);
    if (response.status === 401 && !url.includes('/analytics') && !isSignIn) {
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
      
      if ([502, 503, 504].includes(status) && retriesLeft > 0 && errorCode !== 'MAINTENANCE') { // maintenance: say so at once
        if (!isBackground) console.warn(`[API] ⚠️ RETRYING (${retriesLeft} left) in ${backoff}ms: ${url}`);
        await new Promise(r => setTimeout(r, backoff));
        return performNetworkRequest(url, options, retriesLeft - 1, backoff * 2, dedupeKey, requestId, isBackground);
      }
      
      if (errorCode === 'PASSWORD_CHANGE_REQUIRED') reportPasswordChangeRequired();
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
    // Anonymous visit id: joins searches, hotel views and bookings for Admin → Revenue per search
    'x-session-id': getSessionId(),
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
// Sign up (2 steps), sign in with a code, Google, mobile number, notifications
const post = (path, body) => apiFetch(`${PUBLIC_BASE}${path}`, { method: 'POST', body: JSON.stringify(body || {}) });
export const getAuthConfig = () => apiFetch(`${PUBLIC_BASE}/auth/config`).then((r) => r?.data || {});
export const signupStartApi = (details) => post('/auth/signup/start', details);
export const loginCodeSendApi = (identifier) => post('/auth/login/code', { identifier });
export const loginCodeVerifyApi = (identifier, code) => post('/auth/login/code/verify', { identifier, code });
export const googleSignInApi = (credential) => post('/auth/google', { credential });
/** Company sign-in: the work email decides the company and provider; returns { url } to go to. */
export const companySsoStartApi = (email, returnTo) => post('/auth/sso/start', { email, returnTo });
/** Company sign-in in setup mode: the test sign-in page proves the work email with a code. */
export const companySsoTestCodeApi = (state, email) => post('/auth/sso/test-idp/code', { state, email });
export const companySsoTestVerifyApi = (state, email, code, name) => post('/auth/sso/test-idp/verify', { state, email, code, name });
export const phoneCodeSendApi = (phone) => post('/auth/phone/code', { phone });
export const phoneVerifyApi = (phone, code) => post('/auth/phone/verify', { phone, code });
export const logoutAllApi = () => post('/auth/logout-all');
export const getMyNotifications = () => apiFetch(`${PUBLIC_BASE}/notifications?limit=30`, { cache: 'no-store' }).then((r) => r?.data || { items: [], unread: 0 });
export const markMyNotificationsRead = (ids) => apiFetch(`${PUBLIC_BASE}/notifications/read`, { method: 'PUT', body: JSON.stringify({ ids }) });
export const sendVerificationOtp = (email) => apiFetch(`${PUBLIC_BASE}/auth/send-otp`, { method: 'POST', body: JSON.stringify({ email, type: 'VERIFICATION' }) });
export const verifyOtpApi = (email, otp) => apiFetch(`${PUBLIC_BASE}/auth/verify-otp`, { method: 'POST', body: JSON.stringify({ email, otp, type: 'VERIFICATION' }) });
export const acceptInvite = (token, password) => apiFetch(`${PUBLIC_BASE}/users/accept-invite`, { method: 'POST', body: JSON.stringify({ token, password }) });

// ─── HOTELS & DESTINATIONS ───────────────────────────────────────────────────
export const getPopularDestinations = (options = {}) => apiFetch(`${PUBLIC_BASE}/public/search/popular`, options).then(res => res?.data);
export const searchDestinations = (query, options = {}) => apiFetch(`${PUBLIC_BASE}/public/search?q=${encodeURIComponent(query)}`, options).then(res => res?.data);
// Home page: cities with live counts, top-rated hotels, live offers, reviews, sign-up and membership
export const getHomeFeed = () => apiFetch(`${PUBLIC_BASE}/public/home`).then(res => res?.data);
// What signing in / a new account saves on a hotel (sign-in price, first-booking offer)
/** ZivoPlus's service fee, when on ({ type, value, maxAmount, gstPct }), else null. */
export const getServiceFeeInfo = () => apiFetch(`${PUBLIC_BASE}/public/service-fee`).then(res => res?.data || null);
export const getGuestOffers = (hotelId) => apiFetch(`${PUBLIC_BASE}/public/guest-offers${hotelId ? `?hotelId=${encodeURIComponent(hotelId)}` : ''}`).then(res => res?.data || null);
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
  // Rooms and their guests: results only list hotels that can take the whole group
  if (searchParams.occupancy?.length) params.set('occ', searchParams.occupancy.map((r) => `${r.adults}-${r.children || 0}`).join(','));
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
/** Hourly stays: hotels free for a slot, and one hotel's hourly offer on a date */
export const searchHourlyHotels = (h) => apiFetch(`${PUBLIC_BASE}/hotels/search/hourly?${new URLSearchParams({ city: h.city || '', date: h.date, start: h.start, hours: String(h.hours), guests: String(h.guests) })}`, { cache: 'no-store' }).then((r) => r?.data || { hotels: [] });
export const getHotelHourly = (id, date, hours) => apiFetch(`${PUBLIC_BASE}/hotels/${id}/hourly?date=${date}&hours=${hours}`, { cache: 'no-store' }).then((r) => r?.data);
export const previewHourlyApi = (body) => apiFetch(`${PUBLIC_BASE}/bookings/hourly/preview`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r?.data);
export const bookHourlyApi = (body) => apiFetch(`${PUBLIC_BASE}/bookings/hourly`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r?.data);
export const getHotelById = (id, stay = {}) => {
  const q = stay.checkIn && stay.checkOut ? `?${new URLSearchParams({ checkin: stay.checkIn, checkout: stay.checkOut })}` : '';
  return apiFetch(`${PUBLIC_BASE}/hotels/${id}${q}`).then(res => res?.data);
};
// What's nearby (onboarding Location step)
export const suggestNearbyPlaces = (lat, lng) => apiFetch(`${PUBLIC_BASE}/hotels/nearby/suggest`, { method: 'POST', body: JSON.stringify({ lat, lng }) }).then(res => res?.data || []);
export const lookupNearbyPlace = (q, lat, lng) => apiFetch(`${PUBLIC_BASE}/hotels/nearby/lookup`, { method: 'POST', body: JSON.stringify({ q, lat, lng }) }).then(res => res?.data || []);
export const getHotelAmenities = (id) => apiFetch(`${PUBLIC_BASE}/hotels/${id}/amenities`).then(res => res?.data);
export const getHotelImages = (id) => apiFetch(`${PUBLIC_BASE}/hotels/${id}/images`).then(res => res?.data);

// ─── SAVED HOTELS (and price-drop alerts) ───────────────────────────────────
export const savedHotelsApi = {
  list: () => apiFetch(`${PUBLIC_BASE}/saved-hotels`, { cache: 'no-store' }, 0).then((r) => r?.data || []),
  ids: () => apiFetch(`${PUBLIC_BASE}/saved-hotels/ids`, { cache: 'no-store' }, 0).then((r) => r?.data || []),
  save: (body) => apiFetch(`${PUBLIC_BASE}/saved-hotels`, jsonBody('POST', body), 0).then((r) => r?.data),
  alerts: (hotelId, alerts) => apiFetch(`${PUBLIC_BASE}/saved-hotels/${hotelId}`, jsonBody('PATCH', { alerts }), 0).then((r) => r?.data),
  remove: (hotelId) => apiFetch(`${PUBLIC_BASE}/saved-hotels/${hotelId}`, { method: 'DELETE' }, 0),
};

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
// A credit or debit note against the invoice (cancellations, refunds, hours added)
// The GST invoice the property uploaded for a business (GSTIN) booking
export const downloadHotelInvoice = (bookingId) => apiFetch(`${PUBLIC_BASE}/invoices/hotel/${bookingId}/download`, { responseType: 'blob' });
export const downloadGuestNote = (noteId) => apiFetch(`${PUBLIC_BASE}/invoices/notes/${noteId}/download`, { responseType: 'blob' });
// Booking voucher PDF: type 'guest' (booking confirmation) or 'hotelier' (owner/admin only)
export const downloadVoucher = (bookingId, type = 'guest') => apiFetch(`${PUBLIC_BASE}/bookings/${bookingId}/voucher?type=${type}`, { responseType: 'blob' }, 0);
// The signed-in user's profile (name, email, phone)
export const getMyProfile = () => apiFetch(`${PUBLIC_BASE}/auth/me`, {}, 0).then(res => res?.data?.user);

// ─── PAYMENTS ─────────────────────────────────────────────────────────────────
export const createPaymentOrder = (bookingId) => apiFetch(`${PUBLIC_BASE}/payments/create-order`, { method: 'POST', body: JSON.stringify({ bookingId }) });
export const verifyPaymentApi = (verificationData) => apiFetch(`${PUBLIC_BASE}/payments/verify`, { method: 'POST', body: JSON.stringify(verificationData) });
/** Extra hours on a booked hourly stay: options, a payment order for the difference, confirm */
export const getExtensionOptionsApi = (bookingId) => apiFetch(`${PUBLIC_BASE}/bookings/${bookingId}/hourly/extend`, { cache: 'no-store' }).then((r) => r?.data);
export const createExtensionApi = (bookingId, hours) => apiFetch(`${PUBLIC_BASE}/bookings/${bookingId}/hourly/extend`, { method: 'POST', body: JSON.stringify({ hours }) }).then((r) => r?.data);
export const verifyExtensionApi = (bookingId, response) => apiFetch(`${PUBLIC_BASE}/bookings/${bookingId}/hourly/extend/verify`, { method: 'POST', body: JSON.stringify(response) }).then((r) => r?.data);

// ─── STAFF & ROLES (admin console) ──────────────────────────────────────────────
const STAFF = () => `${PUBLIC_BASE}/admin/staff`;
const jsonBody = (method, body) => ({ method, body: JSON.stringify(body || {}) });
/** ZivoPlus staff: the same shape as the extranet team API (services/extranetApi.js teamApi) */
export const adminTeamApi = {
  get: () => apiFetch(STAFF(), { cache: 'no-store' }, 0).then((r) => r?.data),
  invite: (body) => apiFetch(`${STAFF()}/invite`, jsonBody('POST', body), 0).then((r) => r?.data),
  update: (id, body) => apiFetch(`${STAFF()}/${id}`, jsonBody('PATCH', body), 0).then((r) => r?.data),
  remove: (id) => apiFetch(`${STAFF()}/${id}`, { method: 'DELETE' }, 0).then((r) => r?.data),
  resend: (id) => apiFetch(`${STAFF()}/${id}/resend`, { method: 'POST' }, 0).then((r) => r?.data),
  saveRole: (role) => apiFetch(role.id ? `${STAFF()}/roles/${role.id}` : `${STAFF()}/roles`, jsonBody(role.id ? 'PUT' : 'POST', role), 0).then((r) => r?.data),
  deleteRole: (id) => apiFetch(`${STAFF()}/roles/${id}`, { method: 'DELETE' }, 0).then((r) => r?.data),
};

// ─── SEO (admin console) ─────────────────────────────────────────────────────
const SEO = () => `${PUBLIC_BASE}/admin/seo`;
export const adminSeoApi = {
  get: () => apiFetch(SEO(), { cache: 'no-store' }, 0).then((r) => r?.data),
  save: (body) => apiFetch(SEO(), jsonBody('PUT', body), 0).then((r) => r?.data),
  hotels: (q = '') => apiFetch(`${SEO()}/hotels?q=${encodeURIComponent(q)}`, { cache: 'no-store' }, 0).then((r) => r?.data || []),
  saveHotel: (id, body) => apiFetch(`${SEO()}/hotels/${id}`, jsonBody('PUT', body), 0).then((r) => r?.data),
  preview: (path) => apiFetch(`${SEO()}/preview?path=${encodeURIComponent(path)}`, { cache: 'no-store' }, 0).then((r) => r?.data),
};

// ─── GOOGLE HOTELS (admin console) ──────────────────────────────────────────
const GH = () => `${PUBLIC_BASE}/admin/google`;
export const adminGoogleApi = {
  get: () => apiFetch(GH(), { cache: 'no-store' }, 0).then((r) => r?.data),
  save: (body) => apiFetch(GH(), jsonBody('PUT', body), 0).then((r) => r?.data),
  setHotel: (id, excluded) => apiFetch(`${GH()}/hotels/${id}`, jsonBody('PUT', { excluded }), 0).then((r) => r?.data),
  sample: (id, checkin, nights) => apiFetch(`${GH()}/hotels/${id}/sample?checkin=${checkin || ''}&nights=${nights || 1}`, { cache: 'no-store' }, 0).then((r) => r?.data),
  accuracy: () => apiFetch(`${GH()}/accuracy`, { method: 'POST' }, 0).then((r) => r?.data),
};

// Admin → Reports
const RP = () => `${ADMIN_BASE}/reports`;
const qs = (o) => new URLSearchParams(Object.entries(o || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined)).toString();
export const adminReportsApi = {
  list: () => apiFetch(RP(), { cache: 'no-store' }, 0).then((r) => r?.data),
  run: (key, filters) => apiFetch(`${RP()}/${key}?${qs(filters)}`, { cache: 'no-store' }, 0).then((r) => r?.data),
  download: (key, filters, format) => apiFetch(`${RP()}/${key}?${qs({ ...filters, format })}`, { responseType: 'blob' }, 0),
};

// Admin → Content Scores: every property's listing completeness, and one property's detail
export const adminContentApi = {
  list: (filters = {}) => apiFetch(`${ADMIN_BASE}/content-scores?${qs(filters)}`, { cache: 'no-store' }, 0).then((r) => r?.data),
  detail: (hotelId) => apiFetch(`${ADMIN_BASE}/content-scores/${encodeURIComponent(hotelId)}`, { cache: 'no-store' }, 0).then((r) => r?.data),
};

// Admin → Documents & emails (guest invoice issuer, voucher notes, attachments) and the setup checklist
export const adminDocumentsApi = {
  get: () => apiFetch(`${ADMIN_BASE}/documents`, { cache: 'no-store' }, 0).then((r) => r?.data),
  save: (body) => apiFetch(`${ADMIN_BASE}/documents`, jsonBody('PUT', body), 0).then((r) => r?.data),
  preview: (kind) => apiFetch(`${ADMIN_BASE}/documents/preview/${encodeURIComponent(kind)}`, { responseType: 'blob' }, 0),
  setup: () => apiFetch(`${ADMIN_BASE}/setup`, { cache: 'no-store' }, 0).then((r) => r?.data),
};

// Onboarding checks (Finance step): PAN, GSTIN, IFSC, payout account (backend/routes/verificationRoutes.js)
export const verificationApi = {
  pan: (pan, incorporationType) => apiFetch(`${API_URL}/verification/pan`, jsonBody('POST', { pan, incorporationType }), 0).then((r) => r?.data),
  gstin: (gstin, pan, state) => apiFetch(`${API_URL}/verification/gstin`, jsonBody('POST', { gstin, pan, state }), 0).then((r) => r?.data),
  ifsc: (code) => apiFetch(`${API_URL}/verification/ifsc/${encodeURIComponent(code)}`, { cache: 'no-store' }, 0).then((r) => r?.data),
  checkAccount: (body) => apiFetch(`${API_URL}/verification/bank-account`, jsonBody('POST', body), 0).then((r) => r?.data),
  accountStatus: (hotelId) => apiFetch(`${API_URL}/verification/bank-account/${hotelId}`, { cache: 'no-store' }, 0).then((r) => r?.data),
  decideAccount: (hotelId, body) => apiFetch(`${API_URL}/verification/bank-account/${hotelId}/decision`, jsonBody('POST', body), 0).then((r) => r?.data),
};

// Listing agreements: owner reads and signs (Extranet); staff prepare, send, record (Admin)
export const agreementApi = {
  view: (hotelId) => apiFetch(`${API_URL}/extranet/agreement/${hotelId}`, { cache: 'no-store' }, 0).then((r) => r?.data),
  sendCode: (hotelId) => apiFetch(`${API_URL}/extranet/agreement/${hotelId}/code`, jsonBody('POST', {}), 0).then((r) => r?.data),
  sign: (hotelId, body) => apiFetch(`${API_URL}/extranet/agreement/${hotelId}/sign`, jsonBody('POST', body), 0).then((r) => r?.data),
  pdf: (hotelId) => apiFetch(`${API_URL}/extranet/agreement/${hotelId}/pdf`, { responseType: 'blob' }, 0),
  list: (q = {}) => apiFetch(`${ADMIN_BASE}/agreements?${qs(q)}`, { cache: 'no-store' }, 0).then((r) => r),
  preview: (hotelId, body) => apiFetch(`${ADMIN_BASE}/agreements/${hotelId}/preview`, jsonBody('POST', body), 0).then((r) => r?.data),
  prepare: (hotelId, body) => apiFetch(`${ADMIN_BASE}/agreements/${hotelId}/prepare`, jsonBody('POST', body), 0).then((r) => r?.data),
  markSigned: (hotelId, note) => apiFetch(`${ADMIN_BASE}/agreements/${hotelId}/mark-signed`, jsonBody('POST', { note }), 0).then((r) => r?.data),
  cancel: (id) => apiFetch(`${ADMIN_BASE}/agreements/${id}`, { method: 'DELETE' }, 0),
  adminPdf: (hotelId) => apiFetch(`${ADMIN_BASE}/agreements/${hotelId}/pdf`, { responseType: 'blob' }, 0),
  template: (kind = 'HOTEL') => apiFetch(`${ADMIN_BASE}/agreement-template?kind=${kind}`, { cache: 'no-store' }, 0).then((r) => r?.data),
  saveTemplate: (body, kind = 'HOTEL') => apiFetch(`${ADMIN_BASE}/agreement-template?kind=${kind}`, jsonBody('PUT', body), 0).then((r) => r?.data),
  // Aadhaar eSign through Leegality
  startAadhaar: (hotelId, body) => apiFetch(`${API_URL}/extranet/agreement/${hotelId}/aadhaar`, jsonBody('POST', body), 0).then((r) => r?.data),
  auditTrail: (hotelId) => apiFetch(`${API_URL}/extranet/agreement/${hotelId}/audit-trail`, { responseType: 'blob' }, 0),
  adminAuditTrail: (hotelId) => apiFetch(`${ADMIN_BASE}/agreements/${hotelId}/audit-trail`, { responseType: 'blob' }, 0),
  refresh: (hotelId) => apiFetch(`${ADMIN_BASE}/agreements/${hotelId}/refresh`, jsonBody('POST', {}), 0).then((r) => r?.data),
  signing: () => apiFetch(`${ADMIN_BASE}/agreement-template/signing`, { cache: 'no-store' }, 0).then((r) => r?.data),
  saveSigning: (body) => apiFetch(`${ADMIN_BASE}/agreement-template/signing`, jsonBody('PUT', body), 0).then((r) => r?.data),
};

// ZivoPlus for Business and ZivoPlus Partner Hub (backend/routes/businessRoutes.js,
// adminOrganisationRoutes.js, hotelBusinessRateRoutes.js)
export const businessApi = {
  info: () => apiFetch(`${API_URL}/business/info`, { cache: 'no-store' }, 0).then((r) => r?.data),
  mine: () => apiFetch(`${API_URL}/business/mine`, { cache: 'no-store' }, 0).then((r) => r?.data || []),
  apply: (body) => apiFetch(`${API_URL}/business/apply`, jsonBody('POST', body), 0).then((r) => r?.data),
  get: (orgId) => apiFetch(`${API_URL}/business/${orgId}`, { cache: 'no-store' }, 0).then((r) => r?.data),
  update: (orgId, body) => apiFetch(`${API_URL}/business/${orgId}`, jsonBody('PUT', body), 0).then((r) => r?.data),
  addDocument: (orgId, body) => apiFetch(`${API_URL}/business/${orgId}/documents`, jsonBody('POST', body), 0).then((r) => r?.data),
  removeDocument: (orgId, docId) => apiFetch(`${API_URL}/business/${orgId}/documents/${docId}`, { method: 'DELETE' }, 0),
  documentFile: (orgId, docId) => apiFetch(`${API_URL}/business/${orgId}/documents/${docId}/file`, { responseType: 'blob' }, 0),
  members: (orgId) => apiFetch(`${API_URL}/business/${orgId}/members`, { cache: 'no-store' }, 0).then((r) => r?.data || []),
  invite: (orgId, body) => apiFetch(`${API_URL}/business/${orgId}/members`, jsonBody('POST', body), 0).then((r) => r?.data),
  updateMember: (orgId, id, body) => apiFetch(`${API_URL}/business/${orgId}/members/${id}`, jsonBody('PATCH', body), 0).then((r) => r?.data),
  removeMember: (orgId, id) => apiFetch(`${API_URL}/business/${orgId}/members/${id}`, { method: 'DELETE' }, 0),
  account: (orgId, page = 1) => apiFetch(`${API_URL}/business/${orgId}/account?page=${page}`, { cache: 'no-store' }, 0).then((r) => r?.data),
  startTopup: (orgId, amount) => apiFetch(`${API_URL}/business/${orgId}/topup`, jsonBody('POST', { amount }), 0).then((r) => r?.data),
  confirmTopup: (orgId, body) => apiFetch(`${API_URL}/business/${orgId}/topup/confirm`, jsonBody('POST', body), 0).then((r) => r?.data),
  branding: (orgId, body) => apiFetch(`${API_URL}/business/${orgId}/branding`, jsonBody('PUT', body), 0).then((r) => r?.data),
  rates: (orgId, hotelIds = '') => apiFetch(`${API_URL}/business/${orgId}/rates?hotelIds=${encodeURIComponent(hotelIds)}`, { cache: 'no-store' }, 0).then((r) => r?.data || []),
  quote: (orgId, body) => apiFetch(`${API_URL}/business/${orgId}/quote`, jsonBody('POST', body), 0).then((r) => r?.data),
  book: (orgId, body) => apiFetch(`${API_URL}/business/${orgId}/bookings`, jsonBody('POST', body), 0).then((r) => r?.data),
  bookings: (orgId, q = {}) => apiFetch(`${API_URL}/business/${orgId}/bookings?${new URLSearchParams(Object.entries(q).filter(([, v]) => v !== '' && v != null))}`, { cache: 'no-store' }, 0).then((r) => r?.data),
  booking: (orgId, id) => apiFetch(`${API_URL}/business/${orgId}/bookings/${id}`, { cache: 'no-store' }, 0).then((r) => r?.data),
  payBooking: (orgId, id) => apiFetch(`${API_URL}/business/${orgId}/bookings/${id}/pay`, jsonBody('POST', {}), 0).then((r) => r?.data),
  cancelBooking: (orgId, id) => apiFetch(`${API_URL}/business/${orgId}/bookings/${id}/cancel`, jsonBody('POST', {}), 0).then((r) => r?.data),
  voucher: (orgId, id, price = 'NONE') => apiFetch(`${API_URL}/business/${orgId}/bookings/${id}/voucher?price=${price}`, { responseType: 'blob' }, 0),
  trips: (orgId, q = {}) => apiFetch(`${API_URL}/business/${orgId}/trips?${new URLSearchParams(Object.entries(q).filter(([, v]) => v))}`, { cache: 'no-store' }, 0).then((r) => r?.data),
  requestTrip: (orgId, body) => apiFetch(`${API_URL}/business/${orgId}/trips`, jsonBody('POST', body), 0).then((r) => r?.data),
  declineTrip: (orgId, id, note) => apiFetch(`${API_URL}/business/${orgId}/trips/${id}/decline`, jsonBody('POST', { note }), 0).then((r) => r?.data),
  cancelTrip: (orgId, id) => apiFetch(`${API_URL}/business/${orgId}/trips/${id}/cancel`, jsonBody('POST', {}), 0).then((r) => r?.data),
  importMembers: (orgId, csv, commit) => apiFetch(`${API_URL}/business/${orgId}/members/import`, jsonBody('POST', { csv, commit }), 0).then((r) => r?.data),
  setDelegate: (orgId, memberId, body) => apiFetch(`${API_URL}/business/${orgId}/members/${memberId}/delegate`, jsonBody('PUT', body), 0).then((r) => r?.data),
  agreement: (orgId) => apiFetch(`${API_URL}/business/${orgId}/agreement`, { cache: 'no-store' }, 0).then((r) => r?.data),
  agreementCode: (orgId) => apiFetch(`${API_URL}/business/${orgId}/agreement/code`, jsonBody('POST', {}), 0).then((r) => r?.data),
  signAgreement: (orgId, body) => apiFetch(`${API_URL}/business/${orgId}/agreement/sign`, jsonBody('POST', body), 0).then((r) => r?.data),
  agreementAadhaar: (orgId, body) => apiFetch(`${API_URL}/business/${orgId}/agreement/aadhaar`, jsonBody('POST', body), 0).then((r) => r?.data),
  agreementPdf: (orgId, audit = false) => apiFetch(`${API_URL}/business/${orgId}/agreement/${audit ? 'audit-trail' : 'pdf'}`, { responseType: 'blob' }, 0),
  incentives: (orgId) => apiFetch(`${API_URL}/business/${orgId}/incentives`, { cache: 'no-store' }, 0).then((r) => r?.data),
  uploadLogo: (orgId, file) => apiFetch(`${API_URL}/business/${orgId}/branding/logo`, jsonBody('POST', { file }), 0).then((r) => r?.data),
  removeLogo: (orgId) => apiFetch(`${API_URL}/business/${orgId}/branding/logo`, { method: 'DELETE' }, 0).then((r) => r?.data),
  policy: (orgId) => apiFetch(`${API_URL}/business/${orgId}/policy`, { cache: 'no-store' }, 0).then((r) => r?.data),
  savePolicy: (orgId, body) => apiFetch(`${API_URL}/business/${orgId}/policy`, jsonBody('PUT', body), 0).then((r) => r?.data),
  approvals: (orgId) => apiFetch(`${API_URL}/business/${orgId}/approvals`, { cache: 'no-store' }, 0).then((r) => r?.data || []),
  decide: (orgId, id, body) => apiFetch(`${API_URL}/business/${orgId}/approvals/${id}`, jsonBody('POST', body), 0).then((r) => r?.data),
  spend: (orgId, q = {}) => apiFetch(`${API_URL}/business/${orgId}/reports/spend?${new URLSearchParams(Object.entries(q).filter(([, v]) => v))}`, { cache: 'no-store' }, 0).then((r) => r?.data),
  spendCsv: (orgId, q = {}) => apiFetch(`${API_URL}/business/${orgId}/reports/spend.csv?${new URLSearchParams(Object.entries(q).filter(([, v]) => v))}`, { responseType: 'blob' }, 0),
  travellers: (orgId, q = {}) => apiFetch(`${API_URL}/business/${orgId}/travellers?${new URLSearchParams(Object.entries(q).filter(([, v]) => v))}`, { cache: 'no-store' }, 0).then((r) => r?.data),
  travellersCsv: (orgId, q = {}) => apiFetch(`${API_URL}/business/${orgId}/travellers.csv?${new URLSearchParams(Object.entries(q).filter(([, v]) => v))}`, { responseType: 'blob' }, 0),
  groups: (orgId) => apiFetch(`${API_URL}/business/${orgId}/groups`, { cache: 'no-store' }, 0).then((r) => r?.data),
  groupHotels: (orgId, q) => apiFetch(`${API_URL}/business/${orgId}/groups/hotels?q=${encodeURIComponent(q || '')}`, { cache: 'no-store' }, 0).then((r) => r?.data || []),
  requestGroup: (orgId, body) => apiFetch(`${API_URL}/business/${orgId}/groups`, jsonBody('POST', body), 0).then((r) => r?.data),
  groupPrice: (orgId, id) => apiFetch(`${API_URL}/business/${orgId}/groups/${id}/price`, { cache: 'no-store' }, 0).then((r) => r?.data),
  acceptGroup: (orgId, id, body) => apiFetch(`${API_URL}/business/${orgId}/groups/${id}/accept`, jsonBody('POST', body), 0).then((r) => r?.data),
  cancelGroup: (orgId, id) => apiFetch(`${API_URL}/business/${orgId}/groups/${id}/cancel`, jsonBody('POST', {}), 0).then((r) => r?.data),
  roomingList: (orgId, bookingId) => apiFetch(`${API_URL}/business/${orgId}/bookings/${bookingId}/rooming-list`, { cache: 'no-store' }, 0).then((r) => r?.data),
  saveRoomingList: (orgId, bookingId, rooms) => apiFetch(`${API_URL}/business/${orgId}/bookings/${bookingId}/rooming-list`, jsonBody('PUT', { rooms }), 0).then((r) => r?.data),
  agreedRates: (orgId) => apiFetch(`${API_URL}/business/${orgId}/agreed-rates`, { cache: 'no-store' }, 0).then((r) => r?.data || []),
  // Company sign-in (single sign-on); shown only once the server reports it (info().sso.available)
  sso: (orgId) => apiFetch(`${API_URL}/business/${orgId}/sso`, { cache: 'no-store' }, 0).then((r) => r?.data),
  saveSso: (orgId, body) => apiFetch(`${API_URL}/business/${orgId}/sso`, jsonBody('PUT', body), 0).then((r) => r?.data),
  addSsoDomain: (orgId, domain) => apiFetch(`${API_URL}/business/${orgId}/sso/domains`, jsonBody('POST', { domain }), 0).then((r) => r?.data),
  verifySsoDomain: (orgId, id) => apiFetch(`${API_URL}/business/${orgId}/sso/domains/${id}/verify`, jsonBody('POST', {}), 0).then((r) => r?.data),
  removeSsoDomain: (orgId, id) => apiFetch(`${API_URL}/business/${orgId}/sso/domains/${id}`, { method: 'DELETE' }, 0),
  testSso: (orgId) => apiFetch(`${API_URL}/business/${orgId}/sso/test`, jsonBody('POST', {}), 0).then((r) => r?.data),
  commission: (orgId, q = {}) => apiFetch(`${API_URL}/business/${orgId}/commission?${new URLSearchParams(Object.entries(q).filter(([, v]) => v))}`, { cache: 'no-store' }, 0).then((r) => r?.data),
};
export const adminBusinessApi = {
  list: (q = {}) => apiFetch(`${ADMIN_BASE}/organisations?${qs(q)}`, { cache: 'no-store' }, 0).then((r) => r?.data),
  get: (id) => apiFetch(`${ADMIN_BASE}/organisations/${id}`, { cache: 'no-store' }, 0).then((r) => r?.data),
  decide: (id, body) => apiFetch(`${ADMIN_BASE}/organisations/${id}/decision`, jsonBody('POST', body), 0).then((r) => r?.data),
  terms: (id, body) => apiFetch(`${ADMIN_BASE}/organisations/${id}/terms`, jsonBody('PUT', body), 0).then((r) => r?.data),
  entry: (id, body) => apiFetch(`${ADMIN_BASE}/organisations/${id}/ledger`, jsonBody('POST', body), 0).then((r) => r?.data),
  documentFile: (id, docId) => apiFetch(`${ADMIN_BASE}/organisations/${id}/documents/${docId}/file`, { responseType: 'blob' }, 0),
  settings: () => apiFetch(`${ADMIN_BASE}/business-settings`, { cache: 'no-store' }, 0).then((r) => r?.data),
  runIncentives: (month) => apiFetch(`${ADMIN_BASE}/business-settings/incentives/run`, jsonBody('POST', { month }), 0).then((r) => r?.data),
  prepareAgreement: (id) => apiFetch(`${ADMIN_BASE}/organisations/${id}/agreement`, jsonBody('POST', {}), 0).then((r) => r?.data),
  refreshAgreement: (id) => apiFetch(`${ADMIN_BASE}/organisations/${id}/agreement/refresh`, jsonBody('POST', {}), 0).then((r) => r?.data),
  agreementPdf: (id, audit = false) => apiFetch(`${ADMIN_BASE}/organisations/${id}/agreement/pdf${audit ? '?audit=1' : ''}`, { responseType: 'blob' }, 0),
  saveSettings: (body) => apiFetch(`${ADMIN_BASE}/business-settings`, jsonBody('PUT', body), 0).then((r) => r?.data),
  // Rates agreed between a company and hotels (the hotel accepts them in the extranet)
  rates: (id) => apiFetch(`${ADMIN_BASE}/organisations/${id}/rates`, { cache: 'no-store' }, 0).then((r) => r?.data || []),
  rateHotels: (id, q) => apiFetch(`${ADMIN_BASE}/organisations/${id}/rates/hotels?q=${encodeURIComponent(q || '')}`, { cache: 'no-store' }, 0).then((r) => r?.data || []),
  proposeRate: (id, body) => apiFetch(`${ADMIN_BASE}/organisations/${id}/rates`, jsonBody('POST', body), 0).then((r) => r?.data),
  endRate: (id, rateId, note) => apiFetch(`${ADMIN_BASE}/organisations/${id}/rates/${rateId}/end`, jsonBody('POST', { note }), 0).then((r) => r?.data),
};
// Extranet → GST invoices: the property's invoices for business (GSTIN) bookings
export const hotelGstInvoicesApi = {
  list: (hotelId, status = '') => apiFetch(`${API_URL}/extranet/gst-invoices/${hotelId}${status ? `?status=${status}` : ''}`, { cache: 'no-store' }, 0).then((r) => r?.data),
  upload: (hotelId, bookingId, body) => apiFetch(`${API_URL}/extranet/gst-invoices/${hotelId}/${bookingId}`, jsonBody('POST', body), 0).then((r) => r?.data),
  file: (hotelId, bookingId) => apiFetch(`${API_URL}/extranet/gst-invoices/${hotelId}/${bookingId}/file`, { responseType: 'blob' }, 0),
};
export const hotelBusinessRatesApi = {
  get: (hotelId) => apiFetch(`${API_URL}/extranet/business-rates/${hotelId}`, { cache: 'no-store' }, 0).then((r) => r?.data),
  save: (hotelId, body) => apiFetch(`${API_URL}/extranet/business-rates/${hotelId}`, jsonBody('PUT', body), 0).then((r) => r?.data),
  contracts: (hotelId) => apiFetch(`${API_URL}/extranet/business-rates/${hotelId}/contracts`, { cache: 'no-store' }, 0).then((r) => r?.data || []),
  groups: (hotelId) => apiFetch(`${API_URL}/extranet/business-rates/${hotelId}/groups`, { cache: 'no-store' }, 0).then((r) => r?.data || []),
  quoteGroup: (hotelId, id, body) => apiFetch(`${API_URL}/extranet/business-rates/${hotelId}/groups/${id}/quote`, jsonBody('POST', body), 0).then((r) => r?.data),
  declineGroup: (hotelId, id, note) => apiFetch(`${API_URL}/extranet/business-rates/${hotelId}/groups/${id}/decline`, jsonBody('POST', { note }), 0).then((r) => r?.data),
  decideContract: (hotelId, rateId, decision, note) => apiFetch(`${API_URL}/extranet/business-rates/${hotelId}/contracts/${rateId}/decision`, jsonBody('POST', { decision, note }), 0).then((r) => r?.data),
};

// Admin operations: System control, System health, Demand forecasting, Revenue per search,
// Experiments, Fraud & risk (backend/routes/adminOpsRoutes.js)
const noStore = { cache: 'no-store' };
export const adminOpsApi = {
  control: () => apiFetch(`${ADMIN_BASE}/control`, noStore, 0).then((r) => r?.data),
  setSwitch: (key, body) => apiFetch(`${ADMIN_BASE}/control/${encodeURIComponent(key)}`, jsonBody('PUT', body), 0).then((r) => r?.data),
  health: () => apiFetch(`${ADMIN_BASE}/health`, noStore, 0).then((r) => r?.data),
  forecast: (f) => apiFetch(`${ADMIN_BASE}/insights/forecast?${qs(f)}`, noStore, 0).then((r) => r?.data),
  searchRevenue: (f) => apiFetch(`${ADMIN_BASE}/insights/search-revenue?${qs(f)}`, noStore, 0).then((r) => r?.data),
  experiments: () => apiFetch(`${ADMIN_BASE}/experiments`, noStore, 0).then((r) => r?.data),
  createExperiment: (body) => apiFetch(`${ADMIN_BASE}/experiments`, jsonBody('POST', body), 0).then((r) => r?.data),
  updateExperiment: (id, body) => apiFetch(`${ADMIN_BASE}/experiments/${id}`, jsonBody('PATCH', body), 0).then((r) => r?.data),
  deleteExperiment: (id) => apiFetch(`${ADMIN_BASE}/experiments/${id}`, { method: 'DELETE' }, 0).then((r) => r?.data),
  experimentResults: (id) => apiFetch(`${ADMIN_BASE}/experiments/${id}/results`, noStore, 0).then((r) => r?.data),
  risk: (f) => apiFetch(`${ADMIN_BASE}/risk?${qs(f)}`, noStore, 0).then((r) => r?.data),
  riskAccount: (id) => apiFetch(`${ADMIN_BASE}/risk/accounts/${id}`, noStore, 0).then((r) => r?.data),
  reviewAccount: (id, body) => apiFetch(`${ADMIN_BASE}/risk/accounts/${id}/review`, jsonBody('POST', body), 0).then((r) => r?.data),
  blockIp: (body) => apiFetch(`${ADMIN_BASE}/risk/ips`, jsonBody('POST', body), 0).then((r) => r?.data),
};

// Admin → Finance (ledger, payouts; recording a payout uses the wallet endpoint)
export const adminFinanceApi = {
  hotelInvoices: (q = {}) => apiFetch(`${ADMIN_BASE}/finance/hotel-invoices?${qs(q)}`, { cache: 'no-store' }, 0).then((r) => r?.data),
  serviceFee: () => apiFetch(`${ADMIN_BASE}/finance/service-fee`, { cache: 'no-store' }, 0).then((r) => r?.data),
  saveServiceFee: (body) => apiFetch(`${ADMIN_BASE}/finance/service-fee`, jsonBody('PUT', body), 0).then((r) => r?.data),
  remindHotelInvoice: (bookingId) => apiFetch(`${ADMIN_BASE}/finance/hotel-invoices/${bookingId}/remind`, jsonBody('POST', {}), 0).then((r) => r?.data),
  ledger: (filters) => apiFetch(`${ADMIN_BASE}/finance/ledger?${qs(filters)}`, { cache: 'no-store' }, 0).then((r) => r?.data),
  payouts: () => apiFetch(`${ADMIN_BASE}/finance/payouts`, { cache: 'no-store' }, 0).then((r) => r?.data),
  due: (hotelId) => apiFetch(`${ADMIN_BASE}/wallets/hotels/${hotelId}/payout`, { cache: 'no-store' }, 0).then((r) => r?.data),
  record: (hotelId, reference) => apiFetch(`${ADMIN_BASE}/wallets/hotels/${hotelId}/payout`, jsonBody('POST', { reference }), 0).then((r) => r?.data),
  settings: () => apiFetch(`${ADMIN_BASE}/finance/settings`, { cache: 'no-store' }, 0).then((r) => r?.data),
  saveSettings: (body) => apiFetch(`${ADMIN_BASE}/finance/settings`, jsonBody('PUT', body), 0).then((r) => r?.data),
  month: (period) => apiFetch(`${ADMIN_BASE}/finance/months/${period}`, { cache: 'no-store' }, 0).then((r) => r?.data),
  issue: (period, hotelId) => apiFetch(`${ADMIN_BASE}/finance/months/${period}/issue`, jsonBody('POST', hotelId ? { hotelId } : {}), 0).then((r) => r?.data),
  emailMonth: (period, hotelId) => apiFetch(`${ADMIN_BASE}/finance/months/${period}/email`, jsonBody('POST', hotelId ? { hotelId } : {}), 0).then((r) => r?.data),
  documents: (filters) => apiFetch(`${ADMIN_BASE}/finance/documents?${qs(filters)}`, { cache: 'no-store' }, 0).then((r) => r?.data),
  document: (id) => apiFetch(`${ADMIN_BASE}/finance/documents/${id}`, { cache: 'no-store' }, 0).then((r) => r?.data),
  creditNote: (id, settlementIds, reason) => apiFetch(`${ADMIN_BASE}/finance/documents/${id}/credit-note`, jsonBody('POST', { settlementIds, reason }), 0).then((r) => r?.data),
  file: (url) => apiFetch(`${ADMIN_BASE}/finance/${url}`, { responseType: 'blob' }, 0),
  property: (hotelId, fy) => apiFetch(`${ADMIN_BASE}/finance/properties/${hotelId}?${qs({ fy })}`, { cache: 'no-store' }, 0).then((r) => r?.data),
};

/** Saves a downloaded file (Blob) under a name. */
export const saveBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

// ─── ADMIN ────────────────────────────────────────────────────────────────────
export const getAdminHotels = async () => apiFetch(`${ADMIN_BASE}/hotels`).then(res => res?.data);
export const getAdminBookings = async (params = {}) => apiFetch(`${ADMIN_BASE}/bookings?${new URLSearchParams(params).toString()}`);
export const getSystemStats = async () => apiFetch(`${ADMIN_BASE}/system/stats`).then(res => res?.data);
export const getSecurityLogs = async (params = {}) => apiFetch(`${ADMIN_BASE}/system/security-logs?${new URLSearchParams(params).toString()}`);
export const getIntegrityResult = async () => apiFetch(`${ADMIN_BASE}/system/integrity`).then(res => res?.data);
export const triggerSystemAction = (actionData) => apiFetch(`${ADMIN_BASE}/system/actions`, { method: 'POST', body: JSON.stringify(actionData) });
export const getAdminHourly = () => apiFetch(`${ADMIN_BASE}/hourly`, { cache: 'no-store' }).then((r) => r?.data);
export const saveAdminHourlySettings = (data) => apiFetch(`${ADMIN_BASE}/hourly/settings`, { method: 'PUT', body: JSON.stringify(data) });
export const approveHotelHourly = (hotelId, approved) => apiFetch(`${ADMIN_BASE}/hourly/hotels/${hotelId}`, { method: 'PUT', body: JSON.stringify({ approved }) });
export const getDeliveryStatus = () => apiFetch(`${ADMIN_BASE}/delivery`).then((r) => r?.data);
export const retryFailedEmails = () => apiFetch(`${ADMIN_BASE}/delivery/retry-failed`, { method: 'POST', body: '{}' });
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

// Requests to the hotel (late arrival, early check-in, airport pickup…) for a booking
export const getStayRequests = (bookingId) => apiFetch(`${PUBLIC_BASE}/bookings/${bookingId}/requests`).then(res => res?.data || []);
export const createStayRequest = (bookingId, body) => apiFetch(`${PUBLIC_BASE}/bookings/${bookingId}/requests`, { method: 'POST', body: JSON.stringify(body) }).then(res => res?.data);
export const cancelStayRequest = (bookingId, requestId) => apiFetch(`${PUBLIC_BASE}/bookings/${bookingId}/requests/${requestId}/cancel`, { method: 'POST' }).then(res => res?.data);

// Change dates (same rooms, today's rates; the hotel approves)
const DC = (bookingId) => `${PUBLIC_BASE}/bookings/${bookingId}/date-change`;
export const getDateChangeApi = (bookingId) => apiFetch(DC(bookingId), { cache: 'no-store' }).then((r) => r?.data);
export const quoteDateChangeApi = (bookingId, body) => apiFetch(`${DC(bookingId)}/quote`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r?.data);
export const requestDateChangeApi = (bookingId, body) => apiFetch(DC(bookingId), { method: 'POST', body: JSON.stringify(body) }).then((r) => r?.data);
export const withdrawDateChangeApi = (bookingId, requestId) => apiFetch(`${DC(bookingId)}/${requestId}/withdraw`, { method: 'POST' }).then((r) => r?.data);
export const payDateChangeApi = (bookingId, requestId) => apiFetch(`${DC(bookingId)}/${requestId}/pay`, { method: 'POST' }).then((r) => r?.data);
export const verifyDateChangeApi = (bookingId, requestId, response) => apiFetch(`${DC(bookingId)}/${requestId}/verify`, { method: 'POST', body: JSON.stringify(response) }).then((r) => r?.data);

// Cancel one room of a booking with several rooms (the rest of the booking stays)
export const getRoomCancelPreview = (bookingId, roomNumber) => apiFetch(`${PUBLIC_BASE}/bookings/${bookingId}/rooms/${roomNumber}/cancel-preview`).then(res => res?.data);
export const cancelBookingRoomApi = (bookingId, roomNumber, refundTo = 'SOURCE') => apiFetch(`${PUBLIC_BASE}/bookings/${bookingId}/rooms/${roomNumber}/cancel`, { method: 'POST', body: JSON.stringify({ refundTo }) });
