import { Router } from 'express';
import crypto from 'crypto';
import { query } from '../config/supabase.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

const router = Router();

// Protect all admin routes with authentication and strict ADMIN role
router.use(requireAuth);
router.use(requireRole('ADMIN'));

/**
 * @route POST /api/v1/admin/invitations
 * @desc Generate a new one-time use invitation code for TEACHER or ADMIN
 */
router.post('/invitations', async (req, res, next) => {
  try {
    const { role = 'TEACHER', expiresInDays = 30 } = req.body;

    if (!['ADMIN', 'TEACHER'].includes(role)) {
      return res.status(400).json({ status: 'fail', message: 'Role must be either TEACHER or ADMIN.' });
    }

    // Generate random human-friendly code: e.g. TCH-9F42-7B1A or ADM-82EA-19C4
    const prefix = role === 'ADMIN' ? 'ADM' : 'TCH';
    const randomHex = crypto.randomBytes(4).toString('hex').toUpperCase();
    const randomHex2 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const code = `${prefix}-${randomHex}-${randomHex2}`;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + parseInt(expiresInDays, 10));

    const insertRes = await query(
      `INSERT INTO public.invitations (code, role, created_by, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING invitation_id, code, role, created_by, expires_at, used_at`,
      [code, role, req.user.user_id, expiresAt]
    );

    res.status(201).json({
      status: 'success',
      message: `One-time invitation code created for role ${role}.`,
      data: {
        invitation: insertRes.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/admin/invitations
 * @desc List all invitation codes with usage status
 */
router.get('/invitations', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT 
        i.invitation_id,
        i.code,
        i.role,
        i.expires_at,
        i.used_at,
        (i.used_at IS NOT NULL) AS is_used,
        u_creator.name AS created_by_name,
        u_used.name AS used_by_name,
        u_used.email AS used_by_email
       FROM public.invitations i
       LEFT JOIN public.users u_creator ON i.created_by = u_creator.user_id
       LEFT JOIN public.users u_used ON i.used_by = u_used.user_id
       ORDER BY i.invitation_id DESC`
    );

    res.status(200).json({
      status: 'success',
      data: {
        invitations: result.rows
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route DELETE /api/v1/admin/invitations/:id
 * @desc Revoke an unused invitation code
 */
router.delete('/invitations/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const check = await query('SELECT used_at FROM public.invitations WHERE invitation_id = $1', [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ status: 'fail', message: 'Invitation not found.' });
    }

    if (check.rows[0].used_at !== null) {
      return res.status(400).json({ status: 'fail', message: 'Cannot revoke an invitation code that has already been used.' });
    }

    await query('DELETE FROM public.invitations WHERE invitation_id = $1', [id]);

    res.status(200).json({
      status: 'success',
      message: 'Invitation code revoked successfully.'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/admin/users
 * @desc List all registered users and their verified roles
 */
router.get('/users', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT user_id, name, email, role, is_active, auth_provider, avatar_url, created_at, updated_at
       FROM public.users
       ORDER BY user_id DESC`
    );

    res.status(200).json({
      status: 'success',
      data: {
        users: result.rows
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/admin/stats
 * @desc Get system user count statistics
 */
router.get('/stats', async (req, res, next) => {
  try {
    const statsRes = await query(`
      SELECT
        COUNT(*) FILTER (WHERE role = 'ADMIN') as admin_count,
        COUNT(*) FILTER (WHERE role = 'TEACHER') as teacher_count,
        COUNT(*) FILTER (WHERE role = 'STUDENT') as student_count,
        COUNT(*) as total_users
      FROM public.users;
    `);

    const inviteStats = await query(`
      SELECT
        COUNT(*) FILTER (WHERE used_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())) as active_invites,
        COUNT(*) FILTER (WHERE used_at IS NOT NULL) as used_invites,
        COUNT(*) as total_invites
      FROM public.invitations;
    `);

    res.status(200).json({
      status: 'success',
      data: {
        users: statsRes.rows[0],
        invitations: inviteStats.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
