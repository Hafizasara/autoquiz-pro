const getDefaultApiUrl = () => {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return 'https://autoquiz-pro.onrender.com/api/v1';
  }
  return 'http://localhost:5000/api/v1';
};

export const API_BASE_URL = getDefaultApiUrl();

/**
 * Universal API Request Handler
 */
const request = async (endpoint, options = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data.message || `Request failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return data;
};

// --- AUTHENTICATION API ---

export const checkApiHealth = async () => {
  try {
    return await request('/health');
  } catch (err) {
    return { status: 'error', message: err.message };
  }
};

export const loginWithEmail = async (email, password) => {
  return await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
};

export const registerTeacher = async ({ name, email, password, inviteCode }) => {
  return await request('/auth/register-teacher', {
    method: 'POST',
    body: JSON.stringify({ name, email, password, inviteCode })
  });
};

export const registerAdmin = async ({ name, email, password, inviteCode }) => {
  return await request('/auth/register-admin', {
    method: 'POST',
    body: JSON.stringify({ name, email, password, inviteCode })
  });
};

export const syncGoogleAuth = async (supabaseAccessToken, inviteCode = null) => {
  return await request('/auth/google-auth', {
    method: 'POST',
    body: JSON.stringify({ supabaseAccessToken, inviteCode })
  });
};

export const validateInviteCode = async (code, requiredRole = null) => {
  return await request('/auth/validate-invite', {
    method: 'POST',
    body: JSON.stringify({ code, requiredRole })
  });
};

export const checkUniversityEmail = async (email) => {
  return await request('/auth/check-university-email', {
    method: 'POST',
    body: JSON.stringify({ email })
  });
};

export const fetchCurrentUser = async (token) => {
  return await request('/auth/me', {
    headers: { Authorization: `Bearer ${token}` }
  });
};

// --- ADMIN API ---

export const fetchAdminStats = async (token) => {
  return await request('/admin/stats', {
    headers: { Authorization: `Bearer ${token}` }
  });
};

export const fetchInvitations = async (token) => {
  return await request('/admin/invitations', {
    headers: { Authorization: `Bearer ${token}` }
  });
};

export const createInvitation = async (token, { role, expiresInDays }) => {
  return await request('/admin/invitations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ role, expiresInDays })
  });
};

export const revokeInvitation = async (token, invitationId) => {
  return await request(`/admin/invitations/${invitationId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
};

export const fetchAdminUsers = async (token) => {
  return await request('/admin/users', {
    headers: { Authorization: `Bearer ${token}` }
  });
};
