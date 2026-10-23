const getDefaultApiUrl = () => {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return 'https://autoquiz-pro.onrender.com/api/v1';
  }
  return 'https://autoquiz-pro.onrender.com/api/v1';
};

export const API_BASE_URL = getDefaultApiUrl();

/**
 * Get or create unique persistent browser device token
 */
export const getDeviceToken = () => {
  if (typeof window === 'undefined') return 'server_device';
  let token = localStorage.getItem('autoquiz_device_token');
  if (!token) {
    token = 'dev_' + (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2));
    localStorage.setItem('autoquiz_device_token', token);
  }
  return token;
};

const request = async (endpoint, options = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;
  const deviceToken = getDeviceToken();

  const headers = {
    'Content-Type': 'application/json',
    'x-device-token': deviceToken,
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

// --- UNIFIED AUTHENTICATION API ---

export const registerUser = async ({ name, email, password, inviteCode }) => {
  return await request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name,
      email,
      password,
      inviteCode,
      deviceToken: getDeviceToken(),
      browserInfo: typeof navigator !== 'undefined' ? navigator.userAgent : 'Web'
    })
  });
};

export const loginUser = async ({ email, password }) => {
  return await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      deviceToken: getDeviceToken(),
      browserInfo: typeof navigator !== 'undefined' ? navigator.userAgent : 'Web'
    })
  });
};

export const syncGoogleAuth = async (supabaseAccessToken, inviteCode = null) => {
  return await request('/auth/google-auth', {
    method: 'POST',
    body: JSON.stringify({
      supabaseAccessToken,
      inviteCode,
      deviceToken: getDeviceToken(),
      browserInfo: typeof navigator !== 'undefined' ? navigator.userAgent : 'Web'
    })
  });
};

export const verifyEmailDevice = async (token) => {
  return await request('/auth/verify-device', {
    method: 'POST',
    body: JSON.stringify({
      token,
      deviceToken: getDeviceToken()
    })
  });
};

export const validateInviteCode = async (code) => {
  return await request('/auth/validate-invite', {
    method: 'POST',
    body: JSON.stringify({ code })
  });
};

export const fetchCurrentUser = async (token) => {
  return await request('/auth/me', {
    headers: { Authorization: `Bearer ${token}` }
  });
};

// --- TEACHER API ---

export const fetchTeacherCourses = async (token) => {
  return await request('/teacher/courses', {
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

export const fetchAdminTeachers = async (token) => {
  return await request('/admin/teachers', {
    headers: { Authorization: `Bearer ${token}` }
  });
};

export const fetchAdminCourses = async (token) => {
  return await request('/admin/courses', {
    headers: { Authorization: `Bearer ${token}` }
  });
};

export const createAdminCourse = async (token, { courseName, courseCode, teacherId }) => {
  return await request('/admin/courses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ courseName, courseCode, teacherId })
  });
};

export const assignCourseTeacher = async (token, courseId, teacherId) => {
  return await request(`/admin/courses/${courseId}/assign`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ teacherId })
  });
};

export const uploadAdminCSV = async (token, file) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/admin/upload-csv`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: formData
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `CSV upload failed with status ${response.status}`);
  }

  return data;
};

export const fetchAdministrators = async (token) => {
  return await request('/admin/administrators', {
    headers: { Authorization: `Bearer ${token}` }
  });
};

export const createAdminUser = async (token, { name, email, password }) => {
  return await request('/admin/create-admin', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, email, password })
  });
};
