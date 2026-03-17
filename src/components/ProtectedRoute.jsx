import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-xl animate-pulse">กำลังโหลดระบบ...</div>
      </div>
    );
  }

  if (!user) {
    // Redirect to login if not authenticated
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If roles are specified, check if user has permission
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Redirect to a safe page (dashboard) if role not allowed
    // You could also redirect to an "Unauthorized" page
    return <Navigate to="/" replace />;
  }

  return children;
}
