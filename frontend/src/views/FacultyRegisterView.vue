<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { registerUser, validateInviteCode } from '../api';

const router = useRouter();

const form = ref({
  name: '',
  email: '',
  password: '',
  inviteCode: ''
});

const isSubmitting = ref(false);
const isValidatingCode = ref(false);
const validatedInvite = ref(null);
const errorMessage = ref('');
const successMessage = ref('');
const showPassword = ref(false);

const checkInviteCode = async () => {
  if (!form.value.inviteCode || form.value.inviteCode.trim().length < 4) {
    validatedInvite.value = null;
    return;
  }

  isValidatingCode.value = true;
  errorMessage.value = '';

  try {
    const res = await validateInviteCode(form.value.inviteCode.trim());
    if (res.status === 'success' && res.data?.valid) {
      validatedInvite.value = res.data;
    } else {
      validatedInvite.value = null;
    }
  } catch (err) {
    validatedInvite.value = null;
  } finally {
    isValidatingCode.value = false;
  }
};

const handleFacultyRegister = async () => {
  errorMessage.value = '';
  successMessage.value = '';

  if (!form.value.inviteCode || !form.value.inviteCode.trim()) {
    errorMessage.value = 'An official invitation code from your University Administrator is strictly required to register faculty or administrator access.';
    return;
  }

  isSubmitting.value = true;

  try {
    const res = await registerUser({
      name: form.value.name,
      email: form.value.email,
      password: form.value.password,
      inviteCode: form.value.inviteCode.trim()
    });

    const roleName = res.data?.role || 'Educator / Staff';
    const uniName = res.data?.universityName || 'your Institution';

    successMessage.value = `Account registered successfully as ${roleName} for ${uniName}! Redirecting to sign in...`;
    sessionStorage.setItem('auth_success_msg', successMessage.value);

    setTimeout(() => {
      router.push({ path: '/login', query: { registered: 'faculty' } });
    }, 1500);
  } catch (err) {
    errorMessage.value = err.message || 'Registration failed. Please check your invitation code.';
  } finally {
    isSubmitting.value = false;
  }
};
</script>

<template>
  <div class="auth-page">
    <div class="auth-container">
      <header class="auth-brand">
        <div class="logo-circle institutional">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="brand-svg">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div class="badge-institutional">
          <span class="badge-dot"></span>
          INSTITUTIONAL ACCESS ONLY
        </div>
        <h1 class="app-title">Faculty & Staff Onboarding</h1>
        <p class="app-subtitle">AutoQuiz Pro Academic Management System</p>
      </header>

      <div class="auth-card glass-card">
        <div class="card-intro">
          <h2 class="card-heading">Educator Registration</h2>
          <p class="card-subtext">
            This portal is strictly reserved for University Instructors and Administrators holding an authorized invitation code.
          </p>
        </div>

        <div v-if="errorMessage" class="alert alert-error">
          <svg class="alert-icon" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
          </svg>
          <span>{{ errorMessage }}</span>
        </div>

        <div v-if="successMessage" class="alert alert-success">
          <svg class="alert-icon" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
          </svg>
          <span>{{ successMessage }}</span>
        </div>

        <form @submit.prevent="handleFacultyRegister" class="form-body">
          <!-- INVITATION CODE (MANDATORY FIRST FIELD) -->
          <div class="form-group highlight-group">
            <div class="label-row">
              <label class="form-label required-label">Administrator Invitation Code</label>
              <span v-if="isValidatingCode" class="validating-hint">Checking code...</span>
            </div>
            <div class="input-with-validation">
              <input
                v-model="form.inviteCode"
                type="text"
                placeholder="e.g. TCH-ABCD1234 or ADM-XXXX9999"
                required
                @blur="checkInviteCode"
                @input="checkInviteCode"
                class="form-input code-input"
                :class="{ 'input-valid': validatedInvite, 'input-pending': isValidatingCode }"
              />
              <span v-if="validatedInvite" class="badge-valid-check">
                <svg viewBox="0 0 20 20" fill="currentColor" class="check-svg">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                </svg>
              </span>
            </div>

            <!-- Validated Code Pill -->
            <div v-if="validatedInvite" class="code-verified-pill">
              <span class="uni-name">{{ validatedInvite.universityName || 'Verified Institution' }}</span>
              <span class="role-badge" :class="validatedInvite.role.toLowerCase()">
                {{ validatedInvite.role === 'ADMIN' ? 'University Administrator' : 'Course Teacher' }}
              </span>
            </div>
            <span v-else class="input-hint">
              Your University Administrator must provide this single-use code.
            </span>
          </div>

          <div class="form-group">
            <label class="form-label required-label">Full Name & Title</label>
            <input
              v-model="form.name"
              type="text"
              placeholder="e.g. Dr. Robert Vance or Prof. Sarah Clark"
              required
              class="form-input"
            />
          </div>

          <div class="form-group">
            <label class="form-label required-label">Institutional / Professional Email</label>
            <input
              v-model="form.email"
              type="email"
              placeholder="e.g. professor.clark@university.edu"
              required
              class="form-input"
            />
          </div>

          <div class="form-group">
            <div class="label-row">
              <label class="form-label required-label">Password</label>
              <button type="button" class="btn-link" @click="showPassword = !showPassword">
                {{ showPassword ? 'Hide' : 'Show' }}
              </button>
            </div>
            <input
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="Create secure password (min 8 characters)"
              minlength="8"
              required
              class="form-input"
            />
          </div>

          <button
            type="submit"
            class="btn btn-primary btn-block btn-lg"
            :disabled="isSubmitting"
          >
            {{ isSubmitting ? 'Registering Institutional Account...' : 'Complete Faculty Registration' }}
          </button>
        </form>

        <div class="card-footer">
          <span>Already registered?</span>
          <router-link to="/login" class="link-bold">Go to Sign In</router-link>
        </div>
      </div>

      <!-- Private notice footer -->
      <footer class="private-footer">
        <p>🔒 Restricted Area: Public students must register via the standard student portal.</p>
        <router-link to="/register" class="link-subtle">Student Registration &rarr;</router-link>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3rem 1.5rem;
  background-color: var(--bg-page);
}

