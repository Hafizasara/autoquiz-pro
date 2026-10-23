import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query, supabase } from '../config/supabase.js';

const JWT_SECRET = process.env.JWT_SECRET || 'autoquiz-pro-fallback-jwt-secret-key-2026';
const JWT_EXPIRES_IN = '7d';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

/**
 * Find university matching an email domain
 */
export const findUniversityByEmailDomain = async (email) => {
  if (!email || typeof email !== 'string') return null;

  const normalized = email.trim().toLowerCase();
  const parts = normalized.split('@');
  if (parts.length !== 2) return null;
  const domain = parts[1];

  const publicDomains = [
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 
    'icloud.com', 'mail.com', 'proton.me', 'protonmail.com', 
    'aol.com', 'live.com', 'msn.com', 'yandex.com', 'zoho.com'
  ];

  if (publicDomains.includes(domain)) {
    return null;
  }

  // 1. Direct university domain lookup
  const res = await query(
    `SELECT university_id, name, code, domain 
     FROM public.universities 
     WHERE is_active = TRUE AND ($1 = domain OR $1 LIKE ('%.' || domain))
     LIMIT 1`,
    [domain]
  );

  if (res.rows.length > 0) {
    return res.rows[0];
  }

  // 2. Check if ends with generic academic suffixes (.edu, .edu.pk, .ac.uk)
  const isGenericEdu = domain.endsWith('.edu') || domain.endsWith('.edu.pk') || domain.endsWith('.ac.uk');
  if (isGenericEdu) {
    const defaultRes = await query(
      `SELECT university_id, name, code, domain 
       FROM public.universities 
       WHERE domain = 'edu' OR domain = 'ptut.edu.pk'
       LIMIT 1`
    );
    return defaultRes.rows[0] || null;
  }

  return null;
};

/**
 * Validate an invitation code for one-time use
 */
export const validateInvitation = async (code, requiredRole = null) => {
  if (!code || typeof code !== 'string') {
    throw new Error('Invitation code is required.');
  }

  const cleanCode = code.trim().toUpperCase();

  const res = await query(
    `SELECT i.invitation_id, i.code, i.role, i.university_id, i.created_by, i.used_by, i.expires_at, i.used_at,
            u.name as university_name
     FROM public.invitations i
     LEFT JOIN public.universities u ON i.university_id = u.university_id
     WHERE UPPER(i.code) = $1`,
    [cleanCode]
  );

  if (res.rows.length === 0) {
    throw new Error('Invalid invitation code. Please obtain a valid code from your university administrator.');
  }

  const invite = res.rows[0];

  if (invite.used_at !== null || invite.used_by !== null) {
    throw new Error('This invitation code has already been used. Each invitation code is strictly one-time use.');
  }

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    throw new Error('This invitation code has expired. Please request a new code from your university administrator.');
  }

  if (requiredRole && invite.role !== requiredRole) {
    throw new Error(`This invitation code is for role ${invite.role}, not ${requiredRole}.`);
  }

  return invite;
};

/**
 * Mark invitation code as used
 */
export const markInvitationUsed = async (invitationId, userId) => {
  await query(
    `UPDATE public.invitations 
     SET used_by = $1, used_at = NOW() 
     WHERE invitation_id = $2`,
    [userId, invitationId]
  );
};

/**
 * Check if a browser/device is already verified for a user
 */
export const isDeviceVerified = async (userId, deviceToken) => {
  if (!deviceToken) return false;

  const res = await query(
    `SELECT is_verified 
     FROM public.user_devices 
     WHERE user_id = $1 AND device_token = $2`,
    [userId, deviceToken]
  );

  return res.rows.length > 0 && res.rows[0].is_verified === true;
};

/**
 * Generate an email verification token for a student browser session
 */
