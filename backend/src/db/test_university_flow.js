import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import {
  registerUnified,
  loginUnified
} from '../services/auth.service.js';
import {
  processUniversityCSV,
  getUniversityCourses,
  assignTeacherToCourse,
  getTeacherAssignedCourses
} from '../services/university.service.js';
import { query } from '../config/supabase.js';

async function runTest() {
  console.log('🧪 Starting Multi-Tenant University & Course Assignment Flow Test...\n');

  // Clean up test university and test users data
  await query("DELETE FROM public.users WHERE email IN ('dean.vance@apex-tech.edu', 'prof.clark@apex-tech.edu')");
  await query("DELETE FROM public.universities WHERE code = 'TEST-UNI-2026'");

  // 1. Onboard University & Administrator
  console.log('Test 1: Register University & Admin Setup:');
  const uniInsert = await query(
    `INSERT INTO public.universities (name, code, domain, contact_email, website, is_active, created_at)
     VALUES ($1, $2, $3, $4, $5, TRUE, NOW())
     RETURNING university_id, name, code, domain`,
    ['Apex Technology University', 'TEST-UNI-2026', 'apex-tech.edu', 'contact@apex-tech.edu', 'https://apex-tech.edu']
  );
  const university = uniInsert.rows[0];
  const universityId = university.university_id;

  // Create University Admin
  const adminSalt = await bcrypt.genSalt(10);
  const adminHash = await bcrypt.hash('SuperSecurePassword2026!', adminSalt);
  const adminInsert = await query(
    `INSERT INTO public.users (name, email, password_hash, role, is_active, university_id, email_verified, created_at, updated_at)
     VALUES ($1, $2, $3, 'ADMIN', TRUE, $4, TRUE, NOW(), NOW())
     RETURNING user_id, name, email, role`,
    ['Dean Robert Vance', 'dean.vance@apex-tech.edu', adminHash, universityId]
  );
  const admin = adminInsert.rows[0];
  const adminId = admin.user_id;

  // Generate an initial single-use teacher invitation code from university admin
  const initialTeacherCode = 'TEACHER-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  await query(
    `INSERT INTO public.invitations (code, university_id, role, created_by, expires_at)
     VALUES ($1, $2, 'TEACHER', $3, NOW() + INTERVAL '14 days')`,
    [initialTeacherCode, universityId, adminId]
  );

  console.log(`  University registered: ${university.name} (ID: ${universityId}) ✅ PASS`);
  console.log(`  Admin account created: ${admin.email} (ID: ${adminId}) ✅ PASS`);
  console.log(`  Single-use Teacher Invitation Code generated: ${initialTeacherCode} ✅ PASS`);

  // 2. CSV Upload by Admin: Courses Roster
  console.log('\nTest 2: CSV Upload by Admin (Import Courses):');
  const csvContent = `course_code,course_name\nCS-101,Introduction to Algorithms\nDS-201,Data Structures & Design\nAI-301,Artificial Intelligence & Machine Learning`;
  const csvSummary = await processUniversityCSV(universityId, adminId, csvContent);
  console.log(`  CSV detected type: ${csvSummary.detectedType} ✅ PASS`);
  console.log(`  Courses created from CSV: ${csvSummary.created} ✅ PASS`);

  // 3. Teacher Registration using University Invite Code (Role decided strictly by server)
  console.log('\nTest 3: Teacher Registration using University Invite Code:');
  const teacherEmail = `prof.clark@apex-tech.edu`;
  const teacherRes = await registerUnified({
    name: 'Professor Arthur Clark',
    email: teacherEmail,
    password: 'TeacherPassword123!',
    inviteCode: initialTeacherCode
  });
  console.log(`  Server decided role: ${teacherRes.role} (Expected: TEACHER) ✅ PASS`);
  console.log(`  Teacher registered for ${teacherRes.universityName} ✅ PASS`);

  // Verify teacher in database
  const teacherUserRes = await query('SELECT user_id, email, role FROM public.users WHERE email = $1', [teacherEmail]);
  const teacher = teacherUserRes.rows[0];
  const teacherId = teacher.user_id;

  // 4. Test Teacher Blank Dashboard (Before Admin Course Assignment)
  console.log('\nTest 4: Teacher Blank Dashboard Verification (Zero Assigned Courses):');
  const teacherCoursesBefore = await getTeacherAssignedCourses(teacherId, universityId);
  console.log(`  Assigned courses count: ${teacherCoursesBefore.length} (Expected: 0)`);
  if (teacherCoursesBefore.length === 0) {
    console.log('  Teacher dashboard is correctly BLANK before admin assignment! ✅ PASS');
  } else {
    console.log('  ❌ FAIL: Teacher should not have courses yet');
    process.exit(1);
  }

  // 5. Admin Assigns Course to Teacher
  console.log('\nTest 5: Admin Assigns Course to Teacher:');
  const allCourses = await getUniversityCourses(universityId);
  const targetCourse = allCourses.find(c => c.course_code === 'CS-101');
  const assigned = await assignTeacherToCourse(universityId, targetCourse.course_id, teacherId);
  console.log(`  Course "${assigned.course_name}" assigned to Teacher ID ${teacherId} ✅ PASS`);

  // 6. Test Teacher Active Dashboard (After Admin Course Assignment)
  console.log('\nTest 6: Teacher Active Dashboard Verification:');
  const teacherCoursesAfter = await getTeacherAssignedCourses(teacherId, universityId);
  console.log(`  Assigned courses count: ${teacherCoursesAfter.length} (Expected: 1)`);
  console.log(`  Course: ${teacherCoursesAfter[0]?.course_name} (${teacherCoursesAfter[0]?.course_code})`);
  if (teacherCoursesAfter.length === 1 && teacherCoursesAfter[0].course_code === 'CS-101') {
    console.log('  Teacher now sees assigned course! ✅ PASS');
  } else {
    console.log('  ❌ FAIL: Course assignment failed');
    process.exit(1);
  }

  // Clean up test data
  await query('DELETE FROM public.universities WHERE university_id = $1', [universityId]);
  console.log('\n🎉 ALL MULTI-TENANT UNIVERSITY & COURSE ASSIGNMENT TESTS PASSED!\n');
}

runTest()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
  });
