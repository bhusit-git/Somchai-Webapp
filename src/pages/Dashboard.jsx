import { useAuth } from '../contexts/AuthContext';
import StoreManagerDashboard from '../components/dashboard/StoreManagerDashboard';
import OwnerDashboard from '../components/dashboard/OwnerDashboard';

export default function Dashboard() {
  const { user } = useAuth();

  // Roles that should see the overall Owner Dashboard
  const ownerRoles = ['owner', 'admin'];

  // If the user's role is in the ownerRoles list, show the Owner version
  if (user && ownerRoles.includes(user.role)) {
    return <OwnerDashboard />;
  }

  // Otherwise (manager, store_manager, staff, cook), show the Store Manager version
  return <StoreManagerDashboard />;
}
