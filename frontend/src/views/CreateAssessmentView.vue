<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../store/auth';
import { createAssessment, fetchTeacherCourses, fetchAssessments } from '../api';

const router = useRouter();
const auth = useAuth();

const courses = ref([]);
const existingAssessments = ref([]);
const isLoadingCourses = ref(true);
const isSubmitting = ref(false);
const errorMessage = ref('');
const validationErrors = ref([]);
const successMessage = ref('');
const createdAssessmentRecord = ref(null);

const form = ref({
  title: 'Data Structures Midterm Examination 2026',
  courseId: '',
  assessmentType: 'Midterm Exam',
  totalMarks: 100,
  passingMarks: 50,
  durationMinutes: 60,
  description: 'Midterm assessment covering algorithmic complexity, singly and doubly linked lists, stack evaluation, circular queues, and binary search tree traversals.',
  status: 'PUBLISHED'
});

const loadInitialData = async () => {
  isLoadingCourses.value = true;
  errorMessage.value = '';

  try {
    const courseRes = await fetchTeacherCourses(auth.token.value);
    courses.value = courseRes.data?.courses || [];

    if (courses.value.length > 0) {
      form.value.courseId = courses.value[0].course_id;
    }

    const assessRes = await fetchAssessments(auth.token.value);
    existingAssessments.value = assessRes.data?.assessments || [];
  } catch (err) {
    console.error('Error loading courses or assessments:', err);
    errorMessage.value = err.message || 'Unable to load course catalog';
  } finally {
    isLoadingCourses.value = false;
  }
};

const handleCreateAssessment = async () => {
  errorMessage.value = '';
  validationErrors.value = [];
  successMessage.value = '';
  createdAssessmentRecord.value = null;
  isSubmitting.value = true;

  try {
    const payload = {
      title: form.value.title,
      courseId: form.value.courseId,
      totalMarks: Number(form.value.totalMarks),
      passingMarks: Number(form.value.passingMarks),
      durationMinutes: Number(form.value.durationMinutes),
      description: form.value.description,
      status: form.value.status,
      questions: [
        {
          id: 1,
          question: 'What is the worst-case time complexity of searching in an unbalanced Binary Search Tree?',
          options: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'],
          correctAnswer: 'O(n)',
          marks: 20
        },
        {
          id: 2,
          question: 'Which abstract data type operates on a Last-In, First-Out (LIFO) protocol?',
          options: ['Queue', 'Stack', 'Priority Queue', 'Array'],
          correctAnswer: 'Stack',
          marks: 20
        }
      ]
    };

    const res = await createAssessment(auth.token.value, payload);

    if (res.status === 'success') {
      createdAssessmentRecord.value = res.data.assessment;
      successMessage.value = `Assessment "${res.data.assessment.title}" created successfully with ID #${res.data.assessment.assessment_id}!`;
      // Reload existing assessments to show real-time persistence
      const assessRes = await fetchAssessments(auth.token.value);
      existingAssessments.value = assessRes.data?.assessments || [];
    }
  } catch (err) {
    errorMessage.value = err.message || 'Failed to create assessment.';
    if (err.errors && Array.isArray(err.errors)) {
      validationErrors.value = err.errors;
    }
  } finally {
    isSubmitting.value = false;
  }
};

onMounted(async () => {
  await loadInitialData();
});
</script>

