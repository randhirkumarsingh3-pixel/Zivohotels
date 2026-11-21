/**
 * Tiny event channel: the API layer reports "the server wants a new password first"
 * (PASSWORD_CHANGE_REQUIRED) and the account guard reacts. Avoids importing React state here.
 */
const listeners = new Set();
export const onPasswordChangeRequired = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const reportPasswordChangeRequired = () => listeners.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
