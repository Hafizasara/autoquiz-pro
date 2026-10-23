<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../store/auth';
import {
  fetchAdminStats,
  fetchInvitations,
  createInvitation,
  revokeInvitation,
  fetchAdminUsers,
  fetchAdminCourses,
  createAdminCourse,
  assignCourseTeacher,
  fetchAdminTeachers,
  uploadAdminCSV,
  fetchTeacherCourses,
  fetchAdministrators,
  createAdminUser
} from '../api';

const router = useRouter();
const auth = useAuth();

// Teacher State
const teacherCourses = ref([]);
const teacherLoading = ref(true);

// Admin Panel State
const stats = ref(null);
const invitations = ref([]);
const usersList = ref([]);
const coursesList = ref([]);
const teachersList = ref([]);
const administratorsList = ref([]);

// New Admin Form State
const newAdminForm = ref({ name: '', email: '', password: '' });
const isCreatingAdmin = ref(false);

const newInviteRole = ref('TEACHER');
const newInviteDays = ref(30);
const isGenerating = ref(false);
const latestGeneratedCode = ref(null);

// Course Creation Modal / Form
const newCourseForm = ref({ courseName: '', courseCode: '', teacherId: '' });
const isCreatingCourse = ref(false);

// Course Assignment Map
const selectedTeacherMap = ref({});

// CSV Upload State
const csvFile = ref(null);
const isUploadingCSV = ref(false);
const csvUploadResult = ref(null);

const adminErrorMessage = ref('');
const adminSuccessMessage = ref('');
const activeAdminTab = ref('COURSES'); // 'COURSES' | 'ADMINS' | 'INVITATIONS' | 'CSV' | 'USERS'

const handleLogout = async () => {
  await auth.logout();
  router.push('/login');
};

const copyToClipboard = (text) => {
  navigator.clipboard.writeText(text);
  adminSuccessMessage.value = `Copied "${text}" to clipboard!`;
  setTimeout(() => {
    adminSuccessMessage.value = '';
  }, 3000);
};

// Load Teacher Assigned Courses
const loadTeacherData = async () => {
  teacherLoading.value = true;
  try {
    const res = await fetchTeacherCourses(auth.token.value);
    teacherCourses.value = res.data?.courses || [];
  } catch (err) {
    console.error('Error fetching teacher courses:', err);
  } finally {
    teacherLoading.value = false;
  }
};

// Load Admin Data
const loadAdminData = async () => {
  if (!auth.isAdmin.value) return;
  adminErrorMessage.value = '';

  try {
    const [statsRes, invitesRes, usersRes, coursesRes, teachersRes, adminsRes] = await Promise.all([
      fetchAdminStats(auth.token.value),
      fetchInvitations(auth.token.value),
      fetchAdminUsers(auth.token.value),
      fetchAdminCourses(auth.token.value),
      fetchAdminTeachers(auth.token.value),
      fetchAdministrators(auth.token.value)
    ]);

    stats.value = statsRes.data;
    invitations.value = invitesRes.data.invitations;
    usersList.value = usersRes.data.users;
    coursesList.value = coursesRes.data.courses;
    teachersList.value = teachersRes.data.teachers;
    administratorsList.value = adminsRes.data.administrators || [];

    // Initialize course assignment selection
    coursesList.value.forEach(c => {
      selectedTeacherMap.value[c.course_id] = c.teacher_id || '';
    });
  } catch (err) {
    adminErrorMessage.value = err.message || 'Failed to load administrator data';
  }
};

