<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { registerUser } from '../api';

const router = useRouter();

const form = ref({
  name: '',
  email: '',
  password: '',
  inviteCode: ''
});

const isSubmitting = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const showPassword = ref(false);
const verificationLink = ref(null);

const handleRegister = async () => {
  errorMessage.value = '';
  successMessage.value = '';
  verificationLink.value = null;
  isSubmitting.value = true;

  try {
    const res = await registerUser(form.value);

    if (res.data?.verificationRequired) {
      // Student registration: verification email sent
      successMessage.value = res.data.message;
      verificationLink.value = res.data.verificationLink;
      // Also save message to sessionStorage so Login page can display it when redirected
      sessionStorage.setItem('auth_success_msg', res.data.message);
      setTimeout(() => {
        router.push({ path: '/login', query: { registered: 'student' } });
      }, 3500);
    } else {
      // Teacher or Admin registration: completed
      successMessage.value = res.data?.message || 'Account registered successfully! Redirecting to login...';
      sessionStorage.setItem('auth_success_msg', successMessage.value);
      setTimeout(() => {
        router.push({ path: '/login', query: { registered: 'true' } });
      }, 1500);
    }
  } catch (err) {
    errorMessage.value = err.message || 'Registration failed';
  } finally {
    isSubmitting.value = false;
  }
};
</script>

<template>
  <div class="auth-page">
    <div class="auth-container">
      <header class="auth-brand">
        <div class="logo-circle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="brand-svg">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
        <h1 class="app-title">AutoQuiz Pro</h1>
        <p class="app-subtitle">Create Your Account</p>
      </header>

      <div class="auth-card glass-card">
        <div class="card-intro">
          <h2 class="card-heading">Register Account</h2>
          <p class="card-subtext">
            Enter your details below. Once registered, you will be redirected to the sign in page.
          </p>
        </div>

        <div v-if="errorMessage" class="alert alert-error">
          <span>{{ errorMessage }}</span>
        </div>

        <div v-if="successMessage" class="alert alert-success">
          <div>
            <p>{{ successMessage }}</p>
            <div v-if="verificationLink" class="preview-verify-box">
              <span class="preview-label">Local preview verification link:</span>
              <a :href="verificationLink" target="_blank" class="preview-link">
                Click here to verify this browser now &rarr;
              </a>
            </div>
          </div>
        </div>

        <form @submit.prevent="handleRegister" class="form-body">
          <div class="form-group">
            <label class="form-label">Full Name</label>
            <input
              v-model="form.name"
              type="text"
              placeholder="e.g. Alex Morgan"
              required
              class="form-input"
            />
          </div>

          <div class="form-group">
            <label class="form-label">Email Address</label>
            <input
              v-model="form.email"
              type="email"
              placeholder="e.g. student@ptut.edu.pk or faculty@institution.edu"
              required
              class="form-input"
            />
            <span class="input-hint">
              Students must use their official university email (.edu). Faculty may use university or personal email with an invite code.
            </span>
          </div>

          <div class="form-group">
            <div class="label-row">
              <label class="form-label">Password</label>
              <button type="button" class="btn-link" @click="showPassword = !showPassword">
                {{ showPassword ? 'Hide' : 'Show' }}
              </button>
            </div>
            <input
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="Create strong password (min 8 characters)"
              minlength="8"
              required
              class="form-input"
            />
          </div>

          <div class="form-group">
            <label class="form-label">Invitation Code</label>
            <input
              v-model="form.inviteCode"
              type="text"
              placeholder="Enter invitation code (Required for Teachers/Admins; Leave blank if Student)"
              class="form-input code-input"
            />
            <span class="input-hint">
              Teachers and Admins must provide a one-time invitation code from their University Administrator. University students can leave this blank.
            </span>
          </div>

          <button type="submit" class="btn btn-primary btn-block" :disabled="isSubmitting">
            {{ isSubmitting ? 'Creating Account...' : 'Register Account' }}
          </button>
        </form>

        <div class="card-footer">
          <span>Already have an account?</span>
          <router-link to="/login" class="link-bold">Sign In here</router-link>
        </div>
      </div>
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
  max-width: 480px;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.auth-brand {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.logo-circle {
  width: 54px;
  height: 54px;
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
  width: 30px;
  height: 30px;
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

.auth-card {
  padding: 2.25rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.card-intro {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
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
}

.form-body {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
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

.input-hint {
  font-size: 0.75rem;
  color: var(--text-dim);
  line-height: 1.4;
}

.btn-link {
  font-size: 0.8rem;
  color: var(--accent-primary);
  background: transparent;
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

.btn-block {
  width: 100%;
  justify-content: center;
  padding: 0.95rem;
  margin-top: 0.5rem;
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: var(--text-muted);
  border-top: 1px solid var(--border-color);
  padding-top: 1.25rem;
}

.link-bold {
  color: var(--accent-primary);
  font-weight: 600;
}

.alert {
  padding: 0.85rem 1.15rem;
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
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

.preview-verify-box {
  margin-top: 0.75rem;
  background: rgba(0, 0, 0, 0.3);
  padding: 0.6rem 0.85rem;
  border-radius: 4px;
}

.preview-label {
  display: block;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.preview-link {
  color: var(--accent-cyan);
  font-weight: 600;
  font-size: 0.85rem;
  word-break: break-all;
}
</style>
