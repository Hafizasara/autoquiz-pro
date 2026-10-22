import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { getGeminiModel } from '../config/gemini.js';

const router = Router();

// Endpoint for question generation using Gemini
router.post('/generate', async (req, res, next) => {
  try {
    const { topic, gradeLevel, questionCount = 5, difficulty = 'medium' } = req.body;

    if (!topic) {
      return res.status(400).json({ status: 'fail', message: 'Topic is required' });
    }

    const model = await getGeminiModel();

    if (!model) {
      return res.status(200).json({
        status: 'mock',
        message: 'Gemini API key is not configured yet. Returning scaffold sample response.',
        data: {
          topic,
          gradeLevel,
          questions: [
            {
              id: 1,
              question: `Sample question on ${topic}?`,
              options: ['Option A', 'Option B', 'Option C', 'Option D'],
              correctAnswer: 'Option A'
            }
          ]
        }
      });
    }

    // Call Gemini API when configured
    const prompt = `Generate ${questionCount} multiple-choice questions for grade level ${gradeLevel || 'general'} about topic "${topic}" with difficulty "${difficulty}". Return in structured JSON format.`;
    const result = await model.generateContent(prompt);
    const response = await result.response;

    res.status(200).json({
      status: 'success',
      data: response.text()
    });
  } catch (error) {
    next(error);
  }
});

// Endpoint to list saved quizzes
router.get('/', async (req, res, next) => {
  try {
    res.status(200).json({
      status: 'success',
      data: []
    });
  } catch (error) {
    next(error);
  }
});

export default router;
