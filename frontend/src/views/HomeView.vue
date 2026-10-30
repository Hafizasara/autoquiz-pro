<script setup>
import { computed } from 'vue';
import { useAuth } from '../store/auth';

const auth = useAuth();
const currentYear = new Date().getFullYear();

const stats = [
  { value: '100%', label: 'Automated Grading & Analytics' },
  { value: '3-Tier', label: 'Role Governance (Admin, Faculty, Student)' },
  { value: 'Zero', label: 'Manual Paper Grading Hassle' },
  { value: 'Real-time', label: 'Anti-Tamper Browser Verification' }
];

const pillars = [
  {
    icon: '⚡',
    title: 'AI Assessment Synthesis',
    description: 'Transform lecture syllabi, technical topics, and curriculum outlines into balanced, multi-format exam questions, midterms, and pop-quizzes in seconds.'
  },
  {
    icon: '🛡️',
    title: 'Browser Fingerprint & Verification',
    description: 'Protect institutional examination integrity with automatic browser verification links, preventing unauthorized seat substitution or impersonation.'
  },
  {
    icon: '📊',
    title: 'Instant Scoring & Analytics',
    description: 'Eliminate grading backlogs. Real-time evaluation calculates passing thresholds, class distribution metrics, and granular question-level diagnostics.'
  },
  {
    icon: '🔄',
    title: 'Faculty Workload Management',
    description: 'Full administrative toolkit for seamless teacher invitations, departmental reassignment, and one-click bulk course and assessment transfers.'
  }
];

const roles = [
  {
    badge: 'Faculty & Teachers',
    badgeClass: 'badge-teacher',
    title: 'For Educators & Course Leads',
    points: [
      'Generate exams with tailored difficulty and topics',
      'Manage multiple courses, batches, and syllabi simultaneously',
      'Review student submissions with automated scoring & feedback',
      'Download audit trails and performance reports'
    ],
    actionText: 'Register as Faculty',
    actionRoute: '/faculty-register'
  },
  {
    badge: 'Students & Candidates',
    badgeClass: 'badge-student',
    title: 'For Students & Test Takers',
    points: [
      'Access scheduled semester tests, quizzes, and assessments',
      'Distraction-free, responsive test-taking environment',
      'Instant grade transparency and score breakdowns',
      'Secure single-sign-on with Google or student email'
    ],
    actionText: 'Join as Student',
    actionRoute: '/register'
  },
  {
    badge: 'Institutional Admins',
    badgeClass: 'badge-admin',
    title: 'For Department Chairs & Admins',
    points: [
      'Generate secure, time-expiring teacher invite tokens',
      'Bulk invite hundreds of faculty members via CSV',
      'Transfer course workloads between faculty with one click',
      'Audit department activity, enrollment, and exam records'
    ],
    actionText: 'Admin Sign In',
    actionRoute: '/login'
  }
];

const steps = [
  {
    step: '01',
    title: 'Define Course & Assessment',
    desc: 'Instructors specify the course, target subjects, total duration, passing marks, and question formats.'
  },
  {
    step: '02',
    title: 'AI Generates Questions',
    desc: 'The intelligent generator balances question taxonomy, distractor validity, and difficulty tiers.'
  },
  {
    step: '03',
    title: 'Secure Exam Delivery',
    desc: 'Students receive access, verify browser identity, and complete timed tests in an interactive interface.'
  },
  {
    step: '04',
    title: 'Instant Results & Archival',
    desc: 'Grades are instantly compiled, results published, and academic progress tracked without delay.'
  }
];

const faqs = [
  {
    q: 'What is AutoQuiz Pro and why was it created?',
    a: 'AutoQuiz Pro is an enterprise academic assessment platform designed for universities, colleges, and schools. It solves the bottlenecks of manual question formulation, exam paper leaks, and multi-week grading delays by offering AI-assisted test generation, secure test delivery, and instant automated analytics.'
  },
  {
    q: 'How does it protect exam integrity?',
    a: 'AutoQuiz Pro enforces device and browser verification, token-governed test sessions, strict time windows, and server-side validation to ensure that only registered and verified candidates can sit for scheduled examinations.'
  },
  {
    q: 'Can institutions migrate existing teacher courses?',
    a: 'Yes! The institutional administrator console includes built-in Faculty Workload Transfer tools. When professors transition semesters or take leaves, entire course catalogs and assessment registries can be transferred cleanly in one click.'
  },
  {
    q: 'Can students register freely?',
    a: 'Students can register directly using their student credentials or Google OAuth. Faculty accounts require verification or an institutional invite token issued by a departmental administrator.'
  }
];
</script>

