<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { verifyEmailDevice } from '../api';

const route = useRoute();
const router = useRouter();

const loading = ref(true);
const success = ref(false);
const message = ref('Verifying your email and browser authorization...');

onMounted(async () => {
  const token = route.query.token;

  if (!token) {
    loading.value = false;
    success.value = false;
    message.value = 'Verification token is missing. Please click the full link sent to your university email.';
    return;
  }

  try {
    const res = await verifyEmailDevice(token);
    success.value = true;
    message.value = res.message || 'Browser verified successfully! You will only need to verify once on this browser.';
  } catch (err) {
    success.value = false;
    message.value = err.message || 'Verification link expired or invalid.';
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="verify-page">
    <div class="verify-card glass-card">
      <div v-if="loading" class="state-box">
        <div class="spinner"></div>
        <h2 class="state-title">Verifying Browser</h2>
        <p class="state-text">{{ message }}</p>
      </div>

      <div v-else-if="success" class="state-box">
        <div class="icon-circle icon-success">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h2 class="state-title">Browser Verified!</h2>
        <p class="state-text">{{ message }}</p>
        <div class="note-box">
          <p>This browser is now authorized. You can sign in anytime without repeating verification on this device.</p>
        </div>
        <router-link to="/login" class="btn btn-primary btn-block">
          Proceed to Sign In &rarr;
        </router-link>
      </div>

      <div v-else class="state-box">
        <div class="icon-circle icon-danger">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        </div>
        <h2 class="state-title">Verification Failed</h2>
        <p class="state-text text-danger">{{ message }}</p>
        <router-link to="/login" class="btn btn-secondary btn-block">
          Return to Sign In
        </router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.verify-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1.5rem;
}

.verify-card {
  width: 100%;
  max-width: 480px;
  padding: 2.75rem 2.25rem;
}

.state-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 1.25rem;
}

.spinner {
  width: 44px;
  height: 44px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.icon-circle {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-circle svg {
  width: 32px;
  height: 32px;
}

.icon-success {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
}

.icon-danger {
  background: rgba(244, 63, 94, 0.15);
  color: #fb7185;
}

.state-title {
  font-family: var(--font-heading);
  font-size: 1.45rem;
  font-weight: 700;
  color: var(--text-main);
}

.state-text {
  font-size: 0.92rem;
  color: var(--text-muted);
  line-height: 1.5;
}

.note-box {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--border-color);
  padding: 0.85rem 1rem;
  border-radius: var(--radius-sm);
  font-size: 0.82rem;
  color: #a5b4fc;
}

.btn-block {
  width: 100%;
  justify-content: center;
  padding: 0.9rem;
}
</style>
