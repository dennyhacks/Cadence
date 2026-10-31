import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import Logo from '../components/Logo.jsx';

function Splash() {
  return (
    <div className="grid min-h-screen place-items-center" role="status" aria-label="Loading">
      <Logo />
    </div>
  );
}

/** Pages that need a signed-in user. Pass roles to limit them, e.g. <ProtectedRoute roles={['admin']} />. */
export function ProtectedRoute({ roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Sign-in and sign-up pages. Someone who is already signed in goes straight to the app. */
export function GuestRoute() {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (user) return <Navigate to="/" replace />;
  return <Outlet />;
}
