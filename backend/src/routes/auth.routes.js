import { Router } from 'express';
import {
  registerUnified,
  loginUnified,
  googleAuthUnified,
  verifyDeviceWithToken,
  getUserProfile,
  validateInvitation
} from '../services/auth.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

/**
 * @route POST /api/v1/auth/register
 * @desc UNIFIED REGISTRATION - Server decides role.
 * User enters Name, Email, Password, and optional Invite Code.
 * Redirects to login page upon success.
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, inviteCode, deviceToken, browserInfo } = req.body;
    const clientDevice = deviceToken || req.headers['x-device-token'];

    const result = await registerUnified({
      name,
      email,
      password,
      inviteCode,
      deviceToken: clientDevice,
      browserInfo: browserInfo || req.headers['user-agent']
    });

    res.status(201).json({
      status: 'success',
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
 * @desc UNIFIED LOGIN - Server validates credentials and verifies browser trust.
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password, deviceToken, browserInfo } = req.body;
    const clientDevice = deviceToken || req.headers['x-device-token'];

    const result = await loginUnified({
      email,
      password,
      deviceToken: clientDevice,
      browserInfo: browserInfo || req.headers['user-agent']
    });

    if (result.status === 'verification_required') {
      return res.status(200).json({
        status: 'verification_required',
        message: result.message,
        data: result
      });
    }

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
 * @desc UNIFIED GOOGLE OAUTH SIGN-IN & REGISTRATION
 */
router.post('/google-auth', async (req, res) => {
  try {
    const { supabaseAccessToken, inviteCode, deviceToken, browserInfo } = req.body;
    const clientDevice = deviceToken || req.headers['x-device-token'];

    const result = await googleAuthUnified({
      supabaseAccessToken,
      inviteCode,
      deviceToken: clientDevice,
      browserInfo: browserInfo || req.headers['user-agent']
    });

    if (result.status === 'verification_required') {
      return res.status(200).json({
        status: 'verification_required',
        message: result.message,
        data: result
      });
    }

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
 * @route POST /api/v1/auth/verify-device
 * @desc Verify browser device from student email link
 */
router.post('/verify-device', async (req, res) => {
  try {
    const { token, deviceToken } = req.body;
    const clientDevice = deviceToken || req.headers['x-device-token'];

    const result = await verifyDeviceWithToken(token, clientDevice);

    res.status(200).json({
      status: 'success',
      message: result.message
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
 * @desc Validate invitation code before registration
 */
router.post('/validate-invite', async (req, res) => {
  try {
    const { code } = req.body;
    const invite = await validateInvitation(code);

    res.status(200).json({
      status: 'success',
      valid: true,
      data: {
        role: invite.role,
        universityName: invite.university_name,
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
 * @route GET /api/v1/auth/me
 * @desc Get currently authenticated user profile
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
