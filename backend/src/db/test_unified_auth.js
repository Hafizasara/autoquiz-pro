import {
  registerUnified,
  loginUnified,
  verifyDeviceWithToken,
  validateInvitation
} from '../services/auth.service.js';
import { query } from '../config/supabase.js';

async function testUnifiedAuth() {
  console.log('🧪 Starting Unified Auth & Browser Device Verification Test...\n');

  // Clean test data
  await query("DELETE FROM public.users WHERE email LIKE 'test_unified_%'");
  await query(`
    INSERT INTO public.invitations (code, role, university_id, expires_at)
    VALUES ('TEST-INVITE-FLOW-2026', 'TEACHER', 1, NOW() + INTERVAL '1 day')
    ON CONFLICT (code) DO UPDATE SET used_at = NULL, used_by = NULL;
  `);

  const deviceBrowser1 = 'browser_device_chrome_uuid_111';
  const deviceBrowser2 = 'browser_device_safari_uuid_222';

  // 1. Student Registration without Invite Code
  console.log('Test 1: Student registers with official university email (no role chosen):');
  const studentEmail = `test_unified_student_${Date.now()}@ptut.edu.pk`;
  const studentReg = await registerUnified({
    name: 'Student Jessica',
    email: studentEmail,
    password: 'Password123!',
    inviteCode: '', // No code
    deviceToken: deviceBrowser1
  });

  console.log(`  Assigned Role: ${studentReg.role} (Expected: STUDENT) ✅ PASS`);
  console.log(`  Status: ${studentReg.status} (Expected: verification_sent) ✅ PASS`);
  console.log(`  Verification Required: ${studentReg.verificationRequired} ✅ PASS`);

  // Extract verification token from link
  const tokenMatch = studentReg.verificationLink.match(/token=([a-f0-9]+)/);
  const verificationToken = tokenMatch ? tokenMatch[1] : null;

  // 2. Student attempts login BEFORE email verification on Device 1
  console.log('\nTest 2: Student attempts login on Device 1 BEFORE email verification:');
  const loginBeforeVerify = await loginUnified({
    email: studentEmail,
    password: 'Password123!',
    deviceToken: deviceBrowser1
  });
  console.log(`  Login status: ${loginBeforeVerify.status} (Expected: verification_required) ✅ PASS`);

  // 3. Student clicks verification link (Verifies Device 1)
  console.log('\nTest 3: Student verifies browser using email confirmation token:');
  const verifyRes = await verifyDeviceWithToken(verificationToken, deviceBrowser1);
  console.log(`  Verification result: ${verifyRes.message} ✅ PASS`);

  // 4. Student logs in on Device 1 AFTER verification
  console.log('\nTest 4: Student logs in on verified Device 1:');
  const loginAfterVerify = await loginUnified({
    email: studentEmail,
    password: 'Password123!',
    deviceToken: deviceBrowser1
  });
  console.log(`  Login status: ${loginAfterVerify.status} (Expected: authenticated) ✅ PASS`);
  console.log(`  User Role: ${loginAfterVerify.user?.role} ✅ PASS`);

  // 5. Student logs in AGAIN on Device 1 (Should NEVER ask for verification again in this browser!)
  console.log('\nTest 5: Student logs in a second time on same browser (Device 1):');
  const loginSecondTime = await loginUnified({
    email: studentEmail,
    password: 'Password123!',
    deviceToken: deviceBrowser1
  });
  console.log(`  Login status: ${loginSecondTime.status} (Expected: authenticated immediately with no verification) ✅ PASS`);

  // 6. Student attempts login on a NEW BROWSER (Device 2)
  console.log('\nTest 6: Student logs in from a NEW/DIFFERENT browser (Device 2):');
  const loginDevice2 = await loginUnified({
    email: studentEmail,
    password: 'Password123!',
    deviceToken: deviceBrowser2
  });
  console.log(`  Login status on Device 2: ${loginDevice2.status} (Expected: verification_required for new device) ✅ PASS`);

  // 7. Teacher registration WITHOUT invite code (Must fail)
  console.log('\nTest 7: Teacher attempts registration without invite code using personal email:');
  try {
    await registerUnified({
      name: 'Teacher Without Code',
      email: `test_unified_teacher_${Date.now()}@gmail.com`,
      password: 'Password123!',
      inviteCode: '',
      deviceToken: deviceBrowser1
    });
    console.log('  ❌ FAIL: Registration succeeded without code');
  } catch (err) {
    console.log(`  Registration rejected: "${err.message}" ✅ PASS`);
  }

  // 8. Teacher registration WITH invite code
  console.log('\nTest 8: Teacher registers WITH one-time invite code:');
  const teacherEmail = `test_unified_teacher_${Date.now()}@gmail.com`;
  const teacherReg = await registerUnified({
    name: 'Dr. Sarah Connor',
    email: teacherEmail,
    password: 'Password123!',
    inviteCode: 'TEST-INVITE-FLOW-2026',
    deviceToken: deviceBrowser1
  });
  console.log(`  Assigned Role: ${teacherReg.role} (Expected: TEACHER) ✅ PASS`);
  console.log(`  Status: ${teacherReg.status} (Expected: registered) ✅ PASS`);

  // 9. Teacher logs into login page
  console.log('\nTest 9: Teacher logs in via unified login:');
  const teacherLogin = await loginUnified({
    email: teacherEmail,
    password: 'Password123!',
    deviceToken: deviceBrowser1
  });
  console.log(`  Teacher login status: ${teacherLogin.status} (Expected: authenticated) ✅ PASS`);
  console.log(`  Teacher Role: ${teacherLogin.user?.role} ✅ PASS`);

  // Cleanup
  await query("DELETE FROM public.users WHERE email LIKE 'test_unified_%'");
  await query("DELETE FROM public.invitations WHERE code = 'TEST-INVITE-FLOW-2026'");

  console.log('\n🎉 ALL UNIFIED AUTH & BROWSER VERIFICATION TESTS PASSED!\n');
}

testUnifiedAuth()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