.auth-container {
  width: 100%;
  max-width: 500px;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.auth-brand {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
}

.logo-circle.institutional {
  width: 58px;
  height: 58px;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-vivid));
  display: flex;
  align-items: center;
  justify-content: center;
  color: #FFFFFF;
  box-shadow: 0 4px 14px rgba(56, 189, 248, 0.35);
}

.brand-svg {
  width: 32px;
  height: 32px;
}

.badge-institutional {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.35rem 0.85rem;
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  border-radius: var(--radius-full);
  background: var(--bg-hover);
  color: var(--accent-deep);
  border: 1px solid var(--border-sky);
  text-transform: uppercase;
}

.badge-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent-vivid);
  box-shadow: 0 0 6px var(--accent-primary);
}

.app-title {
  font-family: var(--font-heading);
  font-size: 1.95rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text-main);
}

.app-subtitle {
  font-size: 0.9rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.auth-card {
  background-color: var(--bg-card);
  border: 1px solid var(--border-sky);
  border-radius: var(--radius-lg);
  padding: 2.25rem;
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.card-intro {
  text-align: center;
}

.card-heading {
  font-family: var(--font-heading);
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 0.35rem;
}

.card-subtext {
  font-size: 0.88rem;
  color: var(--text-secondary);
  line-height: 1.45;
}

.form-body {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.highlight-group {
  padding: 1rem;
  background: var(--bg-page);
  border: 1px solid var(--border-sky);
  border-radius: var(--radius-md);
}

.label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.form-label {
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--text-main);
}

.required-label::after {
  content: ' *';
  color: var(--color-error);
}

.validating-hint {
  font-size: 0.75rem;
  color: var(--accent-vivid);
  font-weight: 600;
}

.input-with-validation {
  position: relative;
  display: flex;
  align-items: center;
}

.code-input {
  text-transform: uppercase;
  font-family: monospace;
  font-weight: 700;
  letter-spacing: 0.05em;
  padding-right: 2.5rem;
}

.badge-valid-check {
  position: absolute;
  right: 0.75rem;
  display: flex;
  align-items: center;
  color: var(--color-success);
}

.check-svg {
  width: 20px;
  height: 20px;
}

.code-verified-pill {
  margin-top: 0.4rem;
  padding: 0.5rem 0.85rem;
  border-radius: var(--radius-sm);
  background: var(--bg-success);
  border: 1px solid var(--border-success);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.82rem;
}

.uni-name {
  color: var(--color-success);
  font-weight: 700;
}

.role-badge {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  background: var(--bg-hover);
  color: var(--accent-deep);
  border: 1px solid var(--border-sky);
  text-transform: uppercase;
}

.role-badge.admin {
  background: #EFF6FF;
  color: #1D4ED8;
  border: 1px solid #BFDBFE;
}

.input-hint {
  font-size: 0.75rem;
  color: var(--text-secondary);
  line-height: 1.35;
}

.form-input {
  width: 100%;
  padding: 0.75rem 1rem;
  border-radius: var(--radius-md);
  background-color: #FFFFFF;
  border: 1px solid var(--border-light);
  color: var(--text-main);
  font-size: 0.92rem;
  outline: none;
  transition: var(--transition-fast);
}

.form-input:hover {
  border-color: var(--border-sky);
}

.form-input:focus {
  border-color: var(--border-focus);
  box-shadow: var(--focus-ring);
}

.btn-lg {
  padding: 0.85rem 1.25rem;
  font-size: 0.95rem;
  font-weight: 700;
  margin-top: 0.5rem;
}

.btn-link {
  background: none;
  border: none;
  color: var(--accent-vivid);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}

.btn-link:hover {
  color: var(--accent-deep);
  text-decoration: underline;
}

.card-footer {
  text-align: center;
  font-size: 0.88rem;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-light);
}

.link-bold {
  color: var(--accent-vivid);
  font-weight: 600;
  text-decoration: none;
}

.link-bold:hover {
  color: var(--accent-deep);
  text-decoration: underline;
}

.private-footer {
  text-align: center;
  font-size: 0.8rem;
  color: var(--text-secondary);
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 0.5rem;
}

.link-subtle {
  color: var(--accent-vivid);
  text-decoration: none;
  font-weight: 600;
}

.link-subtle:hover {
  color: var(--accent-deep);
  text-decoration: underline;
}
</style>