<template>
  <div class="homepage">
    <!-- Hero Section -->
    <header class="hero-section">
      <div class="hero-bg-glow"></div>
      <div class="page-container hero-container">
        <div class="hero-badge">
          <span class="badge-pulse"></span>
          Next-Generation Academic Assessment Platform
        </div>

        <h1 class="hero-headline">
          Intelligent Exam Generation & Automated Academic Assessment.
        </h1>

        <p class="hero-subline">
          AutoQuiz Pro empowers universities and educators to compose comprehensive exams with AI,
          safeguard examination integrity with browser verification, and deliver real-time grading analytics effortlessly.
        </p>

        <div class="hero-actions">
          <template v-if="auth.isAuthenticated.value">
            <router-link to="/dashboard" class="btn btn-primary btn-lg">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
                <rect x="3" y="3" width="7" height="7"/>
                <rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/>
              </svg>
              Go to Your Dashboard
            </router-link>
            <router-link to="/assessments/create" class="btn btn-secondary btn-lg" v-if="auth.isTeacher.value || auth.isAdmin.value">
              Create New Assessment
            </router-link>
          </template>
          <template v-else>
            <router-link to="/register" class="btn btn-primary btn-lg">
              Get Started Free &rarr;
            </router-link>
            <router-link to="/login" class="btn btn-secondary btn-lg">
              Sign In to Portal
            </router-link>
            <router-link to="/faculty-register" class="btn btn-outline btn-lg">
              Faculty Access
            </router-link>
          </template>
        </div>

        <!-- Trust Stats Bar -->
        <div class="hero-stats-card glass-card">
          <div v-for="(stat, idx) in stats" :key="idx" class="stat-item">
            <div class="stat-val">{{ stat.value }}</div>
            <div class="stat-lbl">{{ stat.label }}</div>
          </div>
        </div>
      </div>
    </header>

    <!-- About Section: Purpose & What it is built for -->
    <section id="about" class="section section-alt">
      <div class="page-container">
        <div class="section-header">
          <span class="section-tag">About AutoQuiz Pro</span>
          <h2 class="section-title">Built for Modern Educational Excellence</h2>
          <p class="section-subtitle">
            Traditional testing is burdened with paper administration, exam leaks, and tedious manual grading.
            AutoQuiz Pro was built from the ground up to modernise university and institutional examinations.
          </p>
        </div>

        <div class="about-grid">
          <div class="about-card card">
            <div class="about-icon">🎯</div>
            <h3>Why Was It Built?</h3>
            <p>
              To replace outdated assessment workflows with an automated, reliable system that handles the entire
              lifecycle: curriculum-aligned question drafting, secure online proctoring, and instant scoring with zero grading backlogs.
            </p>
          </div>

          <div class="about-card card">
            <div class="about-icon">🏫</div>
            <h3>Who Is It For?</h3>
            <p>
              Designed specifically for higher-education departments, faculty course directors, academic committees,
              and university students demanding fair, transparent, and flexible testing environments.
            </p>
          </div>

          <div class="about-card card">
            <div class="about-icon">🚀</div>
            <h3>What Problems Does It Solve?</h3>
            <p>
              Eliminates repetitive question formulation, prevents exam cheating via strict browser identity verification,
              and provides instant visibility into academic outcomes for teachers and students alike.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Feature Pillars -->
    <section id="features" class="section">
      <div class="page-container">
        <div class="section-header">
          <span class="section-tag">Core Capabilities</span>
          <h2 class="section-title">Everything Needed to Run Scalable Exams</h2>
          <p class="section-subtitle">
            A cohesive suite of tools engineered for both academic rigour and administrative simplicity.
          </p>
        </div>

        <div class="pillars-grid">
          <div v-for="(pillar, idx) in pillars" :key="idx" class="pillar-card interactive-card">
            <div class="pillar-icon-box">{{ pillar.icon }}</div>
            <h3 class="pillar-title">{{ pillar.title }}</h3>
            <p class="pillar-desc">{{ pillar.description }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- 3 Roles & Portals -->
    <section id="roles" class="section section-alt">
      <div class="page-container">
        <div class="section-header">
          <span class="section-tag">Dedicated Portals</span>
          <h2 class="section-title">Tailored Experiences for Every Stakeholder</h2>
          <p class="section-subtitle">
            Granular permissions and purpose-built dashboards ensure each user gets the exact tools they need.
          </p>
        </div>

        <div class="roles-grid">
          <div v-for="(r, idx) in roles" :key="idx" class="role-card card">
            <div class="role-card-header">
              <span class="role-pill" :class="r.badgeClass">{{ r.badge }}</span>
              <h3 class="role-card-title">{{ r.title }}</h3>
            </div>
            <ul class="role-points">
              <li v-for="(point, pIdx) in r.points" :key="pIdx">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="check-icon">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
                <span>{{ point }}</span>
              </li>
            </ul>
            <div class="role-action">
              <router-link :to="r.actionRoute" class="btn btn-secondary btn-block">
                {{ r.actionText }} &rarr;
              </router-link>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Step-by-Step Workflow -->
    <section id="workflow" class="section">
      <div class="page-container">
        <div class="section-header">
          <span class="section-tag">Simple Lifecycle</span>
          <h2 class="section-title">How AutoQuiz Pro Works</h2>
          <p class="section-subtitle">
            From exam creation to grade dissemination in four streamlined steps.
          </p>
        </div>

        <div class="workflow-grid">
          <div v-for="(s, idx) in steps" :key="idx" class="workflow-card">
            <div class="workflow-num">{{ s.step }}</div>
            <h3 class="workflow-title">{{ s.title }}</h3>
            <p class="workflow-desc">{{ s.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- FAQ Section -->
    <section id="faq" class="section section-alt">
      <div class="page-container faq-container">
        <div class="section-header">
          <span class="section-tag">Got Questions?</span>
          <h2 class="section-title">Frequently Asked Questions</h2>
          <p class="section-subtitle">
            Quick answers about platform capabilities, security, and onboarding.
          </p>
        </div>

        <div class="faq-list">
          <div v-for="(item, idx) in faqs" :key="idx" class="faq-item card">
            <h3 class="faq-question">
              <span class="faq-q-badge">Q</span>
              {{ item.q }}
            </h3>
            <p class="faq-answer">{{ item.a }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Final Call to Action -->
    <section class="cta-section">
      <div class="page-container">
        <div class="cta-box glass-card">
          <h2 class="cta-title">Ready to Elevate Your Academic Examinations?</h2>
          <p class="cta-text">
            Join faculty and students leveraging automated intelligence for smarter, fairer assessments today.
          </p>
          <div class="cta-actions">
            <router-link to="/register" class="btn btn-primary btn-lg">
              Create Student Account
            </router-link>
            <router-link to="/faculty-register" class="btn btn-secondary btn-lg">
              Register as Faculty
            </router-link>
          </div>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="footer">
      <div class="page-container footer-container">
        <div class="footer-left">
          <div class="footer-brand">
            <div class="brand-icon-sm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
            </div>
            <span class="footer-title">AutoQuiz Pro</span>
          </div>
          <p class="footer-desc">
            Next-generation automated testing, AI assessment synthesis, and institutional examination management.
          </p>
        </div>

        <div class="footer-links">
          <div class="footer-col">
            <span class="col-head">Navigation</span>
            <a href="#about">About</a>
            <a href="#features">Features</a>
            <a href="#roles">Portals</a>
            <a href="#workflow">Workflow</a>
          </div>
          <div class="footer-col">
            <span class="col-head">Access</span>
            <router-link to="/login">Sign In</router-link>
            <router-link to="/register">Student Sign Up</router-link>
            <router-link to="/faculty-register">Faculty Registry</router-link>
          </div>
        </div>
      </div>

      <div class="footer-bottom">
        <div class="page-container bottom-wrap">
          <span>&copy; {{ currentYear }} AutoQuiz Pro. All rights reserved.</span>
          <span>Institutional Academic Assessment Suite</span>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.homepage {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: var(--bg-page);
  color: var(--text-main);
  overflow-x: hidden;
}

.page-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1.5rem;
  width: 100%;
}

/* ==========================================================================
   Hero Section
   ========================================================================== */
.hero-section {
  position: relative;
  padding: 5rem 0 3.5rem;
  overflow: hidden;
  background: linear-gradient(180deg, #FFFFFF 0%, #F0F8FF 60%, var(--bg-page) 100%);
  border-bottom: 1px solid var(--border-light);
}

.hero-bg-glow {
  position: absolute;
  top: -120px;
  left: 50%;
  transform: translateX(-50%);
  width: 700px;
  height: 400px;
  background: radial-gradient(circle, rgba(56, 189, 248, 0.25) 0%, rgba(2, 132, 199, 0.05) 60%, transparent 80%);
  pointer-events: none;
  filter: blur(50px);
}

.hero-container {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 1.5rem;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--bg-hover);
  border: 1px solid var(--border-sky);
  color: var(--accent-deep);
  font-size: 0.84rem;
  font-weight: 700;
  padding: 0.4rem 1.1rem;
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-sm);
}

.badge-pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-primary);
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.35);
}

