import { useEffect } from 'react';

const SITE = 'ZivoHotels';
const DEFAULT_DESCRIPTION = 'Book hotels across India with ZivoHotels. Member prices, free cancellation on many stays, reserve now and pay later, and Zivo Rewards on every booking.';

/**
 * Sets the browser tab title ("Hotels in Mumbai | ZivoHotels") and, optionally, the page's meta
 * description, so tabs, bookmarks, shared links and search results show what the page is.
 */
const usePageTitle = (title, description) => {
  useEffect(() => {
    document.title = title ? `${title} | ${SITE}` : `${SITE}: hotel bookings at the best prices`;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'description'; document.head.appendChild(meta); }
    meta.content = description || DEFAULT_DESCRIPTION;
  }, [title, description]);
};

export default usePageTitle;
