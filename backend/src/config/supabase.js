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

// Supabase JS Client for Auth & Storage (runs over HTTPS 443)
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

// PostgreSQL Connection Pool using direct pooler connection string
export const dbPool = isDatabaseUrlConfigured
  ? new Pool({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 5000,
      ssl: false // Required for Supabase pooler proxy
    })
  : null;

// Query helper with automatic client acquisition and release
export const query = async (text, params) => {
  if (!dbPool) {
    throw new Error('Database pool not configured. Please check DATABASE_URL in .env');
  }
  const client = await dbPool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
};

// Health test helper
export const testSupabaseConnection = async () => {
  if (!supabase) {
    return { connected: false, message: 'SUPABASE_URL and SUPABASE_ANON_KEY are not configured' };
  }

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      return { connected: false, message: error.message };
    }

    // Also test db pool
    let dbStatus = 'disconnected';
    if (dbPool) {
      const res = await query('SELECT 1 as test');
      if (res.rows[0]?.test === 1) {
        dbStatus = 'connected';
      }
    }

    return {
      connected: true,
      protocol: 'HTTPS (Port 443)',
      databasePool: dbStatus,
      endpoint: supabaseUrl,
      status: 'authenticated/ready'
    };
  } catch (err) {
    return { connected: false, error: err.message };
  }
};
