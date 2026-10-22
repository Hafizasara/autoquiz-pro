import app from './app.js';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 AutoQuiz Pro Backend Server running at http://localhost:${PORT}`);
  console.log(`🔗 REST API endpoints mounted at http://localhost:${PORT}/api/v1`);
  console.log(`🩺 Health check available at http://localhost:${PORT}/api/v1/health`);
});
