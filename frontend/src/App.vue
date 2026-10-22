<script setup>
import { ref, onMounted } from 'vue';
import { checkApiHealth, validateInvitationCode } from './api';
import { isSupabaseConfigured, signInWithGoogle } from './supabase';

const apiStatus = ref({
  loading: true,
  connected: false,
  data: null,
  error: null
});

const invitationCode = ref('');
const invitationResult = ref(null);
const invitationLoading = ref(false);

const testBackendConnection = async () => {
  apiStatus.value.loading = true;
  apiStatus.value.error = null;
  try {
    const res = await checkApiHealth();
    if (res.status === 'success') {
      apiStatus.value.connected = true;
      apiStatus.value.data = res;
    } else {
      apiStatus.value.connected = false;
      apiStatus.value.error = res.message || 'Backend unreachable';
    }
  } catch (err) {
    apiStatus.value.connected = false;
    apiStatus.value.error = err.message;
  } finally {
    apiStatus.value.loading = false;
  }
};

const handleGoogleAuth = async () => {
  try {
    await signInWithGoogle();
  } catch (err) {
    alert(err.message);
  }
};

const handleTestInvitation = async () => {
  if (!invitationCode.value) return;
  invitationLoading.value = true;
  try {
    const res = await validateInvitationCode(invitationCode.value);
    invitationResult.value = res;
  } catch (err) {
    invitationResult.value = { status: 'error', message: err.message };
  } finally {
    invitationLoading.value = false;
  }
};

onMounted(() => {
  testBackendConnection();
});
</script>

<template>
  <div class="layout">
    <!-- Navigation Header -->
    <header class="header glass-card">
      <div class="brand">
        <div class="logo-box">
          <svg class="logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div>
          <h1 class="brand-title">AutoQuiz Pro</h1>
          <p class="brand-subtitle">AI Exam & Assessment Generator for Teachers</p>
        </div>
      </div>

      <div class="header-badges">
        <span class="badge badge-info">
          <span class="badge-dot"></span> EdTech Tools
        </span>
        <span :class="['badge', apiStatus.connected ? 'badge-success' : 'badge-warning']">
          <span class="badge-dot"></span>
          {{ apiStatus.loading ? 'Checking API...' : (apiStatus.connected ? 'API Online' : 'API Standby') }}
        </span>
      </div>
    </header>

    <!-- Main Container -->
    <main class="main-content">
      <!-- Hero Banner -->
      <section class="hero-section glass-card">
        <div class="hero-tag">System Ready & Setup Complete</div>
        <h2 class="hero-title">Academic & Student Productivity Powered by AI</h2>
        <p class="hero-description">
          AutoQuiz Pro provides automated test synthesis, rubrics generation, and intelligent answer evaluation for educators.
        </p>

        <div class="hero-actions">
          <button class="btn btn-primary" @click="testBackendConnection" :disabled="apiStatus.loading">
            <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
            </svg>
            {{ apiStatus.loading ? 'Connecting...' : 'Ping REST API (/api/v1/health)' }}
          </button>

          <button class="btn btn-secondary" @click="handleGoogleAuth">
            <svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z"/>
            </svg>
            Continue with Google
          </button>
        </div>
      </section>

      <!-- Architecture Status Grid -->
      <section class="grid-section">
        <!-- Backend API Card -->
        <div class="glass-card module-card">
          <div class="module-header">
            <div class="module-icon bg-indigo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
                <line x1="6" y1="6" x2="6.01" y2="6"/>
                <line x1="6" y1="18" x2="6.01" y2="18"/>
              </svg>
            </div>
            <div>
              <h3 class="module-title">Node.js Express Backend</h3>
              <p class="module-meta">REST API mounted at <code>/api/v1</code></p>
            </div>
          </div>
          <div class="status-box" v-if="apiStatus.connected && apiStatus.data">
            <div class="status-row">
              <span>Status:</span>
              <strong class="text-success">Active ({{ apiStatus.data.version }})</strong>
            </div>
            <div class="status-row">
              <span>Supabase Service:</span>
              <span class="pill">{{ apiStatus.data.services.supabase }}</span>
            </div>
            <div class="status-row">
              <span>Gemini AI Service:</span>
              <span class="pill">{{ apiStatus.data.services.gemini }}</span>
            </div>
          </div>
          <div class="status-box text-warning" v-else>
            {{ apiStatus.error || 'Server ping not yet completed. Ensure backend server is running.' }}
          </div>
        </div>

        <!-- Supabase Database & Auth Card -->
        <div class="glass-card module-card">
          <div class="module-header">
            <div class="module-icon bg-green">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <ellipse cx="12" cy="5" rx="9" ry="3"/>
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
              </svg>
            </div>
            <div>
              <h3 class="module-title">PostgreSQL on Supabase</h3>
              <p class="module-meta">Database & Google Auth OAuth</p>
            </div>
          </div>
          <div class="status-box">
            <div class="status-row">
              <span>Supabase Config:</span>
              <strong :class="isSupabaseConfigured ? 'text-success' : 'text-warning'">
                {{ isSupabaseConfigured ? 'Connected' : 'Requires .env keys' }}
              </strong>
            </div>
            <p class="hint-text">
              Configured for Google OAuth, Email verification, and administration invitation codes.
            </p>
          </div>
        </div>

        <!-- Google Gemini AI Card -->
        <div class="glass-card module-card">
          <div class="module-header">
            <div class="module-icon bg-cyan">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
            </div>
            <div>
              <h3 class="module-title">Gemini AI Engine</h3>
              <p class="module-meta">Exam Generation & Automated Grading</p>
            </div>
          </div>
          <div class="status-box">
            <div class="status-row">
              <span>Target Model:</span>
              <span class="pill">gemini-2.5-flash</span>
            </div>
            <p class="hint-text">
              Ready to generate customized questions and provide instant teacher-grade feedback.
            </p>
          </div>
        </div>

        <!-- Hosting & CI Card -->
        <div class="glass-card module-card">
          <div class="module-header">
            <div class="module-icon bg-amber">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="2" y1="12" x2="22" y2="12"/>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
            </div>
            <div>
              <h3 class="module-title">CI/CD & Cloud Hosting</h3>
              <p class="module-meta">Vercel, Render & GitHub Actions</p>
            </div>
          </div>
          <div class="status-box">
            <div class="ci-targets">
              <span class="target-tag">Vercel (Frontend)</span>
              <span class="target-tag">Render (Backend)</span>
              <span class="target-tag">GitHub Actions (CI)</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Invitation Code Quick Test -->
      <section class="glass-card invitation-section">
        <h3 class="section-title">Administration Invitation Code Verification</h3>
        <p class="section-subtitle">Test invitation code verification endpoint: <code>/api/v1/auth/validate-invitation</code></p>
        <div class="invite-form">
          <input
            v-model="invitationCode"
            placeholder="Enter invitation code (e.g. TEACHER-PRO-2026)"
            class="input-field"
            @keyup.enter="handleTestInvitation"
          />
          <button class="btn btn-primary" @click="handleTestInvitation" :disabled="invitationLoading">
            {{ invitationLoading ? 'Validating...' : 'Validate Code' }}
          </button>
        </div>
        <div v-if="invitationResult" class="invite-response">
          <pre>{{ JSON.stringify(invitationResult, null, 2) }}</pre>
        </div>
      </section>
    </main>

    <!-- Footer -->
    <footer class="footer">
      <p>AutoQuiz Pro &bull; Vue 3 + Vite Frontend &bull; Node.js Express REST API &bull; Supabase &bull; Gemini</p>
    </footer>
  </div>
