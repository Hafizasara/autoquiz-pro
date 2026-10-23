import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { query } from '../config/supabase.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import {
  processUniversityCSV,
  getUniversityCourses,
  createUniversityCourse,
  assignTeacherToCourse
} from '../services/university.service.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Protect all admin routes with authentication and strict ADMIN role
router.use(requireAuth);
router.use(requireRole('ADMIN'));

/**
 * @route POST /api/v1/admin/upload-csv
 * @desc Upload CSV to bulk import Courses, Students, or generate Teacher invitations
 */
router.post('/upload-csv', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'fail', message: 'Please select a CSV file to upload.' });
    }

    const csvContent = req.file.buffer.toString('utf-8');
    const result = await processUniversityCSV(req.user.university_id, req.user.user_id, csvContent);

    res.status(200).json({
      status: 'success',
      message: `CSV processing complete (${result.detectedType}): ${result.processed} records processed.`,
      data: result
    });
  } catch (error) {
    res.status(400).json({ status: 'fail', message: error.message });
  }
});

/**
 * @route GET /api/v1/admin/courses
 * @desc List all courses in the university with assigned teachers & enrolled students
 */
router.get('/courses', async (req, res, next) => {
  try {
    const uniId = req.user.university_id || 1;
    const courses = await getUniversityCourses(uniId);
    res.status(200).json({ status: 'success', data: { courses } });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/admin/courses
 * @desc Create a new course in the university
 */
router.post('/courses', async (req, res, next) => {
  try {
    const { courseName, courseCode, teacherId } = req.body;
    const uniId = req.user.university_id || 1;
    const resolvedTeacherId = teacherId ? parseInt(teacherId, 10) : null;
    const course = await createUniversityCourse(uniId, { 
      courseName, 
      courseCode, 
      teacherId: resolvedTeacherId 
    });

    res.status(201).json({
      status: 'success',
      message: 'Course created successfully.',
      data: { course }
    });
  } catch (error) {
    res.status(400).json({ status: 'fail', message: error.message });
  }
});

/**
 * @route PUT /api/v1/admin/courses/:id/assign
 * @desc Assign or reassign a teacher to a course
 */
router.put('/courses/:id/assign', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { teacherId } = req.body;
    const uniId = req.user.university_id || 1;
    const resolvedTeacherId = teacherId ? parseInt(teacherId, 10) : null;

    const updated = await assignTeacherToCourse(uniId, id, resolvedTeacherId);

    res.status(200).json({
      status: 'success',
      message: resolvedTeacherId ? 'Teacher assigned to course successfully.' : 'Course unassigned.',
      data: { course: updated }
    });
  } catch (error) {
    res.status(400).json({ status: 'fail', message: error.message });
  }
});

/**
 * @route GET /api/v1/admin/teachers
 * @desc List all teachers belonging to this university (for course assignment dropdown)
 */
router.get('/teachers', async (req, res, next) => {
  try {
    const uniId = req.user.university_id || 1;
    const resTeachers = await query(
      `SELECT user_id, name, email, avatar_url, created_at,
              (SELECT COUNT(*) FROM public.courses WHERE user_id = u.user_id)::int as assigned_courses_count
       FROM public.users u
       WHERE (u.university_id = $1 OR u.university_id IS NULL) AND u.role = 'TEACHER' AND u.is_active = TRUE
       ORDER BY name ASC`,
      [uniId]
    );

    res.status(200).json({
      status: 'success',
      data: { teachers: resTeachers.rows }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/admin/invitations
 * @desc Generate a new one-time use invitation code for TEACHER or ADMIN in this university
 */
router.post('/invitations', async (req, res, next) => {
  try {
    const { role = 'TEACHER', expiresInDays = 30 } = req.body;

    if (!['ADMIN', 'TEACHER'].includes(role)) {
      return res.status(400).json({ status: 'fail', message: 'Role must be either TEACHER or ADMIN.' });
    }

    const prefix = role === 'ADMIN' ? 'ADM' : 'TCH';
    const randomHex = crypto.randomBytes(4).toString('hex').toUpperCase();
    const code = `${prefix}-${randomHex}-${Date.now().toString().slice(-4)}`;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + parseInt(expiresInDays, 10));

    const insertRes = await query(
      `INSERT INTO public.invitations (code, role, university_id, created_by, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING invitation_id, code, role, university_id, created_by, expires_at, used_at`,
      [code, role, req.user.university_id, req.user.user_id, expiresAt]
    );

    res.status(201).json({
      status: 'success',
      message: `One-time invitation code created for role ${role}.`,
      data: {
        invitation: insertRes.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/admin/invitations
 * @desc List all invitation codes for this university
 */
router.get('/invitations', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT 
        i.invitation_id,
        i.code,
        i.role,
        i.expires_at,
        i.used_at,
        (i.used_at IS NOT NULL) AS is_used,
        u_creator.name AS created_by_name,
        u_used.name AS used_by_name,
        u_used.email AS used_by_email
       FROM public.invitations i
       LEFT JOIN public.users u_creator ON i.created_by = u_creator.user_id
       LEFT JOIN public.users u_used ON i.used_by = u_used.user_id
       WHERE i.university_id = $1
       ORDER BY i.invitation_id DESC`,
      [req.user.university_id]
    );

    res.status(200).json({
      status: 'success',
      data: {
        invitations: result.rows
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route DELETE /api/v1/admin/invitations/:id
 * @desc Revoke an unused invitation code
 */
router.delete('/invitations/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const check = await query(
      'SELECT used_at FROM public.invitations WHERE invitation_id = $1 AND university_id = $2',
      [id, req.user.university_id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ status: 'fail', message: 'Invitation not found.' });
    }

    if (check.rows[0].used_at !== null) {
      return res.status(400).json({ status: 'fail', message: 'Cannot revoke an invitation code that has already been used.' });
    }

    await query('DELETE FROM public.invitations WHERE invitation_id = $1', [id]);

    res.status(200).json({
      status: 'success',
      message: 'Invitation code revoked successfully.'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/admin/users
 * @desc List all users registered in this university
 */
router.get('/users', async (req, res, next) => {
  try {
    const uniId = req.user.university_id || 1;
    const result = await query(
      `SELECT user_id, name, email, role, is_active, auth_provider, avatar_url, created_at, updated_at
       FROM public.users
       WHERE (university_id = $1 OR university_id IS NULL)
       ORDER BY user_id DESC`,
      [uniId]
    );

    res.status(200).json({
      status: 'success',
      data: {
        users: result.rows
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/admin/stats
 * @desc Get university user and course statistics
 */
router.get('/stats', async (req, res, next) => {
  try {
    const uniId = req.user.university_id || 1;
    const statsRes = await query(
      `SELECT
        COUNT(*) FILTER (WHERE role = 'ADMIN') as admin_count,
        COUNT(*) FILTER (WHERE role = 'TEACHER') as teacher_count,
        COUNT(*) FILTER (WHERE role = 'STUDENT') as student_count,
        COUNT(*) as total_users
       FROM public.users
       WHERE (university_id = $1 OR university_id IS NULL);`,
      [uniId]
    );

    const inviteStats = await query(
      `SELECT
        COUNT(*) FILTER (WHERE used_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())) as active_invites,
        COUNT(*) FILTER (WHERE used_at IS NOT NULL) as used_invites,
        COUNT(*) as total_invites
       FROM public.invitations
       WHERE (university_id = $1 OR university_id IS NULL);`,
      [uniId]
    );

    const courseStats = await query(
      `SELECT 
        COUNT(*) as total_courses,
        COUNT(*) FILTER (WHERE user_id IS NOT NULL) as assigned_courses,
        COUNT(*) FILTER (WHERE user_id IS NULL) as unassigned_courses
       FROM public.courses
       WHERE (university_id = $1 OR university_id IS NULL);`,
      [uniId]
    );

    res.status(200).json({
      status: 'success',
      data: {
        users: statsRes.rows[0],
        invitations: inviteStats.rows[0],
        courses: courseStats.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/admin/create-admin
 * @desc Directly create an administrator account for this university
 */
router.post('/create-admin', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ status: 'fail', message: 'Name, email, and password are required.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ status: 'fail', message: 'Password must be at least 8 characters long.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await query('SELECT user_id FROM public.users WHERE email = $1', [normalizedEmail]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ status: 'fail', message: 'A user with this email address already exists.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const insertRes = await query(
      `INSERT INTO public.users (name, email, password_hash, role, is_active, university_id, auth_provider, email_verified, created_at, updated_at)
       VALUES ($1, $2, $3, 'ADMIN', TRUE, $4, 'email', TRUE, NOW(), NOW())
       RETURNING user_id, name, email, role, university_id, created_at`,
      [name.trim(), normalizedEmail, passwordHash, req.user.university_id]
    );

    res.status(201).json({
      status: 'success',
      message: 'New administrator created successfully.',
      data: {
        admin: insertRes.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/admin/administrators
 * @desc List all administrators for this university
 */
router.get('/administrators', async (req, res, next) => {
  try {
    const admins = await query(
      `SELECT user_id, name, email, created_at, is_active
       FROM public.users
       WHERE university_id = $1 AND role = 'ADMIN'
       ORDER BY created_at ASC`,
      [req.user.university_id]
    );

    res.status(200).json({
      status: 'success',
      data: {
        administrators: admins.rows
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
