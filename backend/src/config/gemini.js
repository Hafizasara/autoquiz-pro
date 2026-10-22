import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
export const isGeminiConfigured = Boolean(apiKey);

if (!isGeminiConfigured) {
  console.warn('⚠️ GEMINI_API_KEY is not defined in backend/.env. AI features will require API key setup.');
}

let genAIClient = null;

export const getGeminiModel = async (modelName = (process.env.GEMINI_MODEL || 'gemini-1.5-flash')) => {
  if (!apiKey) return null;
  if (!genAIClient) {
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      genAIClient = new GoogleGenerativeAI(apiKey);
    } catch (err) {
      console.warn('Could not initialize GoogleGenerativeAI client:', err.message);
      return null;
    }
  }
  return genAIClient.getGenerativeModel({ model: modelName });
};
