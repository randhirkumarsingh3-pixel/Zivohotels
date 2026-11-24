import { lazy } from 'react';

/**
 * lazy() for pages, safe across deploys. Each deploy renames the page files, so a tab opened
 * before a deploy can ask for a file that no longer exists; React then fails the whole app.
 * Instead, reload the page once (the browser then gets the new files). If it still fails after
 * the reload, the error is shown as usual.
 */
const KEY = 'zivo_chunk_reload_at';
const isChunkError = (e) => /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Unable to preload CSS/i.test(String(e?.message || e));

export const lazyPage = (factory) => lazy(() => factory().then((m) => {
  try { sessionStorage.removeItem(KEY); } catch { /* storage blocked */ }
  return m;
}).catch((err) => {
  let last = 0;
  try { last = Number(sessionStorage.getItem(KEY) || 0); } catch { /* storage blocked */ }
  if (isChunkError(err) && Date.now() - last > 30000) {
    try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* storage blocked */ }
    window.location.reload();
    return new Promise(() => {}); // keep showing the loading state while the page reloads
  }
  throw err;
}));

export default lazyPage;
