<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../store/auth';
import {
  fetchAdminStats,
  fetchInvitations,
  createInvitation,
  revokeInvitation,
  fetchAdminUsers
} from '../api';

const router = useRouter();
const auth = useAuth();

// Admin Panel State
const stats = ref(null);
const invitations = ref([]);
const usersList = ref([]);
const newInviteRole = ref('TEACHER');
const newInviteDays = ref(30);
const isGenerating = ref(false);
const latestGeneratedCode = ref(null);
const adminErrorMessage = ref('');
const adminSuccessMessage = ref('');
const activeAdminTab = ref('INVITATIONS'); // 'INVITATIONS' | 'USERS'

const handleLogout = async () => {
  await auth.logout();
  router.push('/login');
};

const copyToClipboard = (text) => {
  navigator.clipboard.writeText(text);
  adminSuccessMessage.value = `Copied code "${text}" to clipboard!`;
  setTimeout(() => {
    adminSuccessMessage.value = '';
  }, 3000);
};

const loadAdminData = async () => {
  if (!auth.isAdmin.value) return;
  adminErrorMessage.value = '';

  try {
    const [statsRes, invitesRes, usersRes] = await Promise.all([
      fetchAdminStats(auth.token.value),
      fetchInvitations(auth.token.value),
      fetchAdminUsers(auth.token.value)
    ]);

    stats.value = statsRes.data;
    invitations.value = invitesRes.data.invitations;
    usersList.value = usersRes.data.users;
  } catch (err) {
    adminErrorMessage.value = err.message || 'Failed to load administrator data';
  }
};

const handleCreateInvite = async () => {
  if (!auth.isAdmin.value) return;
  isGenerating.value = true;
  adminErrorMessage.value = '';
  latestGeneratedCode.value = null;

  try {
    const res = await createInvitation(auth.token.value, {
      role: newInviteRole.value,
      expiresInDays: newInviteDays.value
    });

    latestGeneratedCode.value = res.data.invitation.code;
    adminSuccessMessage.value = `Generated new one-time ${newInviteRole.value} invitation code: ${latestGeneratedCode.value}`;
    await loadAdminData();
  } catch (err) {
    adminErrorMessage.value = err.message || 'Could not generate invitation code';
  } finally {
    isGenerating.value = false;
  }
};

const handleRevokeInvite = async (invitationId, code) => {
  if (!confirm(`Are you sure you want to revoke invitation code ${code}?`)) return;

  try {
    await revokeInvitation(auth.token.value, invitationId);
    adminSuccessMessage.value = `Revoked code ${code}`;
    await loadAdminData();
  } catch (err) {
    adminErrorMessage.value = err.message;
  }
};

onMounted(() => {
  if (auth.isAdmin.value) {
    loadAdminData();
  }
});
</script>

