import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, supabase } from '../config/supabase.js';

const JWT_SECRET = process.env.JWT_SECRET || 'autoquiz-pro-fallback-jwt-secret-key-2026';
const JWT_EXPIRES_IN = '7d';

/**
 * Check if an email belongs to an official university or academic institution
 */
export const isOfficialUniversityEmail = async (email) => {
  if (!email || typeof email !== 'string') return false;

  const normalized = email.trim().toLowerCase();
  const parts = normalized.split('@');
  if (parts.length !== 2) return false;
  const domain = parts[1];

  // Disallowed personal / public email providers
  const publicDomains = [
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 
    'icloud.com', 'mail.com', 'proton.me', 'protonmail.com', 
    'aol.com', 'live.com', 'msn.com', 'yandex.com', 'zoho.com'
  ];

  if (publicDomains.includes(domain)) {
    return false;
  }

  // Common academic domain suffixes
  const academicSuffixes = ['.edu', '.edu.pk', '.ac.uk', '.edu.au', '.ac.in', '.edu.in', '.ac.nz', '.edu.my', '.ac.za'];
  const hasAcademicSuffix = academicSuffixes.some(suffix => domain === suffix.slice(1) || domain.endsWith(suffix));
  if (hasAcademicSuffix) {
    return true;
  }

  // Check database table of allowed university domains
  try {
    const res = await query(
      'SELECT domain_id FROM public.university_domains WHERE is_active = TRUE AND ($1 = domain OR $1 LIKE ("%." || domain))',
      [domain]
    );
    return res.rows.length > 0;
  } catch (err) {
    console.warn('Could not query university_domains, falling back to suffix check:', err.message);
    return hasAcademicSuffix;
  }
};

/**
 * Validate an invitation code for one-time use
 */
export const validateInvitation = async (code, requiredRole = null) => {
  if (!code || typeof code !== 'string') {
    throw new Error('Invitation code is required');
  }

  const cleanCode = code.trim().toUpperCase();

  const res = await query(
    `SELECT invitation_id, code, role, created_by, used_by, expires_at, used_at 
     FROM public.invitations 
     WHERE UPPER(code) = $1`,
    [cleanCode]
  );

  if (res.rows.length === 0) {
    throw new Error('Invalid invitation code. Please check with an administrator.');
  }

  const invite = res.rows[0];

  if (invite.used_at !== null || invite.used_by !== null) {
    throw new Error('This invitation code has already been used. Each invitation code is one-time use only.');
  }

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    throw new Error('This invitation code has expired. Please request a new code from an administrator.');
  }

  if (requiredRole && invite.role !== requiredRole) {
    throw new Error(`This invitation code is for role ${invite.role}, not ${requiredRole}.`);
  }

  return invite;
};

/**
 * Mark invitation code as used by a specific user
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
 * Generate signed JWT token with server-decided role
 */