.hero-headline {
  font-family: var(--font-heading);
  font-size: 2.85rem;
  line-height: 1.18;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--text-main);
  max-width: 900px;
}

.hero-subline {
  font-size: 1.18rem;
  line-height: 1.6;
  color: var(--text-secondary);
  max-width: 760px;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 1rem;
  margin-top: 0.5rem;
}

.btn-lg {
  padding: 0.85rem 1.75rem;
  font-size: 1rem;
  border-radius: var(--radius-md);
}

.btn-icon {
  width: 18px;
  height: 18px;
}

/* Stats Card */
.hero-stats-card {
  margin-top: 2rem;
  width: 100%;
  max-width: 1020px;
  padding: 1.5rem 1rem;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.25rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-sky);
  background: rgba(255, 255, 255, 0.95);
  box-shadow: var(--shadow-md);
}

@media (min-width: 768px) {
  .hero-stats-card {
    grid-template-columns: repeat(4, 1fr);
  }
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 0.5rem;
  border-right: 1px solid var(--border-light);
}

.stat-item:last-child {
  border-right: none;
}

.stat-val {
  font-family: var(--font-heading);
  font-size: 1.75rem;
  font-weight: 800;
  color: var(--accent-vivid);
  line-height: 1.2;
}

.stat-lbl {
  font-size: 0.8rem;
  color: var(--text-secondary);
  font-weight: 600;
  margin-top: 0.25rem;
}

