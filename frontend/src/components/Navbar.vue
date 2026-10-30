<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../store/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuth();

// Hide global navbar on views that already have their own self-contained top bar (like DashboardView)
const isDashboard = computed(() => route.name === 'Dashboard');

const handleSignOut = async () => {
  await auth.logout();
  router.push('/login');
};
</script>

<template>
  <nav v-if="!isDashboard" class="main-navbar">
    <div class="nav-container">
      <router-link to="/" class="brand-link">
        <div class="brand-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div class="brand-text">
          <span class="brand-title">AutoQuiz <span class="brand-accent">Pro</span></span>
          <span class="brand-tagline">Institutional Assessment Suite</span>
        </div>
      </router-link>

      <!-- Center Nav Links for Quick Section Navigation -->
      <div class="nav-center-links">
        <a href="#about" class="nav-item">About</a>
        <a href="#features" class="nav-item">Features</a>
        <a href="#roles" class="nav-item">Portals</a>
        <a href="#workflow" class="nav-item">How It Works</a>
        <a href="#faq" class="nav-item">FAQ</a>
      </div>

      <!-- Right Action Buttons -->
      <div class="nav-actions">
        <template v-if="auth.isAuthenticated.value">
          <router-link to="/dashboard" class="btn btn-outline btn-sm">
            Dashboard
          </router-link>
          <button class="btn btn-secondary btn-sm" @click="handleSignOut">
            Sign Out
          </button>
        </template>
        <template v-else>
          <router-link to="/login" class="btn btn-outline btn-sm">
            Sign In
          </router-link>
          <router-link to="/register" class="btn btn-primary btn-sm">
            Get Started
          </router-link>
        </template>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.main-navbar {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border-sky);
  box-shadow: 0 2px 10px rgba(135, 206, 235, 0.12);
  transition: var(--transition-fast);
}

.nav-container {
  max-width: 1240px;
  margin: 0 auto;
  padding: 0.85rem 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1.5rem;
}

.brand-link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  text-decoration: none;
}

.brand-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-vivid));
  display: flex;
  align-items: center;
  justify-content: center;
  color: #FFFFFF;
  box-shadow: 0 3px 10px rgba(56, 189, 248, 0.35);
  flex-shrink: 0;
}

.brand-icon svg {
  width: 22px;
  height: 22px;
}

.brand-text {
  display: flex;
  flex-direction: column;
}

.brand-title {
  font-family: var(--font-heading);
  font-size: 1.25rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text-main);
  line-height: 1.15;
}

.brand-accent {
  color: var(--accent-vivid);
}

.brand-tagline {
  font-size: 0.7rem;
  color: var(--text-secondary);
  font-weight: 500;
  letter-spacing: 0.02em;
}

.nav-center-links {
  display: none;
  align-items: center;
  gap: 1.5rem;
}

@media (min-width: 820px) {
  .nav-center-links {
    display: flex;
  }
}

.nav-item {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-decoration: none;
  transition: var(--transition-fast);
  padding: 0.35rem 0.5rem;
  border-radius: var(--radius-sm);
}

.nav-item:hover {
  color: var(--accent-vivid);
  text-decoration: none;
  background-color: var(--bg-hover);
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

@media (max-width: 480px) {
  .brand-tagline {
    display: none;
  }
  .nav-container {
    padding: 0.75rem 1rem;
  }
}
</style>
