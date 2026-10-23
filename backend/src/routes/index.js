import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import adminRoutes from './admin.routes.js';
import teacherRoutes from './teacher.routes.js';
import quizRoutes from './quiz.routes.js';
import assessmentRoutes from './assessment.routes.js';
import evaluationRoutes from './evaluation.routes.js';

const router = Router();

router.use('/', healthRoutes);
router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/teacher', teacherRoutes);
router.use('/assessments', assessmentRoutes);
router.use('/quizzes', quizRoutes);
router.use('/evaluations', evaluationRoutes);

export default router;
