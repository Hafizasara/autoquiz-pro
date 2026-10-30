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

// PostgreSQL Connection Pool using direct pooler connection string (short timeout to fail fast if blocked)
export const dbPool = isDatabaseUrlConfigured
  ? new Pool({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 30000,
      max: 10,
      ssl: { rejectUnauthorized: false }
    })
  : null;

let directPoolWorking = null; // null: unknown, true: working, false: blocked/failed

/**
 * Resilient HTTPS query runner via Supabase REST API (Port 443)
 * Operates without requiring raw TCP PostgreSQL ports (5432 / 6543)
 */
export const runViaHttps = async (text, params = []) => {
  const client = supabaseAdmin || supabase;
  if (!client) {
    throw new Error('Supabase client is not configured for HTTPS fallback.');
  }

  const clean = text.replace(/\s+/g, ' ').trim();

  // Helper: safely substitute $1, $2, etc. with properly formatted values
  const interpolateParams = (sql, pList = []) => {
    if (!pList || pList.length === 0) return sql;
    let interpolated = sql;
    for (let i = 0; i < pList.length; i++) {
      const val = pList[i];
      let formatted;
      if (val === null || val === undefined) {
        formatted = 'NULL';
      } else if (typeof val === 'number' || typeof val === 'boolean') {
        formatted = String(val);
      } else if (val instanceof Date) {
        formatted = `'${val.toISOString()}'`;
      } else {
        formatted = `'${String(val).replace(/'/g, "''")}'`;
      }
      const placeholder = new RegExp(`\\$${i + 1}(?![0-9])`, 'g');
      interpolated = interpolated.replace(placeholder, () => formatted);
    }
    return interpolated;
  };

  // 1. Try exec_sql RPC if defined in Supabase
  try {
    const readySql = interpolateParams(text, params);
    const { data, error } = await client.rpc('exec_sql', {
      query_text: readySql,
      query_params: []
    });
    if (!error && data !== null) {
      const rows = Array.isArray(data) ? data : (data.success ? [] : [data]);
      return { rows, rowCount: rows.length };
    }
    if (error) {
      console.warn('⚠️ [HTTPS Fallback] exec_sql RPC notice:', error.message, 'Query:', readySql.substring(0, 100));
    }
  } catch (rpcErr) {
    console.warn('⚠️ [HTTPS Fallback] exec_sql exception:', rpcErr.message);
  }

  // 2. Health check: SELECT 1
  if (/^SELECT\s+1/i.test(clean)) {
    return { rows: [{ test: 1 }], rowCount: 1 };
  }

  // 3. Universities lookup
  if (/FROM\s+public\.universities/i.test(clean)) {
    const { data, error } = await client
      .from('universities')
      .select('university_id, name, code, domain, contact_email, website, logo_url, is_active')
      .eq('is_active', true);

    if (error) throw error;
    const all = data || [];

    if (params && params.length > 0 && typeof params[0] === 'string') {
      const domain = params[0].toLowerCase();
      const matched = all.find(u => u.domain === domain || domain.endsWith('.' + u.domain));
      if (matched) return { rows: [matched], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }

    if (/domain\s*=\s*'edu'/i.test(clean)) {
      const edu = all.find(u => u.domain === 'edu' || u.domain === 'ptut.edu.pk') || all[0];
      return { rows: edu ? [edu] : [], rowCount: edu ? 1 : 0 };
    }

    return { rows: all, rowCount: all.length };
  }

  // 4. Users query by email (with university join)
  if (/FROM\s+public\.users.*WHERE.*(u\.)?email\s*=\s*\$1/i.test(clean)) {
    const email = params[0]?.trim().toLowerCase();
    const { data, error } = await client
      .from('users')
      .select('user_id, name, email, password_hash, role, is_active, university_id, auth_provider, avatar_url, email_verified, universities(name, code)')
      .ilike('email', email)
      .maybeSingle();

    if (error) throw error;
    if (!data) return { rows: [], rowCount: 0 };

    const row = {
      ...data,
      university_name: data.universities?.name || null,
      university_code: data.universities?.code || null
    };
    return { rows: [row], rowCount: 1 };
  }

  // 5. Users query by user_id
  if (/FROM\s+public\.users.*WHERE.*(u\.)?user_id\s*=\s*\$1/i.test(clean)) {
    const userId = params[0];
    const { data, error } = await client
      .from('users')
      .select('user_id, name, email, role, is_active, avatar_url, university_id, auth_provider, email_verified, universities(name, code)')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return { rows: [], rowCount: 0 };

    const row = {
      ...data,
      university_name: data.universities?.name || null,
      university_code: data.universities?.code || null
    };
    return { rows: [row], rowCount: 1 };
  }

  // 6. Update user email_verified
  if (/UPDATE\s+public\.users\s+SET\s+email_verified\s*=\s*TRUE\s+WHERE\s+user_id\s*=\s*\$1/i.test(clean)) {
    const { error } = await client
      .from('users')
      .update({ email_verified: true, updated_at: new Date().toISOString() })
      .eq('user_id', params[0]);
    if (error) throw error;
    return { rows: [], rowCount: 1 };
  }

  // 7. Check user device verification
  if (/FROM\s+public\.user_devices.*WHERE.*user_id\s*=\s*\$1.*device_token\s*=\s*\$2/i.test(clean)) {
    const { data, error } = await client
      .from('user_devices')
      .select('is_verified')
      .eq('user_id', params[0])
      .eq('device_token', params[1])
      .maybeSingle();

    if (error) throw error;
    return { rows: data ? [data] : [], rowCount: data ? 1 : 0 };
  }

  // 8. Upsert user device (record active login)
  if (/INSERT\s+INTO\s+public\.user_devices/i.test(clean)) {
    const userId = params[0];
    const deviceToken = params[1];
    const browserInfo = params[2] || 'Web Browser';
    const isVerified = clean.includes('TRUE') || Boolean(params[3]);

    const { error } = await client
      .from('user_devices')
      .upsert({
        user_id: userId,
        device_token: deviceToken,
        browser_info: browserInfo,
        is_verified: isVerified,
        verified_at: isVerified ? new Date().toISOString() : null,
        last_login: new Date().toISOString()
      }, { onConflict: 'user_id, device_token' });

    if (error) throw error;
    return { rows: [], rowCount: 1 };
  }

  // 9. Email verification tokens
  if (/INSERT\s+INTO\s+public\.email_verifications/i.test(clean)) {
    const { error } = await client
      .from('email_verifications')
      .insert({
        user_id: params[0],
        token: params[1],
        device_token: params[2],
        expires_at: params[3]
      });
    if (error) throw error;
    return { rows: [], rowCount: 1 };
  }

  if (/FROM\s+public\.email_verifications.*WHERE.*token\s*=\s*\$1/i.test(clean)) {
    const { data, error } = await client
      .from('email_verifications')
      .select('verification_id, user_id, device_token, expires_at, used_at')
      .eq('token', params[0])
      .maybeSingle();

    if (error) throw error;
    return { rows: data ? [data] : [], rowCount: data ? 1 : 0 };
  }

  if (/UPDATE\s+public\.email_verifications\s+SET\s+used_at/i.test(clean)) {
    const { error } = await client
      .from('email_verifications')
      .update({ used_at: new Date().toISOString() })
      .eq('verification_id', params[0]);
    if (error) throw error;
    return { rows: [], rowCount: 1 };
  }

  // 10. Invitations Lifecycle (Creation, Lookup, Resend, Revoke, List)
  if (/INSERT\s+INTO\s+public\.invitations/i.test(clean)) {
    let code, role, universityId, createdBy, expiresAt, targetEmail;
    if (clean.includes("'TEACHER'")) {
      code = params[0];
      role = 'TEACHER';
      universityId = params[1] || 1;
      createdBy = params[2];
      expiresAt = params[3];
      targetEmail = params[4];
    } else {
      code = params[0];
      role = params[1] || 'TEACHER';
      universityId = params[2] || 1;
      createdBy = params[3];
      expiresAt = params[4];
      targetEmail = params[5];
    }

    const { data, error } = await client
      .from('invitations')
      .insert({
        code,
        role,
        university_id: universityId,
        created_by: createdBy,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        target_email: targetEmail ? targetEmail.trim().toLowerCase() : null
      })
      .select('invitation_id, code, role, university_id, created_by, expires_at, used_at, target_email, created_at')
      .single();

    if (error) throw error;
    return { rows: [data], rowCount: 1 };
  }

  if (/FROM\s+public\.invitations/i.test(clean)) {
    // Stats count
    if (clean.includes('COUNT(*)')) {
      const { data, error } = await client.from('invitations').select('invitation_id, used_at, expires_at');
      if (error) throw error;
      const all = data || [];
      const now = new Date();
      const active = all.filter(i => !i.used_at && (!i.expires_at || new Date(i.expires_at) > now)).length;
      const used = all.filter(i => Boolean(i.used_at)).length;
      const expired = all.filter(i => !i.used_at && i.expires_at && new Date(i.expires_at) <= now).length;
      return {
        rows: [{
          active_invites: active,
          used_invites: used,
          expired_invites: expired,
          total_invites: all.length
        }],
        rowCount: 1
      };
    }

    // Single invite lookup by code
    if (/WHERE.*code\s*=\s*\$1/i.test(clean)) {
      const { data, error } = await client
        .from('invitations')
        .select('invitation_id, code, role, university_id, created_by, used_by, expires_at, used_at, target_email, universities(name)')
        .eq('code', params[0].trim())
        .maybeSingle();

      if (error) throw error;
      if (!data) return { rows: [], rowCount: 0 };
      return {
        rows: [{
          ...data,
          university_name: data.universities?.name || null
        }],
        rowCount: 1
      };
    }

    // Single invite lookup by invitation_id (pre-revoke check)
    if (/WHERE.*invitation_id\s*=\s*\$1/i.test(clean)) {
      const { data, error } = await client
        .from('invitations')
        .select('invitation_id, used_at, code, target_email, university_id')
        .eq('invitation_id', params[0])
        .maybeSingle();

      if (error) throw error;
      return { rows: data ? [data] : [], rowCount: data ? 1 : 0 };
    }

    // Full invitations list
    const { data: invs, error } = await client
      .from('invitations')
      .select('*')
      .order('invitation_id', { ascending: false });

    if (error) throw error;
    const now = new Date();
    const rows = (invs || []).map(i => ({
      ...i,
      is_used: Boolean(i.used_at),
      is_expired: Boolean(!i.used_at && i.expires_at && new Date(i.expires_at) < now),
      status: i.used_at ? 'used' : (i.expires_at && new Date(i.expires_at) < now ? 'expired' : 'pending'),
      created_by_name: null,
      used_by_name: null,
      used_by_email: null
    }));

    return { rows, rowCount: rows.length };
  }

  if (/UPDATE\s+public\.invitations\s+SET\s+expires_at/i.test(clean)) {
    const expiresAt = params[0];
    const invitationId = params[1];
    const { data, error } = await client
      .from('invitations')
      .update({ expires_at: new Date(expiresAt).toISOString() })
      .eq('invitation_id', invitationId)
      .is('used_at', null)
      .select('*')
      .single();

    if (error) throw error;
    return { rows: data ? [data] : [], rowCount: data ? 1 : 0 };
  }

  if (/UPDATE\s+public\.invitations\s+SET\s+used_at/i.test(clean)) {
    const { error } = await client
      .from('invitations')
      .update({ used_at: new Date().toISOString(), used_by: params[0] })
      .eq('invitation_id', params[1]);
    if (error) throw error;
    return { rows: [], rowCount: 1 };
  }

  if (/DELETE\s+FROM\s+public\.invitations/i.test(clean)) {
    const { error } = await client
      .from('invitations')
      .delete()
      .eq('invitation_id', params[0]);
    if (error) throw error;
    return { rows: [], rowCount: 1 };
  }

  // Audit Log Insert
  if (/INSERT\s+INTO\s+public\.admin_audit_log/i.test(clean)) {
    try {
      await client.from('admin_audit_log').insert({
        university_id: params[0],
        admin_user_id: params[1],
        action: params[2],
        target_type: params[3],
        target_id: params[4],
        details: typeof params[5] === 'string' ? JSON.parse(params[5] || '{}') : (params[5] || {}),
        ip_address: params[6]
      });
    } catch (auditErr) {
      console.warn('Audit log write notice:', auditErr.message);
    }
    return { rows: [], rowCount: 1 };
  }

  // 11. User registration insert
  if (/INSERT\s+INTO\s+public\.users/i.test(clean)) {
    const name = params[0];
    const email = params[1];
    const passwordHash = params[2];
    const role = clean.includes("'STUDENT'") ? 'STUDENT' : params[3];
    const universityId = clean.includes("'STUDENT'") ? params[3] : params[4];

    const { data, error } = await client
      .from('users')
      .insert({
        name,
        email,
        password_hash: passwordHash,
        role,
        is_active: true,
        university_id: universityId,
        auth_provider: 'email',
        email_verified: role !== 'STUDENT'
      })
      .select('user_id, name, email, role, university_id, created_at')
      .single();

    if (error) throw error;
    return { rows: [data], rowCount: 1 };
  }

  // 12. Courses
  if (/FROM\s+public\.courses/i.test(clean)) {
    let q = client.from('courses').select('*');
    if (params && params.length > 0) {
      q = q.eq('university_id', params[0]);
    }
    const { data, error } = await q;
    if (error) throw error;
    return { rows: data || [], rowCount: (data || []).length };
  }

  // 13. Assessments
  if (/FROM\s+public\.assessments/i.test(clean)) {
    if (clean.includes('COUNT(')) {
      const countRes = await client.from('assessments').select('*', { count: 'exact', head: true });
      return { rows: [{ cnt: countRes.count || 0 }], rowCount: 1 };
    }
    const { data, error } = await client.from('assessments').select('*');
    if (error) throw error;
    return { rows: data || [], rowCount: (data || []).length };
  }

  console.warn('⚠️ [HTTPS Fallback] Unhandled query pattern:', clean);
  return { rows: [], rowCount: 0 };
};

// Universal Query helper with automatic failover to HTTPS Port 443
export const query = async (text, params) => {
  // If service role key is configured, use high-speed HTTPS execution directly
  if (supabaseAdmin && process.env.PREFER_DIRECT_POOL !== 'true') {
    return await runViaHttps(text, params);
  }

  // Otherwise, if direct pool is available, try direct pool
  if (dbPool && directPoolWorking !== false) {
    try {
      const client = await dbPool.connect();
      try {
        const res = await client.query(text, params);
        directPoolWorking = true;
        return res;
      } finally {
        client.release();
      }
    } catch (poolErr) {
      const isNetworkTimeout = poolErr.message?.includes('timeout') || 
                               poolErr.message?.includes('ETIMEDOUT') || 
                               poolErr.code === 'ETIMEDOUT' ||
                               poolErr.code === 'ECONNREFUSED';
      if (isNetworkTimeout) {
        console.warn('⚠️ Direct PostgreSQL connection timed out/blocked. Seamlessly switching to HTTPS (Port 443)...');
        directPoolWorking = false;
      } else {
        throw poolErr;
      }
    }
  }

  // Execute over HTTPS (Port 443) using Supabase service role privileges
  return await runViaHttps(text, params);
};

// Health test helper
export const testSupabaseConnection = async () => {
  if (!supabase && !supabaseAdmin) {
    return { connected: false, message: 'SUPABASE_URL and API keys are not configured' };
  }

  try {
    // 1. Verify HTTPS connection (Port 443)
    const client = supabaseAdmin || supabase;
    const countRes = await client.from('universities').select('*', { count: 'exact', head: true });
    
    let dbStatus = directPoolWorking === true ? 'connected (direct pooler)' : 'connected (HTTPS Port 443)';

    return {
      connected: true,
      protocol: 'HTTPS (Port 443) with Direct Pooler Failover',
      databasePool: dbStatus,
      endpoint: supabaseUrl,
      status: 'authenticated/ready',
      activeUniversities: countRes.count || 0
    };
  } catch (err) {
    return { connected: false, error: err.message };
  }
};

