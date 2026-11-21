import { createContext, useContext, useState, useEffect } from 'react';
import { loginUser } from '../services/api';

/**
 * Who is signed in. The session itself is an HTTP-only cookie set by the server at login, which
 * scripts on the page can't read; only the user's profile (name, role) is kept in localStorage
 * for the first paint, and checked with the server on load.
 */
const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

const API = import.meta.env.VITE_API_URL || '/api/v1';
const saveUser = (u) => { try { localStorage.setItem('user_data', JSON.stringify(u)); } catch { /* storage unavailable */ } };
const forget = () => { try { localStorage.removeItem('user_data'); localStorage.removeItem('jwt_token'); } catch { /* storage unavailable */ } };

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On load: check the session with the server. A token from before the cookie (localStorage) is
  // moved into the cookie once, so people already signed in stay signed in.
  useEffect(() => {
    let legacy = null;
    let stored = null;
    try { legacy = localStorage.getItem('jwt_token'); stored = JSON.parse(localStorage.getItem('user_data') || 'null'); } catch { /* ignore */ }
    if (!legacy && !stored) { setLoading(false); return; }
    if (stored) setUser(stored);
    const check = legacy
      ? fetch(`${API}/auth/session`, { method: 'POST', credentials: 'include', headers: { Authorization: `Bearer ${legacy}` } })
      : fetch(`${API}/auth/me`, { credentials: 'include' });
    check
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) { forget(); setUser(null); return; }
        const body = await r.json().catch(() => null);
        const fresh = body?.data?.user;
        if (fresh) {
          const merged = { ...(stored || {}), ...fresh };
          setUser(merged); saveUser(merged);
        }
        try { localStorage.removeItem('jwt_token'); } catch { /* ignore */ }
      })
      .catch(() => { /* offline: keep showing the stored profile */ })
      .finally(() => setLoading(false));
  }, []);

  // options.allowedRoles: each login page accepts only its own kind of account (admin console,
  // partner extranet). A wrong account is refused (and its session cleared) before anything is kept.
  const login = async (email, password, options = {}) => {
    try {
      const response = await loginUser({ email, password });
      const loggedInUser = response.data.user;
      if (options.allowedRoles && !options.allowedRoles.includes(loggedInUser?.role)) {
        fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
        return { success: false, message: options.wrongRoleMessage || 'This account cannot sign in here.' };
      }
      setUser(loggedInUser);
      saveUser(loggedInUser);
      try { localStorage.removeItem('jwt_token'); } catch { /* ignore */ }
      return { success: true, user: loggedInUser };
    } catch (error) {
      return { success: false, message: error.message };
    }
  };

  // After a password change the server sets a new session cookie itself; nothing to keep here
  const replaceToken = () => {};

  const logout = () => {
    fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
    setUser(null);
    forget();
  };

  if (loading) {
    // Prevent rendering app until auth state is confirmed
    return <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand-600"></div>
    </div>;
  }

  return (
    <AuthContext.Provider value={{ user, token: null, isAuthenticated: !!user, login, logout, replaceToken }}>
      {children}
    </AuthContext.Provider>
  );
};
