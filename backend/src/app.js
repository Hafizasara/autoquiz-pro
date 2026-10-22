import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import v1Routes from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();

const app = express();

// Security and utility middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(morgan(process.env.NODE_ENV === 'development' ? 'dev' : 'combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root info route
app.get('/', (req, res) => {
  res.json({
    name: 'AutoQuiz Pro API',
    description: 'AI Exam & Assessment Generator for Teachers',
    apiDocs: '/api/v1/health',
    status: 'online'
  });
});

// REST API under /api/v1
app.use('/api/v1', v1Routes);

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({
    status: 'fail',
    message: `Cannot find route ${req.originalUrl} on this server`
  });
});

// Global error handler
app.use(errorHandler);

export default app;
