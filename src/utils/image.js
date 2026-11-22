/**
 * Photo address for the website. With a width, uploaded photos come as a WebP of that size
 * (/img/w800/uploads/...), made by the API once and cached: a 4 MB phone photo becomes ~60 KB
 * on a hotel card. Widths: 400 (thumbnails), 800 (cards, room photos), 1600 (large photos).
 * Other addresses (Google Cloud Storage, outside images) come back as they are.
 */
const SIZES = [400, 800, 1600];
const RESIZABLE = /^\/uploads\/.+\.(jpe?g|png|webp)$/i;

export const getImageUrl = (url, width) => {
  if (!url) return '';
  if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }
  const apiBase = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000/api/v1';
  let domain = apiBase.replace(/\/api\/v1\/?$/, '');

  // ensure url starts with a slash
  const cleanUrl = url.startsWith('/') ? url : `/${url}`;

  if (width && RESIZABLE.test(cleanUrl)) {
    const w = SIZES.find((s) => s >= width) || SIZES[SIZES.length - 1];
    return `${domain}/img/w${w}${cleanUrl}`;
  }
  return `${domain}${cleanUrl}`;
};

/**
 * If a resized photo can't load, show the original instead (once). Installed once for the whole
 * page (main.jsx), so every <img> using a width gets it.
 */
export const installImageFallback = () => {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (e) => {
    const img = e.target;
    if (!img || img.tagName !== 'IMG' || img.dataset.zivoFallback) return;
    const m = /\/img\/w\d+(\/uploads\/.+)$/.exec(img.currentSrc || img.src || '');
    if (!m) return;
    img.dataset.zivoFallback = '1';
    // Stop here so the photo's own error handler (which may hide it) only runs if the original fails too
    e.stopPropagation();
    img.src = img.src.replace(/\/img\/w\d+\/uploads\//, '/uploads/');
  }, true);
};
