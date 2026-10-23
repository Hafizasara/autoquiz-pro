import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { getTeacherAssignedCourses } from '../services/university.service.js';

const router = Router();

// Protect all teacher routes
router.use(requireAuth);
router.use(requireRole('TEACHER'));

/**
 * @route GET /api/v1/teacher/courses
 * @desc Get all courses assigned to this teacher by university administrator
 * Returns empty array if no courses have been assigned yet (blank dashboard state)
 */
router.get('/courses', async (req, res, next) => {
  try {
    const courses = await getTeacherAssignedCourses(req.user.user_id, req.user.university_id);

    res.status(200).json({
      status: 'success',
      data: {
        courses,
        hasAssignedCourses: courses.length > 0
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