<template>
  <div class="dashboard-page">
    <!-- Top Navbar -->
    <header class="navbar glass-card">
      <div class="nav-brand">
        <div class="logo-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div>
          <h1 class="nav-title">AutoQuiz Pro</h1>
          <p class="nav-subtitle">AI Exam & Assessment Platform</p>
        </div>
      </div>

      <div class="nav-user">
        <div class="user-info">
          <span class="user-name">{{ auth.user.value?.name }}</span>
          <span class="user-email">{{ auth.user.value?.email }}</span>
        </div>

        <span :class="[
          'badge',
          auth.isAdmin.value ? 'badge-warning' : (auth.isTeacher.value ? 'badge-info' : 'badge-success')
        ]">
          <span class="badge-dot"></span>
          {{ auth.role.value }}
        </span>

        <button class="btn btn-secondary btn-sm" @click="handleLogout">
          Sign Out
        </button>
      </div>
    </header>

    <!-- Main Dashboard Body -->
    <main class="dashboard-content">
      <!-- ============================================== -->
      <!-- VIEW 1: STUDENT DASHBOARD                     -->
      <!-- ============================================== -->
      <section v-if="auth.isStudent.value" class="role-view">
        <div class="glass-card banner-card">
          <div class="badge badge-success">
            <span class="badge-dot"></span> Verified University Student
          </div>
          <h2 class="banner-title">Welcome, {{ auth.user.value?.name }}!</h2>
          <p class="banner-text">
            You are authenticated with your official university account (<code>{{ auth.user.value?.email }}</code>).
            Here you can attempt AI-generated quizzes, practice problem-solving, and view instant pedagogical feedback.
          </p>
        </div>

        <div class="grid-cards">
          <div class="glass-card stat-card">
            <div class="stat-number">0</div>
            <div class="stat-label">Pending Assessments</div>
            <p class="stat-hint">Active exams assigned by your instructors</p>
          </div>

          <div class="glass-card stat-card">
            <div class="stat-number">0</div>
            <div class="stat-label">Completed Quizzes</div>
            <p class="stat-hint">Submissions graded by AI & instructors</p>
          </div>

          <div class="glass-card stat-card">
            <div class="stat-number">100%</div>
            <div class="stat-label">Academic Standing</div>
            <p class="stat-hint">Official Student Credential Active</p>
          </div>
        </div>
      </section>

      <!-- ============================================== -->
      <!-- VIEW 2: TEACHER STUDIO                         -->
      <!-- ============================================== -->
      <section v-if="auth.isTeacher.value" class="role-view">
        <div class="glass-card banner-card">
          <div class="badge badge-info">
            <span class="badge-dot"></span> Verified Educator Studio
          </div>
          <h2 class="banner-title">Welcome, Professor {{ auth.user.value?.name }}</h2>
          <p class="banner-text">
            Your Teacher account was authorized with an administrator invitation code.
            You have full access to AI question generation (Gemini), rubric creation, and automated answer marking.
          </p>
        </div>

        <div class="grid-cards">
          <div class="glass-card action-card">
            <div class="card-icon-box bg-indigo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
            </div>
            <h3 class="action-card-title">AI Quiz Generator</h3>
            <p class="action-card-desc">Synthesize customized multiple-choice & short-answer exams using Gemini 2.0 Flash.</p>
            <span class="badge badge-info">Gemini AI Ready</span>
          </div>

          <div class="glass-card action-card">
            <div class="card-icon-box bg-green">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </div>
            <h3 class="action-card-title">Bloom's Taxonomy Rubrics</h3>
            <p class="action-card-desc">Categorize questions by cognitive difficulty (Recall, Analysis, Evaluation).</p>
            <span class="badge badge-success">Pedagogy Engine</span>
          </div>

          <div class="glass-card action-card">
            <div class="card-icon-box bg-cyan">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
            </div>
            <h3 class="action-card-title">Automated Answer Marking</h3>
            <p class="action-card-desc">Grade student submissions with instant semantic feedback and rubric scoring.</p>
            <span class="badge badge-info">Evaluation API</span>
          </div>
        </div>
      </section>

      <!-- ============================================== -->
      <!-- VIEW 3: ADMIN CONSOLE                          -->
      <!-- ============================================== -->
      <section v-if="auth.isAdmin.value" class="role-view">
        <div class="glass-card banner-card">
          <div class="badge badge-warning">
            <span class="badge-dot"></span> Administrator Control Center
          </div>
          <h2 class="banner-title">System Administration & Access Control</h2>
          <p class="banner-text">
            Generate one-time invitation codes for Teachers and Admins, audit code usage, and monitor registered users.
          </p>
        </div>

        <!-- Global Admin Alerts -->
        <div v-if="adminSuccessMessage" class="alert alert-success">
          {{ adminSuccessMessage }}
        </div>
        <div v-if="adminErrorMessage" class="alert alert-error">
          {{ adminErrorMessage }}
        </div>

        <!-- Stats Overview Cards -->
        <div v-if="stats" class="grid-cards">
          <div class="glass-card stat-card">
            <div class="stat-number">{{ stats.users?.total_users || 0 }}</div>
            <div class="stat-label">Total Users</div>
            <div class="stat-breakdown">
              <span>{{ stats.users?.teacher_count || 0 }} Teachers</span> &bull;
              <span>{{ stats.users?.student_count || 0 }} Students</span> &bull;
              <span>{{ stats.users?.admin_count || 0 }} Admins</span>
            </div>
          </div>

          <div class="glass-card stat-card">
            <div class="stat-number">{{ stats.invitations?.active_invites || 0 }}</div>
            <div class="stat-label">Active One-Time Codes</div>
            <p class="stat-hint">Unused invitation codes ready for distribution</p>
          </div>

          <div class="glass-card stat-card">
            <div class="stat-number">{{ stats.invitations?.used_invites || 0 }}</div>
            <div class="stat-label">Redeemed Codes</div>
            <p class="stat-hint">Codes successfully claimed by verified users</p>
          </div>
        </div>

        <!-- Invitation Generator Widget -->
        <div class="glass-card generator-card">
          <div class="generator-header">
            <div>
              <h3 class="section-title">Create Single-Use Invitation Code</h3>
              <p class="section-desc">
                Teachers and Admins can only register using a valid, single-use invitation code generated here.
              </p>
            </div>
          </div>

          <form @submit.prevent="handleCreateInvite" class="generator-form">
            <div class="form-row">
              <div class="field-item">
                <label class="form-label">Assign Role</label>
                <select v-model="newInviteRole" class="form-select">
                  <option value="TEACHER">TEACHER (Educator Studio)</option>
                  <option value="ADMIN">ADMIN (System Administrator)</option>
                </select>
              </div>

              <div class="field-item">
                <label class="form-label">Expires In</label>
                <select v-model="newInviteDays" class="form-select">
                  <option :value="7">7 Days</option>
                  <option :value="30">30 Days</option>
                  <option :value="90">90 Days</option>
                  <option :value="365">1 Year</option>
                </select>
              </div>

              <button type="submit" class="btn btn-primary btn-generate" :disabled="isGenerating">
                {{ isGenerating ? 'Generating...' : '+ Generate Invitation Code' }}
              </button>
            </div>
          </form>

          <!-- Newly Created Code Banner with 1-Click Copy -->
          <div v-if="latestGeneratedCode" class="new-code-banner">
            <div>
              <span class="new-code-label">Newly Generated Invitation Code:</span>
              <div class="new-code-display">{{ latestGeneratedCode }}</div>
            </div>
            <button class="btn btn-secondary btn-copy" @click="copyToClipboard(latestGeneratedCode)">
              Copy to Clipboard
            </button>
          </div>
        </div>

        <!-- Admin Navigation Tabs: Invitations vs Users -->
        <div class="admin-tabs">
          <button
            :class="['admin-tab-btn', activeAdminTab === 'INVITATIONS' && 'active']"
            @click="activeAdminTab = 'INVITATIONS'"
          >
            Invitation Codes Audit Log ({{ invitations.length }})
          </button>
          <button
            :class="['admin-tab-btn', activeAdminTab === 'USERS' && 'active']"
            @click="activeAdminTab = 'USERS'"
          >
            User Directory ({{ usersList.length }})
          </button>
        </div>

        <!-- TAB 1: Invitations Audit Table -->
        <div v-if="activeAdminTab === 'INVITATIONS'" class="glass-card table-card">
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Role</th>
                  <th>Created By</th>
                  <th>Status</th>
                  <th>Usage Details</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="inv in invitations" :key="inv.invitation_id">
                  <td>
                    <code class="code-pill">{{ inv.code }}</code>
                    <button class="btn-copy-inline" title="Copy code" @click="copyToClipboard(inv.code)">
                      📋
                    </button>
                  </td>
                  <td>
                    <span :class="['role-pill', inv.role === 'ADMIN' ? 'role-admin' : 'role-teacher']">
                      {{ inv.role }}
                    </span>
                  </td>
                  <td>{{ inv.created_by_name || 'System Bootstrap' }}</td>
                  <td>
                    <span v-if="inv.is_used" class="badge-status badge-status-used">
                      Redeemed
                    </span>
                    <span v-else class="badge-status badge-status-active">
                      Available (Unused)
                    </span>
                  </td>
                  <td>
                    <span v-if="inv.is_used" class="used-text">
                      Used by <strong>{{ inv.used_by_name }}</strong> ({{ inv.used_by_email }})
                      on {{ new Date(inv.used_at).toLocaleDateString() }}
                    </span>
                    <span v-else class="text-dim">
                      Expires {{ new Date(inv.expires_at).toLocaleDateString() }}
                    </span>
                  </td>
                  <td>
                    <button
                      v-if="!inv.is_used"
                      class="btn-revoke"
                      @click="handleRevokeInvite(inv.invitation_id, inv.code)"
                    >
                      Revoke
                    </button>
                    <span v-else class="text-dim">-</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- TAB 2: User Directory Table -->
        <div v-if="activeAdminTab === 'USERS'" class="glass-card table-card">
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Verified Role</th>
                  <th>Auth Provider</th>
                  <th>Registered</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="u in usersList" :key="u.user_id">
                  <td>#{{ u.user_id }}</td>
                  <td class="font-bold">{{ u.name }}</td>
                  <td>{{ u.email }}</td>
                  <td>
                    <span :class="[
                      'role-pill',
                      u.role === 'ADMIN' ? 'role-admin' : (u.role === 'TEACHER' ? 'role-teacher' : 'role-student')
                    ]">
                      {{ u.role }}
                    </span>
                  </td>
                  <td>
                    <span class="provider-tag">{{ u.auth_provider }}</span>
                  </td>
                  <td>{{ new Date(u.created_at).toLocaleDateString() }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.dashboard-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 2rem;
  min-height: 100vh;
}