const handleCreateAdmin = async () => {
  if (!newAdminForm.value.name || !newAdminForm.value.email || !newAdminForm.value.password) {
    adminErrorMessage.value = 'Name, email, and password are required to create an administrator.';
    return;
  }

  isCreatingAdmin.value = true;
  adminErrorMessage.value = '';

  try {
    const res = await createAdminUser(auth.token.value, newAdminForm.value);
    adminSuccessMessage.value = `New administrator "${res.data.admin.name}" created successfully!`;
    newAdminForm.value = { name: '', email: '', password: '' };
    await loadAdminData();
  } catch (err) {
    adminErrorMessage.value = err.message || 'Could not create administrator';
  } finally {
    isCreatingAdmin.value = false;
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

const handleCreateCourse = async () => {
  if (!newCourseForm.value.courseName) return;
  isCreatingCourse.value = true;
  adminErrorMessage.value = '';

  try {
    await createAdminCourse(auth.token.value, {
      courseName: newCourseForm.value.courseName,
      courseCode: newCourseForm.value.courseCode,
      teacherId: newCourseForm.value.teacherId || null
    });

    adminSuccessMessage.value = `Course "${newCourseForm.value.courseName}" created successfully!`;
    newCourseForm.value = { courseName: '', courseCode: '', teacherId: '' };
    await loadAdminData();
  } catch (err) {
    adminErrorMessage.value = err.message;
  } finally {
    isCreatingCourse.value = false;
  }
};

const handleAssignTeacher = async (courseId) => {
  const teacherId = selectedTeacherMap.value[courseId] || null;
  adminErrorMessage.value = '';

  try {
    await assignCourseTeacher(auth.token.value, courseId, teacherId ? parseInt(teacherId, 10) : null);
    adminSuccessMessage.value = 'Teacher course assignment updated successfully!';
    await loadAdminData();
  } catch (err) {
    adminErrorMessage.value = err.message;
  }
};

const onFileSelected = (e) => {
  const file = e.target.files[0];
  if (file) {
    csvFile.value = file;
  }
};

const handleUploadCSV = async () => {
  if (!csvFile.value) {
    adminErrorMessage.value = 'Please select a CSV file first.';
    return;
  }

  isUploadingCSV.value = true;
  adminErrorMessage.value = '';
  csvUploadResult.value = null;

  try {
    const res = await uploadAdminCSV(auth.token.value, csvFile.value);
    csvUploadResult.value = res.data;
    adminSuccessMessage.value = res.message;
    csvFile.value = null;
    await loadAdminData();
  } catch (err) {
    adminErrorMessage.value = err.message;
  } finally {
    isUploadingCSV.value = false;
  }
};

onMounted(async () => {
  if (auth.isTeacher.value) {
    await loadTeacherData();
  } else if (auth.isAdmin.value) {
    await loadAdminData();
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
          <p class="nav-subtitle">{{ auth.user.value?.universityName || 'Institutional Academic Hub' }}</p>
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

    <!-- Main Dashboard Content -->
    <main class="dashboard-content">
      <!-- ============================================== -->
      <!-- VIEW 1: STUDENT DASHBOARD                     -->
      <!-- ============================================== -->
      <section v-if="auth.isStudent.value" class="role-view">
        <div class="glass-card banner-card">
          <div class="badge badge-success">
            <span class="badge-dot"></span> {{ auth.user.value?.universityName || 'University Student' }}
          </div>
          <h2 class="banner-title">Welcome, {{ auth.user.value?.name }}!</h2>
          <p class="banner-text">
            Authenticated via your official institutional account (<code>{{ auth.user.value?.email }}</code>).
            Your AI-graded quizzes and examination schedules will appear here.
          </p>
        </div>

        <div class="grid-cards">
          <div class="glass-card stat-card">
            <div class="stat-number">0</div>
            <div class="stat-label">Active Assessments</div>
            <p class="stat-hint">Exams currently open for completion</p>
          </div>

          <div class="glass-card stat-card">
            <div class="stat-number">0</div>
            <div class="stat-label">Completed Assessments</div>
            <p class="stat-hint">Graded submissions with feedback</p>
          </div>

          <div class="glass-card stat-card">
            <div class="stat-number">100%</div>
            <div class="stat-label">Institutional Status</div>
            <p class="stat-hint">Active Student Credential</p>
          </div>
        </div>
      </section>

      <!-- ============================================== -->
      <!-- VIEW 2: TEACHER DASHBOARD (BLANK vs ASSIGNED)  -->
      <!-- ============================================== -->
      <section v-if="auth.isTeacher.value" class="role-view">
        <div class="glass-card banner-card">
          <div class="badge badge-info">
            <span class="badge-dot"></span> {{ auth.user.value?.universityName || 'Academic Faculty' }}
          </div>
          <h2 class="banner-title">Educator Studio &bull; {{ auth.user.value?.name }}</h2>
          <p class="banner-text">
            Registered with your university invitation code. Course access and exam generation are configured below.
          </p>
        </div>

        <!-- 2A. BLANK DASHBOARD STATE (When 0 courses assigned by Admin) -->
        <div v-if="!teacherLoading && teacherCourses.length === 0" class="glass-card empty-dashboard-card">
          <div class="empty-icon-circle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
              <path d="M6 6h10M6 10h10"/>
              <circle cx="12" cy="16" r="1.5"/>
            </svg>
          </div>

          <span class="badge badge-warning">
            <span class="badge-dot"></span> Pending Course Assignment
          </span>

          <h3 class="empty-title">No Courses Assigned Yet</h3>
          <p class="empty-desc">
            You have successfully registered with <strong>{{ auth.user.value?.universityName || 'your university' }}</strong>, but your University Administrator has not assigned any courses to your profile yet.
          </p>

          <div class="empty-notice-box">
            <p class="empty-notice-title">What happens next?</p>
            <p class="empty-notice-text">
              Your administrator manages curriculum and course allocations. Once they assign your courses in the University Admin Console, your course studios, Gemini question generators, and student rosters will automatically unlock here.
            </p>
          </div>

          <button class="btn btn-secondary" @click="loadTeacherData">
            Refresh Course Allocations
          </button>
        </div>

        <!-- 2B. ACTIVE DASHBOARD STATE (When courses ARE assigned) -->
        <div v-else-if="!teacherLoading && teacherCourses.length > 0" class="assigned-courses-section">
          <div class="section-top-row">
            <div>
              <h3 class="section-title">Your Assigned Courses ({{ teacherCourses.length }})</h3>
              <p class="section-desc">Courses assigned to you by your university administrator.</p>
            </div>
            <button class="btn btn-secondary btn-sm" @click="loadTeacherData">
              Refresh
            </button>
          </div>

          <div class="grid-cards">
            <div v-for="c in teacherCourses" :key="c.course_id" class="glass-card course-card">
              <div class="course-header">
                <span class="course-badge">{{ c.course_code || 'CRS' }}</span>
                <span class="student-count">{{ c.student_count }} Students</span>
              </div>
              <h4 class="course-name">{{ c.course_name }}</h4>
              <p class="course-meta">Assigned curriculum module</p>

              <div class="course-actions">
                <router-link to="/assessments/create" class="btn btn-primary btn-block btn-sm">
                  + Create / Generate Assessment
                </router-link>
                <router-link to="/assessments" class="btn btn-secondary btn-block btn-sm">
                  View Assessment Registry
                </router-link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ============================================== -->
      <!-- VIEW 3: UNIVERSITY ADMIN CONSOLE               -->
      <!-- ============================================== -->
      <section v-if="auth.isAdmin.value" class="role-view">
        <div class="glass-card banner-card">
          <div class="badge badge-warning">
            <span class="badge-dot"></span> University Administrator Portal
          </div>
          <h2 class="banner-title">{{ auth.user.value?.universityName || 'Institution Administration' }}</h2>
          <p class="banner-text">
            Upload CSV rosters, assign courses to teachers, generate one-time teacher invitation codes, and monitor users.
          </p>
        </div>

        <!-- Alerts -->
        <div v-if="adminSuccessMessage" class="alert alert-success">{{ adminSuccessMessage }}</div>
        <div v-if="adminErrorMessage" class="alert alert-error">{{ adminErrorMessage }}</div>

        <!-- System Stats Grid -->
        <div v-if="stats" class="grid-cards">
          <div class="glass-card stat-card">
            <div class="stat-number">{{ stats.courses?.total_courses || 0 }}</div>
            <div class="stat-label">Total Courses</div>
            <div class="stat-breakdown">
              <span>{{ stats.courses?.assigned_courses || 0 }} Assigned</span> &bull;
              <span>{{ stats.courses?.unassigned_courses || 0 }} Unassigned</span>
            </div>
          </div>

          <div class="glass-card stat-card">
            <div class="stat-number">{{ stats.users?.teacher_count || 0 }}</div>
            <div class="stat-label">Registered Teachers</div>
            <p class="stat-hint">Teachers registered via invitation codes</p>
          </div>

          <div class="glass-card stat-card">
            <div class="stat-number">{{ stats.users?.student_count || 0 }}</div>
            <div class="stat-label">University Students</div>
            <p class="stat-hint">Active institutional student accounts</p>
          </div>

          <div class="glass-card stat-card">
            <div class="stat-number">{{ stats.invitations?.active_invites || 0 }}</div>
            <div class="stat-label">Active Invites</div>
            <p class="stat-hint">One-time codes awaiting redemption</p>
          </div>
        </div>

        <!-- Admin Sub-Navigation Tabs -->
        <div class="admin-tabs">
          <button
            :class="['admin-tab-btn', activeAdminTab === 'COURSES' && 'active']"
            @click="activeAdminTab = 'COURSES'"
          >
            Courses & Teacher Assignment ({{ coursesList.length }})
          </button>
          <button
            :class="['admin-tab-btn', activeAdminTab === 'ADMINS' && 'active']"
            @click="activeAdminTab = 'ADMINS'"
          >
            Administrators ({{ administratorsList.length }})
          </button>
          <button
            :class="['admin-tab-btn', activeAdminTab === 'CSV' && 'active']"
            @click="activeAdminTab = 'CSV'"
          >
            Bulk CSV Upload
          </button>
          <button
            :class="['admin-tab-btn', activeAdminTab === 'INVITATIONS' && 'active']"
            @click="activeAdminTab = 'INVITATIONS'"
          >
            Teacher Invitation Codes ({{ invitations.length }})
          </button>
          <button
            :class="['admin-tab-btn', activeAdminTab === 'USERS' && 'active']"
            @click="activeAdminTab = 'USERS'"
          >
            User Directory ({{ usersList.length }})
          </button>
        </div>

        <!-- ============================================== -->
        <!-- TAB 1: COURSES & TEACHER ASSIGNMENT            -->
        <!-- ============================================== -->
        <div v-if="activeAdminTab === 'COURSES'" class="tab-pane">
          <!-- Create Single Course Form -->
          <div class="glass-card create-course-box">
            <h3 class="section-title">Add New University Course</h3>
            <form @submit.prevent="handleCreateCourse" class="form-row">
              <div class="field-item">
                <label class="form-label">Course Name</label>
                <input
                  v-model="newCourseForm.courseName"
                  type="text"
                  placeholder="e.g. Operating Systems & Architecture"
                  required
                  class="form-input"
                />
              </div>

              <div class="field-item">
                <label class="form-label">Course Code</label>
                <input
                  v-model="newCourseForm.courseCode"
                  type="text"
                  placeholder="e.g. CS-301"
                  required
                  class="form-input code-input"
                />
              </div>

              <div class="field-item">
                <label class="form-label">Assign Teacher (Optional)</label>
                <select v-model="newCourseForm.teacherId" class="form-select">
                  <option value="">-- Leave Unassigned --</option>
                  <option v-for="t in teachersList" :key="t.user_id" :value="t.user_id">
                    {{ t.name }} ({{ t.email }})
                  </option>
                </select>
              </div>

              <button type="submit" class="btn btn-primary btn-generate" :disabled="isCreatingCourse">
                {{ isCreatingCourse ? 'Creating...' : '+ Create Course' }}
              </button>
            </form>
          </div>

          <!-- Courses Table with Teacher Assignment Dropdown -->
          <div class="glass-card table-card">
            <div class="table-wrapper">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Course Name</th>
                    <th>Enrolled Students</th>
                    <th>Assigned Teacher</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="c in coursesList" :key="c.course_id">
                    <td><code class="code-pill">{{ c.course_code || 'CRS' }}</code></td>
                    <td class="font-bold">{{ c.course_name }}</td>
                    <td>{{ c.student_count }} Students</td>
                    <td>
                      <select v-model="selectedTeacherMap[c.course_id]" class="table-select">
                        <option value="">-- Unassigned --</option>
                        <option v-for="t in teachersList" :key="t.user_id" :value="t.user_id">
                          {{ t.name }} ({{ t.email }})
                        </option>
                      </select>
                    </td>
                    <td>
                      <button class="btn btn-primary btn-xs" @click="handleAssignTeacher(c.course_id)">
                        Save Assignment
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- ============================================== -->
        <!-- TAB: ADMINISTRATORS MANAGEMENT                 -->
        <!-- ============================================== -->
        <div v-if="activeAdminTab === 'ADMINS'" class="tab-pane">
          <div class="glass-card creator-card">
            <h3 class="section-title">Add New University Administrator</h3>
            <p class="section-desc">
              Create an administrator account directly or issue invitation codes for institutional co-administrators.
            </p>

            <form @submit.prevent="handleCreateAdmin" class="form-row">
              <div class="field-item">
                <label class="form-label">Full Name</label>
                <input
                  v-model="newAdminForm.name"
                  type="text"
                  placeholder="e.g. Dean Vance"
                  required
                  class="form-input"
                />
              </div>

              <div class="field-item">
                <label class="form-label">Admin Email</label>
                <input
                  v-model="newAdminForm.email"
                  type="email"
                  placeholder="e.g. dean@university.edu"
                  required
                  class="form-input"
                />
              </div>

              <div class="field-item">
                <label class="form-label">Password</label>
                <input
                  v-model="newAdminForm.password"
                  type="password"
                  placeholder="Min 8 characters"
                  minlength="8"
                  required
                  class="form-input"
                />
              </div>

              <button type="submit" class="btn btn-primary" :disabled="isCreatingAdmin">
                {{ isCreatingAdmin ? 'Creating...' : '+ Create Administrator' }}
              </button>
            </form>
          </div>

          <!-- Existing Admins Table -->
          <div class="glass-card table-card">
            <div class="card-header-bar">
              <h3 class="section-title">University Administrators Roster</h3>
              <span class="badge-count">{{ administratorsList.length }} Registered</span>
            </div>

            <div class="table-wrapper">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>User ID</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="adm in administratorsList" :key="adm.user_id">
                    <td>#{{ adm.user_id }}</td>
                    <td class="font-bold">{{ adm.name }}</td>
                    <td>{{ adm.email }}</td>
                    <td><span class="badge-status badge-status-active">Active Admin</span></td>
                    <td>{{ new Date(adm.created_at).toLocaleDateString() }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- ============================================== -->
        <!-- TAB 2: BULK CSV UPLOAD                         -->
        <!-- ============================================== -->
        <div v-if="activeAdminTab === 'CSV'" class="tab-pane">
          <div class="glass-card csv-upload-card">
            <div class="card-intro">
              <h3 class="section-title">Upload University CSV File</h3>
              <p class="section-desc">
                Bulk import courses, assign teachers, upload student rosters, or generate teacher invitation codes in seconds.
              </p>
            </div>

            <div class="csv-upload-box">
              <input type="file" accept=".csv" @change="onFileSelected" class="file-input" />
              <button
                class="btn btn-primary"
                @click="handleUploadCSV"
                :disabled="isUploadingCSV || !csvFile"
              >
                {{ isUploadingCSV ? 'Processing CSV...' : 'Process & Import CSV File' }}
              </button>
            </div>

            <!-- Upload Results Card -->
            <div v-if="csvUploadResult" class="csv-result-box">
              <h4 class="result-title">✓ Import Completed (Type: {{ csvUploadResult.detectedType }})</h4>
              <p>Total Rows: <strong>{{ csvUploadResult.totalRows }}</strong> &bull; Records Processed: <strong>{{ csvUploadResult.processed }}</strong></p>

              <div v-if="csvUploadResult.invitationsGenerated?.length" class="invites-generated-box">
                <p class="invites-title">Generated Teacher Invitation Codes:</p>
                <div class="invites-list">
                  <div v-for="(inv, idx) in csvUploadResult.invitationsGenerated" :key="idx" class="invite-item">
                    <span>{{ inv.email || inv.name }} ({{ inv.courseCode || 'General' }}):</span>
                    <code class="code-pill">{{ inv.code }}</code>
                    <button class="btn-copy-inline" @click="copyToClipboard(inv.code)">📋</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Sample CSV Formats Reference -->
            <div class="csv-templates-guide">
              <h4 class="guide-title">Supported CSV Formats:</h4>
              <div class="grid-templates">
                <div class="template-card">
                  <span class="template-tag">Format 1: Courses & Teachers</span>
                  <pre>course_code,course_name,teacher_email
CS-101,Introduction to CS,john@uni.edu
CS-201,Data Structures,sarah@uni.edu</pre>
                </div>

                <div class="template-card">
                  <span class="template-tag">Format 2: Students Roster</span>
                  <pre>name,roll_number,email,course_code
Alice Smith,2026-CS-01,alice@uni.edu,CS-101
Bob Vance,2026-CS-02,bob@uni.edu,CS-101</pre>
                </div>

                <div class="template-card">
                  <span class="template-tag">Format 3: Teachers List</span>
                  <pre>name,email
Dr. Alan Turing,alan@uni.edu
Dr. Ada Lovelace,ada@uni.edu</pre>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ============================================== -->
        <!-- TAB 3: INVITATIONS                             -->
        <!-- ============================================== -->
        <div v-if="activeAdminTab === 'INVITATIONS'" class="tab-pane">
          <div class="glass-card generator-card">
            <h3 class="section-title">Generate Teacher Invitation Code</h3>
            <p class="section-desc">Create single-use invitation codes for instructors in {{ auth.user.value?.universityName }}.</p>

            <form @submit.prevent="handleCreateInvite" class="form-row">
              <div class="field-item">
                <label class="form-label">Role</label>
                <select v-model="newInviteRole" class="form-select">
                  <option value="TEACHER">TEACHER (Educator Studio)</option>
                  <option value="ADMIN">ADMIN (Additional Admin)</option>
                </select>
              </div>

              <div class="field-item">
                <label class="form-label">Expires In</label>
                <select v-model="newInviteDays" class="form-select">
                  <option :value="30">30 Days</option>
                  <option :value="60">60 Days</option>
                  <option :value="90">90 Days</option>
                  <option :value="365">1 Year</option>
                </select>
              </div>

              <button type="submit" class="btn btn-primary btn-generate" :disabled="isGenerating">
                {{ isGenerating ? 'Generating...' : '+ Create Invitation Code' }}
              </button>
            </form>

            <div v-if="latestGeneratedCode" class="new-code-banner">
              <div>
                <span class="new-code-label">One-Time Invitation Code:</span>
                <div class="new-code-display">{{ latestGeneratedCode }}</div>
              </div>
              <button class="btn btn-secondary btn-copy" @click="copyToClipboard(latestGeneratedCode)">
                Copy to Clipboard
              </button>
            </div>
          </div>

          <div class="glass-card table-card">
            <div class="table-wrapper">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Usage Details</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="inv in invitations" :key="inv.invitation_id">
                    <td>
                      <code class="code-pill">{{ inv.code }}</code>
                      <button class="btn-copy-inline" title="Copy code" @click="copyToClipboard(inv.code)">📋</button>
                    </td>
                    <td>
                      <span :class="['role-pill', inv.role === 'ADMIN' ? 'role-admin' : 'role-teacher']">{{ inv.role }}</span>
                    </td>
                    <td>
                      <span v-if="inv.is_used" class="badge-status badge-status-used">Redeemed</span>
                      <span v-else class="badge-status badge-status-active">Available</span>
                    </td>
                    <td>
                      <span v-if="inv.is_used" class="used-text">
                        Used by <strong>{{ inv.used_by_name }}</strong> ({{ inv.used_by_email }}) on {{ new Date(inv.used_at).toLocaleDateString() }}
                      </span>
                      <span v-else class="text-dim">Expires {{ new Date(inv.expires_at).toLocaleDateString() }}</span>
                    </td>
                    <td>
                      <button v-if="!inv.is_used" class="btn-revoke" @click="handleRevokeInvite(inv.invitation_id, inv.code)">
                        Revoke
                      </button>
                      <span v-else class="text-dim">-</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- ============================================== -->
        <!-- TAB 4: USERS DIRECTORY                         -->
        <!-- ============================================== -->
        <div v-if="activeAdminTab === 'USERS'" class="tab-pane">
          <div class="glass-card table-card">
            <div class="table-wrapper">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>User ID</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
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
                      <span :class="['role-pill', u.role === 'ADMIN' ? 'role-admin' : (u.role === 'TEACHER' ? 'role-teacher' : 'role-student')]">
                        {{ u.role }}
                      </span>
                    </td>
                    <td><span class="provider-tag">{{ u.auth_provider }}</span></td>
                    <td>{{ new Date(u.created_at).toLocaleDateString() }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
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
  background-color: var(--bg-page);
}

.navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1.5rem;
  padding: 1.25rem 2rem;
  background: var(--bg-card);
  border: 1px solid var(--border-sky);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.logo-box {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-vivid));
  display: flex;
  align-items: center;
  justify-content: center;
  color: #FFFFFF;
  box-shadow: 0 4px 12px rgba(56, 189, 248, 0.35);
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
  font-size: 0.82rem;
  color: var(--text-secondary);
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
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text-main);
}

.user-email {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

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
  background: var(--bg-card);
  border: 1px solid var(--border-sky);
  border-left: 4px solid var(--accent-primary);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.banner-title {
  font-family: var(--font-heading);
  font-size: 1.75rem;
  font-weight: 800;
  color: var(--text-main);
}

.banner-text {
  font-size: 0.95rem;
  color: var(--text-secondary);
  max-width: 750px;
  line-height: 1.6;
}

.banner-text code {
  color: var(--accent-deep);
  font-weight: 700;
}

/* Empty Dashboard State for Teachers with 0 assigned courses */
.empty-dashboard-card {
  padding: 3.5rem 2.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 1.25rem;
  background: var(--bg-card);
  border: 2px dashed var(--border-sky);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.empty-icon-circle {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--bg-hover);
  border: 1px solid var(--border-sky);
  color: var(--accent-vivid);
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-icon-circle svg {
  width: 36px;
  height: 36px;
}

.empty-title {
  font-family: var(--font-heading);
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-main);
}

.empty-desc {
  font-size: 0.95rem;
  color: var(--text-secondary);
  max-width: 600px;
  line-height: 1.6;
}

.empty-notice-box {
  background: var(--bg-hover);
  border: 1px solid var(--border-sky);
  border-radius: var(--radius-md);
  padding: 1.25rem;
  max-width: 580px;
  text-align: left;
}

.empty-notice-title {
  font-weight: 700;
  font-size: 0.92rem;
  color: var(--text-main);
  margin-bottom: 0.4rem;
}

.empty-notice-text {
  font-size: 0.88rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

/* Assigned Courses Section */
.assigned-courses-section {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.section-top-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.course-card {
  padding: 1.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: var(--bg-card);
  border: 1px solid var(--border-sky);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  transition: var(--transition-fast);
}

.course-card:hover {
  background: var(--bg-hover);
  border-color: var(--border-focus);
}

.course-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.course-badge {
  font-family: monospace;
  background: var(--bg-hover);
  color: var(--accent-deep);
  border: 1px solid var(--border-sky);
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 700;
}

.student-count {
  font-size: 0.82rem;
  color: var(--accent-deep);
  font-weight: 600;
}

.course-name {
  font-family: var(--font-heading);
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-main);
}

.course-meta {
  font-size: 0.82rem;
  color: var(--text-secondary);
}

.course-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

/* Admin Tabs (Normal, Hover, Active/Selected State matching rules) */
.admin-tabs {
  display: flex;
  gap: 0.65rem;
  border-bottom: 1px solid var(--border-light);
  padding-bottom: 0.75rem;
  overflow-x: auto;
}

.admin-tab-btn {
  background: #FFFFFF;
  color: var(--text-main);
  border: 1px solid var(--border-sky);
  font-size: 0.88rem;
  font-weight: 600;
  padding: 0.65rem 1.15rem;
  border-radius: var(--radius-md);
  white-space: nowrap;
  box-shadow: var(--shadow-sm);
  transition: var(--transition-fast);
}

/* Hover state: Pale sky blue background, vivid blue border and text */
.admin-tab-btn:hover {
  background: var(--bg-hover);
  border-color: var(--border-focus);
  color: var(--accent-vivid);
}

/* Active/selected state: Light sky blue background with a stronger blue outline */
.admin-tab-btn.active {
  background: var(--bg-active);
  color: var(--accent-deep);
  border: 1px solid var(--accent-vivid);
  font-weight: 700;
}

.tab-pane {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* Course Creation & Form */
.create-course-box,
.creator-card {
  padding: 1.75rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border-sky);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.section-title {
  font-family: var(--font-heading);
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-main);
}

.section-desc {
  font-size: 0.88rem;
  color: var(--text-secondary);
}

.card-header-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border-sky);
  background: var(--bg-hover);
}

.badge-count {
  font-size: 0.75rem;
  font-weight: 700;
  background: #FFFFFF;
  color: var(--accent-deep);
  border: 1px solid var(--border-sky);
  padding: 0.2rem 0.6rem;
  border-radius: var(--radius-full);
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
  min-width: 180px;
}

.form-select, .table-select {
  background-color: #FFFFFF;
  border: 1px solid var(--border-light);
  padding: 0.65rem 0.85rem;
  border-radius: var(--radius-md);
  color: var(--text-main);
  font-size: 0.88rem;
  outline: none;
  transition: var(--transition-fast);
}

.form-select:hover, .table-select:hover {
  border-color: var(--border-sky);
}

.form-select:focus, .table-select:focus {
  border-color: var(--border-focus);
  box-shadow: var(--focus-ring);
}

.table-select {
  padding: 0.4rem 0.6rem;
  font-size: 0.82rem;
}

/* CSV Upload */
.csv-upload-card {
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  background: var(--bg-card);
  border: 1px solid var(--border-sky);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.csv-upload-box {
  display: flex;
  gap: 1rem;
  align-items: center;
  flex-wrap: wrap;
}

.file-input {
  color: var(--text-main);
}

.csv-result-box {
  background: var(--bg-success);
  border: 1px solid var(--border-success);
  border-radius: var(--radius-md);
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.result-title {
  color: var(--color-success);
  font-weight: 700;
}

.invites-generated-box {
  margin-top: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.invites-title {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-main);
}

.invites-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.invite-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
}

.csv-templates-guide {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.guide-title {
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--text-main);
}

.grid-templates {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
}

.template-card {
  background: #FFFFFF;
  border: 1px solid var(--border-sky);
  border-radius: var(--radius-md);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  box-shadow: var(--shadow-sm);
}

.template-tag {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--accent-deep);
}

.template-card pre {
  margin: 0;
  font-size: 0.78rem;
  color: var(--text-main);
  background: var(--bg-page);
  padding: 0.5rem;
  border-radius: 4px;
  border: 1px solid var(--border-light);
  overflow-x: auto;
}

/* Grid & Cards */
.grid-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1.5rem;
}

.stat-card {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  background: var(--bg-card);
  border: 1px solid var(--border-sky);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.stat-number {
  font-family: var(--font-heading);
  font-size: 2rem;
  font-weight: 800;
  color: var(--accent-deep);
}

.stat-label {
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--text-main);
}

.stat-hint, .stat-breakdown {
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.stat-breakdown {
  color: var(--accent-deep);
  font-weight: 600;
}

/* Tables */
.table-card {
  padding: 0;
  overflow: hidden;
  background: var(--bg-card);
  border: 1px solid var(--border-sky);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.table-wrapper {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.88rem;
}

.data-table th {
  background: var(--bg-hover);
  padding: 0.95rem 1.25rem;
  color: var(--text-main);
  font-weight: 700;
  border-bottom: 1px solid var(--border-sky);
}

.data-table td {
  padding: 0.85rem 1.25rem;
  border-bottom: 1px solid var(--border-light);
  color: var(--text-main);
}

.data-table tr:hover td {
  background: var(--bg-page);
}

.code-pill {
  font-family: monospace;
  background: var(--bg-hover);
  border: 1px solid var(--border-sky);
  padding: 0.2rem 0.55rem;
  border-radius: 4px;
  color: var(--accent-deep);
  font-weight: 700;
}

.btn-copy-inline {
  background: transparent;
  cursor: pointer;
  margin-left: 0.4rem;
  opacity: 0.8;
}

.btn-copy-inline:hover {
  opacity: 1;
}

.btn-revoke {
  background: var(--bg-error);
  border: 1px solid var(--border-error);
  color: var(--color-error);
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.3rem 0.65rem;
  border-radius: 4px;
}

.btn-revoke:hover {
  background: #FEE2E2;
}

.generator-card {
  padding: 1.75rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  background: var(--bg-card);
  border: 1px solid var(--border-sky);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.new-code-banner {
  background: var(--bg-hover);
  border: 1px solid var(--border-sky);
  border-radius: var(--radius-md);
  padding: 1rem 1.25rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
}

.new-code-label {
  font-size: 0.8rem;
  color: var(--text-secondary);
  font-weight: 600;
}

.new-code-display {
  font-family: monospace;
  font-size: 1.35rem;
  font-weight: 800;
  color: var(--accent-deep);
}

.btn-generate {
  height: 44px;
  padding: 0 1.25rem;
  white-space: nowrap;
}

.font-bold {
  font-weight: 600;
}

.text-dim {
  color: var(--text-secondary);
}

.provider-tag {
  font-size: 0.78rem;
  color: var(--text-secondary);
  text-transform: capitalize;
}
</style>
