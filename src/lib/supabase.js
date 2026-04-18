import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: async (url, options) => {
      try {
        const token = localStorage.getItem('cashsync_jwt');
        if (token) {
          options = options || {};
          options.headers = new Headers(options.headers || {});
          options.headers.set('Authorization', `Bearer ${token}`);
          
          if (!url.includes('/functions/v1/verify-pin') && typeof window !== 'undefined' && window.location.hostname === 'localhost') {
              console.log('[Supabase Fetch] Injected Authorization Header for:', url);
          }
        }
      } catch (err) {
        console.error('Error applying custom JWT', err);
      }

      const response = await fetch(url, options);

      // Handle 401 Unauthorized (JWT Expired)
      if (response.status === 401 && !url.includes('/functions/v1/verify-pin')) {
        const clone = response.clone();
        try {
          const body = await clone.json();
          const errorMsg = body.error || body.message || '';
          
          if (errorMsg.includes('JWT expired') || errorMsg.includes('invalid') || errorMsg.includes('expired')) {
            console.warn('[Supabase] Auth session expired. Redirecting to login.');
            
            // Clear identity
            localStorage.removeItem('cashsync_user');
            localStorage.removeItem('cashsync_jwt');
            
            // Hard redirect if we are in a browser context
            if (typeof window !== 'undefined') {
              window.location.href = '/login?expired=true';
            }
          }
        } catch (e) {
          // Ignored if not JSON or parsing fails
        }
      }

      return response;
    }
  }
});
