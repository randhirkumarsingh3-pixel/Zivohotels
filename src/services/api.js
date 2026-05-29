// Base URL is handled by Vite proxy for local development, but in production
// it can be overridden using the VITE_API_URL environment variable.
const API_URL = import.meta.env.VITE_API_URL || '/api/v1';
const ADMIN_BASE = `${API_URL}/admin`;
const PUBLIC_BASE = API_URL;

// Helper function to get auth headers
export const getAuthHeaders = () => {
  const token = localStorage.getItem('jwt_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

// Global Response Handler to catch 401s
const handleResponse = async (response) => {
  if (response.status === 401) {
    // For specific endpoints, we might want to bypass redirecting (like analytics)
    if (response.url && response.url.includes('/analytics')) {
      return response;
    }
    // Clear session and force reload to login page
    localStorage.removeItem('jwt_token');
    localStorage.removeItem('user_data');
    window.location.href = '/login?expired=true';
    throw new Error('Session expired. Please login again.');
  }
  return response;
};

// --- AUTHENTICATION API ---
export const loginUser = async (credentials) => {
  try {
    const response = await fetch(`${PUBLIC_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    }).then(handleResponse);
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Login failed');
    return data;
  } catch (error) {
    throw error;
  }
};

export const signupUser = async (userData) => {
  try {
    const response = await fetch(`${PUBLIC_BASE}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Signup failed');
    return data;
  } catch (error) {
    throw error;
  }
};

export const sendVerificationOtp = async (email) => {
  try {
    const response = await fetch(`${PUBLIC_BASE}/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, type: 'VERIFICATION' }),
    });
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to send OTP');
    return data;
  } catch (error) {
    throw error;
  }
};

export const verifyOtpApi = async (email, otp) => {
  try {
    const response = await fetch(`${PUBLIC_BASE}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp, type: 'VERIFICATION' }),
    });
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to verify OTP');
    return data;
  } catch (error) {
    throw error;
  }
};

