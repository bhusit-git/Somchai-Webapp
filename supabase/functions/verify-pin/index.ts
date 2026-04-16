import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/v135/@supabase/supabase-js@2.42.0";
import { SignJWT } from "https://deno.land/x/jose@v4.14.4/index.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { user_id, pin } = await req.json();

    if (!user_id || !pin) {
      return new Response(JSON.stringify({ error: 'Missing user_id or pin' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const jwtSecret = Deno.env.get('CUSTOM_JWT_SECRET') ?? '';

    if (!supabaseUrl || !supabaseServiceKey || !jwtSecret) {
      console.error('Missing environment variables');
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase Client with Service Role (Bypasses RLS)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Rate Limiting Check
    const { data: attemptData } = await supabase
      .from('login_attempts')
      .select('failed_attempts, lockout_until')
      .eq('user_id', user_id)
      .maybeSingle();

    let failed_attempts = 0;
    if (attemptData) {
      if (attemptData.lockout_until && new Date(attemptData.lockout_until) > new Date()) {
        return new Response(JSON.stringify({ error: 'Too many attempts. Account locked temporarily.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      failed_attempts = attemptData.failed_attempts || 0;
    }

    // Fetch User Data
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, name, employee_id, role, branch_id, pin_hash, branches:branch_id (name)')
      .eq('id', user_id)
      .single();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid user or PIN' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify PIN
    if (user.pin_hash !== pin) {
      failed_attempts += 1;
      let lockout_until = null;
      if (failed_attempts >= 5) {
        lockout_until = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // Lock for 5 minutes
      }

      await supabase
        .from('login_attempts')
        .upsert({ user_id, failed_attempts, lockout_until, updated_at: new Date().toISOString() });

      return new Response(JSON.stringify({ error: 'Invalid user or PIN' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // PIN Correct -> Reset attempts
    if (failed_attempts > 0) {
      await supabase
        .from('login_attempts')
        .upsert({ user_id, failed_attempts: 0, lockout_until: null, updated_at: new Date().toISOString() });
    }

    // Sign Custom JWT
    const secret = new TextEncoder().encode(jwtSecret);
    const token = await new SignJWT({
      sub: user.id,
      role: 'authenticated',
      user_metadata: { role: user.role }
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuedAt()
      .setExpirationTime('24h') // Set 24 hour expiration as per plan
      .setAudience('authenticated')
      .sign(secret);

    // Return the token and safe user payload
    const userData = {
      id: user.id,
      name: user.name,
      employee_id: user.employee_id,
      role: user.role,
      branch_id: user.branch_id,
      branch_name: user.branches?.name || null
    };

    return new Response(JSON.stringify({ success: true, token, user: userData }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
