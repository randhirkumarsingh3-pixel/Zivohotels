import { useCallback, useEffect, useState } from 'react';
import { getMyProfile } from '../services/api';
import { useAuth } from '../context/AuthContext';

/**
 * What the signed-in staff member may do (from /auth/me), so menus and buttons show only that.
 * The server checks every action anyway; this only keeps screens tidy.
 *   can('bookings.manage')                 admin console
 *   canAtHotel(hotelId, 'rates.manage')    a property (extranet)
 * Loaded once per signed-in person and shared; refreshAccess() after a role change.
 */
let cache = { userId: null, promise: null, value: null };
const listeners = new Set();

const load = (userId, force = false) => {
  if (!force && cache.userId === userId && cache.promise) return cache.promise;
  cache = { userId, value: cache.userId === userId ? cache.value : null, promise: null };
  cache.promise = getMyProfile().then((u) => {
    cache.value = u?.access || { admin: null, hotels: {} };
    listeners.forEach((fn) => fn(cache.value));
    return cache.value;
  }).catch(() => { cache.promise = null; return cache.value; });
  return cache.promise;
};

export const refreshAccess = () => (cache.userId ? load(cache.userId, true) : Promise.resolve(null));

const useAccess = () => {
  const { user } = useAuth();
  const [access, setAccess] = useState(cache.userId === user?.id ? cache.value : null);

  useEffect(() => {
    if (!user?.id || !['ADMIN', 'OWNER'].includes(user.role)) return undefined;
    const onChange = (v) => setAccess(v);
    listeners.add(onChange);
    load(user.id).then((v) => setAccess(v));
    return () => listeners.delete(onChange);
  }, [user?.id, user?.role]);

  const can = useCallback((perm) => Boolean(access?.admin && (!perm || access.admin.includes(perm))), [access]);
  const canAtHotel = useCallback((hotelId, perm) => {
    const h = access?.hotels?.[hotelId];
    return Boolean(h && (!perm || h.permissions.includes(perm)));
  }, [access]);

  return { access, loading: !access, can, canAtHotel, isSuperAdmin: Boolean(access?.isSuperAdmin) };
};

export default useAccess;