// --- HOTELS API ---
export const getHotels = async (searchParams = {}, filters = {}) => {
  const params = new URLSearchParams();

  if (searchParams.destination) params.set('city', searchParams.destination);
  if (searchParams.checkIn)     params.set('checkIn', searchParams.checkIn);
  if (searchParams.checkOut)    params.set('checkOut', searchParams.checkOut);
  if (searchParams.guests)      params.set('guests', searchParams.guests);

  if (filters.priceMin)        params.set('minPrice',     filters.priceMin);
  if (filters.priceMax)        params.set('maxPrice',     filters.priceMax);
  if (filters.stars)           params.set('minRating',        filters.stars);
  if (filters.sortBy)          params.set('sort', filters.sortBy);
  if (filters.includeSoldOut !== undefined) params.set('includeSoldOut', filters.includeSoldOut);

  const hasSearchCriteria = searchParams.destination && searchParams.checkIn && searchParams.checkOut;
  const baseUrl = hasSearchCriteria ? `${PUBLIC_BASE}/hotels/search` : `${PUBLIC_BASE}/hotels`;

  const url = `${baseUrl}${params.toString() ? '?' + params.toString() : ''}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Network response was not ok');
    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error('Error fetching hotels:', error);
    throw error;
  }
};

export const getHotelById = async (id) => {
  try {
    const response = await fetch(`${PUBLIC_BASE}/hotels/${id}`);
    if (!response.ok) {
      if (response.status === 404) throw new Error('Hotel not found');
      throw new Error('Network response was not ok');
    }
    const data = await response.json();
    return data.data; 
  } catch (error) {
    console.error('Error fetching hotel details:', error);
    throw error;
  }
};

export const trackEvent = async (eventType, metadata = {}, hotelId = null, city = null, experiments = {}) => {
  try {
    let sessionId = localStorage.getItem('session_id');
    if (!sessionId) {
      sessionId = crypto.randomUUID ? crypto.randomUUID() : 'session-' + Date.now();
      localStorage.setItem('session_id', sessionId);
    }
    
    // Fire and forget, don't await response in UI components
    fetch(`${PUBLIC_BASE}/analytics`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'x-session-id': sessionId },
      body: JSON.stringify({ eventType, metadata, hotelId, city, experiments })
    }).catch(console.error); // Silently catch network errors
  } catch (err) {
    console.error('Failed to track event:', err);
  }
};

export const getRecommendations = async (city = null) => {
  try {
    const url = city ? `${PUBLIC_BASE}/recommendations?city=${encodeURIComponent(city)}` : `${PUBLIC_BASE}/recommendations`;
    const response = await fetch(url, { headers: getAuthHeaders() });
    if (!response.ok) return null;
    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    return null;
  }
};

export const getExperiments = async () => {
  try {
    let sessionId = localStorage.getItem('session_id');
    if (!sessionId) {
      sessionId = crypto.randomUUID ? crypto.randomUUID() : 'session-' + Date.now();
      localStorage.setItem('session_id', sessionId);
    }
    
    const response = await fetch(`${PUBLIC_BASE}/experiments`, { 
      headers: { ...getAuthHeaders(), 'x-session-id': sessionId } 
    });
    
    if (!response.ok) return null;
    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error('Error fetching experiments:', error);
    return null;
  }
};

// --- ADMIN APIs ---
export const getAdminHotels = async () => {
  try {
    const response = await fetch(`${ADMIN_BASE}/hotels`, { headers: getAuthHeaders() }).then(handleResponse);
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to fetch hotels');
    return data.data;
  } catch (error) {
    throw error;
  }
};

export const getAdminAnalytics = async (days = 30) => {
  try {
    const [kRes, rRes] = await Promise.all([
      fetch(`${ADMIN_BASE}/analytics/kpis`, { headers: getAuthHeaders() }),
      fetch(`${ADMIN_BASE}/analytics/revenue?days=${days}`, { headers: getAuthHeaders() })
    ]);
    const kData = await kRes.json();
    const rData = await rRes.json();
    return { kpis: kData.data, revenue: rData.data };
  } catch (error) {
    throw error;
  }
};

// --- BOOKINGS API ---
export const createBooking = async (bookingData) => {
  try {
    const response = await fetch(`${PUBLIC_BASE}/bookings`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(bookingData),
    });
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Network response was not ok');
    return data;
  } catch (error) {
    console.error('Error creating booking:', error);
    throw error;
  }
};

export const previewBookingApi = async (bookingData) => {
  try {
    const response = await fetch(`${PUBLIC_BASE}/bookings/preview`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(bookingData),
    });
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Network response was not ok');
    return data;
  } catch (error) {
    console.error('Error previewing booking:', error);
    throw error;
  }
};

export const cancelBooking = async (bookingId) => {
  try {
    const response = await fetch(`${PUBLIC_BASE}/bookings/${bookingId}/fail`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Network response was not ok');
    return data;
  } catch (error) {
    console.error('Error failing booking:', error);
    throw error;
  }
};

export const getAdminBookings = async (params = {}) => {
  try {
    const qs = new URLSearchParams(params).toString();
    const response = await fetch(`${ADMIN_BASE}/bookings?${qs}`, { headers: getAuthHeaders() }).then(handleResponse);
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to fetch bookings');
    return data;
  } catch (error) {
    throw error;
  }
};

// --- PAYMENTS API ---
export const createPaymentOrder = async (bookingId) => {
  try {
    const response = await fetch(`${PUBLIC_BASE}/payments/create-order`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ bookingId }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Network response was not ok');
    return data; 
  } catch (error) {
    console.error('Error creating payment order:', error);
    throw error;
  }
};

export const verifyPaymentApi = async (verificationData) => {
  try {
    const response = await fetch(`${PUBLIC_BASE}/payments/verify`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(verificationData),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Network response was not ok');
    return data; 
  } catch (error) {
    console.error('Error verifying payment:', error);
    throw error;
  }
};

// --- SYSTEM ADMINISTRATION API ---
export const getSystemStats = async () => {
  const res = await fetch(`${ADMIN_BASE}/system/stats`, { headers: getAuthHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to fetch system stats');
  return data.data;
};

export const getSecurityLogs = async (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${ADMIN_BASE}/system/security-logs?${qs}`, { headers: getAuthHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to fetch security logs');
  return data;
};

export const getIntegrityResult = async () => {
  const res = await fetch(`${ADMIN_BASE}/system/integrity`, { headers: getAuthHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to fetch integrity scan');
  return data.data;
};

export const triggerSystemAction = async (actionData) => {
  const res = await fetch(`${ADMIN_BASE}/system/actions`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(actionData),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Action failed');
  return data;
};

export const getSystemConfig = async () => {
  const res = await fetch(`${ADMIN_BASE}/system/config`, { headers: getAuthHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to fetch system config');
  return data.data;
};

export const updateSystemConfig = async (config) => {
  const res = await fetch(`${ADMIN_BASE}/system/config`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(config),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to update config');
  return data;
};
export const getTaxRules = async () => {
  const res = await fetch(`${ADMIN_BASE}/system/tax-rules`, { headers: getAuthHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to fetch tax rules');
  return data.data;
};

export const updateTaxRules = async (slabs) => {
  const res = await fetch(`${ADMIN_BASE}/system/tax-rules`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ slabs }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to update tax rules');
  return data;
};

export const getAdminAnalyticsKpis = async () => {
  const res = await fetch(`${ADMIN_BASE}/analytics/kpis`, { headers: getAuthHeaders() });
  const data = await res.json();
  return data;
};

export const getAdminAnalyticsRevenue = async (days) => {
  const res = await fetch(`${ADMIN_BASE}/analytics/revenue?days=${days}`, { headers: getAuthHeaders() });
  const data = await res.json();
  return data;
};

export const getAdminAnalyticsBookings = async (days) => {
  const res = await fetch(`${ADMIN_BASE}/analytics/bookings?days=${days}`, { headers: getAuthHeaders() });
  const data = await res.json();
  return data;
};

export const getAdminAnalyticsTopProperties = async (days) => {
  const res = await fetch(`${ADMIN_BASE}/analytics/top-properties?days=${days}`, { headers: getAuthHeaders() });
  const data = await res.json();
  return data;
};

export const getPublicConfig = async () => {
  const res = await fetch(`${PUBLIC_BASE}/system/config`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to fetch config');
  return data;
};
