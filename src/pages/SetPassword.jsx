import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ChangePasswordForm from '../components/account/ChangePasswordForm';
import { AuthShell } from '../components/auth/AuthParts';
import usePageTitle from '../hooks/usePageTitle';

/** Accounts created with a temporary password (invites) choose their own before going on. */
const SetPassword = () => {
  usePageTitle('Set your password');
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const home = user?.role === 'OWNER' ? '/extranet' : user?.role === 'ADMIN' ? '/admin' : '/';
  const back = location.state?.from?.pathname && location.state.from.pathname !== '/set-password' ? location.state.from.pathname : home;
  return (
    <AuthShell title="Set your own password" subtitle="Your account was created with a temporary password. Choose your own to continue.">
      <ChangePasswordForm onChanged={() => setTimeout(() => navigate(back, { replace: true }), 800)} />
      <button type="button" onClick={logout} className="mt-4 w-full text-sm font-semibold text-gray-500 hover:text-gray-700">Sign out</button>
    </AuthShell>
  );
};

export default SetPassword;
