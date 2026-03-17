import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate, useLocation } from 'react-router-dom';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Check local storage for existing session
    const storedUser = localStorage.getItem('cashsync_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const loginWithPin = async (pin) => {
    try {
      setLoading(true);
      // In a real production app, we should use proper hashing/auth
      // For this ERP, we are matching the pin_hash directly against the user table
      const { data, error } = await supabase
        .from('users')
        .select(`
          *,
          branches:branch_id (name)
        `)
        .eq('pin_hash', pin)
        .single();

      if (error || !data) {
        throw new Error('รหัส PIN ไม่ถูกต้อง หรือไม่พบผู้ใช้งาน');
      }

      // Check if user is active (if we add active column later)
      // For now, any found user by PIN is allowed

      const userData = {
        id: data.id,
        name: data.name,
        role: data.role,
        branch_id: data.branch_id,
        branch_name: data.branches?.name || 'ไม่ระบุสาขา'
      };

      setUser(userData);
      localStorage.setItem('cashsync_user', JSON.stringify(userData));
      
      // Redirect to dashboard or previous page
      const origin = location.state?.from?.pathname || '/';
      navigate(origin);
      
      return { success: true };
    } catch (err) {
      console.error('Login error:', err);
      return { success: false, message: err.message };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('cashsync_user');
    navigate('/login');
  };

  const value = {
    user,
    loading,
    loginWithPin,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