<template>
  <div class="assessment-studio-page">
    <!-- Navbar Header -->
    <header class="navbar glass-card">
      <div class="nav-brand">
        <div class="logo-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div>
          <h1 class="nav-title">AutoQuiz Pro</h1>
          <p class="nav-subtitle">Assessment Studio & Exam Generator</p>
        </div>
      </div>

      <div class="nav-actions">
        <router-link to="/dashboard" class="btn btn-secondary btn-sm">
          &larr; Back to Dashboard
        </router-link>
        <span class="badge badge-info">
          <span class="badge-dot"></span>
          {{ auth.user.value?.role || 'FACULTY' }}
        </span>
      </div>
    </header>

    <main class="studio-container">
      <!-- Page Banner -->
      <div class="glass-card studio-banner">
        <div class="banner-badge-row">
          <span class="badge badge-primary">
            <span class="badge-dot"></span> Week 6 Core Assessment Module
          </span>
          <span class="banner-subtext">Faculty Creator: {{ auth.user.value?.name }} ({{ auth.user.value?.email }})</span>
        </div>
        <h2 class="studio-headline">Create New Academic Assessment</h2>
        <p class="studio-description">
          Define assessment parameters, syllabus topics, duration, and scoring thresholds. Once published, students enrolled in the course will receive instant examination access and automated Gemini AI evaluation.
        </p>
      </div>

      <!-- Success Notification -->
      <div v-if="successMessage" class="alert alert-success">
        <div class="alert-content">
          <p class="font-bold">{{ successMessage }}</p>
          <div v-if="createdAssessmentRecord" class="record-badge-row">
            <span><strong>Assessment ID:</strong> {{ createdAssessmentRecord.assessment_id }}</span>
            <span><strong>Status:</strong> {{ createdAssessmentRecord.status }}</span>
            <span><strong>Total Marks:</strong> {{ createdAssessmentRecord.total_marks }}</span>
            <span><strong>Duration:</strong> {{ createdAssessmentRecord.duration_minutes }} mins</span>
          </div>
        </div>
      </div>

      <!-- Error Notification -->
      <div v-if="errorMessage" class="alert alert-error">
        <div class="alert-content">
          <p class="font-bold">{{ errorMessage }}</p>
          <ul v-if="validationErrors.length" class="error-list">
            <li v-for="(vErr, i) in validationErrors" :key="i">{{ vErr }}</li>
          </ul>
        </div>
      </div>

      <!-- Creation Form Card (WEEK 6 SCREENSHOT 1 TARGET) -->
      <div class="glass-card form-card">
        <div class="form-card-header">
          <div>
            <h3 class="form-title">Assessment Specification Form</h3>
            <p class="form-subtitle">All fields marked with an asterisk (*) are mandatory for institutional compliance.</p>
          </div>
          <span class="status-indicator">
            <span class="badge-dot pulse-dot"></span> Ready for Submission
          </span>
        </div>

        <form @submit.prevent="handleCreateAssessment" class="assessment-form">
          <!-- Title Row -->
          <div class="form-group">
            <label class="form-label" for="assessment-title">
              Assessment Title *
            </label>
            <input
              id="assessment-title"
              v-model="form.title"
              type="text"
              required
              class="form-input"
              placeholder="e.g. Data Structures Midterm Examination 2026"
            />
            <span class="form-hint">Descriptive academic title appearing on the student examination portal.</span>
          </div>

          <!-- Course & Assessment Type Row -->
          <div class="form-row-2">
            <div class="form-group">
              <label class="form-label" for="assessment-course">
                Assigned Course Module *
              </label>
              <select
                id="assessment-course"
                v-model="form.courseId"
                required
                class="form-input"
              >
                <option value="" disabled>Select assigned course...</option>
                <option v-for="c in courses" :key="c.course_id" :value="c.course_id">
                  {{ c.course_code ? `[${c.course_code}] ` : '' }}{{ c.course_name }}
                </option>
              </select>
              <span class="form-hint">Curriculum module linked to this assessment.</span>
            </div>

            <div class="form-group">
              <label class="form-label" for="assessment-type">
                Assessment Category *
              </label>
              <select
                id="assessment-type"
                v-model="form.assessmentType"
                class="form-input"
              >
                <option value="Quiz">Weekly Quiz</option>
                <option value="Midterm Exam">Midterm Examination</option>
                <option value="Final Exam">Final Examination</option>
                <option value="Lab Assessment">Practical / Lab Assessment</option>
              </select>
            </div>
          </div>

          <!-- Total Marks, Passing Marks, Duration -->
          <div class="form-row-3">
            <div class="form-group">
              <label class="form-label" for="total-marks">
                Total Marks *
              </label>
              <input
                id="total-marks"
                v-model="form.totalMarks"
                type="number"
                min="1"
                required
                class="form-input"
                placeholder="100"
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="passing-marks">
                Passing Marks *
              </label>
              <input
                id="passing-marks"
                v-model="form.passingMarks"
                type="number"
                min="1"
                required
                class="form-input"
                placeholder="50"
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="duration-mins">
                Duration (Minutes) *
              </label>
              <input
                id="duration-mins"
                v-model="form.durationMinutes"
                type="number"
                min="5"
                required
                class="form-input"
                placeholder="60"
              />
            </div>
          </div>

          <!-- Description & Examination Instructions -->
          <div class="form-group">
            <label class="form-label" for="assessment-desc">
              Examination Instructions & Syllabus Coverage
            </label>
            <textarea
              id="assessment-desc"
              v-model="form.description"
              rows="3"
              class="form-input textarea-input"
              placeholder="Provide instructions regarding permitted calculators, syllabus chapters, and AI proctoring rules..."
            ></textarea>
          </div>

          <!-- Publication Status -->
          <div class="form-group">
            <label class="form-label">Publication Status</label>
            <div class="status-radio-group">
              <label class="radio-label">
                <input type="radio" v-model="form.status" value="PUBLISHED" />
                <span class="radio-custom"></span>
                <span><strong>PUBLISHED</strong> (Immediately visible to students)</span>
              </label>
              <label class="radio-label">
                <input type="radio" v-model="form.status" value="DRAFT" />
                <span class="radio-custom"></span>
                <span><strong>DRAFT</strong> (Saved internally for faculty review)</span>
              </label>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="form-actions-bar">
            <button
              id="btn-create-assessment"
              type="submit"
              class="btn btn-primary btn-lg"
              :disabled="isSubmitting"
            >
              <svg v-if="!isSubmitting" class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              <span>{{ isSubmitting ? 'Submitting to Backend API...' : 'Create & Publish Assessment' }}</span>
            </button>

            <router-link to="/dashboard" class="btn btn-secondary btn-lg">
              Cancel
            </router-link>
          </div>
        </form>
      </div>

      <!-- Saved Assessments Registry (Evidence for Screenshot 6) -->
      <div v-if="existingAssessments.length" class="glass-card registry-card">
        <div class="registry-header">
          <div>
            <h3 class="form-title">Active Assessments Registry ({{ existingAssessments.length }})</h3>
            <p class="form-subtitle">Live records synced with Supabase PostgreSQL database.</p>
          </div>
          <button class="btn btn-secondary btn-sm" @click="loadInitialData">
            Refresh Records
          </button>
        </div>

        <div class="table-responsive">
          <table class="assessment-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Assessment Title</th>
                <th>Course</th>
                <th>Total Marks</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Created At</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="a in existingAssessments" :key="a.assessment_id">
                <td><code class="code-id">#{{ a.assessment_id }}</code></td>
                <td class="font-bold">{{ a.title }}</td>
                <td>{{ a.course_name || `Course #${a.course_id}` }}</td>
                <td>{{ a.total_marks }} pts</td>
                <td>{{ a.duration_minutes }}m</td>
                <td>
                  <span :class="['badge', a.status === 'PUBLISHED' ? 'badge-success' : 'badge-warning']">
                    {{ a.status }}
                  </span>
                </td>
                <td class="text-secondary">{{ new Date(a.created_at).toLocaleDateString() }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.assessment-studio-page {
  min-height: 100vh;
  background-color: #F8FBFF;
  color: #1E293B;
  display: flex;
  flex-direction: column;
}

.navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.85rem 2rem;
  background: #FFFFFF;
  border-bottom: 1px solid #87CEEB;
  position: sticky;
  top: 0;
  z-index: 50;
  box-shadow: 0 2px 8px rgba(56, 189, 248, 0.08);
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.logo-box {
  width: 42px;
  height: 42px;
  min-width: 42px;
  max-width: 42px;
  border-radius: 10px;
  background: #E0F2FE;
  color: #0284C7;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo-box svg {
  width: 24px;
  height: 24px;
  max-width: 24px;
  max-height: 24px;
}

.nav-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #1E293B;
  margin: 0;
  line-height: 1.2;
}

