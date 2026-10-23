import bcrypt from 'bcryptjs';
import { query } from '../config/supabase.js';

export const runSystemBootstrap = async () => {
  const log = [];

  try {
    // 1. Ensure Universities Exist
    await query(`
      INSERT INTO public.universities (university_id, name, code, domain, contact_email, website, is_active)
      VALUES 
        (1, 'Punjab Tianjin University of Technology', 'PTUT', 'ptut.edu.pk', 'admin@ptut.edu.pk', 'https://ptut.edu.pk', TRUE),
        (2, 'Global Academic Demo University', 'GLOBAL-EDU', 'edu', 'contact@global-edu.org', 'https://global-edu.org', TRUE)
      ON CONFLICT (domain) DO UPDATE SET is_active = TRUE
    `);
    log.push('Universities verified (PTUT & Global EDU).');

    // 2. Ensure Schema Compatibility
    await query(`
      ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT TRUE;
      ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
      ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) DEFAULT 'email';
      ALTER TABLE public.users ADD COLUMN IF NOT EXISTS university_id INTEGER;
      ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    `);

    // Ensure Assessments Table Exists
    await query(`
      CREATE TABLE IF NOT EXISTS public.assessments (
        assessment_id BIGSERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        course_id BIGINT,
        created_by BIGINT,
        total_marks INTEGER NOT NULL DEFAULT 100,
        passing_marks INTEGER NOT NULL DEFAULT 50,
        duration_minutes INTEGER NOT NULL DEFAULT 60,
        status VARCHAR(50) NOT NULL DEFAULT 'PUBLISHED',
        questions JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    log.push('Assessments table verified.');

    // 3. Hash Passwords
    const adminPasswordHash = await bcrypt.hash('AdminPassword123!', 10);
    const teacherPasswordHash = await bcrypt.hash('TeacherPassword123!', 10);
    const studentPasswordHash = await bcrypt.hash('StudentPassword123!', 10);

    // 4. Seed or Update PTUT Administrator
    const adminRes = await query(`
      INSERT INTO public.users (name, email, password_hash, role, is_active, university_id, auth_provider, email_verified)
      VALUES ('PTUT System Administrator', 'admin@ptut.edu.pk', $1, 'ADMIN', TRUE, 1, 'email', TRUE)
      ON CONFLICT (email) DO UPDATE 
      SET password_hash = $1, role = 'ADMIN', is_active = TRUE, university_id = 1, email_verified = TRUE
      RETURNING user_id, name, email, role
    `, [adminPasswordHash]);
    const adminUser = adminRes.rows[0];
    log.push(`Admin verified: ${adminUser.email} (ID: ${adminUser.user_id})`);

    // 5. Seed or Update Faculty Teacher
    const teacherRes = await query(`
      INSERT INTO public.users (name, email, password_hash, role, is_active, university_id, auth_provider, email_verified)
      VALUES ('Prof. Dr. Tariq Mahmood', 'teacher@ptut.edu.pk', $1, 'TEACHER', TRUE, 1, 'email', TRUE)
      ON CONFLICT (email) DO UPDATE 
      SET password_hash = $1, role = 'TEACHER', is_active = TRUE, university_id = 1, email_verified = TRUE
      RETURNING user_id, name, email, role
    `, [teacherPasswordHash]);
    const teacherUser = teacherRes.rows[0];
    log.push(`Teacher verified: ${teacherUser.email} (ID: ${teacherUser.user_id})`);

    // 6. Seed or Update Student User
    const studentRes = await query(`
      INSERT INTO public.users (name, email, password_hash, role, is_active, university_id, auth_provider, email_verified)
      VALUES ('Muhammad Ali', 'student@ptut.edu.pk', $1, 'STUDENT', TRUE, 1, 'email', TRUE)
      ON CONFLICT (email) DO UPDATE 
      SET password_hash = $1, role = 'STUDENT', is_active = TRUE, university_id = 1, email_verified = TRUE
      RETURNING user_id, name, email, role
    `, [studentPasswordHash]);
    const studentUser = studentRes.rows[0];
    log.push(`Student verified: ${studentUser.email} (ID: ${studentUser.user_id})`);

    // 7. Verify All Student Devices as pre-verified so they can log in seamlessly
    await query(`
      INSERT INTO public.user_devices (user_id, device_token, browser_info, is_verified, verified_at, last_login)
      VALUES ($1, 'universal_trusted_device', 'University Trusted Browser', TRUE, NOW(), NOW())
      ON CONFLICT (user_id, device_token) DO UPDATE SET is_verified = TRUE
    `, [studentUser.user_id]);

    // 8. Seed Teacher Invitation Code (if not already used)
    await query(`
      INSERT INTO public.invitations (code, role, university_id, created_by, expires_at)
      VALUES ('TEACHER-PTUT-2026', 'TEACHER', 1, $1, NOW() + INTERVAL '365 days')
      ON CONFLICT (code) DO NOTHING
    `, [adminUser.user_id]);
    log.push('Invitation code TEACHER-PTUT-2026 verified.');

    // 9. Seed Course assigned to Teacher
    const courseRes = await query(`
      SELECT course_id FROM public.courses WHERE university_id = 1 AND course_code = 'CS-301'
    `);
    let courseId;
    if (courseRes.rows.length === 0) {
      const newCourse = await query(`
        INSERT INTO public.courses (university_id, user_id, course_name, course_code, created_at)
        VALUES (1, $1, 'CS301 - Data Structures & Algorithms', 'CS-301', NOW())
        RETURNING course_id
      `, [teacherUser.user_id]);
      courseId = newCourse.rows[0].course_id;
    } else {
      courseId = courseRes.rows[0].course_id;
      await query(`UPDATE public.courses SET user_id = $1 WHERE course_id = $2`, [teacherUser.user_id, courseId]);
    }
    log.push(`Course CS-301 assigned to teacher (ID: ${courseId}).`);

    // 10. Seed Demo Assessment if empty
    const assessCount = await query(`SELECT COUNT(*) as cnt FROM public.assessments`);
    if (parseInt(assessCount.rows[0]?.cnt || '0', 10) === 0) {
      await query(`
        INSERT INTO public.assessments (title, description, course_id, created_by, total_marks, passing_marks, duration_minutes, status, questions, created_at)
        VALUES (
          'Data Structures Midterm Examination 2026',
          'Comprehensive midterm assessment covering asymptotic notation, linked lists, stacks, queues, binary search trees, and graphs.',
          $1,
          $2,
          100,
          50,
          60,
          'PUBLISHED',
          '[
            {
              "id": 1,
              "question": "What is the worst-case time complexity of searching in an unbalanced Binary Search Tree?",
              "options": ["O(1)", "O(log n)", "O(n)", "O(n log n)"],
              "correctAnswer": "O(n)",
              "marks": 20
            },
            {
              "id": 2,
              "question": "Which data structure follows the LIFO (Last In First Out) principle?",
              "options": ["Queue", "Stack", "Binary Tree", "Hash Map"],
              "correctAnswer": "Stack",
              "marks": 20
            }
          ]'::jsonb,
          NOW()
        )
      `, [courseId, teacherUser.user_id]);
      log.push('Initial demo assessment seeded.');
    }

    return {
      success: true,
      log,
      admin: {
        email: 'admin@ptut.edu.pk',
        password: 'AdminPassword123!',
        role: 'ADMIN'
      },
      teacher: {
        email: 'teacher@ptut.edu.pk',
        password: 'TeacherPassword123!',
        role: 'TEACHER',
        assignedCourse: 'CS301 - Data Structures & Algorithms'
      },
      student: {
        email: 'student@ptut.edu.pk',
        password: 'StudentPassword123!',
        role: 'STUDENT'
      },
      invitationCode: 'TEACHER-PTUT-2026'
    };
  } catch (error) {
    console.error('Bootstrap error:', error);
    throw error;
  }
};
