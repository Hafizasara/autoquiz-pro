import { Router } from 'express';
import { isSupabaseConfigured, testSupabaseConnection } from '../config/supabase.js';
import { isGeminiConfigured } from '../config/gemini.js';
import { runSystemBootstrap } from '../services/bootstrap.service.js';

const router = Router();

router.get('/health', async (req, res) => {
  const supabaseStatus = await testSupabaseConnection();

  res.status(200).json({
    status: 'success',
    message: 'AutoQuiz Pro API is running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    services: {
      supabase: supabaseStatus.connected ? 'connected' : `issue: ${supabaseStatus.message || supabaseStatus.error}`,
      supabaseEndpoint: supabaseStatus.endpoint || null,
      gemini: isGeminiConfigured ? 'configured' : 'pending_env'
    }
  });
});

router.all('/bootstrap', async (req, res) => {
  try {
    const result = await runSystemBootstrap();
    res.status(200).json({
      status: 'success',
      message: 'System bootstrap completed successfully.',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

export default router;
