<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../store/auth';
import {
  loginWithEmail,
  registerTeacher,
  registerAdmin,
  validateInviteCode,
  checkUniversityEmail
} from '../api';
import { signInWithGoogle } from '../supabase';

const router = useRouter();
const auth = useAuth();

// Active main tab: 'STUDENT' | 'TEACHER' | 'ADMIN'
const activeRoleTab = ref('STUDENT');

// Sub-mode for Teacher: 'LOGIN' | 'REGISTER'
const teacherMode = ref('LOGIN');

// Sub-mode for Admin: 'LOGIN' | 'REDEEM'
const adminMode = ref('LOGIN');

// Form States
const loginForm = ref({ email: '', password: '' });
const teacherRegForm = ref({ name: '', email: '', password: '', inviteCode: '' });
const adminRegForm = ref({ name: '', email: '', password: '', inviteCode: '' });

// UI States
const isSubmitting = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const showPassword = ref(false);

// Invite Code Validation state
const inviteCheck = ref({ checking: false, valid: null, message: '', role: null });

// Student email domain tester
const studentEmailTest = ref('');
const studentDomainStatus = ref(null);

const handleStudentGoogleLogin = async () => {
  errorMessage.value = '';
  isSubmitting.value = true;
  try {
    await signInWithGoogle();
  } catch (err) {
    errorMessage.value = err.message || 'Failed to initiate Google sign-in';
    isSubmitting.value = false;
  }
};

const handleTeacherLogin = async () => {
  errorMessage.value = '';
  successMessage.value = '';
  isSubmitting.value = true;

  try {
    const res = await loginWithEmail(loginForm.value.email, loginForm.value.password);
    auth.setSession(res.data.token, res.data.user);
    router.push('/dashboard');
  } catch (err) {
    errorMessage.value = err.message;
  } finally {
    isSubmitting.value = false;
  }
};

const handleTeacherRegister = async () => {
  errorMessage.value = '';
  successMessage.value = '';
  isSubmitting.value = true;

  try {
    const res = await registerTeacher(teacherRegForm.value);
    auth.setSession(res.data.token, res.data.user);
    successMessage.value = 'Teacher registration successful! Redirecting to studio...';
    setTimeout(() => router.push('/dashboard'), 1000);
  } catch (err) {
    errorMessage.value = err.message;
  } finally {
    isSubmitting.value = false;
  }
};

const handleAdminLogin = async () => {
  errorMessage.value = '';
  successMessage.value = '';
  isSubmitting.value = true;

  try {
    const res = await loginWithEmail(loginForm.value.email, loginForm.value.password);
    auth.setSession(res.data.token, res.data.user);
    router.push('/dashboard');
  } catch (err) {
    errorMessage.value = err.message;
  } finally {
    isSubmitting.value = false;
  }
};

const handleAdminRegister = async () => {
  errorMessage.value = '';
  successMessage.value = '';
  isSubmitting.value = true;

  try {
    const res = await registerAdmin(adminRegForm.value);
    auth.setSession(res.data.token, res.data.user);
    successMessage.value = 'Admin account verified and created! Redirecting to dashboard...';
    setTimeout(() => router.push('/dashboard'), 1000);
  } catch (err) {
    errorMessage.value = err.message;
  } finally {
    isSubmitting.value = false;
  }
};

// Live verification of Teacher Invite Code
const checkTeacherInvite = async () => {
  const code = teacherRegForm.value.inviteCode.trim();
  if (!code) {
    inviteCheck.value = { checking: false, valid: null, message: '', role: null };
    return;
  }

  inviteCheck.value.checking = true;
  try {
    const res = await validateInviteCode(code, 'TEACHER');
    inviteCheck.value = {
      checking: false,
      valid: true,
      message: 'Valid one-time Teacher invitation code',
      role: res.data.role
    };
  } catch (err) {
    inviteCheck.value = {
      checking: false,
      valid: false,
      message: err.message,
      role: null
    };
  }
};

// Live test for Student Email Domain
const testDomain = async () => {
  if (!studentEmailTest.value.includes('@')) {
    studentDomainStatus.value = null;
    return;
  }
  try {
    const res = await checkUniversityEmail(studentEmailTest.value);
    studentDomainStatus.value = res.isUniversity;
  } catch {
    studentDomainStatus.value = false;
  }
};
</script>

