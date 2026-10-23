import { Router } from 'express';
import {
  registerTeacherWithEmail,
  registerAdminWithEmail,
  loginWithEmailPassword,
  handleGoogleAuth,
  getUserProfile,
  validateInvitation,
  isOfficialUniversityEmail
} from '../services/auth.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

/**
 * @route POST /api/v1/auth/register-teacher
 * @desc Teacher registration with email & password + admin one-time invite code
 */
router.post('/register-teacher', async (req, res, next) => {
  try {
    const { name, email, password, inviteCode } = req.body;
    const result = await registerTeacherWithEmail({ name, email, password, inviteCode });

    res.status(201).json({
      status: 'success',
      message: 'Teacher account registered successfully.',
      data: result
    });
  } catch (error) {
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

/**
 * @route POST /api/v1/auth/register-admin
 * @desc Admin registration with email & password + ADMIN one-time invite code
 */
router.post('/register-admin', async (req, res, next) => {
  try {
    const { name, email, password, inviteCode } = req.body;
    const result = await registerAdminWithEmail({ name, email, password, inviteCode });

    res.status(201).json({
      status: 'success',
      message: 'Admin account registered successfully.',
      data: result
    });
  } catch (error) {
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

/**
 * @route POST /api/v1/auth/login
 * @desc Sign in with email and password (Teachers and Admins only)
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await loginWithEmailPassword({ email, password });

    res.status(200).json({
      status: 'success',
      message: 'Signed in successfully.',
      data: result
    });
  } catch (error) {
    res.status(401).json({
      status: 'fail',
      message: error.message
    });
  }
});

/**
 * @route POST /api/v1/auth/google-auth
 * @desc Authenticate or register using Google OAuth session token
 */
router.post('/google-auth', async (req, res, next) => {
  try {
    const { supabaseAccessToken, inviteCode } = req.body;
    const result = await handleGoogleAuth({ supabaseAccessToken, inviteCode });

    if (result.status === 'need_invite_code') {
      return res.status(200).json({
        status: 'need_invite_code',
        email: result.email,
        name: result.name,
        message: result.message
      });
    }

    res.status(200).json({
      status: 'success',
      message: result.message || 'Authenticated successfully with Google.',
      data: result
    });
  } catch (error) {
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

/**
 * @route POST /api/v1/auth/validate-invite
 * @desc Validate invitation code before form submission
 */
router.post('/validate-invite', async (req, res, next) => {
  try {
    const { code, requiredRole } = req.body;
    const invite = await validateInvitation(code, requiredRole);

    res.status(200).json({
      status: 'success',
      valid: true,
      data: {
        role: invite.role,
        expiresAt: invite.expires_at
      }
    });
  } catch (error) {
    res.status(400).json({
      status: 'fail',
      valid: false,
      message: error.message
    });
  }
});

/**
 * @route POST /api/v1/auth/check-university-email
 * @desc Check whether an email domain qualifies as an official university email
 */
router.post('/check-university-email', async (req, res) => {
  const { email } = req.body;
  const isUniversity = await isOfficialUniversityEmail(email);

  res.status(200).json({
    status: 'success',
    isUniversity,
    email
  });
});

/**
 * @route GET /api/v1/auth/me
 * @desc Get currently authenticated user profile with server-verified role
 */
router.get('/me', requireAuth, async (req, res) => {
  const profile = await getUserProfile(req.user.user_id);

  res.status(200).json({
    status: 'success',
    data: {
      user: profile
    }
  });
});

export default router;
