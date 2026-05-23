/**
 * usePriceClamp — Frontend Price Shock Limiter
 * 
 * Prevents users from seeing jarring price jumps within the same session.
 * Uses sessionStorage to persist the last-seen price per (hotelId, roomTypeId, date).
 * 
 * Clamp rules:
 *   - Max delta: ±8% from last-seen price within the same session
 *   - On first view: no clamp (establishes baseline)
 * 
 * Usage:
 *   const { getClampedPrice, recordSeenPrice } = usePriceClamp();
 * 
 *   const displayPrice = getClampedPrice(hotelId, roomTypeId, date, serverPrice);
 *   // Call recordSeenPrice after rendering to update baseline
 */
import { useCallback } from 'react';

const MAX_DELTA = 0.08; // 8%

function buildKey(hotelId, roomTypeId, date) {
  return `priceAnchor:${hotelId}:${roomTypeId}:${date}`;
}

export function usePriceClamp() {

  /**
   * Returns the display-safe price, clamped within ±8% of what the user last saw.
   * If no previous price exists, returns the serverPrice as-is (first view).
   */
  const getClampedPrice = useCallback((hotelId, roomTypeId, date, serverPrice) => {
    if (!serverPrice || serverPrice <= 0) return serverPrice;

    const key = buildKey(hotelId, roomTypeId, date);
    // Fallback to localStorage if sessionStorage is missing (cross-tab consistency)
    let stored = sessionStorage.getItem(key) || localStorage.getItem(key);

    if (!stored) {
      // First time user sees this price — baseline established
      return serverPrice;
    }

    const lastSeenPrice = parseFloat(stored);
    if (!lastSeenPrice || lastSeenPrice <= 0) return serverPrice;

    // Persist to both if found in one (sync)
    if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, String(lastSeenPrice));
    if (!localStorage.getItem(key)) localStorage.setItem(key, String(lastSeenPrice));

    const min = lastSeenPrice * (1 - MAX_DELTA);
    const max = lastSeenPrice * (1 + MAX_DELTA);

    return Math.round(Math.min(Math.max(serverPrice, min), max));
  }, []);

  /**
   * Records the price the user actually saw, to use as the anchor for next view.
   * Call this after rendering the price to the user.
   */
  const recordSeenPrice = useCallback((hotelId, roomTypeId, date, displayedPrice) => {
    if (!displayedPrice || displayedPrice <= 0) return;
    const key = buildKey(hotelId, roomTypeId, date);
    sessionStorage.setItem(key, String(displayedPrice));
    localStorage.setItem(key, String(displayedPrice));
  }, []);

  /**
   * Clears all price anchors from session and local storage.
   */
  const clearPriceAnchors = useCallback(() => {
    const keysToRemove = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith('priceAnchor:')) keysToRemove.push(k);
    }
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('priceAnchor:')) keysToRemove.push(k);
    }
    keysToRemove.forEach(k => {
      sessionStorage.removeItem(k);
      localStorage.removeItem(k);
    });
  }, []);

  return { getClampedPrice, recordSeenPrice, clearPriceAnchors };
}
