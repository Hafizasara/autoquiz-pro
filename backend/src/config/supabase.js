import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL;

export const isSupabaseConfigured = Boolean(supabaseUrl && (supabaseAnonKey || supabaseServiceRoleKey));
export const isDatabaseUrlConfigured = Boolean(databaseUrl);

// Supabase JS Client for Auth, Database REST, & Storage (runs over HTTPS 443)
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey || supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })
  : null;

// Admin client for backend operations requiring elevated privileges
export const supabaseAdmin = (isSupabaseConfigured && supabaseServiceRoleKey)
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : supabase;

// PostgreSQL Connection Pool (Optional TCP connection via Supabase pooler)
export const dbPool = isDatabaseUrlConfigured
  ? new Pool({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 3000,
      ssl: {
        rejectUnauthorized: false
      }
    })
  : null;

// Health test helper: tests Supabase HTTPS API and reports status
export const testSupabaseConnection = async () => {
  if (!supabase) {
    return { connected: false, message: 'SUPABASE_URL and SUPABASE_ANON_KEY are not configured' };
  }

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      return { connected: false, message: error.message };
    }
    return {
      connected: true,
      protocol: 'HTTPS (Port 443)',
      endpoint: supabaseUrl,
      status: 'authenticated/ready'
    };
  } catch (err) {
    return { connected: false, error: err.message };
  }
};
