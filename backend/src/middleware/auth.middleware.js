import { supabase } from '../config/supabase.js';

export const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      status: 'fail',
      message: 'Authentication token missing or invalid format (Bearer token expected)'
    });
  }

  if (!supabase) {
    return res.status(503).json({
      status: 'error',
      message: 'Supabase authentication service is not configured yet. Please configure backend/.env'
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        status: 'fail',
        message: 'Invalid or expired session token'
      });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};
