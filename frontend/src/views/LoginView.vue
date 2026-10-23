<script setup>
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuth } from '../store/auth';
import { loginUser } from '../api';
import { signInWithGoogle } from '../supabase';

const router = useRouter();
const route = useRoute();
const auth = useAuth();

const form = ref({
  email: '',
  password: ''
});

const isSubmitting = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const showPassword = ref(false);
const verificationNotice = ref(null);

onMounted(() => {
  const registeredMsg = sessionStorage.getItem('auth_success_msg');
  if (registeredMsg) {
    successMessage.value = registeredMsg;
    sessionStorage.removeItem('auth_success_msg');
  } else if (route.query.registered) {
    successMessage.value = 'Registration complete! Please sign in to access your dashboard.';
  }
});

const handleLogin = async () => {
  errorMessage.value = '';
  verificationNotice.value = null;
  isSubmitting.value = true;

  try {
    const res = await loginUser(form.value);

    if (res.status === 'verification_required') {
      verificationNotice.value = {
        message: res.message,
        verificationLink: res.data?.verificationLink
      };
      return;
    }

    if (res.data?.token) {
      auth.setSession(res.data.token, res.data.user);
      router.push('/dashboard');
    }
  } catch (err) {
    errorMessage.value = err.message || 'Invalid email or password';
  } finally {
    isSubmitting.value = false;
  }
};

const handleGoogleSignIn = async () => {
  errorMessage.value = '';
  verificationNotice.value = null;
  isSubmitting.value = true;

  try {
    await signInWithGoogle();
  } catch (err) {
    errorMessage.value = err.message || 'Google sign in failed';
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
        <p class="app-subtitle">AI Exam & Assessment Generator</p>
      </header>

      <div class="auth-card glass-card">
        <div class="card-intro">
          <h2 class="card-heading">Sign In</h2>
          <p class="card-subtext">Access your academic assessments and courses.</p>
        </div>

        <div v-if="successMessage" class="alert alert-success">
          <span>{{ successMessage }}</span>
        </div>

        <div v-if="errorMessage" class="alert alert-error">
          <span>{{ errorMessage }}</span>
        </div>

        <!-- Verification Notice for Unverified Student Browsers -->
        <div v-if="verificationNotice" class="alert alert-warning">
          <div class="notice-content">
            <p class="font-bold">Browser Verification Required</p>
            <p>{{ verificationNotice.message }}</p>
            <div v-if="verificationNotice.verificationLink" class="preview-verify-box">
              <span class="preview-label">Local preview verification link:</span>
              <a :href="verificationNotice.verificationLink" target="_blank" class="preview-link">
                Click here to verify this browser &rarr;
              </a>
            </div>
          </div>
        </div>

        <form @submit.prevent="handleLogin" class="form-body">
          <div class="form-group">
            <label class="form-label">Email Address</label>
            <input
              v-model="form.email"
              type="email"
              placeholder="e.g. name@university.edu or personal@email.com"
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
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="Enter your password"
              required
              class="form-input"
            />
          </div>

          <button type="submit" class="btn btn-primary btn-block" :disabled="isSubmitting">
            {{ isSubmitting ? 'Signing in...' : 'Sign In' }}
          </button>
        </form>

        <div class="divider"><span>OR</span></div>

        <button
          type="button"
          class="btn btn-google btn-block"
          @click="handleGoogleSignIn"
          :disabled="isSubmitting"
        >
          <svg class="google-svg" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
            <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
            <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
            <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
          </svg>
          Continue with Google
        </button>

        <div class="card-footer">
          <span>Don't have an account?</span>
          <router-link to="/register" class="link-bold">Register here</router-link>
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
  max-width: 460px;
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

.btn-block {
  width: 100%;
  justify-content: center;
  padding: 0.95rem;
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
}

.divider::before, .divider::after {
  content: '';
  flex: 1;
  border-bottom: 1px solid var(--border-color);
}

.divider span {
  padding: 0 0.85rem;
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

.alert-warning {
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.3);
  color: #fbbf24;
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

.font-bold {
  font-weight: 700;
}
</style>
