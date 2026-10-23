<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { supabase } from '../supabase';
import { syncGoogleAuth } from '../api';
import { useAuth } from '../store/auth';

const router = useRouter();
const auth = useAuth();

const loading = ref(true);
const statusMessage = ref('Verifying Google authentication with AutoQuiz Pro server...');
const errorMessage = ref('');
const needsInviteCode = ref(false);
const pendingUser = ref({ email: '', name: '' });
const inviteCodeInput = ref('');
const isSubmittingInvite = ref(false);
const cachedAccessToken = ref('');

const completeOAuthSync = async (accessToken, inviteCode = null) => {
  loading.value = true;
  errorMessage.value = '';

  try {
    const res = await syncGoogleAuth(accessToken, inviteCode);

    if (res.status === 'need_invite_code') {
      loading.value = false;
      needsInviteCode.value = true;
      pendingUser.value = { email: res.email, name: res.name };
      cachedAccessToken.value = accessToken;
      return;
    }

    if (res.status === 'success' && res.data?.token) {
      statusMessage.value = 'Verification successful! Loading dashboard...';
      auth.setSession(res.data.token, res.data.user);
      setTimeout(() => {
        router.push('/dashboard');
      }, 800);
    } else {
      throw new Error(res.message || 'Authentication failed');
    }
  } catch (err) {
    loading.value = false;
    errorMessage.value = err.message || 'Failed to authenticate Google account with server';
  }
};

const handleInviteSubmit = async () => {
  if (!inviteCodeInput.value.trim()) return;
  isSubmittingInvite.value = true;
  errorMessage.value = '';

  try {
    await completeOAuthSync(cachedAccessToken.value, inviteCodeInput.value.trim());
  } finally {
    isSubmittingInvite.value = false;
  }
};

onMounted(async () => {
  try {
    if (!supabase) {
      throw new Error('Supabase client not initialized');
    }

    // Give Supabase a brief moment to parse hash fragments
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session) {
      // Check if session is delivered via onAuthStateChange
      supabase.auth.onAuthStateChange(async (event, newSession) => {
        if (newSession?.access_token) {
          await completeOAuthSync(newSession.access_token);
        } else if (event === 'SIGNED_OUT') {
          errorMessage.value = 'Google sign-in was cancelled or failed. Please try again.';
          loading.value = false;
        }
      });
      return;
    }

    if (session.access_token) {
      await completeOAuthSync(session.access_token);
    }
  } catch (err) {
    loading.value = false;
    errorMessage.value = err.message;
  }
});
</script>

<template>
  <div class="callback-page">
    <div class="callback-card glass-card">
      <!-- Loading State -->
      <div v-if="loading" class="state-box">
        <div class="spinner"></div>
        <h2 class="state-title">Authenticating Session</h2>
        <p class="state-text">{{ statusMessage }}</p>
      </div>

      <!-- Invite Code Required State (Non-university email prompt) -->
      <div v-else-if="needsInviteCode" class="state-box">
        <div class="icon-circle icon-indigo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="8.5" cy="7" r="4"/>
            <line x1="20" y1="8" x2="20" y2="14"/>
            <line x1="23" y1="11" x2="17" y2="11"/>
          </svg>
        </div>

        <h2 class="state-title">Teacher or Admin Invitation Required</h2>
        <p class="state-text">
          Google account <strong>{{ pendingUser.email }}</strong> is not recognized as an official university student domain.
        </p>

        <div class="notice-box">
          <p class="notice-title">How AutoQuiz Pro Roles Work:</p>
          <ul class="notice-list">
            <li><strong>Students:</strong> Must sign in with an official university email (e.g. <code>@ptut.edu.pk</code> or <code>.edu</code>).</li>
            <li><strong>Teachers & Admins:</strong> Can use any email, but require a one-time invitation code from an administrator.</li>
          </ul>
        </div>

        <form @submit.prevent="handleInviteSubmit" class="invite-form">
          <div class="form-group">
            <label class="form-label">Enter One-Time Invitation Code</label>
            <input
              v-model="inviteCodeInput"
              type="text"
              placeholder="e.g. TEACHER-INVITE-2026"
              required
              class="form-input code-input"
            />
          </div>

          <div v-if="errorMessage" class="error-text">
            {{ errorMessage }}
          </div>

          <div class="action-buttons">
            <button
              type="submit"
              class="btn btn-primary"
              :disabled="isSubmittingInvite"
            >
              {{ isSubmittingInvite ? 'Verifying...' : 'Validate Code & Complete Setup' }}
            </button>
            <router-link to="/login" class="btn btn-secondary">
              Cancel & Return to Login
            </router-link>
          </div>
        </form>
      </div>

      <!-- Error State -->
      <div v-else-if="errorMessage" class="state-box">
        <div class="icon-circle icon-danger">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        </div>
        <h2 class="state-title">Authentication Failed</h2>
        <p class="state-text text-danger">{{ errorMessage }}</p>
        <router-link to="/login" class="btn btn-primary">
          Return to Sign In
        </router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.callback-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1.5rem;
}

.callback-card {
  width: 100%;
  max-width: 500px;
  padding: 2.5rem 2rem;
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
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-circle svg {
  width: 28px;
  height: 28px;
}

.icon-indigo {
  background: rgba(99, 102, 241, 0.15);
  color: #818cf8;
}

.icon-danger {
  background: rgba(244, 63, 94, 0.15);
  color: #fb7185;
}

.state-title {
  font-family: var(--font-heading);
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text-main);
}

.state-text {
  font-size: 0.9rem;
  color: var(--text-muted);
  line-height: 1.5;
}

.notice-box {
  text-align: left;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 1rem;
  font-size: 0.82rem;
  width: 100%;
}

.notice-title {
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 0.5rem;
}

.notice-list {
  padding-left: 1.2rem;
  color: var(--text-muted);
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.notice-list code {
  color: var(--accent-cyan);
}

.invite-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  text-align: left;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-main);
}

.form-input {
  width: 100%;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--border-color);
  padding: 0.8rem 1rem;
  border-radius: var(--radius-sm);
  color: var(--text-main);
  font-size: 0.95rem;
}

.code-input {
  font-family: monospace;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.error-text {
  color: #fb7185;
  font-size: 0.85rem;
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
</style>
