import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import RestrictedScreen from '@/components/RestrictedScreen';

type ProtectedRouteProps = {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'user';
};

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">Loading…</div>
    );
  }

  if (!user) {
    return <RestrictedScreen onLogin={() => window.location.assign('/login')} />;
  }

  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