/* Navbar */
.navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1.5rem;
  padding: 1.25rem 2rem;
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.logo-box {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-sm);
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.logo-box svg {
  width: 24px;
  height: 24px;
}

.nav-title {
  font-family: var(--font-heading);
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text-main);
}

.nav-subtitle {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.nav-user {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  flex-wrap: wrap;
}

.user-info {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.user-name {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-main);
}

.user-email {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.btn-sm {
  padding: 0.45rem 0.9rem;
  font-size: 0.82rem;
}

/* Role Views */
.role-view {
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
}

.banner-card {
  padding: 2.25rem 2.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  border-left: 4px solid var(--accent-primary);
}

.banner-title {
  font-family: var(--font-heading);
  font-size: 1.75rem;
  font-weight: 800;
  color: var(--text-main);
}

.banner-text {
  font-size: 0.95rem;
  color: var(--text-muted);
  max-width: 750px;
  line-height: 1.6;
}

.banner-text code {
  color: var(--accent-cyan);
}

/* Grid Cards */
.grid-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
}

.stat-card {
  padding: 1.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.stat-number {
  font-family: var(--font-heading);
  font-size: 2.25rem;
  font-weight: 800;
  color: var(--text-main);
}

.stat-label {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-main);
}

.stat-hint {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.stat-breakdown {
  font-size: 0.8rem;
  color: var(--accent-cyan);
}

/* Action Cards */
.action-card {
  padding: 1.75rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.card-icon-box {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-icon-box svg {
  width: 22px;
  height: 22px;
}

.bg-indigo { background: rgba(99, 102, 241, 0.15); color: #818cf8; }
.bg-green { background: rgba(16, 185, 129, 0.15); color: #34d399; }
.bg-cyan { background: rgba(6, 182, 212, 0.15); color: #22d3ee; }

.action-card-title {
  font-family: var(--font-heading);
  font-size: 1.15rem;
  font-weight: 700;
}

.action-card-desc {
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.5;
}

/* Generator Card */
.generator-card {
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  border: 1px solid var(--border-highlight);
}

.section-title {
  font-family: var(--font-heading);
  font-size: 1.25rem;
  font-weight: 700;
}

.section-desc {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.form-row {
  display: flex;
  gap: 1rem;
  align-items: flex-end;
  flex-wrap: wrap;
}

.field-item {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  flex: 1;
  min-width: 200px;
}

.form-select {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--border-color);
  padding: 0.8rem 1rem;
  border-radius: var(--radius-sm);
  color: var(--text-main);
  font-size: 0.9rem;
  outline: none;
}

.btn-generate {
  height: 48px;
  padding: 0 1.5rem;
  white-space: nowrap;
}

.new-code-banner {
  background: rgba(99, 102, 241, 0.12);
  border: 1px solid rgba(99, 102, 241, 0.35);
  border-radius: var(--radius-sm);
  padding: 1rem 1.25rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
}

.new-code-label {
  font-size: 0.8rem;
  color: #a5b4fc;
}

.new-code-display {
  font-family: monospace;
  font-size: 1.35rem;
  font-weight: 700;
  color: #ffffff;
  letter-spacing: 0.05em;
}

/* Admin Tabs */
.admin-tabs {
  display: flex;
  gap: 0.5rem;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 0.5rem;
}

.admin-tab-btn {
  background: transparent;
  color: var(--text-muted);
  font-size: 0.9rem;
  font-weight: 600;
  padding: 0.6rem 1.25rem;
  border-radius: var(--radius-sm);
}

.admin-tab-btn.active {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-main);
  border: 1px solid var(--border-color);
}

/* Tables */
.table-card {
  padding: 0;
  overflow: hidden;
}

.table-wrapper {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.85rem;
}

.data-table th {
  background: rgba(0, 0, 0, 0.35);
  padding: 1rem 1.25rem;
  color: var(--text-muted);
  font-weight: 600;
  border-bottom: 1px solid var(--border-color);
  white-space: nowrap;
}

.data-table td {
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-main);
}

.data-table tr:hover {
  background: rgba(255, 255, 255, 0.02);
}

.code-pill {
  font-family: monospace;
  background: rgba(0, 0, 0, 0.4);
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  color: var(--accent-cyan);
  font-size: 0.85rem;
}

.btn-copy-inline {
  background: transparent;
  cursor: pointer;
  margin-left: 0.4rem;
  opacity: 0.7;
}

.btn-copy-inline:hover {
  opacity: 1;
}

.role-pill {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.2rem 0.55rem;
  border-radius: var(--radius-full);
}

.role-admin { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
.role-teacher { background: rgba(99, 102, 241, 0.15); color: #a5b4fc; }
.role-student { background: rgba(16, 185, 129, 0.15); color: #34d399; }

.badge-status {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.2rem 0.55rem;
  border-radius: 4px;
}

.badge-status-active {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
}

.badge-status-used {
  background: rgba(100, 116, 139, 0.15);
  color: #94a3b8;
}

.btn-revoke {
  background: rgba(244, 63, 94, 0.15);
  border: 1px solid rgba(244, 63, 94, 0.3);
  color: #fb7185;
  font-size: 0.75rem;
  padding: 0.3rem 0.65rem;
  border-radius: 4px;
}

.btn-revoke:hover {
  background: rgba(244, 63, 94, 0.25);
}

.provider-tag {
  text-transform: uppercase;
  font-size: 0.7rem;
  color: var(--text-dim);
  font-family: monospace;
}

.font-bold {
  font-weight: 600;
}
</style>
