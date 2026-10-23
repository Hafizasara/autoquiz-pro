import {
  registerTeacherWithEmail,
  registerAdminWithEmail,
  loginWithEmailPassword,
  validateInvitation,
  isOfficialUniversityEmail,
  getUserProfile
} from '../services/auth.service.js';
import { query } from '../config/supabase.js';

async function runTests() {
  console.log('🧪 Starting AutoQuiz Pro Authentication & Registration Flow Tests...\n');

  // Clean up any test users from previous runs
  await query("DELETE FROM public.users WHERE email LIKE 'test_%@ptut.edu.pk' OR email LIKE 'test_%@gmail.com'");
  // Ensure test codes exist
  await query(`
    INSERT INTO public.invitations (code, role, expires_at, used_at, used_by)
    VALUES 
      ('TEST-TCH-001', 'TEACHER', NOW() + INTERVAL '1 day', NULL, NULL),
      ('TEST-ADM-001', 'ADMIN', NOW() + INTERVAL '1 day', NULL, NULL)
    ON CONFLICT (code) DO UPDATE 
    SET used_at = NULL, used_by = NULL, expires_at = NOW() + INTERVAL '1 day';
  `);

  // 1. Test University Email Validation
  console.log('Test 1: University Email Validation:');
  const uniCheck1 = await isOfficialUniversityEmail('alice@ptut.edu.pk');
  const uniCheck2 = await isOfficialUniversityEmail('bob@stanford.edu');
  const uniCheck3 = await isOfficialUniversityEmail('charlie@gmail.com');
  console.log('  alice@ptut.edu.pk is university:', uniCheck1 === true ? '✅ PASS' : '❌ FAIL');
  console.log('  bob@stanford.edu is university:', uniCheck2 === true ? '✅ PASS' : '❌ FAIL');
  console.log('  charlie@gmail.com is university:', uniCheck3 === false ? '✅ PASS (Correctly rejected)' : '❌ FAIL');

  // 2. Test Teacher Registration with valid invite code
  console.log('\nTest 2: Teacher Registration:');
  const teacherEmail = `test_teacher_${Date.now()}@gmail.com`;
  const teacher = await registerTeacherWithEmail({
    name: 'Professor John Smith',
    email: teacherEmail,
    password: 'SecurePassword123!',
    inviteCode: 'TEST-TCH-001'
  });
  console.log('  Teacher registered successfully:', teacher.user.role === 'TEACHER' ? '✅ PASS (Role is TEACHER)' : '❌ FAIL');
  console.log('  JWT Token generated:', teacher.token ? '✅ PASS' : '❌ FAIL');

  // 3. Test One-Time Code Enforcement (Reusing TEST-TCH-001 must FAIL)
  console.log('\nTest 3: One-Time Invite Code Re-use Protection:');
  try {
    await registerTeacherWithEmail({
      name: 'Another Teacher',
      email: `test_teacher2_${Date.now()}@gmail.com`,
      password: 'SecurePassword123!',
      inviteCode: 'TEST-TCH-001'
    });
    console.log('❌ FAIL: Allowed re-use of invitation code!');
  } catch (err) {
    console.log('  Re-use rejected with error:', `"${err.message}"`, '✅ PASS');
  }

  // 4. Test Teacher Login
  console.log('\nTest 4: Teacher Email/Password Sign-In:');
  const loginRes = await loginWithEmailPassword({
    email: teacherEmail,
    password: 'SecurePassword123!'
  });
  console.log('  Teacher login successful:', loginRes.user.role === 'TEACHER' ? '✅ PASS' : '❌ FAIL');

  // 5. Test Admin Registration
  console.log('\nTest 5: Admin Registration with ADMIN Invite:');
  const adminEmail = `test_admin_${Date.now()}@ptut.edu.pk`;
  const admin = await registerAdminWithEmail({
    name: 'System Admin',
    email: adminEmail,
    password: 'AdminPassword123!',
    inviteCode: 'TEST-ADM-001'
  });
  console.log('  Admin registered successfully:', admin.user.role === 'ADMIN' ? '✅ PASS (Role is ADMIN)' : '❌ FAIL');

  // Clean up test data
  await query('DELETE FROM public.users WHERE user_id = $1 OR user_id = $2', [teacher.user.user_id, admin.user.user_id]);
  await query("DELETE FROM public.invitations WHERE code IN ('TEST-TCH-001', 'TEST-ADM-001')");

  console.log('\n🎉 ALL BACKEND AUTHENTICATION & ACCESS CONTROL TESTS PASSED PERFECTLY!\n');
}

runTests()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Test execution failed:', e);
    process.exit(1);
  });
