import { Router } from 'express';
import { query } from '../config/supabase.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

const router = Router();

/**
 * @route GET /api/v1/assessments
 * @desc Get all assessments (filtered by course or user role)
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const courseId = req.query.courseId;
    let sql = `
      SELECT a.*, c.course_name, c.course_code, u.name as teacher_name
      FROM public.assessments a
      LEFT JOIN public.courses c ON a.course_id = c.course_id
      LEFT JOIN public.users u ON a.created_by = u.user_id
    `;
    const params = [];

    if (courseId) {
      sql += ` WHERE a.course_id = $1`;
      params.push(courseId);
    } else if (req.user?.role === 'TEACHER') {
      sql += ` WHERE a.created_by = $1`;
      params.push(req.user.user_id);
    }

    sql += ` ORDER BY a.created_at DESC`;

    const result = await query(sql, params);

    res.status(200).json({
      status: 'success',
      data: {
        assessments: result.rows,
        count: result.rows.length
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/assessments/:id
 * @desc Get single assessment by ID
 */
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT a.*, c.course_name, c.course_code, u.name as teacher_name
       FROM public.assessments a
       LEFT JOIN public.courses c ON a.course_id = c.course_id
       LEFT JOIN public.users u ON a.created_by = u.user_id
       WHERE a.assessment_id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'fail',
        message: `Assessment with ID ${id} not found.`
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        assessment: result.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/assessments
 * @desc Create new academic assessment / quiz
 * Week 6 Deliverable 2: Real request with assessment ID and status.
 * Week 6 Deliverable 4: Input validation rejecting missing/invalid data.
 * Week 6 Deliverable 8: Protected by requireAuth.
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const {
      title,
      description,
      courseId,
      course_id,
      totalMarks,
      total_marks,
      passingMarks,
      passing_marks,
      durationMinutes,
      duration_minutes,
      status,
      questions
    } = req.body;

    const validationErrors = [];

    // 1. Title validation
    if (!title || typeof title !== 'string' || title.trim().length < 3) {
      validationErrors.push('Assessment title is required and must be at least 3 characters long.');
    }

    // 2. Course ID validation
    const resolvedCourseId = courseId || course_id;
    if (!resolvedCourseId || isNaN(parseInt(resolvedCourseId, 10))) {
      validationErrors.push('A valid courseId is required to associate this assessment with a curriculum module.');
    }

    // 3. Total marks validation
    const resolvedTotalMarks = totalMarks !== undefined ? parseInt(totalMarks, 10) : (total_marks !== undefined ? parseInt(total_marks, 10) : 100);
    if (isNaN(resolvedTotalMarks) || resolvedTotalMarks <= 0) {
      validationErrors.push('Total marks must be a positive integer greater than 0.');
    }

    // 4. Duration validation
    const resolvedDuration = durationMinutes !== undefined ? parseInt(durationMinutes, 10) : (duration_minutes !== undefined ? parseInt(duration_minutes, 10) : 60);
    if (isNaN(resolvedDuration) || resolvedDuration <= 0) {
      validationErrors.push('Assessment duration must be a positive integer in minutes.');
    }

    // Return structured validation error response if any field fails
    if (validationErrors.length > 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'Validation failed: Please provide all required assessment parameters.',
        errors: validationErrors
      });
    }

    // Check if course exists in the database
    const courseCheck = await query(
      `SELECT course_id, course_name, university_id FROM public.courses WHERE course_id = $1`,
      [resolvedCourseId]
    );

    if (courseCheck.rows.length === 0) {
      return res.status(404).json({
        status: 'fail',
        message: `Course with ID ${resolvedCourseId} does not exist in the institutional curriculum.`
      });
    }

    const resolvedPassingMarks = passingMarks !== undefined ? parseInt(passingMarks, 10) : (passing_marks !== undefined ? parseInt(passing_marks, 10) : Math.round(resolvedTotalMarks * 0.5));
    const resolvedStatus = status || 'PUBLISHED';
    const questionsJson = JSON.stringify(questions || []);

    const insertRes = await query(
      `INSERT INTO public.assessments (
        title, description, course_id, user_id, created_by, total_marks, passing_marks, duration_minutes, status, questions, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9::jsonb, NOW(), NOW())
      RETURNING assessment_id, title, description, course_id, created_by, total_marks, passing_marks, duration_minutes, status, questions, created_at`,
      [
        title.trim(),
        description || '',
        resolvedCourseId,
        req.user.user_id,
        resolvedTotalMarks,
        resolvedPassingMarks,
        resolvedDuration,
        resolvedStatus,
        questionsJson
      ]
    );

    const createdAssessment = insertRes.rows[0];

    return res.status(201).json({
      status: 'success',
      message: 'Assessment created successfully.',
      data: {
        assessment: createdAssessment
      }
    });
  } catch (error) {
    console.error('Error creating assessment:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Internal server error while creating assessment.'
    });
  }
});

export default router;
