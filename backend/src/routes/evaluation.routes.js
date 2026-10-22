import { Router } from 'express';
import { getGeminiModel } from '../config/gemini.js';

const router = Router();

// Endpoint for answer marking and feedback using Gemini
router.post('/mark', async (req, res, next) => {
  try {
    const { question, studentAnswer, rubric } = req.body;

    if (!question || !studentAnswer) {
      return res.status(400).json({
        status: 'fail',
        message: 'Question and studentAnswer are required'
      });
    }

    const model = await getGeminiModel();

    if (!model) {
      return res.status(200).json({
        status: 'mock',
        message: 'Gemini API key is not configured yet. Returning scaffold sample evaluation.',
        data: {
          score: 85,
          feedback: 'Scaffold evaluation: Student answer shows strong conceptual understanding.',
          suggestions: 'Consider elaborating on specific key terms.'
        }
      });
    }

    const prompt = `Act as an expert teacher. Evaluate the following student answer based on the question and optional rubric.
Question: ${question}
Student Answer: ${studentAnswer}
Rubric: ${rubric || 'Standard accuracy and clarity'}

Provide score (0-100), concise constructive feedback, and suggestions. Return JSON format.`;

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

export default router;
