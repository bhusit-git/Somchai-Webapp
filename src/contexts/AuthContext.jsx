import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate, useLocation } from 'react-router-dom';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true); // for first app load only
  const [loading, setLoading] = useState(false);           // for login requests
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Check local storage for existing session
    const storedUser = localStorage.getItem('cashsync_user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (_e) {}
    }
    setInitializing(false); // done checking — render the app
  }, []);

  const loginWithPin = async (pin, userId = null) => {
    try {
      setLoading(true);

      if (!userId) {
        throw new Error('ต้องระบุผู้ใช้งานเพื่อเข้าสู่ระบบ');
      }

      // Clear any stale JWT before calling verify-pin so the interceptor 
      // doesn't attach an expired/old token to the Edge Function call
      localStorage.removeItem('cashsync_jwt');

      // Call the Edge Function instead of reading pin_hash directly
      const { data, error } = await supabase.functions.invoke('verify-pin', {
        body: { user_id: userId, pin }
      });

      // supabase.functions.invoke behavior:
      //   - 2xx: data = parsed body, error = null
      //   - non-2xx (401, 429, 500): data = null, error = FunctionsHttpError
      //   - network failure: data = null, error = FunctionsFetchError
      if (error) {
        // Try to extract the JSON body from the Edge Function's error response
        let serverMsg = null;
        try {
          const errBody = await error.context?.json();
          serverMsg = errBody?.error;
        } catch (_e) { /* context not available or not JSON */ }

        if (serverMsg) {
          // Map known server messages to Thai
          if (serverMsg.includes('Too many attempts') || serverMsg.includes('locked')) {
            throw new Error('กรอก PIN ผิดเกินกำหนด กรุณารอ 5 นาทีแล้วลองใหม่');
          }
          if (serverMsg.includes('Invalid user or PIN')) {
            throw new Error('รหัส PIN ไม่ถูกต้อง');
          }
          throw new Error(serverMsg);
        }
        // Fallback for network errors or unparseable responses
        throw new Error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง');
      }

      if (!data || !data.success) {
        throw new Error('เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่');
      }

      const { user: verifiedUser, token } = data;

      // Store the JWT — the global fetch interceptor will inject it into all subsequent requests
      localStorage.setItem('cashsync_jwt', token);
      
      const userData = {
        id: verifiedUser.id,
        name: verifiedUser.name,
        employee_id: verifiedUser.employee_id || null,
        role: verifiedUser.role,
        branch_id: verifiedUser.branch_id,
        branch_name: verifiedUser.branch_name || 'ไม่ระบุสาขา'
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
    localStorage.removeItem('cashsync_jwt');
    navigate('/login');
  };

  const value = {
    user,
    loading,    // login-in-progress indicator (for showing spinner on numpad)
    loginWithPin,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {!initializing && children}
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

