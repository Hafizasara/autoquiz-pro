const getDefaultApiUrl = () => {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return 'https://autoquiz-pro.onrender.com/api/v1';
  }
  return 'http://localhost:5001/api/v1';
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

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN API - Complete Admin Portal Functions
// ═══════════════════════════════════════════════════════════════════════════════

// --- Dashboard Stats ---

export const fetchAdminStats = async (token) => {
  return await request('/admin/stats', {
    headers: { Authorization: `Bearer ${token}` }
  });
};

// --- Teacher Management ---

export const fetchAdminTeachers = async (token, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return await request(`/admin/teachers${qs ? `?${qs}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
};

export const updateTeacherStatus = async (token, teacherId, isActive) => {
  return await request(`/admin/teachers/${teacherId}/status`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ is_active: isActive })
  });
};

export const updateTeacherDepartment = async (token, teacherId, departmentId) => {
  return await request(`/admin/teachers/${teacherId}/department`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ department_id: departmentId })
  });
};

export const updateTeacherApproval = async (token, teacherId, status) => {
  return await request(`/admin/teachers/${teacherId}/approval`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status })
  });
};

export const transferTeacherWorkload = async (token, { fromTeacherId, toTeacherId }) => {
  return await request('/admin/teachers/transfer', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fromTeacherId, toTeacherId })
  });
};

export const bulkInviteTeachers = async (token, { file, emails, expiresIn = '1d' }) => {
  if (file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('expiresIn', expiresIn);
    const deviceToken = getDeviceToken();

    const response = await fetch(`${API_BASE_URL}/admin/teachers/bulk-invite`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-device-token': deviceToken
      },
      body: formData
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Bulk invite failed');
    return data;
  }

  return await request('/admin/teachers/bulk-invite', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ emails, expiresIn })
  });
};

// --- Student Management ---

export const fetchAdminStudents = async (token, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return await request(`/admin/students${qs ? `?${qs}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
};

export const updateStudentStatus = async (token, studentId, isActive) => {
  return await request(`/admin/students/${studentId}/status`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ is_active: isActive })
  });
};

export const fixStudentEnrollment = async (token, studentId, data) => {
  return await request(`/admin/students/${studentId}/fix-enrollment`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data)
  });
};

export const fetchStudentDetail = async (token, studentId) => {
  return await request(`/admin/students/${studentId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
};

export const bulkLoadStudents = async (token, { course_id, file, emails }) => {
  if (file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('course_id', course_id);
    if (emails) formData.append('emails', emails);
    const deviceToken = getDeviceToken();

    const response = await fetch(`${API_BASE_URL}/admin/students/bulk-load`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-device-token': deviceToken
      },
      body: formData
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Bulk load failed');
    return data;
  }

  return await request('/admin/students/bulk-load', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ course_id, emails })
  });
};

export const mergeStudentAccounts = async (token, { primary_id, secondary_id }) => {
  return await request('/admin/students/merge', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ primary_id, secondary_id })
  });
};

// --- Departments ---

export const fetchDepartments = async (token) => {
  return await request('/admin/departments', {
    headers: { Authorization: `Bearer ${token}` }
  });
};

export const createDepartment = async (token, { name, code }) => {
  return await request('/admin/departments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, code })
  });
};

export const updateDepartment = async (token, id, data) => {
  return await request(`/admin/departments/${id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data)
  });
};

export const deleteDepartment = async (token, id) => {
  return await request(`/admin/departments/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
};

export const fetchDepartmentMembers = async (token, id) => {
  return await request(`/admin/departments/${id}/members`, {
    headers: { Authorization: `Bearer ${token}` }
  });
};

// --- Course Management ---

export const fetchAdminCourses = async (token, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return await request(`/admin/courses${qs ? `?${qs}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
};

export const createAdminCourse = async (token, data) => {
  return await request('/admin/courses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data)
  });
};

export const assignCourseTeacher = async (token, courseId, teacherId) => {
  return await request(`/admin/courses/${courseId}/assign`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ teacherId })
  });
};

export const updateCourseDepartment = async (token, courseId, departmentId) => {
  return await request(`/admin/courses/${courseId}/department`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ department_id: departmentId })
  });
};

export const updateCourseStatus = async (token, courseId, status) => {
  return await request(`/admin/courses/${courseId}/status`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status })
  });
};

export const deleteCourse = async (token, courseId) => {
  return await request(`/admin/courses/${courseId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
};

export const fetchCourseRoster = async (token, courseId) => {
  return await request(`/admin/courses/${courseId}/roster`, {
    headers: { Authorization: `Bearer ${token}` }
  });
};

// --- Invitations ---

export const fetchInvitations = async (token) => {
  return await request('/admin/invitations', {
    headers: { Authorization: `Bearer ${token}` }
  });
};

export const createInvitation = async (token, data) => {
  return await request('/admin/invitations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data)
  });
};

export const revokeInvitation = async (token, invitationId) => {
  return await request(`/admin/invitations/${invitationId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
};

export const resendInvitation = async (token, invitationId, data = {}) => {
  return await request(`/admin/invitations/${invitationId}/resend`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data)
  });
};

// --- Users ---

export const fetchAdminUsers = async (token, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return await request(`/admin/users${qs ? `?${qs}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
};

// --- Administrators ---

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

// --- Approved Domains ---

export const fetchApprovedDomains = async (token) => {
  return await request('/admin/approved-domains', {
    headers: { Authorization: `Bearer ${token}` }
  });
};

export const addApprovedDomain = async (token, { domain, role_scope }) => {
  return await request('/admin/approved-domains', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ domain, role_scope })
  });
};

export const removeApprovedDomain = async (token, domainId) => {
  return await request(`/admin/approved-domains/${domainId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
};

// --- Audit Log ---

export const fetchAuditLog = async (token, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return await request(`/admin/audit-log${qs ? `?${qs}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
};

// --- Sign-In Log ---

export const fetchSignInLog = async (token, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return await request(`/admin/sign-in-log${qs ? `?${qs}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
};

// --- AI Usage ---

export const fetchAIUsage = async (token) => {
  return await request('/admin/ai-usage', {
    headers: { Authorization: `Bearer ${token}` }
  });
};

export const fetchSystemHealth = async (token) => {
  return await request('/admin/system-health', {
    headers: { Authorization: `Bearer ${token}` }
  });
};

// --- User Lookup (Support) ---

export const lookupUser = async (token, email) => {
  return await request(`/admin/lookup-user?email=${encodeURIComponent(email)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
};

// --- Platform Reports ---

export const fetchPlatformReports = async (token) => {
  return await request('/admin/reports', {
    headers: { Authorization: `Bearer ${token}` }
  });
};

export const exportReport = async (token, type = 'users') => {
  const response = await fetch(`${API_BASE_URL}/admin/reports/export?type=${type}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new Error('Export failed');
  return await response.text();
};

// --- CSV Upload ---

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

// --- ASSESSMENTS API ---

export const createAssessment = async (token, assessmentData) => {
  return await request('/assessments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(assessmentData)
  });
};

export const fetchAssessments = async (token, params = {}) => {
  const query = new URLSearchParams(params).toString();
  const endpoint = query ? `/assessments?${query}` : '/assessments';
  return await request(endpoint, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
};

export const fetchAssessmentById = async (token, id) => {
  return await request(`/assessments/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
};

export const bootstrapSystem = async () => {
  return await request('/bootstrap', {
    method: 'POST'
  });
};
