import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Smartphone } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import PhoneVerifyForm from '../account/PhoneVerifyForm';
import { onPasswordChangeRequired } from '../../services/authEvents';

/**
 * Account steps that must happen before anything else, on every page:
 *  - a temporary password (invited accounts) must be replaced: -> /set-password
 *  - a guest who joined with Google adds and confirms a mobile number (required for all guests)
 */
const AccountGuard = () => {
  const { user, logout, updateUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // The server refuses requests until the password is changed: send them to the page
  useEffect(() => onPasswordChangeRequired(() => updateUser({ mustChangePassword: true })), [updateUser]);

  useEffect(() => {
    if (user?.mustChangePassword && location.pathname !== '/set-password') {
      navigate('/set-password', { replace: true, state: { from: location } });
    }
  }, [user?.mustChangePassword, location, navigate]);

  if (!user || user.mustChangePassword) return null;
  if (!(user.role === 'CUSTOMER' && user.google && !user.phoneVerified)) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="add-phone-title">
      <div className="w-full max-w-md rounded-card bg-white p-6 shadow-xl">
        <h2 id="add-phone-title" className="flex items-center gap-2 text-lg font-bold text-gray-900"><Smartphone size={20} className="text-navy-700" aria-hidden="true" /> Add your mobile number</h2>
        <p className="mt-1 mb-5 text-sm text-gray-600">Every ZivoPlus account needs a confirmed mobile number, so hotels can reach you about your stay. We&apos;ll send a code by SMS.</p>
        <PhoneVerifyForm />
        <button type="button" onClick={logout} className="mt-4 w-full text-sm font-semibold text-gray-500 hover:text-gray-700">Sign out instead</button>
      </div>
    </div>
  );
};

export default AccountGuard;