<template>
  <div class="auth-page">
    <div class="auth-container">
      <!-- Brand Logo & Header -->
      <header class="auth-brand">
        <div class="logo-circle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="brand-svg">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
        <h1 class="app-title">AutoQuiz Pro</h1>
        <p class="app-subtitle">AI Exam & Assessment Generator for Teachers</p>
      </header>

      <!-- Role Navigation Selector -->
      <nav class="role-selector-nav">
        <button
          type="button"
          :class="['role-tab', activeRoleTab === 'STUDENT' && 'active']"
          @click="activeRoleTab = 'STUDENT'; errorMessage = ''; successMessage = ''"
        >
          <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
            <path d="M6 12v5c3 3 9 3 12 0v-5"/>
          </svg>
          Student
        </button>

        <button
          type="button"
          :class="['role-tab', activeRoleTab === 'TEACHER' && 'active']"
          @click="activeRoleTab = 'TEACHER'; errorMessage = ''; successMessage = ''"
        >
          <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
            <path d="M6 6h10M6 10h10"/>
          </svg>
          Teacher
        </button>

        <button
          type="button"
          :class="['role-tab', activeRoleTab === 'ADMIN' && 'active']"
          @click="activeRoleTab = 'ADMIN'; errorMessage = ''; successMessage = ''"
        >
          <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          Admin
        </button>
      </nav>

      <!-- Alert Banners -->
      <div v-if="errorMessage" class="alert alert-error">
        <svg class="alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>{{ errorMessage }}</span>
      </div>

      <div v-if="successMessage" class="alert alert-success">
        <svg class="alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <span>{{ successMessage }}</span>
      </div>

      <!-- ============================================== -->
      <!-- TAB 1: STUDENT ACCESS (Google Only + Uni Email) -->
      <!-- ============================================== -->
      <section v-if="activeRoleTab === 'STUDENT'" class="auth-card glass-card">
        <div class="card-intro">
          <div class="badge badge-info">
            <span class="badge-dot"></span> Official University Email Required
          </div>
          <h2 class="card-heading">Student Portal Sign In</h2>
          <p class="card-subtext">
            Access exams, attempt timed assessments, and review AI-graded feedback.
            Students sign in exclusively with Google using an official university email.
          </p>
        </div>

        <div class="rules-box">
          <div class="rule-item">
            <span class="rule-icon check-icon">✓</span>
            <span>Google Single Sign-On with <code>@ptut.edu.pk</code> or any <code>.edu</code> email</span>
          </div>
          <div class="rule-item">
            <span class="rule-icon cross-icon">✕</span>
            <span>Personal emails (Gmail, Yahoo, Hotmail) are not permitted for student accounts</span>
          </div>
        </div>

        <button
          type="button"
          class="btn btn-google btn-block"
          @click="handleStudentGoogleLogin"
          :disabled="isSubmitting"
        >
          <svg class="google-svg" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
            <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
            <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
            <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
          </svg>
          {{ isSubmitting ? 'Connecting with Google...' : 'Continue with Google (University Account)' }}
        </button>

        <!-- University Email Validator Preview Box -->
        <div class="domain-checker">
          <label class="domain-label">Check if your email qualifies as an official university address:</label>
          <div class="domain-input-wrap">
            <input
              v-model="studentEmailTest"
              type="email"
              placeholder="e.g. 2022-ptut-cs-045@ptut.edu.pk"
              class="input-sm"
              @input="testDomain"
            />
            <span v-if="studentDomainStatus === true" class="status-pill status-pill-success">
              ✓ Eligible (.edu / University)
            </span>
            <span v-else-if="studentDomainStatus === false" class="status-pill status-pill-danger">
              ✕ Ineligible (Personal / Non-academic)
            </span>
          </div>
        </div>
      </section>

      <!-- ============================================== -->
      <!-- TAB 2: TEACHER ACCESS (Login or Register)     -->
      <!-- ============================================== -->
      <section v-if="activeRoleTab === 'TEACHER'" class="auth-card glass-card">
        <div class="card-sub-switch">
          <button
            type="button"
            :class="['switch-btn', teacherMode === 'LOGIN' && 'active']"
            @click="teacherMode = 'LOGIN'; errorMessage = ''; successMessage = ''"
          >
            Teacher Sign In
          </button>
          <button
            type="button"
            :class="['switch-btn', teacherMode === 'REGISTER' && 'active']"
            @click="teacherMode = 'REGISTER'; errorMessage = ''; successMessage = ''"
          >
            Register with Invite Code
          </button>
        </div>

        <!-- 2A. Teacher Login -->
        <div v-if="teacherMode === 'LOGIN'">
          <div class="card-intro">
            <h2 class="card-heading">Welcome Back, Educator</h2>
            <p class="card-subtext">Sign in to create, manage, and evaluate AI-powered quizzes.</p>
          </div>

          <form @submit.prevent="handleTeacherLogin" class="form-body">
            <div class="form-group">
              <label class="form-label">Email Address</label>
              <input
                v-model="loginForm.email"
                type="email"
                placeholder="teacher@school.edu or personal@gmail.com"
                required
                class="form-input"
              />
            </div>

            <div class="form-group">
              <div class="label-row">
                <label class="form-label">Password</label>
                <button type="button" class="btn-link" @click="showPassword = !showPassword">
                  {{ showPassword ? 'Hide' : 'Show' }}
                </button>
              </div>
              <input
                v-model="loginForm.password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="Enter your password"
                required
                class="form-input"
              />
            </div>

            <button type="submit" class="btn btn-primary btn-block" :disabled="isSubmitting">
              {{ isSubmitting ? 'Signing in...' : 'Sign In as Teacher' }}
            </button>
          </form>

          <div class="divider"><span>OR</span></div>

          <button
            type="button"
            class="btn btn-google btn-block"
            @click="handleStudentGoogleLogin"
            :disabled="isSubmitting"
          >
            <svg class="google-svg" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
              <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
              <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
              <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
            </svg>
            Sign In with Google (Teacher Account)
          </button>
        </div>

        <!-- 2B. Teacher Registration with Invite Code -->
        <div v-else>
          <div class="card-intro">
            <h2 class="card-heading">Register Teacher Account</h2>
            <p class="card-subtext">
              Teachers can use an organization or personal email, but must provide a one-time invitation code from an Admin.
            </p>
          </div>

          <form @submit.prevent="handleTeacherRegister" class="form-body">
            <div class="form-group">
              <label class="form-label">Full Name</label>
              <input
                v-model="teacherRegForm.name"
                type="text"
                placeholder="Dr. Emily Watson"
                required
                class="form-input"
              />
            </div>

            <div class="form-group">
              <label class="form-label">Email Address (Organization or Personal)</label>
              <input
                v-model="teacherRegForm.email"
                type="email"
                placeholder="emily@university.edu or emily@gmail.com"
                required
                class="form-input"
              />
            </div>

            <div class="form-group">
              <label class="form-label">Password (Minimum 8 characters)</label>
              <input
                v-model="teacherRegForm.password"
                type="password"
                placeholder="Create a strong password"
                minlength="8"
                required
                class="form-input"
              />
            </div>

            <div class="form-group">
              <div class="label-row">
                <label class="form-label">One-Time Teacher Invitation Code</label>
                <span v-if="inviteCheck.checking" class="text-xs text-muted">Checking code...</span>
              </div>
              <div class="input-with-validation">
                <input
                  v-model="teacherRegForm.inviteCode"
                  type="text"
                  placeholder="e.g. TEACHER-INVITE-2026"
                  required
                  class="form-input code-input"
                  @blur="checkTeacherInvite"
                />
                <button type="button" class="btn-check-code" @click="checkTeacherInvite">
                  Verify
                </button>
              </div>

              <p v-if="inviteCheck.valid === true" class="status-msg text-success">
                ✓ {{ inviteCheck.message }}
              </p>
              <p v-else-if="inviteCheck.valid === false" class="status-msg text-danger">
                ✕ {{ inviteCheck.message }}
              </p>
              <p v-else class="status-msg text-dim">
                Invitation codes are strictly single-use and granted by administrators.
              </p>
            </div>

            <button type="submit" class="btn btn-primary btn-block" :disabled="isSubmitting">
              {{ isSubmitting ? 'Creating Teacher Account...' : 'Complete Teacher Registration' }}
            </button>
          </form>
        </div>
      </section>

      <!-- ============================================== -->
      <!-- TAB 3: ADMIN ACCESS                           -->
      <!-- ============================================== -->
      <section v-if="activeRoleTab === 'ADMIN'" class="auth-card glass-card">
        <div class="card-sub-switch">
          <button
            type="button"
            :class="['switch-btn', adminMode === 'LOGIN' && 'active']"
            @click="adminMode = 'LOGIN'; errorMessage = ''; successMessage = ''"
          >
            Admin Sign In
          </button>
          <button
            type="button"
            :class="['switch-btn', adminMode === 'REDEEM' && 'active']"
            @click="adminMode = 'REDEEM'; errorMessage = ''; successMessage = ''"
          >
            Redeem ADMIN Invite
          </button>
        </div>

        <!-- 3A. Admin Login -->
        <div v-if="adminMode === 'LOGIN'">
          <div class="card-intro">
            <h2 class="card-heading">Administrator Portal</h2>
            <p class="card-subtext">Manage invitation codes, inspect user roles, and configure system rules.</p>
          </div>

          <form @submit.prevent="handleAdminLogin" class="form-body">
            <div class="form-group">
              <label class="form-label">Administrator Email</label>
              <input
                v-model="loginForm.email"
                type="email"
                placeholder="admin@autoquiz.pro"
                required
                class="form-input"
              />
            </div>

            <div class="form-group">
              <label class="form-label">Password</label>
              <input
                v-model="loginForm.password"
                type="password"
                placeholder="Enter admin password"
                required
                class="form-input"
              />
            </div>

            <button type="submit" class="btn btn-primary btn-block" :disabled="isSubmitting">
              {{ isSubmitting ? 'Authenticating Admin...' : 'Sign In as Administrator' }}
            </button>
          </form>
        </div>

        <!-- 3B. Redeem ADMIN Invite -->
        <div v-else>
          <div class="card-intro">
            <div class="badge badge-warning">
              <span class="badge-dot"></span> Restricted ADMIN Creation
            </div>
            <h2 class="card-heading">Create Administrator Account</h2>
            <p class="card-subtext">
              Admin accounts can only be created through a valid invitation code with role ADMIN.
            </p>
          </div>

          <form @submit.prevent="handleAdminRegister" class="form-body">
            <div class="form-group">
              <label class="form-label">Full Name</label>
              <input
                v-model="adminRegForm.name"
                type="text"
                placeholder="System Administrator"
                required
                class="form-input"
              />
            </div>

            <div class="form-group">
              <label class="form-label">Official Email</label>
              <input
                v-model="adminRegForm.email"
                type="email"
                placeholder="admin@ptut.edu.pk"
                required
                class="form-input"
              />
            </div>

            <div class="form-group">
              <label class="form-label">Password (Minimum 8 characters)</label>
              <input
                v-model="adminRegForm.password"
                type="password"
                placeholder="Create a strong password"
                minlength="8"
                required
                class="form-input"
              />
            </div>

            <div class="form-group">
              <label class="form-label">ADMIN Invitation Code</label>
              <input
                v-model="adminRegForm.inviteCode"
                type="text"
                placeholder="e.g. ADMIN-PRO-INIT-2026"
                required
                class="form-input code-input"
              />
              <p class="status-msg text-dim">
                Initial system code: <code>ADMIN-PRO-INIT-2026</code>
              </p>
            </div>

            <button type="submit" class="btn btn-primary btn-block" :disabled="isSubmitting">
              {{ isSubmitting ? 'Registering Admin...' : 'Create Admin Account' }}
            </button>
          </form>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2.5rem 1.5rem;
}

