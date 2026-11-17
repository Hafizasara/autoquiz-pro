import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
export const isGeminiConfigured = Boolean(apiKey);

if (!isGeminiConfigured) {
  console.warn('⚠️ GEMINI_API_KEY is not defined in backend/.env. AI features will require API key setup.');
}

let genAIClient = null;

const getGenAIClient = async () => {
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
  return genAIClient;
};

export const getGeminiModel = async (modelName = (process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite')) => {
  const client = await getGenAIClient();
  if (!client) return null;
  return client.getGenerativeModel({ model: modelName });
};

/**
 * Robust content generator that attempts primary model first, and cascades
 * across compatible fallback models if a transient 503 (High Demand) or 404 occurs.
 */
export const generateWithFallback = async (prompt, customConfig = {}) => {
  const client = await getGenAIClient();
  if (!client) {
    throw new Error('Gemini API client is not configured or missing API key.');
  }

  const configuredModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  const modelCandidates = Array.from(new Set([
    configuredModel,
    'gemini-3.5-flash-lite',
    'gemini-3-flash-preview',
    'gemini-flash-lite-latest',
    'gemini-3.1-flash-lite-preview',
    'gemini-3.8-flash',
    'gemini-3.5-flash'
  ])).filter(Boolean);

  const mergedConfig = {
    temperature: 0.3,
    responseMimeType: 'application/json',
    maxOutputTokens: 8192,
    ...customConfig
  };

  let lastError = null;

  for (const modelName of modelCandidates) {
    try {
      const model = client.getGenerativeModel({
        model: modelName,
        generationConfig: mergedConfig
      });
      const response = await model.generateContent(prompt);
      const rawText = response?.response?.text?.() || '';
      if (rawText && rawText.trim().length > 0) {
        return {
          text: rawText.trim(),
          model: modelName
        };
      }
    } catch (err) {
      console.warn(`[Gemini Cascade] Model ${modelName} returned error (${err.status || err.message}). Trying next candidate...`);
      lastError = err;
    }
  }

  throw lastError || new Error('All Gemini model candidates failed to generate content.');
};