export const createEmailVerification = async (userId, deviceToken) => {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  // Record pending device
  await query(
    `INSERT INTO public.user_devices (user_id, device_token, is_verified)
     VALUES ($1, $2, FALSE)
     ON CONFLICT (user_id, device_token) DO UPDATE 
     SET last_login = NOW()`,
    [userId, deviceToken]
  );

  // Store verification token
  await query(
    `INSERT INTO public.email_verifications (user_id, token, device_token, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, token, deviceToken, expiresAt]
  );

  const verificationLink = `${CLIENT_URL}/verify-email?token=${token}&device=${deviceToken}`;

  // Log clearly in console for testing/audit
  console.log(`📧 [EMAIL VERIFICATION LINK for User #${userId}]: ${verificationLink}`);

  return { token, verificationLink };
};

/**
 * Verify browser/device via email verification token
 */
export const verifyDeviceWithToken = async (token, clientDeviceToken) => {
  if (!token) throw new Error('Verification token is missing.');

  const res = await query(
    `SELECT verification_id, user_id, device_token, expires_at, used_at 
     FROM public.email_verifications 
     WHERE token = $1`,
    [token]
  );

  if (res.rows.length === 0) {
    throw new Error('Invalid verification link.');
  }

  const record = res.rows[0];

  if (record.used_at !== null) {
    throw new Error('This verification link has already been used.');
  }

  if (new Date(record.expires_at) < new Date()) {
    throw new Error('This verification link has expired. Please sign in again to request a new link.');
  }

  const targetDeviceToken = clientDeviceToken || record.device_token;

  // Mark verification token as used
  await query(
    `UPDATE public.email_verifications 
     SET used_at = NOW() 
     WHERE verification_id = $1`,
    [record.verification_id]
  );

  // Mark device as verified (one-time verification for this browser!)
  await query(
    `INSERT INTO public.user_devices (user_id, device_token, is_verified, verified_at, last_login)
     VALUES ($1, $2, TRUE, NOW(), NOW())
     ON CONFLICT (user_id, device_token) DO UPDATE 
     SET is_verified = TRUE, verified_at = NOW(), last_login = NOW()`,
    [record.user_id, targetDeviceToken]
  );

  // Mark user's email as verified
  await query('UPDATE public.users SET email_verified = TRUE WHERE user_id = $1', [record.user_id]);

  return {
    success: true,
    message: 'Your browser has been verified successfully! You can now log in.'
  };
};

/**
 * Generate signed JWT token
 */
export const generateSessionToken = (user) => {
  return jwt.sign(
    {
      userId: user.user_id,
      email: user.email,
      role: user.role,
      name: user.name,
      universityId: user.university_id
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

/**
 * UNIFIED REGISTRATION (NO ROLES SHOWN IN UI - SERVER DECIDES ROLE)
 * Teacher: must have invite code.
 * Student: must have official university email.
 * Admin: must have ADMIN invite code.
 * After registration: User is redirected to login page.
 */
export const registerUnified = async ({ name, email, password, inviteCode, deviceToken, browserInfo }) => {
  if (!name || !email || !password) {
    throw new Error('Name, email, and password are required.');
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters long.');
  }

  // 1. Check if user already exists
  const existing = await query('SELECT user_id FROM public.users WHERE email = $1', [normalizedEmail]);
  if (existing.rows.length > 0) {
    throw new Error('An account with this email address already exists. Please go to the login page to sign in.');
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);
  const effectiveDevice = deviceToken || crypto.randomUUID();

  // CASE A: User provided an invitation code -> Teacher or Admin!
  if (inviteCode && inviteCode.trim()) {
    const invite = await validateInvitation(inviteCode);
    const assignedRole = invite.role; // 'TEACHER' or 'ADMIN'

    const insertRes = await query(
      `INSERT INTO public.users (name, email, password_hash, role, is_active, university_id, auth_provider, email_verified, created_at, updated_at)
       VALUES ($1, $2, $3, $4, TRUE, $5, 'email', TRUE, NOW(), NOW())
       RETURNING user_id, name, email, role, university_id, created_at`,
      [name.trim(), normalizedEmail, passwordHash, assignedRole, invite.university_id]
    );

    const newUser = insertRes.rows[0];
    await markInvitationUsed(invite.invitation_id, newUser.user_id);

    // Record browser as trusted for teacher/admin
    await query(
      `INSERT INTO public.user_devices (user_id, device_token, browser_info, is_verified, verified_at)
       VALUES ($1, $2, $3, TRUE, NOW())
       ON CONFLICT (user_id, device_token) DO UPDATE SET is_verified = TRUE`,
      [newUser.user_id, effectiveDevice, browserInfo || 'Web Browser']
    );

    return {
      status: 'registered',
      role: assignedRole,
      universityName: invite.university_name,
      verificationRequired: false,
      message: `Account registered successfully as ${assignedRole} for ${invite.university_name || 'your institution'}! Please sign in.`
    };
  }

  // CASE B: No invitation code provided -> Must be an official university Student!
  const matchedUni = await findUniversityByEmailDomain(normalizedEmail);

  if (!matchedUni) {
    throw new Error(
      'Faculty & Administrator registration requires an invitation code from your University Administrator. Students must register with an official university email address (e.g. @ptut.edu.pk or any .edu domain).'
    );
  }

  // Register as STUDENT (server-decided role!)
  const insertRes = await query(
    `INSERT INTO public.users (name, email, password_hash, role, is_active, university_id, auth_provider, email_verified, created_at, updated_at)
     VALUES ($1, $2, $3, 'STUDENT', TRUE, $4, 'email', FALSE, NOW(), NOW())
     RETURNING user_id, name, email, role, university_id, created_at`,
    [name.trim(), normalizedEmail, passwordHash, matchedUni.university_id]
  );

  const newStudent = insertRes.rows[0];

  // Generate Email Verification Link for this browser
  const { token, verificationLink } = await createEmailVerification(newStudent.user_id, effectiveDevice);

  return {
    status: 'verification_sent',
    role: 'STUDENT',
    universityName: matchedUni.name,
    verificationRequired: true,
    verificationLink, // Provided so user can click or verify in development/preview
    message: `Student account created for ${matchedUni.name}! A verification link has been sent to your university email (${normalizedEmail}). Please verify your browser before signing in.`
  };
};

/**
 * UNIFIED LOGIN (NO ROLES IN UI - SERVER DECIDES ROLE & ENFORCES BROWSER VERIFICATION)
 */
export const loginUnified = async ({ email, password, deviceToken, browserInfo }) => {
  if (!email || !password) {
    throw new Error('Email and password are required.');
  }

  const normalizedEmail = email.trim().toLowerCase();

  const res = await query(
    `SELECT u.user_id, u.name, u.email, u.password_hash, u.role, u.is_active, u.university_id, u.auth_provider, u.avatar_url, u.email_verified,
            univ.name as university_name, univ.code as university_code
     FROM public.users u
     LEFT JOIN public.universities univ ON u.university_id = univ.university_id
     WHERE u.email = $1`,
    [normalizedEmail]
  );

  if (res.rows.length === 0) {
    throw new Error('Invalid email or password.');
  }

  const user = res.rows[0];

  if (!user.is_active) {
    throw new Error('This account has been deactivated. Please contact your institution administrator.');
  }

  if (!user.password_hash) {
    throw new Error('This account was created via Google Sign-In. Please click "Continue with Google".');
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    throw new Error('Invalid email or password.');
  }

  const effectiveDevice = deviceToken || crypto.randomUUID();

  // DEVICE VERIFICATION CHECK:
  // If user is a Student, verify that THIS specific browser was verified!
  if (user.role === 'STUDENT') {
    const verified = await isDeviceVerified(user.user_id, effectiveDevice);

    if (!verified) {
      // New or unverified browser! Generate a verification link to their university email
      const { verificationLink } = await createEmailVerification(user.user_id, effectiveDevice);

      return {
        status: 'verification_required',
        verificationRequired: true,
        email: user.email,
        verificationLink,
        message: `New or unverified browser detected. For security, a verification link has been sent to your university email (${user.email}). Please verify to log in.`
      };
    }
  }

  // Record active login
  await query(
    `INSERT INTO public.user_devices (user_id, device_token, browser_info, is_verified, verified_at, last_login)
     VALUES ($1, $2, $3, TRUE, NOW(), NOW())
     ON CONFLICT (user_id, device_token) DO UPDATE SET last_login = NOW()`,
    [user.user_id, effectiveDevice, browserInfo || 'Web Browser']
  );

  const token = generateSessionToken(user);

  return {
    status: 'authenticated',
    user: {
      userId: user.user_id,
      name: user.name,
      email: user.email,
      role: user.role,
      universityId: user.university_id,
      universityName: user.university_name,
      universityCode: user.university_code,
      avatarUrl: user.avatar_url
    },
    token
  };
};

/**
 * GOOGLE AUTH UNIFIED
 */
export const googleAuthUnified = async ({ supabaseAccessToken, inviteCode = null, deviceToken = null, browserInfo = null }) => {
  if (!supabaseAccessToken) {
    throw new Error('Supabase access token is required.');
  }

  if (!supabase) {
    throw new Error('Supabase authentication client is not initialized on the server.');
  }

  const { data: { user: sbUser }, error: sbError } = await supabase.auth.getUser(supabaseAccessToken);
  if (sbError || !sbUser) {
    throw new Error('Invalid or expired Google OAuth session. Please try signing in again.');
  }

  const email = sbUser.email.trim().toLowerCase();
  const name = sbUser.user_metadata?.full_name || sbUser.user_metadata?.name || email.split('@')[0];
  const avatarUrl = sbUser.user_metadata?.avatar_url || null;
  const supabaseUid = sbUser.id;
  const effectiveDevice = deviceToken || crypto.randomUUID();

  // 1. Check if user already exists
  const existing = await query(
    `SELECT u.user_id, u.name, u.email, u.role, u.is_active, u.university_id, u.auth_provider, u.avatar_url,
            univ.name as university_name, univ.code as university_code
     FROM public.users u
     LEFT JOIN public.universities univ ON u.university_id = univ.university_id
     WHERE u.email = $1 OR u.supabase_uid = $2`,
    [email, supabaseUid]
  );

  if (existing.rows.length > 0) {
    const existingUser = existing.rows[0];

    if (!existingUser.is_active) {
      throw new Error('This account has been deactivated. Please contact support.');
    }

    // Check device verification for student
    if (existingUser.role === 'STUDENT') {
      const verified = await isDeviceVerified(existingUser.user_id, effectiveDevice);
      if (!verified) {
        const { verificationLink } = await createEmailVerification(existingUser.user_id, effectiveDevice);
        return {
          status: 'verification_required',
          verificationRequired: true,
          email: existingUser.email,
          verificationLink,
          message: `New browser detected. A verification link has been sent to ${existingUser.email}. Please verify this browser to continue.`
        };
      }
    }

    await query(
      `UPDATE public.users 
       SET supabase_uid = $1, avatar_url = COALESCE($2, avatar_url), updated_at = NOW() 
       WHERE user_id = $3`,
      [supabaseUid, avatarUrl, existingUser.user_id]
    );

    const token = generateSessionToken(existingUser);
    return {
      status: 'authenticated',
      user: {
        userId: existingUser.user_id,
        name: existingUser.name,
        email: existingUser.email,
        role: existingUser.role,
        universityId: existingUser.university_id,
        universityName: existingUser.university_name,
        universityCode: existingUser.university_code,
        avatarUrl: existingUser.avatar_url || avatarUrl
      },
      token
    };
  }

  // 2. User does not exist yet -> First time registration via Google!
  // Check if invitation code provided
  if (inviteCode && inviteCode.trim()) {
    const invite = await validateInvitation(inviteCode);
    const assignedRole = invite.role;

    const insertRes = await query(
      `INSERT INTO public.users (name, email, role, is_active, supabase_uid, university_id, auth_provider, avatar_url, email_verified, created_at, updated_at)
       VALUES ($1, $2, $3, TRUE, $4, $5, 'google', $6, TRUE, NOW(), NOW())
       RETURNING user_id, name, email, role, university_id, avatar_url, created_at`,
      [name, email, assignedRole, supabaseUid, invite.university_id, avatarUrl]
    );

    const newUser = insertRes.rows[0];
    await markInvitationUsed(invite.invitation_id, newUser.user_id);

    // Save device as verified
    await query(
      `INSERT INTO public.user_devices (user_id, device_token, browser_info, is_verified, verified_at)
       VALUES ($1, $2, $3, TRUE, NOW())
       ON CONFLICT (user_id, device_token) DO UPDATE SET is_verified = TRUE`,
      [newUser.user_id, effectiveDevice, browserInfo || 'Google Browser']
    );

    const token = generateSessionToken(newUser);

    return {
      status: 'authenticated',
      user: {
        userId: newUser.user_id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        universityId: invite.university_id,
        universityName: invite.university_name,
        avatarUrl: newUser.avatar_url
      },
      token,
      message: `${assignedRole} account created successfully with Google.`
    };
  }

  // 3. No invitation code -> Must be an official university student!
  const matchedUni = await findUniversityByEmailDomain(email);

  if (!matchedUni) {
    return {
      status: 'need_invite_code',
      email,
      name,
      message: 'This email is not associated with a registered university domain. Faculty and Admins must provide an invitation code to register.'
    };
  }

  // Create student account
  const insertRes = await query(
    `INSERT INTO public.users (name, email, role, is_active, supabase_uid, university_id, auth_provider, avatar_url, email_verified, created_at, updated_at)
     VALUES ($1, $2, 'STUDENT', TRUE, $3, $4, 'google', $5, FALSE, NOW(), NOW())
     RETURNING user_id, name, email, role, university_id, avatar_url, created_at`,
    [name, email, supabaseUid, matchedUni.university_id, avatarUrl]
  );

  const newStudent = insertRes.rows[0];
  const { verificationLink } = await createEmailVerification(newStudent.user_id, effectiveDevice);

  return {
    status: 'verification_required',
    verificationRequired: true,
    email: newStudent.email,
    verificationLink,
    message: `Student account created for ${matchedUni.name}! Please confirm the verification link sent to your university email to verify this browser.`
  };
};

/**
 * Fetch authenticated user profile
 */
export const getUserProfile = async (userId) => {
  const res = await query(
    `SELECT u.user_id, u.name, u.email, u.role, u.is_active, u.university_id, u.auth_provider, u.avatar_url, u.created_at,
            univ.name as university_name, univ.code as university_code
     FROM public.users u
     LEFT JOIN public.universities univ ON u.university_id = univ.university_id
     WHERE u.user_id = $1`,
    [userId]
  );

  if (res.rows.length === 0) return null;

  const u = res.rows[0];
  return {
    userId: u.user_id,
    name: u.name,
    email: u.email,
    role: u.role,
    universityId: u.university_id,
    universityName: u.university_name,
    universityCode: u.university_code,
    isActive: u.is_active,
    authProvider: u.auth_provider,
    avatarUrl: u.avatar_url,
    createdAt: u.created_at
  };
};
