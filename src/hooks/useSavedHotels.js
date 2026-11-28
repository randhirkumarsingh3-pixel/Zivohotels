import { useEffect, useState } from 'react';
import { savedHotelsApi } from '../services/api';
import { useAuth } from '../context/AuthContext';

/**
 * The hotels the signed-in guest saved (ids), shared by every heart on the page: loaded once,
 * updated as hearts are toggled.
 */
let ids = null; let loading = null; let forUser = null;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(ids));

const load = (userId) => {
  if (forUser !== userId) { ids = null; loading = null; forUser = userId; }
  if (!userId) { ids = new Set(); emit(); return Promise.resolve(); }
  if (!loading) loading = savedHotelsApi.ids().then((list) => { if (forUser === userId) { ids = new Set(list); emit(); } }).catch(() => { ids = new Set(); emit(); });
  return loading;
};

export const useSavedHotels = () => {
  const { user, isAuthenticated } = useAuth();
  const userId = isAuthenticated && user?.role === 'CUSTOMER' ? user.id : null;
  const [state, setState] = useState(ids);
  useEffect(() => { listeners.add(setState); load(userId); return () => { listeners.delete(setState); }; }, [userId]);
  const toggle = async (hotelId, stay = {}) => {
    const was = ids?.has(hotelId);
    ids = new Set(ids || []); if (was) ids.delete(hotelId); else ids.add(hotelId); emit();
    try {
      if (was) await savedHotelsApi.remove(hotelId); else await savedHotelsApi.save({ hotelId, ...stay });
      return !was;
    } catch (e) {
      ids = new Set(ids); if (was) ids.add(hotelId); else ids.delete(hotelId); emit();
      throw e;
    }
  };
  return { canSave: Boolean(userId), signedIn: isAuthenticated, isSaved: (id) => Boolean(state?.has(id)), toggle };
};

export default useSavedHotels;
