/**
 * Event-based tracking system for ZivoHotels analytics.
 * In a real environment, this would push to Mixpanel, Amplitude, or Google Analytics.
 */
export const track = (eventName, properties = {}) => {
  if (import.meta.env.MODE !== 'production') {
    console.log(`[Analytics] Tracked Event: ${eventName}`, properties);
  }
  
  // Future integration point:
  // window.mixpanel.track(eventName, properties);
  // or
  // fetch('/api/v1/analytics/track', { method: 'POST', body: JSON.stringify({ eventName, properties }) });
};
