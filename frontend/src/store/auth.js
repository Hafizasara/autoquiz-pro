import { reactive, computed } from 'vue';
import { fetchCurrentUser } from '../api';
import { signOutSupabase } from '../supabase';

const TOKEN_KEY = 'autoquiz_pro_jwt';
const USER_KEY = 'autoquiz_pro_user';

const state = reactive({
  token: localStorage.getItem(TOKEN_KEY) || null,
  user: JSON.parse(localStorage.getItem(USER_KEY) || 'null'),
  isLoading: true
});

export const useAuth = () => {
  const isAuthenticated = computed(() => Boolean(state.token && state.user));
  const role = computed(() => state.user?.role || null);
  const isAdmin = computed(() => state.user?.role === 'ADMIN');
  const isTeacher = computed(() => state.user?.role === 'TEACHER');
  const isStudent = computed(() => state.user?.role === 'STUDENT');

  const setSession = (token, user) => {
    state.token = token;
    state.user = user;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  };

  const logout = async () => {
    state.token = null;
    state.user = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    await signOutSupabase().catch(() => {});
  };

  const initAuth = async () => {
    state.isLoading = true;
    const storedToken = localStorage.getItem(TOKEN_KEY);

    if (!storedToken) {
      state.token = null;
      state.user = null;
      state.isLoading = false;
      return null;
    }

    try {
      const res = await fetchCurrentUser(storedToken);
      if (res?.data?.user) {
        state.token = storedToken;
        state.user = res.data.user;
        localStorage.setItem(USER_KEY, JSON.stringify(res.data.user));
      } else {
        await logout();
      }
    } catch (err) {
      console.warn('Session verification failed, logging out:', err.message);
      await logout();
    } finally {
      state.isLoading = false;
    }

    return state.user;
  };

  return {
    state,
    user: computed(() => state.user),
    token: computed(() => state.token),
    isLoading: computed(() => state.isLoading),
    role,
    isAuthenticated,
    isAdmin,
    isTeacher,
    isStudent,
    setSession,
    logout,
    initAuth
  };
};