.auth-container {
  width: 100%;
  max-width: 520px;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* Brand */
.auth-brand {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.logo-circle {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  box-shadow: var(--glow-indigo);
  margin-bottom: 0.25rem;
}

.brand-svg {
  width: 32px;
  height: 32px;
}

.app-title {
  font-family: var(--font-heading);
  font-size: 1.85rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  background: linear-gradient(135deg, #ffffff 40%, #a5b4fc 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.app-subtitle {
  font-size: 0.9rem;
  color: var(--text-muted);
}

/* Role Selector Navigation */
.role-selector-nav {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  background: rgba(0, 0, 0, 0.4);
  padding: 0.35rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  gap: 0.35rem;
}

.role-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 0.5rem;
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-muted);
  background: transparent;
  transition: var(--transition);
}

.role-tab:hover {
  color: var(--text-main);
  background: rgba(255, 255, 255, 0.05);
}

.role-tab.active {
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  color: white;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);
}

.tab-icon {
  width: 18px;
  height: 18px;
}

/* Card Container */
.auth-card {
  padding: 2rem 2.25rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.card-intro {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.card-heading {
  font-family: var(--font-heading);
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text-main);
}

.card-subtext {
  font-size: 0.88rem;
  color: var(--text-muted);
  line-height: 1.5;
}

/* Sub-Mode Switcher */
.card-sub-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  background: rgba(0, 0, 0, 0.3);
  padding: 0.25rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  gap: 0.25rem;
}

