import crypto from 'crypto';
import { query } from '../config/supabase.js';

/**
 * Universal robust CSV line parser
 */
export const parseCSV = (csvText) => {
  if (!csvText || typeof csvText !== 'string') return [];

  const lines = csvText.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];

  const parseLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]).map(h => h.toLowerCase().replace(/[\s_-]+/g, ''));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row);
  }

  return rows;
};

/**
 * Process uploaded CSV for university administration
 */
export const processUniversityCSV = async (universityId, adminUserId, csvContent) => {
  const rows = parseCSV(csvContent);
  if (rows.length === 0) {
    throw new Error('CSV file is empty or missing valid headers and data rows.');
  }

  const firstRow = rows[0];
  const keys = Object.keys(firstRow);

  const isCourses = keys.includes('coursename') || keys.includes('coursecode');
  const isStudents = keys.includes('rollnumber') || keys.includes('studentname');
  const isTeachers = keys.includes('teacheremail') || (keys.includes('name') && keys.includes('email') && !isStudents);

  const summary = {
    detectedType: isCourses ? 'COURSES' : (isStudents ? 'STUDENTS' : 'TEACHERS'),
    totalRows: rows.length,
    processed: 0,
    created: 0,
    updated: 0,
    invitationsGenerated: [],
    errors: []
  };

  if (isCourses) {
    // Process Course Import & Teacher Assignment
    for (const row of rows) {
      try {
        const courseName = row.coursename || row.name || 'Untitled Course';
        const courseCode = (row.coursecode || row.code || '').trim().toUpperCase();
        const teacherEmail = (row.teacheremail || row.email || '').trim().toLowerCase();

        let assignedTeacherId = null;

        // If teacher email provided, find or generate invite
        if (teacherEmail) {
          const teacherRes = await query(
            `SELECT user_id FROM public.users 
             WHERE email = $1 AND role = 'TEACHER' AND university_id = $2`,
            [teacherEmail, universityId]
          );

          if (teacherRes.rows.length > 0) {
            assignedTeacherId = teacherRes.rows[0].user_id;
          } else {
            // Generate single-use invitation for this teacher
            const code = `TCH-${courseCode || 'CRS'}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 60);

            await query(
              `INSERT INTO public.invitations (code, role, university_id, created_by, expires_at)
               VALUES ($1, 'TEACHER', $2, $3, $4)
               ON CONFLICT (code) DO NOTHING`,
              [code, universityId, adminUserId, expiresAt]
            );

            summary.invitationsGenerated.push({ email: teacherEmail, code, courseCode });
          }
        }

        // Upsert course
        const existingCourse = await query(
          `SELECT course_id FROM public.courses 
           WHERE university_id = $1 AND course_code = $2`,
          [universityId, courseCode]
        );

        if (existingCourse.rows.length > 0) {
          await query(
            `UPDATE public.courses 
             SET course_name = $1, user_id = COALESCE($2, user_id) 
             WHERE course_id = $3`,
            [courseName, assignedTeacherId, existingCourse.rows[0].course_id]
          );
          summary.updated++;
        } else {
          await query(
            `INSERT INTO public.courses (university_id, course_name, course_code, user_id)
             VALUES ($1, $2, $3, $4)`,
            [universityId, courseName, courseCode, assignedTeacherId]
          );
          summary.created++;
        }

        summary.processed++;
      } catch (err) {
        summary.errors.push(`Row error: ${err.message}`);
      }
    }
  } else if (isStudents) {
    // Process Student Roster Import
    for (const row of rows) {
      try {
        const name = row.name || row.studentname || 'Student';
        const rollNumber = (row.rollnumber || row.id || row.rollno || '').trim();
        const email = (row.email || '').trim().toLowerCase();
        const courseCode = (row.coursecode || row.course || '').trim().toUpperCase();

        if (!rollNumber) {
          throw new Error('Missing roll number');
        }

        // Find course in university
        let courseId = null;
        if (courseCode) {
          const cRes = await query(
            'SELECT course_id FROM public.courses WHERE university_id = $1 AND course_code = $2',
            [universityId, courseCode]
          );
          if (cRes.rows.length > 0) {
            courseId = cRes.rows[0].course_id;
          }
        }

        if (!courseId) {
          // If no course code or course not found, link to or create default course
          const fallbackCourse = await query(
            `SELECT course_id FROM public.courses WHERE university_id = $1 LIMIT 1`,
            [universityId]
          );
          if (fallbackCourse.rows.length > 0) {
            courseId = fallbackCourse.rows[0].course_id;
          } else {
            const newC = await query(
              `INSERT INTO public.courses (university_id, course_name, course_code) 
               VALUES ($1, 'General First Year Studies', 'GEN-101') RETURNING course_id`,
              [universityId]
            );
            courseId = newC.rows[0].course_id;
          }
        }

        // Insert student
        await query(
          `INSERT INTO public.students (university_id, course_id, name, roll_number, email)
           VALUES ($1, $2, $3, $4, $5)`,
          [universityId, courseId, name, rollNumber, email || null]
        );

        summary.created++;
        summary.processed++;
      } catch (err) {
        summary.errors.push(`Student row error: ${err.message}`);
      }
    }
  } else {
    // Teachers List -> Generate one-time invite codes in bulk
    for (const row of rows) {
      try {
        const name = row.name || 'Educator';
        const email = (row.email || '').trim().toLowerCase();
        const code = `TCH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 90);

        await query(
          `INSERT INTO public.invitations (code, role, university_id, created_by, expires_at)
           VALUES ($1, 'TEACHER', $2, $3, $4)`,
          [code, universityId, adminUserId, expiresAt]
        );

        summary.invitationsGenerated.push({ name, email, code });
        summary.created++;
        summary.processed++;
      } catch (err) {
        summary.errors.push(`Teacher invite error: ${err.message}`);
      }
    }
  }

  return summary;
};

/**
 * Get all courses for a university with assigned teacher and enrolled student counts
 */
export const getUniversityCourses = async (universityId) => {
  const targetUniId = universityId || 1;
  const res = await query(
    `SELECT 
      c.course_id,
      c.course_name,
      c.course_code,
      c.created_at,
      c.user_id as teacher_id,
      t.name as teacher_name,
      t.email as teacher_email,
      COUNT(s.student_id)::int as student_count
     FROM public.courses c
     LEFT JOIN public.users t ON c.user_id = t.user_id
     LEFT JOIN public.students s ON c.course_id = s.course_id
     WHERE c.university_id = $1 OR c.university_id IS NULL
     GROUP BY c.course_id, c.course_name, c.course_code, c.created_at, c.user_id, t.name, t.email
     ORDER BY c.course_id DESC`,
    [targetUniId]
  );
  return res.rows;
};

/**
 * Assign a teacher to a course
 */
export const assignTeacherToCourse = async (universityId, courseId, teacherId) => {
  const targetUniId = universityId || 1;
  const resolvedTeacherId = teacherId ? parseInt(teacherId, 10) : null;

  if (resolvedTeacherId) {
    const tCheck = await query(
      `SELECT user_id FROM public.users 
       WHERE user_id = $1 AND role = 'TEACHER'`,
      [resolvedTeacherId]
    );
    if (tCheck.rows.length === 0) {
      throw new Error('Selected teacher does not exist.');
    }
  }

  const res = await query(
    `UPDATE public.courses 
     SET user_id = $1, university_id = COALESCE(university_id, $3)
     WHERE course_id = $2
     RETURNING *`,
    [resolvedTeacherId, courseId, targetUniId]
  );

  if (res.rows.length === 0) {
    throw new Error('Course not found.');
  }

  return res.rows[0];
};

/**
 * Create a new course under a university
 */
export const createUniversityCourse = async (universityId, { courseName, courseCode, teacherId }) => {
  if (!courseName) throw new Error('Course name is required.');

  const targetUniId = universityId || 1;
  const resolvedTeacherId = teacherId ? parseInt(teacherId, 10) : null;

  const res = await query(
    `INSERT INTO public.courses (university_id, course_name, course_code, user_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [targetUniId, courseName.trim(), (courseCode || '').trim().toUpperCase() || null, resolvedTeacherId]
  );
  return res.rows[0];
};

/**
 * Get courses assigned to a teacher
 * If 0 courses, teacher will see the blank dashboard state
 */
export const getTeacherAssignedCourses = async (teacherId, universityId) => {
  const res = await query(
    `SELECT 
      c.course_id,
      c.course_name,
      c.course_code,
      c.created_at,
      COUNT(s.student_id)::int as student_count
     FROM public.courses c
     LEFT JOIN public.students s ON c.course_id = s.course_id
     WHERE c.user_id = $1
     GROUP BY c.course_id, c.course_name, c.course_code, c.created_at
     ORDER BY c.course_id DESC`,
    [teacherId]
  );
  return res.rows;
};