/* ==========================================================================
   Section Layouts
   ========================================================================== */
.section {
  padding: 4.5rem 0;
}

.section-alt {
  background-color: #FFFFFF;
  border-top: 1px solid var(--border-subtle);
  border-bottom: 1px solid var(--border-subtle);
}

.section-header {
  text-align: center;
  max-width: 720px;
  margin: 0 auto 3rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.65rem;
}

.section-tag {
  font-size: 0.8rem;
  text-transform: uppercase;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: var(--accent-vivid);
  background: var(--bg-hover);
  padding: 0.25rem 0.8rem;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-sky);
}

.section-title {
  font-family: var(--font-heading);
  font-size: 2.15rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text-main);
  line-height: 1.25;
}

.section-subtitle {
  font-size: 1.05rem;
  color: var(--text-secondary);
  line-height: 1.55;
}

/* About Grid */
.about-grid {
  display: grid;
  grid-template-columns: repeat(1, 1fr);
  gap: 1.5rem;
}

@media (min-width: 768px) {
  .about-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.about-card {
  padding: 2rem 1.5rem;
  background: #FFFFFF;
  border: 1px solid var(--border-sky);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  transition: var(--transition-fast);
}

.about-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-md);
  border-color: var(--border-focus);
}

.about-icon {
  font-size: 2.25rem;
  line-height: 1;
}

.about-card h3 {
  font-family: var(--font-heading);
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-main);
}

.about-card p {
  font-size: 0.92rem;
  color: var(--text-secondary);
  line-height: 1.55;
}

/* Pillars Grid */
.pillars-grid {
  display: grid;
  grid-template-columns: repeat(1, 1fr);
  gap: 1.5rem;
}

@media (min-width: 640px) {
  .pillars-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .pillars-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

.pillar-card {
  padding: 1.75rem 1.5rem;
  background: #FFFFFF;
  border: 1px solid var(--border-sky);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  box-shadow: var(--shadow-sm);
}

.pillar-icon-box {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  background: var(--bg-hover);
  border: 1px solid var(--border-sky);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
}

.pillar-title {
  font-family: var(--font-heading);
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-main);
}