.switch-btn {
  padding: 0.6rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-muted);
  background: transparent;
  border-radius: var(--radius-sm);
}

.switch-btn.active {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-main);
  border: 1px solid rgba(255, 255, 255, 0.15);
}

/* Rules Checklist Box */
.rules-box {
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.rule-item {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.rule-icon {
  font-weight: 700;
  font-size: 0.95rem;
  line-height: 1.2;
}

.check-icon {
  color: #34d399;
}

.cross-icon {
  color: #f43f5e;
}

.rule-item code {
  color: var(--accent-cyan);
  background: rgba(255, 255, 255, 0.05);
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
}

/* Form Styles */
.form-body {
  display: flex;
  flex-direction: column;
  gap: 1.15rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.form-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-main);
}

.btn-link {
  font-size: 0.8rem;
  color: var(--accent-primary);
  background: transparent;
}

.btn-link:hover {
  text-decoration: underline;
}

.form-input {
  width: 100%;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--border-color);
  padding: 0.8rem 1rem;
  border-radius: var(--radius-sm);
  color: var(--text-main);
  font-size: 0.92rem;
  outline: none;
  transition: var(--transition);
}

.form-input:focus {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
}

.code-input {
  font-family: monospace;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.input-with-validation {
  display: flex;
  gap: 0.5rem;
}

.btn-check-code {
  padding: 0 1rem;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  font-weight: 600;
}

.btn-check-code:hover {
  background: rgba(255, 255, 255, 0.15);
}

.status-msg {
  font-size: 0.78rem;
  margin-top: 0.2rem;
}

.text-success { color: #34d399; }
.text-danger { color: #f43f5e; }
.text-dim { color: var(--text-dim); }

/* Buttons */
.btn-block {
  width: 100%;
  justify-content: center;
}

.btn-google {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: var(--text-main);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.8rem;
  padding: 0.95rem 1.25rem;
  font-weight: 600;
  font-size: 0.95rem;
  border-radius: var(--radius-sm);
}

.btn-google:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.25);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
}

.google-svg {
  width: 20px;
  height: 20px;
}

.divider {
  display: flex;
  align-items: center;
  text-align: center;
  color: var(--text-dim);
  font-size: 0.75rem;
  margin: 0.5rem 0;
}

.divider::before, .divider::after {
  content: '';
  flex: 1;
  border-bottom: 1px solid var(--border-color);
}

.divider span {
  padding: 0 0.85rem;
}

/* Domain Checker Widget */
.domain-checker {
  background: rgba(0, 0, 0, 0.25);
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-sm);
  padding: 0.85rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.domain-label {
  font-size: 0.78rem;
  color: var(--text-dim);
}

.domain-input-wrap {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.input-sm {
  flex: 1;
  min-width: 200px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--border-color);
  padding: 0.45rem 0.75rem;
  border-radius: var(--radius-sm);
  color: var(--text-main);
  font-size: 0.82rem;
  outline: none;
}

.status-pill {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.25rem 0.6rem;
  border-radius: var(--radius-full);
}

.status-pill-success {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.status-pill-danger {
  background: rgba(244, 63, 94, 0.15);
  color: #fb7185;
  border: 1px solid rgba(244, 63, 94, 0.3);
}

/* Alerts */
.alert {
  padding: 0.85rem 1.15rem;
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.alert-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.alert-error {
  background: rgba(244, 63, 94, 0.12);
  border: 1px solid rgba(244, 63, 94, 0.3);
  color: #fb7185;
}

.alert-success {
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: #34d399;
}
</style>