export const generateSessionToken = (user) => {
  return jwt.sign(
    {
      userId: user.user_id,
      email: user.email,
      role: user.role,
      name: user.name
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

/**
 * Register a Teacher (Email & Password + Admin Invite Code)
 */
export const registerTeacherWithEmail = async ({ name, email, password, inviteCode }) => {
  if (!name || !email || !password || !inviteCode) {
    throw new Error('Name, email, password, and a valid invitation code are required.');
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters long.');
  }

  // 1. Verify that email is not already registered
  const existing = await query('SELECT user_id FROM public.users WHERE email = $1', [normalizedEmail]);
  if (existing.rows.length > 0) {
    throw new Error('An account with this email address already exists. Please sign in instead.');
  }

  // 2. Validate one-time invite code strictly for TEACHER role
  const invite = await validateInvitation(inviteCode, 'TEACHER');

  // 3. Hash password
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  // 4. Create user with server-decided role TEACHER
  const insertRes = await query(
    `INSERT INTO public.users (name, email, password_hash, role, is_active, auth_provider, created_at, updated_at)
     VALUES ($1, $2, $3, 'TEACHER', TRUE, 'email', NOW(), NOW())
     RETURNING user_id, name, email, role, created_at`,
    [name.trim(), normalizedEmail, passwordHash]
  );

  const newUser = insertRes.rows[0];

  // 5. Mark invitation code as used
  await markInvitationUsed(invite.invitation_id, newUser.user_id);

  // 6. Generate session JWT
  const token = generateSessionToken(newUser);

  return { user: newUser, token };
};

/**
 * Register an Admin (Email & Password + Admin Invite Code)
 */
export const registerAdminWithEmail = async ({ name, email, password, inviteCode }) => {
  if (!name || !email || !password || !inviteCode) {
    throw new Error('Name, email, password, and a valid ADMIN invitation code are required.');
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters long.');
  }

  const existing = await query('SELECT user_id FROM public.users WHERE email = $1', [normalizedEmail]);
  if (existing.rows.length > 0) {
    throw new Error('An account with this email address already exists. Please sign in instead.');
  }

  // Validate one-time invite code strictly for ADMIN role
  const invite = await validateInvitation(inviteCode, 'ADMIN');

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  const insertRes = await query(
    `INSERT INTO public.users (name, email, password_hash, role, is_active, auth_provider, created_at, updated_at)
     VALUES ($1, $2, $3, 'ADMIN', TRUE, 'email', NOW(), NOW())
     RETURNING user_id, name, email, role, created_at`,
    [name.trim(), normalizedEmail, passwordHash]
  );

  const newUser = insertRes.rows[0];
  await markInvitationUsed(invite.invitation_id, newUser.user_id);
  const token = generateSessionToken(newUser);

  return { user: newUser, token };
};

/**
 * Sign In with Email & Password (Teacher & Admin only; Students must use Google)
 */
export const loginWithEmailPassword = async ({ email, password }) => {
  if (!email || !password) {
    throw new Error('Email and password are required.');
  }

  const normalizedEmail = email.trim().toLowerCase();

  const res = await query(
    `SELECT user_id, name, email, password_hash, role, is_active, auth_provider, avatar_url 
     FROM public.users 
     WHERE email = $1`,
    [normalizedEmail]
  );

  if (res.rows.length === 0) {
    throw new Error('Invalid email or password.');
  }

  const user = res.rows[0];

  if (!user.is_active) {
    throw new Error('This account has been deactivated. Please contact support.');
  }

  // Enforce rule: Students sign in with Google only
  if (user.role === 'STUDENT') {
    throw new Error('Student accounts must sign in using Google with their official university email.');
  }

  // If user signed up via Google and has no password hash
  if (!user.password_hash) {
    throw new Error('This account was created via Google Sign-In. Please click "Continue with Google".');
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    throw new Error('Invalid email or password.');
  }

  const token = generateSessionToken(user);

  return {
    user: {
      userId: user.user_id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatarUrl: user.avatar_url
    },
    token
  };
};

/**
 * Handle Google Authentication & Registration
 * 1. Verifies token from Supabase Auth
 * 2. If user already exists: returns verified session
 * 3. If new user:
 *    - If official university email -> registers as STUDENT
 *    - If not university email -> requires valid inviteCode (TEACHER or ADMIN)
 */
export const handleGoogleAuth = async ({ supabaseAccessToken, inviteCode = null }) => {
  if (!supabaseAccessToken) {
    throw new Error('Supabase access token is required for Google OAuth verification.');
  }

  if (!supabase) {
    throw new Error('Supabase authentication client is not initialized on the server.');
  }

  // 1. Verify token with Supabase Auth
  const { data: { user: sbUser }, error: sbError } = await supabase.auth.getUser(supabaseAccessToken);
  if (sbError || !sbUser) {
    throw new Error('Invalid or expired Google OAuth session. Please try signing in again.');
  }

  const email = sbUser.email.trim().toLowerCase();
  const name = sbUser.user_metadata?.full_name || sbUser.user_metadata?.name || email.split('@')[0];
  const avatarUrl = sbUser.user_metadata?.avatar_url || null;
  const supabaseUid = sbUser.id;

  // 2. Check if user already exists in database
  const existing = await query(
    `SELECT user_id, name, email, role, is_active, auth_provider, avatar_url 
     FROM public.users 
     WHERE email = $1 OR supabase_uid = $2`,
    [email, supabaseUid]
  );

  if (existing.rows.length > 0) {
    const existingUser = existing.rows[0];

    if (!existingUser.is_active) {
      throw new Error('This account has been deactivated. Please contact support.');
    }

    // Sync supabase_uid and avatar if missing
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
        avatarUrl: existingUser.avatar_url || avatarUrl
      },
      token
    };
  }

  // 3. User does not exist yet -> Attempt Registration
  const isUniversity = await isOfficialUniversityEmail(email);

  if (isUniversity) {
    // Student registration: Automatically granted role STUDENT with university email
    const insertRes = await query(
      `INSERT INTO public.users (name, email, role, is_active, supabase_uid, auth_provider, avatar_url, created_at, updated_at)
       VALUES ($1, $2, 'STUDENT', TRUE, $3, 'google', $4, NOW(), NOW())
       RETURNING user_id, name, email, role, avatar_url, created_at`,
      [name, email, supabaseUid, avatarUrl]
    );

    const newStudent = insertRes.rows[0];
    const token = generateSessionToken(newStudent);

    return {
      status: 'registered',
      user: {
        userId: newStudent.user_id,
        name: newStudent.name,
        email: newStudent.email,
        role: newStudent.role,
        avatarUrl: newStudent.avatar_url
      },
      token,
      message: 'Student account registered successfully with official university email.'
    };
  }

  // Not a university email: Must be a Teacher or Admin, requiring a one-time invitation code
  if (!inviteCode) {
    return {
      status: 'need_invite_code',
      email,
      name,
      message: 'This email is not recognized as an official university email. If you are a Teacher or Admin, please provide a valid invitation code to complete registration.'
    };
  }

  // Validate the invitation code
  const invite = await validateInvitation(inviteCode);
  const assignedRole = invite.role; // 'TEACHER' or 'ADMIN'

  const insertRes = await query(
    `INSERT INTO public.users (name, email, role, is_active, supabase_uid, auth_provider, avatar_url, created_at, updated_at)
     VALUES ($1, $2, $3, TRUE, $4, 'google', $5, NOW(), NOW())
     RETURNING user_id, name, email, role, avatar_url, created_at`,
    [name, email, assignedRole, supabaseUid, avatarUrl]
  );

  const newUser = insertRes.rows[0];
  await markInvitationUsed(invite.invitation_id, newUser.user_id);
  const token = generateSessionToken(newUser);

  return {
    status: 'registered',
    user: {
      userId: newUser.user_id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      avatarUrl: newUser.avatar_url
    },
    token,
    message: `${assignedRole} account created successfully with Google.`
  };
};

/**
 * Fetch authenticated user profile by ID
 */
export const getUserProfile = async (userId) => {
  const res = await query(
    `SELECT user_id, name, email, role, is_active, auth_provider, avatar_url, created_at 
     FROM public.users 
     WHERE user_id = $1`,
    [userId]
  );

  if (res.rows.length === 0) {
    return null;
  }

  const u = res.rows[0];
  return {
    userId: u.user_id,
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.is_active,
    authProvider: u.auth_provider,
    avatarUrl: u.avatar_url,
    createdAt: u.created_at
  };
};
