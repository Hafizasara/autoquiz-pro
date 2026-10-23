<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { registerUser } from '../api';

const router = useRouter();

const form = ref({
  name: '',
  email: '',
  password: ''
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
      sessionStorage.setItem('auth_success_msg', res.data.message);
      setTimeout(() => {
        router.push({ path: '/login', query: { registered: 'student' } });
      }, 3500);
    } else {
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
        <p class="app-subtitle">Student Registration</p>
      </header>

      <div class="auth-card glass-card">
        <div class="card-intro">
          <h2 class="card-heading">Create Student Account</h2>
          <p class="card-subtext">
            Enter your details using your official university email. Once registered, you will be redirected to the sign in page.
          </p>
        </div>

        <div v-if="errorMessage" class="alert alert-error">
          <svg class="alert-icon" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
          </svg>
          <span>{{ errorMessage }}</span>
        </div>

        <div v-if="successMessage" class="alert alert-success">
          <div>
            <p>{{ successMessage }}</p>
            <div v-if="verificationLink" class="preview-verify-box">
              <span class="preview-label">Browser verification link:</span>
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
            <label class="form-label">University Email Address</label>
            <input
              v-model="form.email"
              type="email"
              placeholder="e.g. student@ptut.edu.pk or student@university.edu"
              required
              class="form-input"
            />
            <span class="input-hint">
              Must be your official university email address (.edu or registered institution domain).
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

          <button type="submit" class="btn btn-primary btn-block" :disabled="isSubmitting">
            {{ isSubmitting ? 'Creating Student Account...' : 'Complete Registration' }}
          </button>
        </form>

        <div class="card-footer">
          <span>Already registered?</span>
          <router-link to="/login" class="link-bold">Sign In here</router-link>
        </div>
      </div>

      <!-- Discreet footer for faculty & administrators -->
      <footer class="footer-institutional">
        <span>University Faculty or Staff?</span>
        <router-link to="/faculty-register" class="link-institutional">
          Faculty & Admin Portal &rarr;
        </router-link>
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
  padding: 2.5rem 1.5rem;
  background-color: var(--bg-page);
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
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-vivid));
  display: flex;
  align-items: center;
  justify-content: center;
  color: #FFFFFF;
  box-shadow: 0 4px 14px rgba(56, 189, 248, 0.35);
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
  gap: 1.25rem;
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
  gap: 1.15rem;
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
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--text-main);
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

.preview-verify-box {
  margin-top: 0.65rem;
  padding: 0.65rem 0.85rem;
  background-color: var(--bg-hover);
  border: 1px solid var(--border-sky);
  border-radius: var(--radius-sm);
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.preview-label {
  font-size: 0.75rem;
  color: var(--text-secondary);
  font-weight: 600;
}

.preview-link {
  font-size: 0.85rem;
  color: var(--accent-vivid);
  font-weight: 700;
  text-decoration: underline;
}

.preview-link:hover {
  color: var(--accent-deep);
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

.footer-institutional {
  text-align: center;
  font-size: 0.8rem;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  margin-top: 0.25rem;
}

.link-institutional {
  color: var(--accent-vivid);
  font-weight: 600;
  text-decoration: none;
}

.link-institutional:hover {
  color: var(--accent-deep);
  text-decoration: underline;
}
</style>
