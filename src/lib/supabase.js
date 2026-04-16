import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: (url, options) => {
      try {
        const token = localStorage.getItem('cashsync_jwt');
        if (token) {
          options = options || {};
          options.headers = new Headers(options.headers || {});
          options.headers.set('Authorization', `Bearer ${token}`);
          
          // Debugging log (can be removed in prod window.location to prevent logging in prod)
          if (!url.includes('/functions/v1/verify-pin') && typeof window !== 'undefined' && window.location.hostname === 'localhost') {
              console.log('[Supabase Fetch] Injected Authorization Header for:', url);
          }
        }
      } catch (err) {
        console.error('Error applying custom JWT', err);
      }
      return fetch(url, options);
    }
  }
});
