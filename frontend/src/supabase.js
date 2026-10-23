import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://kzfhpwyliikdrvifwdoi.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_VZmyzFDEd_NVBabMiRHqiw_sEKiPNo1';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

/**
 * Trigger Google OAuth Sign-In
 * Redirects to /auth/callback to exchange tokens and verify roles with backend
 */
export const signInWithGoogle = async () => {
  if (!supabase) {
    throw new Error('Supabase client is not configured.');
  }

  const redirectUrl = `${window.location.origin}/auth/callback`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUrl,
      queryParams: {
        access_type: 'offline',
        prompt: 'select_account'
      }
    }
  });

  if (error) throw error;
  return data;
};

export const signOutSupabase = async () => {
  if (!supabase) return;
  await supabase.auth.signOut();
};
