import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

// Endpoint to verify or validate administrative invitation codes
router.post('/validate-invitation', async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ status: 'fail', message: 'Invitation code is required' });
    }

    // Scaffold placeholder for administration invitation codes
    res.status(200).json({
      status: 'success',
      valid: true,
      message: 'Invitation code validation ready (scaffolded)'
    });
  } catch (error) {
    next(error);
  }
});

// Protected endpoint to retrieve authenticated user profile
router.get('/profile', requireAuth, async (req, res, next) => {
  try {
    res.status(200).json({
      status: 'success',
      user: {
        id: req.user.id,
        email: req.user.email,
        metadata: req.user.user_metadata
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