.nav-subtitle {
  font-size: 0.8rem;
  color: #64748B;
  margin: 0;
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.studio-container {
  max-width: 1040px;
  margin: 0 auto;
  width: 100%;
  padding: 2rem 1.5rem 4rem;
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
}

.studio-banner {
  padding: 1.75rem 2rem;
  border-radius: 16px;
  background: #FFFFFF;
  border: 1px solid #87CEEB;
  box-shadow: 0 4px 16px rgba(56, 189, 248, 0.08);
}

.banner-badge-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.banner-subtext {
  font-size: 0.85rem;
  color: #64748B;
}

.studio-headline {
  font-size: 1.65rem;
  font-weight: 700;
  color: #1E293B;
  margin-bottom: 0.5rem;
}

.studio-description {
  font-size: 0.95rem;
  color: #64748B;
  line-height: 1.55;
  max-width: 860px;
}

.form-card {
  padding: 2rem;
  border-radius: 16px;
  background: #FFFFFF;
  border: 1px solid #87CEEB;
  box-shadow: 0 8px 24px rgba(56, 189, 248, 0.09);
}

.form-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-bottom: 1.25rem;
  margin-bottom: 1.5rem;
  border-bottom: 1px solid #E0F2FE;
}

.form-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #1E293B;
}

.form-subtitle {
  font-size: 0.85rem;
  color: #64748B;
  margin-top: 0.25rem;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.82rem;
  font-weight: 600;
  color: #0284C7;
  background: #E0F2FE;
  padding: 0.35rem 0.75rem;
  border-radius: 20px;
}

.pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #0284C7;
}

.assessment-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.form-row-2 {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 1.25rem;
}

.form-row-3 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 1.25rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.form-label {
  font-size: 0.88rem;
  font-weight: 600;
  color: #1E293B;
}

.form-input {
  width: 100%;
  padding: 0.75rem 0.95rem;
  border-radius: 8px;
  border: 1px solid #CBDFF0;
  background: #FFFFFF;
  color: #1E293B;
  font-size: 0.92rem;
  transition: all 0.2s ease;
}

.form-input:focus {
  outline: none;
  border-color: #38BDF8;
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.2);
}

.textarea-input {
  resize: vertical;
  min-height: 85px;
}

.form-hint {
  font-size: 0.78rem;
  color: #64748B;
}

.status-radio-group {
  display: flex;
  gap: 1.5rem;
  margin-top: 0.25rem;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  cursor: pointer;
  color: #1E293B;
}

.form-actions-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding-top: 1.25rem;
  margin-top: 0.5rem;
  border-top: 1px solid #E0F2FE;
}

.btn-lg {
  padding: 0.85rem 1.75rem;
  font-size: 0.98rem;
  font-weight: 600;
  border-radius: 10px;
}

.btn-svg {
  width: 18px;
  height: 18px;
  margin-right: 0.4rem;
}

.record-badge-row {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-top: 0.5rem;
  font-size: 0.88rem;
}

.registry-card {
  padding: 1.75rem;
  border-radius: 16px;
  background: #FFFFFF;
  border: 1px solid #87CEEB;
}

.registry-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.25rem;
}

.assessment-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.assessment-table th {
  text-align: left;
  padding: 0.75rem 1rem;
  background: #F8FBFF;
  color: #64748B;
  font-weight: 600;
  border-bottom: 1px solid #CBDFF0;
}

.assessment-table td {
  padding: 0.85rem 1rem;
  border-bottom: 1px solid #E0F2FE;
  color: #1E293B;
}

.code-id {
  background: #E0F2FE;
  color: #0284C7;
  padding: 0.2rem 0.45rem;
  border-radius: 4px;
  font-family: monospace;
  font-weight: 600;
}

@media (max-width: 768px) {
  .form-row-2,
  .form-row-3 {
    grid-template-columns: 1fr;
  }
}
</style>
