import { createRouter, createWebHistory } from 'vue-router';
import LoginView from '../views/LoginView.vue';
import RegisterView from '../views/RegisterView.vue';
import FacultyRegisterView from '../views/FacultyRegisterView.vue';
import VerifyEmailView from '../views/VerifyEmailView.vue';
import DashboardView from '../views/DashboardView.vue';
import OAuthCallbackView from '../views/OAuthCallbackView.vue';
import CreateAssessmentView from '../views/CreateAssessmentView.vue';
import { useAuth } from '../store/auth';
import HomeView from '../views/HomeView.vue';

const routes = [
  {
    path: '/',
    name: 'Home',
    component: HomeView,

  },
  {
    path: '/login',
    name: 'Login',
    component: LoginView,
    meta: { guestOnly: true }
  },
  {
    path: '/register',
    name: 'Register',
    component: RegisterView,
    meta: { guestOnly: true }
  },
  {
    path: '/faculty-register',
    alias: '/staff/register',
    name: 'FacultyRegister',
    component: FacultyRegisterView,
    meta: { guestOnly: true }
  },
  {
    path: '/verify-email',
    name: 'VerifyEmail',
    component: VerifyEmailView
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
    path: '/assessments/create',
    alias: ['/assessments/new', '/assessments'],
    name: 'CreateAssessment',
    component: CreateAssessmentView,
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