.pillar-desc {
  font-size: 0.88rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

/* Roles Grid */
.roles-grid {
  display: grid;
  grid-template-columns: repeat(1, 1fr);
  gap: 1.75rem;
}

@media (min-width: 840px) {
  .roles-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.role-card {
  padding: 2.25rem 1.75rem;
  background: #FFFFFF;
  border: 1px solid var(--border-sky);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 1.5rem;
  box-shadow: var(--shadow-sm);
  transition: var(--transition-fast);
}

.role-card:hover {
  border-color: var(--border-focus);
  box-shadow: var(--shadow-md);
}

.role-card-header {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.role-card-title {
  font-family: var(--font-heading);
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--text-main);
}

.badge-teacher {
  background: var(--bg-hover);
  color: var(--accent-deep);
  border: 1px solid var(--border-sky);
}

.badge-student {
  background: #F0FDF4;
  color: #166534;
  border: 1px solid #BBF7D0;
}

.badge-admin {
  background: #EFF6FF;
  color: #1D4ED8;
  border: 1px solid #BFDBFE;
}

.role-points {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: 0;
  flex-grow: 1;
}

.role-points li {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  font-size: 0.88rem;
  color: var(--text-main);
  line-height: 1.45;
}

.check-icon {
  width: 17px;
  height: 17px;
  color: var(--accent-vivid);
  flex-shrink: 0;
  margin-top: 2px;
}

.role-action {
  margin-top: 0.5rem;
}

/* Workflow Grid */
.workflow-grid {
  display: grid;
  grid-template-columns: repeat(1, 1fr);
  gap: 1.5rem;
}

@media (min-width: 640px) {
  .workflow-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .workflow-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

.workflow-card {
  padding: 2rem 1.5rem;
  background: #FFFFFF;
  border: 1px solid var(--border-sky);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  position: relative;
}

.workflow-num {
  font-family: var(--font-heading);
  font-size: 2.25rem;
  font-weight: 900;
  color: var(--accent-primary);
  line-height: 1;
}

.workflow-title {
  font-family: var(--font-heading);
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-main);
}

.workflow-desc {
  font-size: 0.88rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

/* FAQ */
.faq-container {
  max-width: 860px;
}

.faq-list {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.faq-item {
  padding: 1.75rem 2rem;
  background: #FFFFFF;
  border: 1px solid var(--border-sky);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.faq-question {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-family: var(--font-heading);
  font-size: 1.12rem;
  font-weight: 700;
  color: var(--text-main);
}

.faq-q-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: var(--bg-hover);
  color: var(--accent-vivid);
  border: 1px solid var(--border-sky);
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 800;
  flex-shrink: 0;
}

.faq-answer {
  font-size: 0.92rem;
  color: var(--text-secondary);
  line-height: 1.6;
  padding-left: 2.25rem;
}

/* CTA Section */
.cta-section {
  padding: 4.5rem 0;
  background: linear-gradient(180deg, var(--bg-page) 0%, #E0F2FE 100%);
}

.cta-box {
  background: #FFFFFF;
  border: 1px solid var(--border-sky);
  border-radius: var(--radius-lg);
  padding: 3.5rem 2rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.25rem;
  box-shadow: var(--shadow-lg);
}

.cta-title {
  font-family: var(--font-heading);
  font-size: 2.25rem;
  font-weight: 800;
  color: var(--text-main);
  max-width: 680px;
  line-height: 1.25;
}

.cta-text {
  font-size: 1.1rem;
  color: var(--text-secondary);
  max-width: 600px;
}

.cta-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 1rem;
  margin-top: 0.5rem;
}

/* Footer */
.footer {
  background: #FFFFFF;
  border-top: 1px solid var(--border-sky);
  padding-top: 3.5rem;
}

.footer-container {
  display: flex;
  flex-direction: column;
  gap: 2.5rem;
  padding-bottom: 2.5rem;
}

@media (min-width: 768px) {
  .footer-container {
    flex-direction: row;
    justify-content: space-between;
    align-items: flex-start;
  }
}

.footer-left {
  max-width: 400px;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.footer-brand {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.brand-icon-sm {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-vivid));
  display: flex;
  align-items: center;
  justify-content: center;
  color: #FFFFFF;
}

.brand-icon-sm svg {
  width: 18px;
  height: 18px;
}

.footer-title {
  font-family: var(--font-heading);
  font-size: 1.2rem;
  font-weight: 800;
  color: var(--text-main);
}

.footer-desc {
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

.footer-links {
  display: flex;
  gap: 3rem;
}

.footer-col {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.col-head {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-main);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.25rem;
}

.footer-col a {
  font-size: 0.88rem;
  color: var(--text-secondary);
  text-decoration: none;
  transition: var(--transition-fast);
}

.footer-col a:hover {
  color: var(--accent-vivid);
  text-decoration: underline;
}

.footer-bottom {
  border-top: 1px solid var(--border-light);
  padding: 1.25rem 0;
  background: var(--bg-page);
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.bottom-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: center;
  text-align: center;
}

@media (min-width: 640px) {
  .bottom-wrap {
    flex-direction: row;
    justify-content: space-between;
  }
}

@media (max-width: 640px) {
  .hero-headline {
    font-size: 2.1rem;
  }
  .section-title {
    font-size: 1.75rem;
  }
  .cta-title {
    font-size: 1.75rem;
  }
  .faq-answer {
    padding-left: 0;
  }
}
</style>
