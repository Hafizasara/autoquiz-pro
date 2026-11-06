<script setup>
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../store/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuth();

const isMobileMenuOpen = ref(false);

// Hide global navbar on views that already have their own self-contained top bar (like DashboardView)
const isDashboard = computed(() => route.name === 'Dashboard');

const handleSignOut = async () => {
  await auth.logout();
  router.push('/login');
};

const navigateToSection = (sectionId) => {
  isMobileMenuOpen.value = false;
  const hash = sectionId.startsWith('#') ? sectionId : `#${sectionId}`;

  if (route.path === '/') {
    const el = document.querySelector(hash);
    if (el) {
      const topOffset = 80;
      const elementPosition = el.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - topOffset;
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
      window.history.pushState(null, '', hash);
    }
  } else {
    router.push({ path: '/', hash }).then(() => {
      setTimeout(() => {
        const el = document.querySelector(hash);
        if (el) {
          const topOffset = 80;
          const elementPosition = el.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - topOffset;
          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
          });
        }
      }, 150);
    });
  }
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
        <a href="/#about" class="nav-item" @click.prevent="navigateToSection('#about')">About</a>
        <a href="/#features" class="nav-item" @click.prevent="navigateToSection('#features')">Features</a>
        <a href="/#roles" class="nav-item" @click.prevent="navigateToSection('#roles')">Portals</a>
        <a href="/#workflow" class="nav-item" @click.prevent="navigateToSection('#workflow')">How It Works</a>
        <a href="/#faq" class="nav-item" @click.prevent="navigateToSection('#faq')">FAQ</a>
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

        <!-- Mobile hamburger toggle button -->
        <button
          class="mobile-menu-btn"
          @click="isMobileMenuOpen = !isMobileMenuOpen"
          aria-label="Toggle navigation menu"
        >
          <svg v-if="!isMobileMenuOpen" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Mobile Navigation Drawer -->
    <div v-if="isMobileMenuOpen" class="mobile-nav-drawer">
      <a href="/#about" class="mobile-nav-item" @click.prevent="navigateToSection('#about')">About</a>
      <a href="/#features" class="mobile-nav-item" @click.prevent="navigateToSection('#features')">Features</a>
      <a href="/#roles" class="mobile-nav-item" @click.prevent="navigateToSection('#roles')">Portals</a>
      <a href="/#workflow" class="mobile-nav-item" @click.prevent="navigateToSection('#workflow')">How It Works</a>
      <a href="/#faq" class="mobile-nav-item" @click.prevent="navigateToSection('#faq')">FAQ</a>
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

.mobile-menu-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--border-sky);
  border-radius: var(--radius-sm);
  padding: 0.4rem;
  color: var(--text-main);
  cursor: pointer;
  transition: var(--transition-fast);
}

.mobile-menu-btn:hover {
  background: var(--bg-hover);
  color: var(--accent-vivid);
}

.mobile-menu-btn svg {
  width: 20px;
  height: 20px;
}

@media (min-width: 820px) {
  .mobile-menu-btn {
    display: none;
  }
}

.mobile-nav-drawer {
  display: flex;
  flex-direction: column;
  padding: 0.75rem 1.5rem 1rem;
  background: rgba(255, 255, 255, 0.98);
  border-top: 1px solid var(--border-sky);
  gap: 0.5rem;
  animation: slideDown 0.2s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.mobile-nav-item {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-main);
  text-decoration: none;
  padding: 0.6rem 0.85rem;
  border-radius: var(--radius-sm);
  transition: var(--transition-fast);
}

.mobile-nav-item:hover {
  background: var(--bg-hover);
  color: var(--accent-vivid);
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
