import jwt from 'jsonwebtoken';
import { query, supabase } from '../config/supabase.js';

const JWT_SECRET = process.env.JWT_SECRET || 'autoquiz-pro-fallback-jwt-secret-key-2026';

/**
 * Authentication Middleware: Verifies Bearer token and attaches database user object to req.user
 * Role is strictly loaded from the PostgreSQL database, never from client input or user_metadata.
 */
export const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      status: 'fail',
      message: 'Authentication required. Bearer token missing or malformed.'
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    // 1. First attempt to verify as application JWT token
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded && decoded.userId) {
        const dbRes = await query(
          'SELECT user_id, name, email, role, is_active, avatar_url, university_id FROM public.users WHERE user_id = $1',
          [decoded.userId]
        );

        if (dbRes.rows.length === 0 || !dbRes.rows[0].is_active) {
          return res.status(401).json({ status: 'fail', message: 'User account not found or deactivated.' });
        }

        req.user = dbRes.rows[0];
        if (!req.user.university_id && decoded.universityId) {
          req.user.university_id = decoded.universityId;
        }
        if (!req.user.university_id) {
          req.user.university_id = 1;
        }
        return next();
      }
    } catch (jwtErr) {
      // If not our app JWT, might be a direct Supabase access token (fallback verification)
      if (supabase) {
        const { data: { user: sbUser }, error } = await supabase.auth.getUser(token);
        if (!error && sbUser) {
          const dbRes = await query(
            'SELECT user_id, name, email, role, is_active, avatar_url, university_id FROM public.users WHERE email = $1 OR supabase_uid = $2',
            [sbUser.email, sbUser.id]
          );

          if (dbRes.rows.length > 0 && dbRes.rows[0].is_active) {
            req.user = dbRes.rows[0];
            if (!req.user.university_id) {
              req.user.university_id = 1;
            }
            return next();
          }
        }
      }
      throw jwtErr;
    }

    return res.status(401).json({
      status: 'fail',
      message: 'Invalid or expired session token. Please sign in again.'
    });
  } catch (err) {
    return res.status(401).json({
      status: 'fail',
      message: 'Authentication session expired or invalid: ' + err.message
    });
  }
};

/**
 * Role-Based Access Control Middleware
 * Enforces that req.user.role is in the allowed list of roles.
 * Decided strictly on the server by the database record.
 */
export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        status: 'fail',
        message: 'Authentication required before checking permissions.'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'fail',
        message: `Forbidden: Access requires one of the following roles [${allowedRoles.join(', ')}]. Your current role is [${req.user.role}].`
      });
    }

    next();
  };
};