</template>

<style scoped>
.layout {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 2rem;
  min-height: 100vh;
}

/* Header */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1.5rem;
  padding: 1.25rem 2rem;
}

.brand {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

.logo-box {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-sm);
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: var(--glow-indigo);
}

.logo-icon {
  width: 28px;
  height: 28px;
}

.brand-title {
  font-family: var(--font-heading);
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-main);
}

.brand-subtitle {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.header-badges {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

/* Hero Section */
.hero-section {
  padding: 3rem 2.5rem;
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(99, 102, 241, 0.2);
}

.hero-tag {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--accent-cyan);
  margin-bottom: 0.75rem;
}

.hero-title {
  font-family: var(--font-heading);
  font-size: 2.25rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.2;
  margin-bottom: 1rem;
  background: linear-gradient(135deg, #ffffff 40%, #a5b4fc 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero-description {
  font-size: 1.05rem;
  color: var(--text-muted);
  max-width: 680px;
  margin-bottom: 2rem;
}

.hero-actions {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.85rem 1.6rem;
  border-radius: var(--radius-sm);
  font-weight: 600;
  font-size: 0.95rem;
}

.btn-icon {
  width: 18px;
  height: 18px;
}

.btn-primary {
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  color: white;
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.92;
  transform: translateY(-1px);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-color);
  color: var(--text-main);
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}

/* Grid Section */
.grid-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
  margin-top: 1.5rem;
}

.module-card {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.module-header {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.module-icon {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
}

.module-icon svg {
  width: 22px;
  height: 22px;
}

.bg-indigo { background: rgba(99, 102, 241, 0.15); color: #818cf8; }
.bg-green { background: rgba(16, 185, 129, 0.15); color: #34d399; }
.bg-cyan { background: rgba(6, 182, 212, 0.15); color: #22d3ee; }
.bg-amber { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }

.module-title {
  font-family: var(--font-heading);
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text-main);
}

.module-meta {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.module-meta code {
  color: var(--accent-cyan);
}

.status-box {
  background: rgba(0, 0, 0, 0.25);
  border-radius: var(--radius-sm);
  padding: 0.9rem;
  font-size: 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.text-success { color: #34d399; }
.text-warning { color: #fbbf24; }

.pill {
  background: rgba(255, 255, 255, 0.08);
  padding: 0.15rem 0.6rem;
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  font-family: monospace;
}

.hint-text {
  font-size: 0.8rem;
  color: var(--text-muted);
  line-height: 1.4;
}

.ci-targets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.target-tag {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-color);
  padding: 0.25rem 0.65rem;
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
}

/* Invitation Section */
.invitation-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.section-title {
  font-family: var(--font-heading);
  font-size: 1.15rem;
  font-weight: 600;
}

.section-subtitle {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.section-subtitle code {
  color: var(--accent-primary);
}

.invite-form {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.input-field {
  flex: 1;
  min-width: 250px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid var(--border-color);
  padding: 0.8rem 1rem;
  border-radius: var(--radius-sm);
  color: var(--text-main);
  font-size: 0.9rem;
  outline: none;
  transition: var(--transition);
}

.input-field:focus {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
}

.invite-response {
  background: rgba(0, 0, 0, 0.4);
  border-radius: var(--radius-sm);
  padding: 0.85rem;
  font-size: 0.85rem;
  border: 1px solid var(--border-color);
}

.invite-response pre {
  margin: 0;
  color: #a5b4fc;
}

/* Footer */
.footer {
  text-align: center;
  font-size: 0.8rem;
  color: var(--text-dim);
  padding: 1rem 0;
}

@media (max-width: 640px) {
  .hero-title {
    font-size: 1.75rem;
  }
  .header {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
