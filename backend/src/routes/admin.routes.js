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
import {
  sendTeacherInvitationEmail,
  sendTeacherApprovalNotification,
  formatExpiryLabel
} from '../services/email.service.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Protect all admin routes with authentication and strict ADMIN role
router.use(requireAuth);
router.use(requireRole('ADMIN'));

// ─── AUDIT LOG HELPER ─────────────────────────────────────────────────────────
const logAudit = async (req, action, targetType, targetId, details = {}) => {
  try {
    await query(
      `INSERT INTO public.admin_audit_log (university_id, admin_user_id, action, target_type, target_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [req.user.university_id, req.user.user_id, action, targetType, targetId, JSON.stringify(details), req.ip]
    );
  } catch (e) {
    console.error('Audit log write failed:', e.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 1. DASHBOARD STATS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @route GET /api/v1/admin/stats
 * @desc Comprehensive dashboard stats
 */
router.get('/stats', async (req, res, next) => {
  try {
    const uniId = req.user.university_id || 1;

    const [usersRes, inviteRes, courseRes, deptRes, assessRes] = await Promise.all([
      query(
        `SELECT
          COUNT(*) FILTER (WHERE role = 'ADMIN')::int as admin_count,
          COUNT(*) FILTER (WHERE role = 'TEACHER')::int as teacher_count,
          COUNT(*) FILTER (WHERE role = 'STUDENT')::int as student_count,
          COUNT(*)::int as total_users,
          COUNT(*) FILTER (WHERE is_active = TRUE)::int as active_users,
          COUNT(*) FILTER (WHERE is_active = FALSE)::int as inactive_users
         FROM public.users WHERE (university_id = $1 OR university_id IS NULL)`,
        [uniId]
      ),
      query(
        `SELECT
          COUNT(*) FILTER (WHERE used_at IS NULL AND (expires_at IS NULL OR expires_at > NOW()))::int as active_invites,
          COUNT(*) FILTER (WHERE used_at IS NOT NULL)::int as used_invites,
          COUNT(*) FILTER (WHERE used_at IS NULL AND expires_at < NOW())::int as expired_invites,
          COUNT(*)::int as total_invites
         FROM public.invitations WHERE (university_id = $1 OR university_id IS NULL)`,
        [uniId]
      ),
      query(
        `SELECT 
          COUNT(*)::int as total_courses,
          COUNT(*) FILTER (WHERE user_id IS NOT NULL)::int as assigned_courses,
          COUNT(*) FILTER (WHERE user_id IS NULL)::int as unassigned_courses,
          COUNT(*) FILTER (WHERE status = 'archived')::int as archived_courses
         FROM public.courses WHERE (university_id = $1 OR university_id IS NULL)`,
        [uniId]
      ),
      query(
        `SELECT COUNT(*)::int as total_departments FROM public.departments WHERE university_id = $1`,
        [uniId]
      ).catch(() => ({ rows: [{ total_departments: 0 }] })),
      query(
        `SELECT COUNT(*)::int as total_assessments FROM public.courses WHERE (university_id = $1 OR university_id IS NULL)`,
        [uniId]
      ).catch(() => ({ rows: [{ total_assessments: 0 }] }))
    ]);

    // Growth data (last 30 days)
    const growthRes = await query(
      `SELECT 
        DATE(created_at) as date,
        COUNT(*) FILTER (WHERE role = 'TEACHER')::int as teachers,
        COUNT(*) FILTER (WHERE role = 'STUDENT')::int as students,
        COUNT(*)::int as total
       FROM public.users
       WHERE (university_id = $1 OR university_id IS NULL) AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at)
       ORDER BY DATE(created_at)`,
      [uniId]
    );

    res.status(200).json({
      status: 'success',
      data: {
        users: usersRes.rows[0],
        invitations: inviteRes.rows[0],
        courses: courseRes.rows[0],
        departments: deptRes.rows[0],
        growth: growthRes.rows
      }
    });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. TEACHER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @route GET /api/v1/admin/teachers
 * @desc List all teachers with full details, course count, assessment count, status, and approval state
 */
router.get('/teachers', async (req, res, next) => {
  try {
    const uniId = req.user.university_id || 1;
    const { search, department_id, course_id, status } = req.query;

    let sql = `SELECT u.user_id, u.name, u.email, u.is_active, u.auth_provider, u.avatar_url,
                      COALESCE(u.approval_status, 'approved') as approval_status,
                      u.department_id, u.last_sign_in, u.created_at, u.updated_at,
                      d.name as department_name, d.code as department_code,
                      (SELECT COUNT(*)::int FROM public.courses WHERE user_id = u.user_id) as course_count,
                      (SELECT COUNT(*)::int FROM public.assessments WHERE created_by = u.user_id) as assessment_count,
                      COALESCE((
                        SELECT json_agg(json_build_object(
                          'course_id', c.course_id,
                          'course_name', c.course_name,
                          'course_code', c.course_code,
                          'department_id', c.department_id
                        ))
                        FROM public.courses c
                        WHERE c.user_id = u.user_id
                      ), '[]'::json) as courses
               FROM public.users u
               LEFT JOIN public.departments d ON u.department_id = d.department_id
               WHERE (u.university_id = $1 OR u.university_id IS NULL) AND u.role = 'TEACHER'`;
    const params = [uniId];

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
    }
    if (department_id) {
      params.push(parseInt(department_id, 10));
      sql += ` AND (u.department_id = $${params.length} OR EXISTS (SELECT 1 FROM public.courses c WHERE c.user_id = u.user_id AND c.department_id = $${params.length}))`;
    }
    if (course_id) {
      params.push(parseInt(course_id, 10));
      sql += ` AND EXISTS (SELECT 1 FROM public.courses c WHERE c.user_id = u.user_id AND c.course_id = $${params.length})`;
    }
    if (status === 'active') {
      sql += ` AND u.is_active = TRUE AND COALESCE(u.approval_status, 'approved') = 'approved'`;
    } else if (status === 'inactive') {
      sql += ` AND u.is_active = FALSE`;
    } else if (status === 'pending' || status === 'pending_approval') {
      sql += ` AND u.approval_status = 'pending'`;
    }

    sql += ` ORDER BY u.name ASC`;
    const result = await query(sql, params);

    res.status(200).json({ status: 'success', data: { teachers: result.rows } });
  } catch (error) {
    next(error);
  }
});

/**
 * @route PUT /api/v1/admin/teachers/:id/status
 * @desc Activate or deactivate a teacher. Deactivation blocks sign-in at once and keeps all data.
 */
router.put('/teachers/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;
    const uniId = req.user.university_id || 1;

    const result = await query(
      `UPDATE public.users SET is_active = $1, updated_at = NOW()
       WHERE user_id = $2 AND (university_id = $3 OR university_id IS NULL) AND role = 'TEACHER'
       RETURNING user_id, name, email, is_active, approval_status`,
      [Boolean(is_active), id, uniId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'fail', message: 'Teacher not found.' });
    }

    const teacher = result.rows[0];
    await logAudit(req, is_active ? 'ACTIVATE_TEACHER' : 'DEACTIVATE_TEACHER', 'USER', id, {
      teacher_name: teacher.name, teacher_email: teacher.email
    });

    res.status(200).json({
      status: 'success',
      message: `Teacher ${teacher.name} has been ${is_active ? 'activated' : 'deactivated'}. ${is_active ? 'Sign-in access restored.' : 'Sign-in blocked immediately. All courses and assessments preserved.'}`,
      data: { teacher }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route PUT /api/v1/admin/teachers/:id/approval
 * @desc Approve or reject a teacher who signed in on an approved domain (manual approval step)
 */
router.put('/teachers/:id/approval', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'approved' | 'rejected'
    const uniId = req.user.university_id || 1;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ status: 'fail', message: 'Status must be either approved or rejected.' });
    }

    const isActive = status === 'approved';
    const result = await query(
      `UPDATE public.users 
       SET approval_status = $1, is_active = $2, updated_at = NOW()
       WHERE user_id = $3 AND (university_id = $4 OR university_id IS NULL) AND role = 'TEACHER'
       RETURNING user_id, name, email, approval_status, is_active`,
      [status, isActive, id, uniId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'fail', message: 'Teacher not found.' });
    }

    const teacher = result.rows[0];
    await logAudit(req, status === 'approved' ? 'APPROVE_TEACHER' : 'REJECT_TEACHER', 'USER', id, {
      teacher_name: teacher.name, teacher_email: teacher.email, status
    });

    // Notify teacher via email
    await sendTeacherApprovalNotification({
      to: teacher.email,
      teacherName: teacher.name,
      approved: isActive,
      universityName: req.user.university_name || 'AutoQuiz Pro University'
    });

    res.status(200).json({
      status: 'success',
      message: `Teacher ${teacher.name} has been ${status}. ${isActive ? 'Account unlocked.' : 'Registration rejected.'}`,
      data: { teacher }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route PUT /api/v1/admin/teachers/:id/department
 * @desc Assign a teacher to a department
 */
router.put('/teachers/:id/department', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { department_id } = req.body;
    const uniId = req.user.university_id || 1;

    const result = await query(
      `UPDATE public.users SET department_id = $1, updated_at = NOW()
       WHERE user_id = $2 AND (university_id = $3 OR university_id IS NULL) AND role = 'TEACHER'
       RETURNING user_id, name, email, department_id`,
      [department_id ? parseInt(department_id, 10) : null, id, uniId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'fail', message: 'Teacher not found.' });
    }

    await logAudit(req, 'ASSIGN_DEPARTMENT', 'USER', id, { department_id });

    res.status(200).json({
      status: 'success',
      message: 'Department assignment updated.',
      data: { teacher: result.rows[0] }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/admin/teachers/transfer
 * @desc Transfer a leaving teacher’s courses and assessments to another teacher
 */
router.post('/teachers/transfer', async (req, res, next) => {
  try {
    const { fromTeacherId, toTeacherId } = req.body;
    const uniId = req.user.university_id || 1;

    if (!fromTeacherId || !toTeacherId) {
      return res.status(400).json({ status: 'fail', message: 'Source teacher and destination teacher are both required.' });
    }

    if (parseInt(fromTeacherId, 10) === parseInt(toTeacherId, 10)) {
      return res.status(400).json({ status: 'fail', message: 'Source and destination teacher cannot be the same person.' });
    }

    // Verify both teachers
    const [fromRes, toRes] = await Promise.all([
      query('SELECT user_id, name, email FROM public.users WHERE user_id = $1 AND role = $2', [fromTeacherId, 'TEACHER']),
      query('SELECT user_id, name, email FROM public.users WHERE user_id = $1 AND role = $2', [toTeacherId, 'TEACHER'])
    ]);

    if (fromRes.rows.length === 0) {
      return res.status(404).json({ status: 'fail', message: 'Source teacher not found.' });
    }
    if (toRes.rows.length === 0) {
      return res.status(404).json({ status: 'fail', message: 'Destination teacher not found.' });
    }

    const fromTeacher = fromRes.rows[0];
    const toTeacher = toRes.rows[0];

    // Transfer courses
    const courseUpdate = await query(
      `UPDATE public.courses SET user_id = $1 WHERE user_id = $2 RETURNING course_id`,
      [toTeacherId, fromTeacherId]
    );

    // Transfer assessments
    const assessmentUpdate = await query(
      `UPDATE public.assessments SET created_by = $1 WHERE created_by = $2 RETURNING assessment_id`,
      [toTeacherId, fromTeacherId]
    );

    const transferredCourses = courseUpdate.rowCount || courseUpdate.rows.length;
    const transferredAssessments = assessmentUpdate.rowCount || assessmentUpdate.rows.length;

    await logAudit(req, 'TRANSFER_TEACHER_WORKLOAD', 'USER', toTeacherId, {
      from_teacher_id: fromTeacherId,
      from_teacher_name: fromTeacher.name,
      to_teacher_id: toTeacherId,
      to_teacher_name: toTeacher.name,
      transferred_courses: transferredCourses,
      transferred_assessments: transferredAssessments
    });

    res.status(200).json({
      status: 'success',
      message: `Successfully transferred ${transferredCourses} course(s) and ${transferredAssessments} assessment(s) from ${fromTeacher.name} to ${toTeacher.name}.`,
      data: {
        fromTeacher: fromTeacher.name,
        toTeacher: toTeacher.name,
        transferredCourses,
        transferredAssessments
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/admin/teachers/bulk-invite
 * @desc Bulk-invite teachers from a CSV file of emails
 */
router.post('/teachers/bulk-invite', upload.single('file'), async (req, res, next) => {
  try {
    let emails = [];
    const expiresIn = req.body.expiresIn || '1d';

    if (req.file) {
      const content = req.file.buffer.toString('utf-8');
      const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        const parts = line.split(',').map(p => p.trim().replace(/^["']|["']$/g, ''));
        for (const p of parts) {
          if (p.includes('@') && p.includes('.')) {
            emails.push(p.toLowerCase());
          }
        }
      }
    } else if (req.body.emails) {
      emails = (Array.isArray(req.body.emails) ? req.body.emails : req.body.emails.split(','))
        .map(e => e.trim().toLowerCase())
        .filter(e => e.includes('@'));
    }

    emails = [...new Set(emails)];

    if (emails.length === 0) {
      return res.status(400).json({ status: 'fail', message: 'No valid teacher emails found in the uploaded CSV or list.' });
    }

    let durationMs = 24 * 60 * 60 * 1000;
    let expiryLabel = '1 Day';
    if (expiresIn === '1h') { durationMs = 1 * 60 * 60 * 1000; expiryLabel = '1 Hour'; }
    else if (expiresIn === '5h') { durationMs = 5 * 60 * 60 * 1000; expiryLabel = '5 Hours'; }

    const expiresAt = new Date(Date.now() + durationMs);
    const createdInvitations = [];
    const errors = [];

    for (const email of emails) {
      try {
        const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
        const code = `TCH-${randomHex}-${Date.now().toString().slice(-4)}`;

        const ins = await query(
          `INSERT INTO public.invitations (code, role, university_id, created_by, expires_at, target_email)
           VALUES ($1, 'TEACHER', $2, $3, $4, $5)
           RETURNING invitation_id, code, role, target_email, expires_at, created_at`,
          [code, req.user.university_id, req.user.user_id, expiresAt, email]
        );

        await sendTeacherInvitationEmail({
          to: email,
          inviteCode: code,
          expiresInLabel: expiryLabel,
          expiresAt,
          universityName: req.user.university_name || 'AutoQuiz Pro University'
        });

        createdInvitations.push(ins.rows[0]);
      } catch (err) {
        errors.push({ email, error: err.message });
      }
    }

    await logAudit(req, 'BULK_INVITE_TEACHERS', 'INVITATIONS', null, {
      total_emails: emails.length,
      successful: createdInvitations.length,
      failed: errors.length
    });

    res.status(200).json({
      status: 'success',
      message: `Bulk invite completed: ${createdInvitations.length} teacher invitation(s) created and dispatched (valid for ${expiryLabel}).`,
      data: {
        total: emails.length,
        invitedCount: createdInvitations.length,
        invitations: createdInvitations,
        errors
      }
    });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. STUDENT MANAGEMENT
//    Privacy: Admins can see student accounts, enrollment, and status.
//    Admins CANNOT see student marks, answers, or assessment submissions.
//    Marks stay visible to the student and the course's teacher only.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @route GET /api/v1/admin/students
 * @desc List/search students with enrolled course count, status filter, last sign-in
 * @query search - name or email substring
 * @query status - 'ALL' | 'ACTIVE' | 'INACTIVE'
 */
router.get('/students', async (req, res, next) => {
  try {
    const uniId = req.user.university_id || 1;
    const { search, status, department_id, course_id } = req.query;

    let sql = `SELECT u.user_id, u.name, u.email, u.is_active, u.email_verified,
                      u.last_sign_in, u.created_at, u.auth_provider, u.department_id,
                      d.name as department_name, d.code as department_code,
                      (SELECT COUNT(*)::int FROM public.students s
                       JOIN public.courses c ON s.course_id = c.course_id
                       WHERE s.email = u.email AND (c.university_id = $1 OR c.university_id IS NULL)) as enrolled_courses,
                      COALESCE((
                        SELECT json_agg(json_build_object(
                          'course_id', c.course_id,
                          'course_name', c.course_name,
                          'course_code', c.course_code,
                          'department_id', c.department_id,
                          'department_name', cd.name
                        ))
                        FROM public.students sc
                        JOIN public.courses c ON sc.course_id = c.course_id
                        LEFT JOIN public.departments cd ON c.department_id = cd.department_id
                        WHERE sc.email = u.email AND (c.university_id = $1 OR c.university_id IS NULL)
                      ), '[]'::json) as courses
               FROM public.users u
               LEFT JOIN public.departments d ON u.department_id = d.department_id
               WHERE (u.university_id = $1 OR u.university_id IS NULL) AND u.role = 'STUDENT'`;
    const params = [uniId];

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
    }

    if (status === 'ACTIVE') {
      sql += ` AND u.is_active = TRUE`;
    } else if (status === 'INACTIVE') {
      sql += ` AND u.is_active = FALSE`;
    }

    if (course_id) {
      params.push(parseInt(course_id, 10));
      sql += ` AND EXISTS (
        SELECT 1 FROM public.students sf
        WHERE sf.email = u.email AND sf.course_id = $${params.length}
      )`;
    }

    if (department_id) {
      params.push(parseInt(department_id, 10));
      sql += ` AND (
        u.department_id = $${params.length}
        OR EXISTS (
          SELECT 1 FROM public.students sdf
          JOIN public.courses cdf ON sdf.course_id = cdf.course_id
          WHERE sdf.email = u.email AND cdf.department_id = $${params.length}
        )
      )`;
    }

    sql += ` ORDER BY u.name ASC LIMIT 200`;
    const result = await query(sql, params);

    res.status(200).json({ status: 'success', data: { students: result.rows } });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/admin/students/:id
 * @desc Get single student detail with enrolled courses (NO marks or answers)
 */
router.get('/students/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const uniId = req.user.university_id || 1;

    // Get student user info
    const userRes = await query(
      `SELECT u.user_id, u.name, u.email, u.is_active, u.email_verified,
              u.last_sign_in, u.created_at, u.auth_provider, u.avatar_url
       FROM public.users u
       WHERE u.user_id = $1 AND (u.university_id = $2 OR u.university_id IS NULL) AND u.role = 'STUDENT'`,
      [id, uniId]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ status: 'fail', message: 'Student not found.' });
    }

    // Get enrolled courses (course info only — NO marks, NO answers)
    const enrollRes = await query(
      `SELECT s.student_id, s.email as enrollment_email, s.name as enrollment_name, s.roll_number,
              c.course_id, c.course_name, c.course_code,
              t.name as teacher_name, t.email as teacher_email
       FROM public.students s
       JOIN public.courses c ON s.course_id = c.course_id
       LEFT JOIN public.users t ON c.user_id = t.user_id
       WHERE s.email = $1 AND (c.university_id = $2 OR c.university_id IS NULL)
       ORDER BY c.course_name ASC`,
      [userRes.rows[0].email, uniId]
    );

    // Check for possible duplicate accounts (same name, different email)
    const dupeRes = await query(
      `SELECT user_id, name, email, is_active, created_at
       FROM public.users
       WHERE LOWER(name) = LOWER($1) AND user_id != $2
         AND (university_id = $3 OR university_id IS NULL) AND role = 'STUDENT'
       LIMIT 5`,
      [userRes.rows[0].name, id, uniId]
    );

    res.status(200).json({
      status: 'success',
      data: {
        student: userRes.rows[0],
        enrollments: enrollRes.rows,
        possibleDuplicates: dupeRes.rows
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route PUT /api/v1/admin/students/:id/status
 * @desc Activate or deactivate a student
 */
router.put('/students/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;
    const uniId = req.user.university_id || 1;

    const result = await query(
      `UPDATE public.users SET is_active = $1, updated_at = NOW()
       WHERE user_id = $2 AND (university_id = $3 OR university_id IS NULL) AND role = 'STUDENT'
       RETURNING user_id, name, email, is_active`,
      [is_active, id, uniId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'fail', message: 'Student not found.' });
    }

    await logAudit(req, is_active ? 'ACTIVATE_STUDENT' : 'DEACTIVATE_STUDENT', 'USER', id, {
      student_name: result.rows[0].name
    });

    res.status(200).json({
      status: 'success',
      message: `Student ${result.rows[0].name} has been ${is_active ? 'activated' : 'deactivated'}.`,
      data: { student: result.rows[0] }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route PUT /api/v1/admin/students/:id/fix-enrollment
 * @desc Fix enrollment: update email, reassign course, or add student to a missing course
 */
router.put('/students/:id/fix-enrollment', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { correct_email, course_id, add_to_course_id, student_email } = req.body;
    const uniId = req.user.university_id || 1;
    const changes = [];

    // Fix 1: Update student enrollment record email (if teacher typed it wrong)
    if (correct_email) {
      await query(
        `UPDATE public.students SET email = $1 WHERE student_id = $2`,
        [correct_email.trim().toLowerCase(), id]
      );
      changes.push(`Email corrected to ${correct_email}`);
    }

    // Fix 2: Reassign to a different course
    if (course_id) {
      await query(
        `UPDATE public.students SET course_id = $1 WHERE student_id = $2`,
        [course_id, id]
      );
      changes.push(`Reassigned to course #${course_id}`);
    }

    // Fix 3: Add student to a course they can't see (create new enrollment row)
    if (add_to_course_id && student_email) {
      // Check course belongs to this university
      const courseCheck = await query(
        `SELECT course_id, course_name FROM public.courses WHERE course_id = $1 AND (university_id = $2 OR university_id IS NULL)`,
        [add_to_course_id, uniId]
      );
      if (courseCheck.rows.length === 0) {
        return res.status(404).json({ status: 'fail', message: 'Course not found in your institution.' });
      }

      // Check if already enrolled
      const existing = await query(
        `SELECT student_id FROM public.students WHERE email = $1 AND course_id = $2`,
        [student_email.trim().toLowerCase(), add_to_course_id]
      );
      if (existing.rows.length > 0) {
        return res.status(400).json({ status: 'fail', message: 'Student is already enrolled in this course.' });
      }

      // Get student name from users table
      const userCheck = await query(
        `SELECT name FROM public.users WHERE user_id = $1`,
        [id]
      );
      const studentName = userCheck.rows[0]?.name || 'Student';

      await query(
        `INSERT INTO public.students (email, name, course_id, university_id) VALUES ($1, $2, $3, $4)`,
        [student_email.trim().toLowerCase(), studentName, add_to_course_id, uniId]
      );
      changes.push(`Added to course "${courseCheck.rows[0].course_name}"`);
    }

    await logAudit(req, 'FIX_ENROLLMENT', 'STUDENT', id, { correct_email, course_id, add_to_course_id, changes });

    res.status(200).json({
      status: 'success',
      message: changes.length > 0 ? `Enrollment fixed: ${changes.join('; ')}` : 'No changes made.'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/admin/students/bulk-load
 * @desc Bulk-load student emails into a course (CSV file or pasted emails)
 */
router.post('/students/bulk-load', upload.single('file'), async (req, res, next) => {
  try {
    const uniId = req.user.university_id || 1;
    const { course_id, emails: emailsText } = req.body;

    if (!course_id) {
      return res.status(400).json({ status: 'fail', message: 'course_id is required.' });
    }

    // Verify course exists in this university
    const courseCheck = await query(
      `SELECT course_id, course_name FROM public.courses WHERE course_id = $1 AND (university_id = $2 OR university_id IS NULL)`,
      [course_id, uniId]
    );
    if (courseCheck.rows.length === 0) {
      return res.status(404).json({ status: 'fail', message: 'Course not found.' });
    }

    // Parse emails from CSV file or pasted text
    let emailList = [];

    if (req.file) {
      const csvContent = req.file.buffer.toString('utf-8');
      emailList = csvContent
        .split(/[\r\n,;]+/)
        .map(e => e.trim().toLowerCase())
        .filter(e => e && e.includes('@'));
    }

    if (emailsText) {
      const pasted = emailsText
        .split(/[\r\n,;]+/)
        .map(e => e.trim().toLowerCase())
        .filter(e => e && e.includes('@'));
      emailList = [...emailList, ...pasted];
    }

    // Deduplicate
    emailList = [...new Set(emailList)];

    if (emailList.length === 0) {
      return res.status(400).json({ status: 'fail', message: 'No valid emails provided.' });
    }

    let added = 0;
    let skipped = 0;
    const errors = [];

    for (const email of emailList) {
      try {
        // Check if already enrolled in this course
        const existing = await query(
          `SELECT student_id FROM public.students WHERE email = $1 AND course_id = $2`,
          [email, course_id]
        );
        if (existing.rows.length > 0) {
          skipped++;
          continue;
        }

        // Try to find name from users table
        const userRow = await query(
          `SELECT name FROM public.users WHERE email = $1`,
          [email]
        );
        const name = userRow.rows[0]?.name || email.split('@')[0];

        await query(
          `INSERT INTO public.students (email, name, course_id, university_id) VALUES ($1, $2, $3, $4)`,
          [email, name, course_id, uniId]
        );
        added++;
      } catch (e) {
        errors.push({ email, error: e.message });
      }
    }

    await logAudit(req, 'BULK_LOAD_STUDENTS', 'COURSE', course_id, {
      course_name: courseCheck.rows[0].course_name,
      total: emailList.length, added, skipped, errors: errors.length
    });

    res.status(200).json({
      status: 'success',
      message: `Bulk load complete: ${added} added, ${skipped} already enrolled, ${errors.length} errors.`,
      data: { added, skipped, total: emailList.length, errors: errors.slice(0, 10) }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/admin/students/merge
 * @desc Merge a duplicate student account: keep primary, transfer enrollments from secondary, then deactivate secondary
 */
router.post('/students/merge', async (req, res, next) => {
  try {
    const { primary_id, secondary_id } = req.body;
    const uniId = req.user.university_id || 1;

    if (!primary_id || !secondary_id || primary_id === secondary_id) {
      return res.status(400).json({ status: 'fail', message: 'Two different student IDs are required.' });
    }

    // Verify both are students in this university
    const [primaryRes, secondaryRes] = await Promise.all([
      query(`SELECT user_id, name, email FROM public.users WHERE user_id = $1 AND (university_id = $2 OR university_id IS NULL) AND role = 'STUDENT'`, [primary_id, uniId]),
      query(`SELECT user_id, name, email FROM public.users WHERE user_id = $1 AND (university_id = $2 OR university_id IS NULL) AND role = 'STUDENT'`, [secondary_id, uniId])
    ]);

    if (primaryRes.rows.length === 0) return res.status(404).json({ status: 'fail', message: 'Primary student not found.' });
    if (secondaryRes.rows.length === 0) return res.status(404).json({ status: 'fail', message: 'Secondary student not found.' });

    const primary = primaryRes.rows[0];
    const secondary = secondaryRes.rows[0];

    // Transfer enrollments from secondary email to primary email (skip duplicates)
    const secondaryEnrollments = await query(
      `SELECT student_id, course_id FROM public.students WHERE email = $1`,
      [secondary.email]
    );

    let transferred = 0;
    for (const enroll of secondaryEnrollments.rows) {
      // Check if primary already enrolled in this course
      const existing = await query(
        `SELECT student_id FROM public.students WHERE email = $1 AND course_id = $2`,
        [primary.email, enroll.course_id]
      );
      if (existing.rows.length === 0) {
        await query(
          `UPDATE public.students SET email = $1, name = $2 WHERE student_id = $3`,
          [primary.email, primary.name, enroll.student_id]
        );
        transferred++;
      }
    }

    // Deactivate the secondary account
    await query(
      `UPDATE public.users SET is_active = FALSE, updated_at = NOW() WHERE user_id = $1`,
      [secondary_id]
    );

    await logAudit(req, 'MERGE_STUDENT', 'USER', primary_id, {
      primary: { id: primary_id, email: primary.email },
      secondary: { id: secondary_id, email: secondary.email },
      transferred
    });

    res.status(200).json({
      status: 'success',
      message: `Merged "${secondary.name}" (${secondary.email}) into "${primary.name}" (${primary.email}). ${transferred} enrollment(s) transferred. Secondary account deactivated.`,
      data: { primary, secondary, transferred }
    });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. DEPARTMENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @route GET /api/v1/admin/departments
 */
router.get('/departments', async (req, res, next) => {
  try {
    const uniId = req.user.university_id || 1;
    const result = await query(
      `SELECT d.*,
              (SELECT COUNT(*)::int FROM public.users WHERE department_id = d.department_id) as user_count,
              (SELECT COUNT(*)::int FROM public.courses WHERE department_id = d.department_id) as course_count
       FROM public.departments d
       WHERE d.university_id = $1
       ORDER BY d.name ASC`,
      [uniId]
    );

    res.status(200).json({ status: 'success', data: { departments: result.rows } });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/admin/departments
 */
router.post('/departments', async (req, res, next) => {
  try {
    const { name, code } = req.body;
    const uniId = req.user.university_id || 1;

    if (!name || !code) {
      return res.status(400).json({ status: 'fail', message: 'Department name and code are required.' });
    }

    const result = await query(
      `INSERT INTO public.departments (university_id, name, code)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [uniId, name.trim(), code.trim().toUpperCase()]
    );

    await logAudit(req, 'CREATE_DEPARTMENT', 'DEPARTMENT', result.rows[0].department_id, { name, code });

    res.status(201).json({
      status: 'success',
      message: `Department "${name}" created successfully.`,
      data: { department: result.rows[0] }
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ status: 'fail', message: 'A department with this code already exists.' });
    }
    next(error);
  }
});

/**
 * @route PUT /api/v1/admin/departments/:id
 */
router.put('/departments/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, code, status } = req.body;
    const uniId = req.user.university_id || 1;

    const result = await query(
      `UPDATE public.departments SET 
        name = COALESCE($1, name),
        code = COALESCE($2, code),
        status = COALESCE($3, status),
        updated_at = NOW()
       WHERE department_id = $4 AND university_id = $5
       RETURNING *`,
      [name, code ? code.trim().toUpperCase() : null, status, id, uniId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'fail', message: 'Department not found.' });
    }

    await logAudit(req, 'UPDATE_DEPARTMENT', 'DEPARTMENT', id, { name, code, status });

    res.status(200).json({
      status: 'success',
      message: 'Department updated.',
      data: { department: result.rows[0] }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route DELETE /api/v1/admin/departments/:id
 * Archive a department (soft delete). Returns counts of related users and courses.
 */
router.delete('/departments/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const uniId = req.user.university_id || 1;
    // Count related entities
    const userCountRes = await query(`SELECT COUNT(*)::int AS cnt FROM public.users WHERE department_id = $1`, [id]);
    const courseCountRes = await query(`SELECT COUNT(*)::int AS cnt FROM public.courses WHERE department_id = $1`, [id]);
    // Archive by setting status to 'archived'
    const result = await query(`UPDATE public.departments SET status = 'archived', updated_at = NOW() WHERE department_id = $1 AND university_id = $2 RETURNING *`, [id, uniId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'fail', message: 'Department not found.' });
    }
    await logAudit(req, 'ARCHIVE_DEPARTMENT', 'DEPARTMENT', id, { userCount: userCountRes.rows[0].cnt, courseCount: courseCountRes.rows[0].cnt });
    res.status(200).json({
      status: 'success',
      message: 'Department archived.',
      data: {
        department: result.rows[0],
        relatedUsers: userCountRes.rows[0].cnt,
        relatedCourses: courseCountRes.rows[0].cnt
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/admin/departments/:id/members
 * @desc Get all teachers, courses, and students from a specific department
 */
router.get('/departments/:id/members', async (req, res, next) => {
  try {
    const { id } = req.params;
    const uniId = req.user.university_id || 1;

    // 1. Fetch Department
    const deptRes = await query(
      `SELECT * FROM public.departments WHERE department_id = $1 AND university_id = $2`,
      [id, uniId]
    );
    if (deptRes.rows.length === 0) {
      return res.status(404).json({ status: 'fail', message: 'Department not found.' });
    }

    // 2. Fetch Courses in this department
    const coursesRes = await query(
      `SELECT c.course_id, c.course_name, c.course_code, c.status, c.user_id as teacher_id,
              t.name as teacher_name, t.email as teacher_email,
              COUNT(s.student_id)::int as student_count
       FROM public.courses c
       LEFT JOIN public.users t ON c.user_id = t.user_id
       LEFT JOIN public.students s ON c.course_id = s.course_id
       WHERE c.department_id = $1 AND (c.university_id = $2 OR c.university_id IS NULL)
       GROUP BY c.course_id, c.course_name, c.course_code, c.status, c.user_id, t.name, t.email
       ORDER BY c.course_name ASC`,
      [id, uniId]
    );

    // 3. Fetch Teachers in this department (or teaching courses in this department)
    const teachersRes = await query(
      `SELECT DISTINCT u.user_id, u.name, u.email, u.is_active, u.approval_status,
              (SELECT COUNT(*)::int FROM public.courses WHERE user_id = u.user_id) as course_count,
              COALESCE((
                SELECT json_agg(json_build_object('course_id', tc.course_id, 'course_name', tc.course_name, 'course_code', tc.course_code))
                FROM public.courses tc
                WHERE tc.user_id = u.user_id AND tc.department_id = $1
              ), '[]'::json) as department_courses
       FROM public.users u
       LEFT JOIN public.courses c ON c.user_id = u.user_id
       WHERE (u.department_id = $1 OR c.department_id = $1)
         AND (u.university_id = $2 OR u.university_id IS NULL)
         AND u.role = 'TEACHER'
       ORDER BY u.name ASC`,
      [id, uniId]
    );

    // 4. Fetch Students in this department (or enrolled in courses in this department)
    const studentsRes = await query(
      `SELECT DISTINCT u.user_id, u.name, u.email, u.is_active, u.created_at,
              COALESCE((
                SELECT json_agg(json_build_object('course_id', c.course_id, 'course_name', c.course_name, 'course_code', c.course_code))
                FROM public.students sc
                JOIN public.courses c ON sc.course_id = c.course_id
                WHERE sc.email = u.email AND c.department_id = $1
              ), '[]'::json) as enrolled_dept_courses
       FROM public.users u
       WHERE (u.department_id = $1 OR EXISTS (
         SELECT 1 FROM public.students s
         JOIN public.courses c ON s.course_id = c.course_id
         WHERE s.email = u.email AND c.department_id = $1
       ))
       AND (u.university_id = $2 OR u.university_id IS NULL)
       AND u.role = 'STUDENT'
       ORDER BY u.name ASC`,
      [id, uniId]
    );

    res.status(200).json({
      status: 'success',
      data: {
        department: deptRes.rows[0],
        courses: coursesRes.rows,
        teachers: teachersRes.rows,
        students: studentsRes.rows
      }
    });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. COURSE MANAGEMENT (Enhanced)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @route GET /api/v1/admin/courses
 */
router.get('/courses', async (req, res, next) => {
  try {
    const uniId = req.user.university_id || 1;
    const { search, department_id, teacher_id, status: courseStatus } = req.query;

    let sql = `SELECT 
        c.course_id, c.course_name, c.course_code, c.created_at, c.status,
        c.user_id as teacher_id, c.department_id,
        t.name as teacher_name, t.email as teacher_email,
        d.name as department_name, d.code as department_code,
        COUNT(s.student_id)::int as student_count
       FROM public.courses c
       LEFT JOIN public.users t ON c.user_id = t.user_id
       LEFT JOIN public.departments d ON c.department_id = d.department_id
       LEFT JOIN public.students s ON c.course_id = s.course_id
       WHERE (c.university_id = $1 OR c.university_id IS NULL)`;
    const params = [uniId];

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (c.course_name ILIKE $${params.length} OR c.course_code ILIKE $${params.length})`;
    }
    if (department_id) {
      params.push(parseInt(department_id));
      sql += ` AND c.department_id = $${params.length}`;
    }
    if (teacher_id) {
      params.push(parseInt(teacher_id));
      sql += ` AND c.user_id = $${params.length}`;
    }
    if (courseStatus) {
      params.push(courseStatus);
      sql += ` AND c.status = $${params.length}`;
    }

    sql += ` GROUP BY c.course_id, c.course_name, c.course_code, c.created_at, c.status,
             c.user_id, c.department_id, t.name, t.email, d.name, d.code
             ORDER BY c.course_id DESC`;

    const result = await query(sql, params);
    res.status(200).json({ status: 'success', data: { courses: result.rows } });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/admin/courses
 */
router.post('/courses', async (req, res, next) => {
  try {
    const { courseName, courseCode, teacherId, departmentId } = req.body;
    const uniId = req.user.university_id || 1;

    const course = await createUniversityCourse(uniId, {
      courseName,
      courseCode,
      teacherId: teacherId ? parseInt(teacherId, 10) : null,
      departmentId: departmentId ? parseInt(departmentId, 10) : null
    });

    await logAudit(req, 'CREATE_COURSE', 'COURSE', course.course_id, { courseName, courseCode, departmentId, teacherId });

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
 */
router.put('/courses/:id/assign', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { teacherId } = req.body;
    const uniId = req.user.university_id || 1;
    const resolvedTeacherId = teacherId ? parseInt(teacherId, 10) : null;

    const updated = await assignTeacherToCourse(uniId, id, resolvedTeacherId);
    await logAudit(req, 'REASSIGN_COURSE', 'COURSE', id, { new_teacher_id: resolvedTeacherId });

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
 * @route DELETE /api/v1/admin/courses/:id
 * Delete a course. Returns warning info about related students and assessments.
 */
router.delete('/courses/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const uniId = req.user.university_id || 1;
    const courseRes = await query(`SELECT * FROM public.courses WHERE course_id = $1 AND university_id = $2`, [id, uniId]);
    if (courseRes.rows.length === 0) {
      return res.status(404).json({ status: 'fail', message: 'Course not found.' });
    }
    const studentCountRes = await query(`SELECT COUNT(*)::int AS cnt FROM public.students WHERE course_id = $1`, [id]);
    const assessmentCountRes = await query(`SELECT COUNT(*)::int AS cnt FROM public.assessments WHERE course_id = $1`, [id]);
    await query(`DELETE FROM public.courses WHERE course_id = $1`, [id]);
    await logAudit(req, 'DELETE_COURSE', 'COURSE', id, { studentCount: studentCountRes.rows[0].cnt, assessmentCount: assessmentCountRes.rows[0].cnt });
    res.status(200).json({
      status: 'success',
      message: 'Course deleted.',
      data: { deletedCourseId: id, relatedStudents: studentCountRes.rows[0].cnt, relatedAssessments: assessmentCountRes.rows[0].cnt }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route PUT /api/v1/admin/courses/:id/department
 */
router.put('/courses/:id/department', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { department_id } = req.body;
    const uniId = req.user.university_id || 1;

    const result = await query(
      `UPDATE public.courses SET department_id = $1
       WHERE course_id = $2 AND (university_id = $3 OR university_id IS NULL)
       RETURNING *`,
      [department_id || null, id, uniId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'fail', message: 'Course not found.' });
    }

    await logAudit(req, 'ASSIGN_COURSE_DEPARTMENT', 'COURSE', id, { department_id });

    res.status(200).json({
      status: 'success',
      message: 'Course department updated.',
      data: { course: result.rows[0] }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route PUT /api/v1/admin/courses/:id/status
 * @desc Archive or restore a course
 */
router.put('/courses/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status: courseStatus } = req.body;
    const uniId = req.user.university_id || 1;

    if (!['active', 'archived', 'deleted'].includes(courseStatus)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid course status.' });
    }

    // Get warning data before archiving
    let warning = null;
    if (courseStatus === 'deleted' || courseStatus === 'archived') {
      const warnRes = await query(
        `SELECT 
          (SELECT COUNT(*)::int FROM public.students WHERE course_id = $1) as student_count`,
        [id]
      );
      warning = warnRes.rows[0];
    }

    const result = await query(
      `UPDATE public.courses SET status = $1
       WHERE course_id = $2 AND (university_id = $3 OR university_id IS NULL)
       RETURNING *`,
      [courseStatus, id, uniId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'fail', message: 'Course not found.' });
    }

    await logAudit(req, `COURSE_${courseStatus.toUpperCase()}`, 'COURSE', id, { warning });

    res.status(200).json({
      status: 'success',
      message: `Course ${courseStatus === 'active' ? 'restored' : courseStatus}.`,
      data: { course: result.rows[0], warning }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/admin/courses/:id/roster
 * @desc Get assigned teacher and enrolled students for a specific course
 */
router.get('/courses/:id/roster', async (req, res, next) => {
  try {
    const { id } = req.params;
    const uniId = req.user.university_id || 1;

    // 1. Get Course Info
    const courseRes = await query(
      `SELECT c.course_id, c.course_name, c.course_code, c.status, c.created_at,
              c.user_id as teacher_id, c.department_id,
              t.name as teacher_name, t.email as teacher_email,
              d.name as department_name, d.code as department_code
       FROM public.courses c
       LEFT JOIN public.users t ON c.user_id = t.user_id
       LEFT JOIN public.departments d ON c.department_id = d.department_id
       WHERE c.course_id = $1 AND (c.university_id = $2 OR c.university_id IS NULL)`,
      [id, uniId]
    );

    if (courseRes.rows.length === 0) {
      return res.status(404).json({ status: 'fail', message: 'Course not found.' });
    }

    // 2. Get Enrolled Students for this course
    const studentsRes = await query(
      `SELECT s.student_id, s.name as enrolled_name, s.email, s.roll_number, s.created_at,
              u.user_id, u.name as user_name, u.is_active, u.last_sign_in
       FROM public.students s
       LEFT JOIN public.users u ON LOWER(s.email) = LOWER(u.email)
       WHERE s.course_id = $1
       ORDER BY COALESCE(u.name, s.name) ASC`,
      [id]
    );

    res.status(200).json({
      status: 'success',
      data: {
        course: courseRes.rows[0],
        teacher: courseRes.rows[0].teacher_id ? {
          user_id: courseRes.rows[0].teacher_id,
          name: courseRes.rows[0].teacher_name,
          email: courseRes.rows[0].teacher_email
        } : null,
        students: studentsRes.rows
      }
    });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. INVITATIONS (Enhanced)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @route POST /api/v1/admin/invitations
 * @desc Create single-use invitation code (1h, 5h, 1d expiry) optionally bound to email with email notification
 */
router.post('/invitations', async (req, res, next) => {
  try {
    const { role = 'TEACHER', expiresIn = '1d', targetEmail } = req.body;

    if (!['ADMIN', 'TEACHER'].includes(role)) {
      return res.status(400).json({ status: 'fail', message: 'Role must be either TEACHER or ADMIN.' });
    }

    const prefix = role === 'ADMIN' ? 'ADM' : 'TCH';
    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
    const code = `${prefix}-${randomHex}-${Date.now().toString().slice(-4)}`;

    // Expiry options: 1 hour, 5 hours, 1 day
    let durationMs = 24 * 60 * 60 * 1000;
    let expiryLabel = '1 Day';

    if (expiresIn === '1h' || expiresIn === 1 || expiresIn === '1 hour') {
      durationMs = 1 * 60 * 60 * 1000;
      expiryLabel = '1 Hour';
    } else if (expiresIn === '5h' || expiresIn === 5 || expiresIn === '5 hours') {
      durationMs = 5 * 60 * 60 * 1000;
      expiryLabel = '5 Hours';
    } else if (expiresIn === '1d' || expiresIn === 24 || expiresIn === '1 day') {
      durationMs = 24 * 60 * 60 * 1000;
      expiryLabel = '1 Day';
    }

    const expiresAt = new Date(Date.now() + durationMs);
    const normalizedEmail = targetEmail ? targetEmail.trim().toLowerCase() : null;

    const insertRes = await query(
      `INSERT INTO public.invitations (code, role, university_id, created_by, expires_at, target_email)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING invitation_id, code, role, university_id, created_by, expires_at, used_at, target_email, created_at`,
      [code, role, req.user.university_id, req.user.user_id, expiresAt, normalizedEmail]
    );

    const invitation = insertRes.rows[0];

    // Send invitation email if email is provided
    let emailStatus = null;
    if (normalizedEmail) {
      emailStatus = await sendTeacherInvitationEmail({
        to: normalizedEmail,
        inviteCode: code,
        expiresInLabel: expiryLabel,
        expiresAt,
        universityName: req.user.university_name || 'AutoQuiz Pro University'
      });
    }

    await logAudit(req, 'CREATE_INVITATION', 'INVITATION', invitation.invitation_id, {
      code, role, target_email: normalizedEmail, expires_in: expiryLabel
    });

    res.status(201).json({
      status: 'success',
      message: normalizedEmail
        ? `Invitation code generated and dispatched to ${normalizedEmail} (valid for ${expiryLabel}).`
        : `Single-use invitation code generated (valid for ${expiryLabel}).`,
      data: {
        invitation,
        expiryLabel,
        emailSent: emailStatus?.success ?? false
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/admin/invitations
 * @desc Get all invitations with pending, used, and expired status
 */
router.get('/invitations', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT 
        i.invitation_id, i.code, i.role, i.expires_at, i.used_at, i.target_email,
        (i.used_at IS NOT NULL) AS is_used,
        (i.used_at IS NULL AND i.expires_at < NOW()) AS is_expired,
        CASE
          WHEN i.used_at IS NOT NULL THEN 'used'
          WHEN i.expires_at < NOW() THEN 'expired'
          ELSE 'pending'
        END AS status,
        u_creator.name AS created_by_name,
        u_used.name AS used_by_name,
        u_used.email AS used_by_email,
        i.created_at
       FROM public.invitations i
       LEFT JOIN public.users u_creator ON i.created_by = u_creator.user_id
       LEFT JOIN public.users u_used ON i.used_by = u_used.user_id
       WHERE (i.university_id = $1 OR i.university_id IS NULL)
       ORDER BY i.invitation_id DESC`,
      [req.user.university_id]
    );

    res.status(200).json({ status: 'success', data: { invitations: result.rows } });
  } catch (error) {
    next(error);
  }
});

/**
 * @route DELETE /api/v1/admin/invitations/:id
 * @desc Revoke an unused invitation
 */
router.delete('/invitations/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const check = await query(
      'SELECT used_at, code, target_email FROM public.invitations WHERE invitation_id = $1 AND (university_id = $2 OR university_id IS NULL)',
      [id, req.user.university_id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ status: 'fail', message: 'Invitation not found.' });
    }
    if (check.rows[0].used_at !== null) {
      return res.status(400).json({ status: 'fail', message: 'Cannot revoke an invitation that has already been redeemed.' });
    }

    await query('DELETE FROM public.invitations WHERE invitation_id = $1', [id]);
    await logAudit(req, 'REVOKE_INVITATION', 'INVITATION', id, { code: check.rows[0].code, target_email: check.rows[0].target_email });

    res.status(200).json({ status: 'success', message: `Invitation ${check.rows[0].code} has been revoked.` });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/admin/invitations/:id/resend
 * @desc Resend invitation: refresh expiry (1h, 5h, 1d) and re-dispatch email
 */
router.post('/invitations/:id/resend', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { expiresIn = '1d' } = req.body;

    let durationMs = 24 * 60 * 60 * 1000;
    let expiryLabel = '1 Day';
    if (expiresIn === '1h') { durationMs = 1 * 60 * 60 * 1000; expiryLabel = '1 Hour'; }
    else if (expiresIn === '5h') { durationMs = 5 * 60 * 60 * 1000; expiryLabel = '5 Hours'; }

    const expiresAt = new Date(Date.now() + durationMs);

    const result = await query(
      `UPDATE public.invitations 
       SET expires_at = $1
       WHERE invitation_id = $2 AND (university_id = $3 OR university_id IS NULL) AND used_at IS NULL
       RETURNING *`,
      [expiresAt, id, req.user.university_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'fail', message: 'Invitation not found or already redeemed.' });
    }

    const invitation = result.rows[0];

    let emailSent = false;
    if (invitation.target_email) {
      const emailRes = await sendTeacherInvitationEmail({
        to: invitation.target_email,
        inviteCode: invitation.code,
        expiresInLabel: expiryLabel,
        expiresAt,
        universityName: req.user.university_name || 'AutoQuiz Pro University'
      });
      emailSent = emailRes?.success ?? false;
    }

    await logAudit(req, 'RESEND_INVITATION', 'INVITATION', id, { target_email: invitation.target_email, expires_in: expiryLabel });

    res.status(200).json({
      status: 'success',
      message: invitation.target_email
        ? `Invitation resent to ${invitation.target_email} (valid for ${expiryLabel}).`
        : `Invitation expiry extended by ${expiryLabel}.`,
      data: { invitation, emailSent, expiryLabel }
    });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. USER DIRECTORY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @route GET /api/v1/admin/users
 */
router.get('/users', async (req, res, next) => {
  try {
    const uniId = req.user.university_id || 1;
    const { search, role, status } = req.query;

    let sql = `SELECT u.user_id, u.name, u.email, u.role, u.is_active, u.auth_provider,
                      u.avatar_url, u.department_id, u.last_sign_in, u.created_at, u.updated_at,
                      d.name as department_name
               FROM public.users u
               LEFT JOIN public.departments d ON u.department_id = d.department_id
               WHERE (u.university_id = $1 OR u.university_id IS NULL)`;
    const params = [uniId];

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
    }
    if (role) {
      params.push(role);
      sql += ` AND u.role = $${params.length}`;
    }
    if (status === 'active') sql += ` AND u.is_active = TRUE`;
    if (status === 'inactive') sql += ` AND u.is_active = FALSE`;

    sql += ` ORDER BY u.user_id DESC`;
    const result = await query(sql, params);

    res.status(200).json({ status: 'success', data: { users: result.rows } });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. ADMINISTRATORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @route GET /api/v1/admin/administrators
 */
router.get('/administrators', async (req, res, next) => {
  try {
    const admins = await query(
      `SELECT user_id, name, email, created_at, is_active, last_sign_in
       FROM public.users
       WHERE university_id = $1 AND role = 'ADMIN'
       ORDER BY created_at ASC`,
      [req.user.university_id]
    );
    res.status(200).json({ status: 'success', data: { administrators: admins.rows } });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/admin/create-admin
 */
router.post('/create-admin', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ status: 'fail', message: 'Name, email, and password are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ status: 'fail', message: 'Password must be at least 8 characters.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await query('SELECT user_id FROM public.users WHERE email = $1', [normalizedEmail]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ status: 'fail', message: 'A user with this email already exists.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const insertRes = await query(
      `INSERT INTO public.users (name, email, password_hash, role, is_active, university_id, auth_provider, email_verified, created_at, updated_at)
       VALUES ($1, $2, $3, 'ADMIN', TRUE, $4, 'email', TRUE, NOW(), NOW())
       RETURNING user_id, name, email, role, university_id, created_at`,
      [name.trim(), normalizedEmail, passwordHash, req.user.university_id]
    );

    await logAudit(req, 'CREATE_ADMIN', 'USER', insertRes.rows[0].user_id, { admin_email: normalizedEmail });

    res.status(201).json({
      status: 'success',
      message: `New administrator "${name}" created successfully.`,
      data: { admin: insertRes.rows[0] }
    });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. APPROVED DOMAINS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @route GET /api/v1/admin/approved-domains
 */
router.get('/approved-domains', async (req, res, next) => {
  try {
    const uniId = req.user.university_id || 1;
    const result = await query(
      `SELECT * FROM public.approved_domains WHERE university_id = $1 ORDER BY domain ASC`,
      [uniId]
    );
    res.status(200).json({ status: 'success', data: { domains: result.rows } });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/admin/approved-domains
 */
router.post('/approved-domains', async (req, res, next) => {
  try {
    const { domain, role_scope = 'STUDENT' } = req.body;
    const uniId = req.user.university_id || 1;

    if (!domain) {
      return res.status(400).json({ status: 'fail', message: 'Domain is required.' });
    }

    const result = await query(
      `INSERT INTO public.approved_domains (university_id, domain, role_scope)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [uniId, domain.trim().toLowerCase(), role_scope]
    );

    await logAudit(req, 'ADD_APPROVED_DOMAIN', 'DOMAIN', result.rows[0].domain_id, { domain, role_scope });

    res.status(201).json({
      status: 'success',
      message: `Domain "${domain}" approved for ${role_scope} sign-ups.`,
      data: { domain: result.rows[0] }
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ status: 'fail', message: 'This domain is already approved for this role.' });
    }
    next(error);
  }
});

/**
 * @route DELETE /api/v1/admin/approved-domains/:id
 */
router.delete('/approved-domains/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const uniId = req.user.university_id || 1;

    const result = await query(
      `DELETE FROM public.approved_domains WHERE domain_id = $1 AND university_id = $2 RETURNING *`,
      [id, uniId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'fail', message: 'Domain not found.' });
    }

    await logAudit(req, 'REMOVE_APPROVED_DOMAIN', 'DOMAIN', id, { domain: result.rows[0].domain });

    res.status(200).json({ status: 'success', message: 'Domain removed from approved list.' });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. AUDIT LOG
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @route GET /api/v1/admin/audit-log
 */
router.get('/audit-log', async (req, res, next) => {
  try {
    const uniId = req.user.university_id || 1;
    const { limit = 100, offset = 0 } = req.query;

    const result = await query(
      `SELECT al.*, u.name as admin_name, u.email as admin_email
       FROM public.admin_audit_log al
       LEFT JOIN public.users u ON al.admin_user_id = u.user_id
       WHERE al.university_id = $1
       ORDER BY al.created_at DESC
       LIMIT $2 OFFSET $3`,
      [uniId, parseInt(limit), parseInt(offset)]
    );

    const countRes = await query(
      `SELECT COUNT(*)::int as total FROM public.admin_audit_log WHERE university_id = $1`,
      [uniId]
    );

    res.status(200).json({
      status: 'success',
      data: { logs: result.rows, total: countRes.rows[0].total }
    });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11. SIGN-IN ACTIVITY LOG
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @route GET /api/v1/admin/sign-in-log
 */
router.get('/sign-in-log', async (req, res, next) => {
  try {
    const uniId = req.user.university_id || 1;
    const { limit = 100 } = req.query;

    const result = await query(
      `SELECT sl.*, u.name as user_name
       FROM public.sign_in_log sl
       LEFT JOIN public.users u ON sl.user_id = u.user_id
       WHERE sl.university_id = $1
       ORDER BY sl.created_at DESC
       LIMIT $2`,
      [uniId, parseInt(limit)]
    );

    res.status(200).json({ status: 'success', data: { logs: result.rows } });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 12. AI USAGE & SYSTEM HEALTH
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @route GET /api/v1/admin/ai-usage
 */
router.get('/ai-usage', async (req, res, next) => {
  try {
    const uniId = req.user.university_id || 1;

    // Summary stats
    const summaryRes = await query(
      `SELECT 
        COUNT(*)::int as total_requests,
        COUNT(*) FILTER (WHERE request_type = 'generation')::int as generation_requests,
        COUNT(*) FILTER (WHERE request_type = 'marking')::int as marking_requests,
        COUNT(*) FILTER (WHERE success = FALSE)::int as failed_requests,
        ROUND(AVG(duration_ms))::int as avg_duration_ms,
        SUM(tokens_used)::int as total_tokens
       FROM public.ai_usage_log
       WHERE university_id = $1 AND created_at >= NOW() - INTERVAL '30 days'`,
      [uniId]
    );

    // Daily breakdown (last 14 days)
    const dailyRes = await query(
      `SELECT 
        DATE(created_at) as date,
        COUNT(*)::int as requests,
        COUNT(*) FILTER (WHERE success = FALSE)::int as failures,
        ROUND(AVG(duration_ms))::int as avg_ms
       FROM public.ai_usage_log
       WHERE university_id = $1 AND created_at >= NOW() - INTERVAL '14 days'
       GROUP BY DATE(created_at)
       ORDER BY DATE(created_at)`,
      [uniId]
    );

    // Per teacher usage
    const perTeacherRes = await query(
      `SELECT u.name, u.email, COUNT(*)::int as requests,
              COUNT(*) FILTER (WHERE al.success = FALSE)::int as failures,
              SUM(al.tokens_used)::int as tokens
       FROM public.ai_usage_log al
       JOIN public.users u ON al.user_id = u.user_id
       WHERE al.university_id = $1 AND al.created_at >= NOW() - INTERVAL '30 days'
       GROUP BY u.name, u.email
       ORDER BY requests DESC
       LIMIT 20`,
      [uniId]
    );

    // Recent failures
    const failuresRes = await query(
      `SELECT al.*, u.name as user_name
       FROM public.ai_usage_log al
       LEFT JOIN public.users u ON al.user_id = u.user_id
       WHERE al.university_id = $1 AND al.success = FALSE
       ORDER BY al.created_at DESC
       LIMIT 20`,
      [uniId]
    );

    res.status(200).json({
      status: 'success',
      data: {
        summary: summaryRes.rows[0],
        daily: dailyRes.rows,
        perTeacher: perTeacherRes.rows,
        recentFailures: failuresRes.rows
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/admin/system-health
 */
router.get('/system-health', async (req, res, next) => {
  try {
    // Test DB connectivity
    let dbStatus = 'healthy';
    let dbLatencyMs = 0;
    try {
      const start = Date.now();
      await query('SELECT 1');
      dbLatencyMs = Date.now() - start;
    } catch {
      dbStatus = 'unhealthy';
    }

    res.status(200).json({
      status: 'success',
      data: {
        database: { status: dbStatus, latency_ms: dbLatencyMs },
        api: { status: 'healthy', uptime: process.uptime() },
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 13. SIGN-IN LOOKUP (Support)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @route GET /api/v1/admin/lookup-user
 * @desc Diagnose why a user cannot sign in
 */
router.get('/lookup-user', async (req, res, next) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ status: 'fail', message: 'Email is required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const uniId = req.user.university_id || 1;

    // Check if user exists
    const userRes = await query(
      `SELECT user_id, name, email, role, is_active, auth_provider, university_id, created_at, last_sign_in
       FROM public.users WHERE email = $1`,
      [normalizedEmail]
    );

    const issues = [];
    let userData = null;

    if (userRes.rows.length === 0) {
      issues.push({ type: 'NOT_FOUND', message: 'No account exists with this email address.' });

      // Check if it's a student in the students table but not registered
      const studentCheck = await query(
        `SELECT s.name, s.roll_number, c.course_name FROM public.students s
         JOIN public.courses c ON s.course_id = c.course_id
         WHERE s.email = $1`, [normalizedEmail]
      );
      if (studentCheck.rows.length > 0) {
        issues.push({
          type: 'ENROLLED_NOT_REGISTERED',
          message: `Student is enrolled in "${studentCheck.rows[0].course_name}" but hasn't created an account yet.`
        });
      }
    } else {
      userData = userRes.rows[0];

      if (!userData.is_active) {
        issues.push({ type: 'DEACTIVATED', message: 'Account is deactivated by an administrator.' });
      }

      // Check domain approval
      const emailDomain = normalizedEmail.split('@')[1];
      const domainCheck = await query(
        `SELECT * FROM public.approved_domains WHERE university_id = $1 AND domain = $2`,
        [uniId, emailDomain]
      );
      if (domainCheck.rows.length === 0) {
        issues.push({
          type: 'DOMAIN_NOT_APPROVED',
          message: `Email domain "${emailDomain}" is not in the approved domain list.`
        });
      }

      if (userData.university_id !== uniId) {
        issues.push({
          type: 'WRONG_UNIVERSITY',
          message: 'User is registered under a different university.'
        });
      }
    }

    // Recent sign-in attempts
    const signInRes = await query(
      `SELECT success, failure_reason, created_at
       FROM public.sign_in_log WHERE email = $1
       ORDER BY created_at DESC LIMIT 5`,
      [normalizedEmail]
    );

    res.status(200).json({
      status: 'success',
      data: {
        user: userData,
        issues: issues.length > 0 ? issues : [{ type: 'NO_ISSUES', message: 'No issues found.' }],
        recentSignIns: signInRes.rows
      }
    });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 14. PLATFORM REPORTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @route GET /api/v1/admin/reports
 */
router.get('/reports', async (req, res, next) => {
  try {
    const uniId = req.user.university_id || 1;

    const [totals, activeCourses, recentGrowth] = await Promise.all([
      query(
        `SELECT
          (SELECT COUNT(*)::int FROM public.users WHERE (university_id = $1 OR university_id IS NULL) AND role = 'TEACHER') as total_teachers,
          (SELECT COUNT(*)::int FROM public.users WHERE (university_id = $1 OR university_id IS NULL) AND role = 'STUDENT') as total_students,
          (SELECT COUNT(*)::int FROM public.courses WHERE (university_id = $1 OR university_id IS NULL)) as total_courses,
          (SELECT COUNT(*)::int FROM public.students WHERE (university_id = $1 OR university_id IS NULL)) as total_enrollments,
          (SELECT COUNT(*)::int FROM public.invitations WHERE university_id = $1) as total_invitations`,
        [uniId]
      ),
      query(
        `SELECT c.course_name, c.course_code, t.name as teacher_name,
                COUNT(s.student_id)::int as students,
                d.name as department_name
         FROM public.courses c
         LEFT JOIN public.users t ON c.user_id = t.user_id
         LEFT JOIN public.students s ON c.course_id = s.course_id
         LEFT JOIN public.departments d ON c.department_id = d.department_id
         WHERE (c.university_id = $1 OR c.university_id IS NULL) AND c.status = 'active'
         GROUP BY c.course_id, c.course_name, c.course_code, t.name, d.name
         ORDER BY students DESC
         LIMIT 10`,
        [uniId]
      ),
      query(
        `SELECT DATE(created_at) as date, COUNT(*)::int as new_users
         FROM public.users
         WHERE (university_id = $1 OR university_id IS NULL) AND created_at >= NOW() - INTERVAL '30 days'
         GROUP BY DATE(created_at) ORDER BY date`,
        [uniId]
      )
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        totals: totals.rows[0],
        mostActiveCourses: activeCourses.rows,
        userGrowth: recentGrowth.rows
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/admin/reports/export
 * @desc Export report as CSV
 */
router.get('/reports/export', async (req, res, next) => {
  try {
    const uniId = req.user.university_id || 1;
    const { type = 'users' } = req.query;

    let csvRows = [];

    if (type === 'users') {
      const result = await query(
        `SELECT user_id, name, email, role, is_active, auth_provider, created_at, last_sign_in
         FROM public.users WHERE (university_id = $1 OR university_id IS NULL)
         ORDER BY user_id`,
        [uniId]
      );
      csvRows = [
        'User ID,Name,Email,Role,Active,Auth Provider,Created,Last Sign-In',
        ...result.rows.map(r => `${r.user_id},"${r.name}","${r.email}",${r.role},${r.is_active},${r.auth_provider},${r.created_at},${r.last_sign_in || ''}`)
      ];
    } else if (type === 'courses') {
      const result = await query(
        `SELECT c.course_id, c.course_name, c.course_code, c.status, t.name as teacher_name,
                COUNT(s.student_id)::int as students
         FROM public.courses c
         LEFT JOIN public.users t ON c.user_id = t.user_id
         LEFT JOIN public.students s ON c.course_id = s.course_id
         WHERE (c.university_id = $1 OR c.university_id IS NULL)
         GROUP BY c.course_id, c.course_name, c.course_code, c.status, t.name
         ORDER BY c.course_id`,
        [uniId]
      );
      csvRows = [
        'Course ID,Name,Code,Status,Teacher,Students',
        ...result.rows.map(r => `${r.course_id},"${r.course_name}","${r.course_code || ''}",${r.status},"${r.teacher_name || 'Unassigned'}",${r.students}`)
      ];
    }

    const csvContent = csvRows.join('\n');

    await logAudit(req, 'EXPORT_REPORT', 'REPORT', null, { type });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${type}_report_${Date.now()}.csv"`);
    res.send(csvContent);
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 15. CSV BULK UPLOAD
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @route POST /api/v1/admin/upload-csv
 */
router.post('/upload-csv', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'fail', message: 'Please select a CSV file.' });
    }

    const csvContent = req.file.buffer.toString('utf-8');
    const result = await processUniversityCSV(req.user.university_id, req.user.user_id, csvContent);

    await logAudit(req, 'UPLOAD_CSV', 'CSV', null, {
      type: result.detectedType, processed: result.processed
    });

    res.status(200).json({
      status: 'success',
      message: `CSV processing complete (${result.detectedType}): ${result.processed} records processed.`,
      data: result
    });
  } catch (error) {
    res.status(400).json({ status: 'fail', message: error.message });
  }
});

export default router;
