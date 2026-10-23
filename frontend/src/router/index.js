import { createRouter, createWebHistory } from 'vue-router';
import LoginView from '../views/LoginView.vue';
import DashboardView from '../views/DashboardView.vue';
import OAuthCallbackView from '../views/OAuthCallbackView.vue';
import { useAuth } from '../store/auth';

const routes = [
  {
    path: '/',
    redirect: () => {
      const auth = useAuth();
      return auth.isAuthenticated.value ? '/dashboard' : '/login';
    }
  },
  {
    path: '/login',
    name: 'Login',
    component: LoginView,
    meta: { guestOnly: true }
  },
  {
    path: '/auth/callback',
    name: 'OAuthCallback',
    component: OAuthCallbackView
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: DashboardView,
    meta: { requiresAuth: true }
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/login'
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach(async (to, from, next) => {
  const auth = useAuth();

  // If initial load and not verified yet
  if (auth.isLoading.value) {
    await auth.initAuth();
  }

  if (to.meta.requiresAuth && !auth.isAuthenticated.value) {
    return next({ name: 'Login' });
  }

  if (to.meta.guestOnly && auth.isAuthenticated.value) {
    return next({ name: 'Dashboard' });
  }

  next();
});

export default router;
