<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../store/auth';
import {
  fetchTeacherCourses,
  fetchAdminTeachers,
  updateTeacherStatus,
  updateTeacherApproval,
  updateTeacherDepartment,
  transferTeacherWorkload,
  bulkInviteTeachers,
  fetchInvitations,
  createInvitation,
  revokeInvitation,
  resendInvitation,
  fetchDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  fetchDepartmentMembers,
  fetchAdminStudents,
  updateStudentStatus,
  fixStudentEnrollment,
  fetchStudentDetail,
  bulkLoadStudents,
  mergeStudentAccounts,
  fetchAdminCourses,
  createAdminCourse,
  assignCourseTeacher,
  updateCourseDepartment,
  updateCourseStatus,
  deleteCourse,
  fetchCourseRoster
} from '../api';

const router = useRouter();
const auth = useAuth();

// Teacher State
const teacherCourses = ref([]);
const teacherLoading = ref(true);

// Admin Messages & Notifications
const adminErrorMessage = ref('');
const adminSuccessMessage = ref('');
const copyToast = ref('');

// Admin Sub-Navigation
const activeTab = ref('TEACHERS'); // 'TEACHERS' | 'STUDENTS' | 'INVITE' | 'REGISTRY' | 'TRANSFER' | 'BULK'

// Sidebar state
const sidebarCollapsed = ref(false);
const activeSection = ref('departments'); // Default to departments so admin immediately sees departments and courses on login

// --- Teacher Directory State ---
const teachersList = ref([]);
const departmentsList = ref([]);
const isLoadingTeachers = ref(false);
const teacherSearch = ref('');
const teacherStatusFilter = ref('ALL'); // 'ALL' | 'ACTIVE' | 'INACTIVE' | 'PENDING'
const teacherDeptFilter = ref('ALL');

// Action Loading States
const updatingTeacherId = ref(null);

// --- Single Teacher Invite State ---
const inviteForm = ref({
  email: '',
  expiresIn: '1d' // Strictly: '1h', '5h', '1d'
});
const isGeneratingInvite = ref(false);
const latestGeneratedInvite = ref(null);

// --- Invitations Registry State ---
const invitationsList = ref([]);
const isLoadingInvitations = ref(false);
const inviteSearch = ref('');
const inviteFilter = ref('ALL'); // 'ALL' | 'PENDING' | 'USED' | 'EXPIRED'
const resendingInviteId = ref(null);
const revokingInviteId = ref(null);

// --- Transfer Workload State ---
const transferForm = ref({
  fromTeacherId: '',
  toTeacherId: ''
});
const isTransferring = ref(false);
const transferResult = ref(null);

// --- Bulk Invite State ---
const bulkFile = ref(null);
const bulkEmailsText = ref('');
const bulkExpiresIn = ref('1d'); // Strictly: '1h', '5h', '1d'
const isBulkInviting = ref(false);
const bulkUploadResult = ref(null);

// --- Active Students State ---
const studentsList = ref([]);
const isLoadingStudents = ref(false);
const studentSearch = ref('');
const studentStatusFilter = ref('ALL'); // 'ALL' | 'ACTIVE' | 'INACTIVE'
const updatingStudentId = ref(null);

// Student Detail Panel
const selectedStudent = ref(null);
const studentDetail = ref(null);
const isLoadingDetail = ref(false);
const showStudentPanel = ref(false);

// Enrollment Fix
const showEnrollmentFix = ref(false);
const enrollmentFixForm = ref({ correct_email: '', add_to_course_id: '' });
const isFixingEnrollment = ref(false);

// Bulk Load Students
const showBulkLoad = ref(false);
const bulkLoadForm = ref({ course_id: '', emails: '' });
const bulkLoadFile = ref(null);
const isBulkLoadingStudents = ref(false);
const bulkLoadResult = ref(null);

// Merge Duplicate Accounts
const showMergeModal = ref(false);
const mergeForm = ref({ primary_id: '', secondary_id: '' });
const isMerging = ref(false);

// Institution Courses (for dropdowns)
const coursesList = ref([]);

// ─── DEPARTMENTS & COURSES MANAGEMENT STATE ─────────────────────────────────
const isLoadingDepts = ref(false);
const showCreateDept = ref(false);
const deptForm = ref({ name: '', code: '' });
const isCreatingDept = ref(false);
const editingDeptId = ref(null);
const editDeptForm = ref({ name: '', code: '', status: 'active' });
const isUpdatingDept = ref(false);
const deptSearch = ref('');

// Courses management
const isLoadingCourses = ref(false);
const showCreateCourse = ref(false);
const courseForm = ref({ courseName: '', courseCode: '', teacherId: '', departmentId: '' });
const isCreatingCourse = ref(false);
const courseDeptFilter = ref('ALL');
const courseTeacherFilter = ref('ALL');
const courseStatusFilter = ref('ALL');
const courseSearch = ref('');
const assigningCourseId = ref(null);
const selectedCourseTeacher = ref({});
const selectedCourseDept = ref({});

// Roster Modals State
const showDeptModal = ref(false);
const selectedDeptMembers = ref(null);
const isLoadingDeptMembers = ref(false);
const deptModalTab = ref('teachers'); // 'teachers' | 'students' | 'courses'

const showCourseModal = ref(false);
const selectedCourseRoster = ref(null);
const isLoadingCourseRoster = ref(false);

// Enhanced Cross-Filtering
const teacherCourseFilter = ref('ALL');
const studentDeptFilter = ref('ALL');
const studentCourseFilter = ref('ALL');

// ============================================================================
// COMPUTED PROPERTIES
// ============================================================================

// Filtered Teachers
const filteredTeachers = computed(() => {
  return teachersList.value.filter((t) => {
    // Search by name or email
    if (teacherSearch.value) {
      const q = teacherSearch.value.toLowerCase();
      const matchName = t.name?.toLowerCase().includes(q);
      const matchEmail = t.email?.toLowerCase().includes(q);
      if (!matchName && !matchEmail) return false;
    }

    // Status Filter
    if (teacherStatusFilter.value === 'ACTIVE') {
      if (!t.is_active || t.approval_status === 'pending') return false;
    } else if (teacherStatusFilter.value === 'INACTIVE') {
      if (t.is_active) return false;
    } else if (teacherStatusFilter.value === 'PENDING') {
      if (t.approval_status !== 'pending') return false;
    }

    // Department Filter
    if (teacherDeptFilter.value !== 'ALL') {
      const matchDirect = String(t.department_id) === String(teacherDeptFilter.value);
      const matchCourseDept = t.courses?.some(c => String(c.department_id) === String(teacherDeptFilter.value));
      if (!matchDirect && !matchCourseDept) return false;
    }

    // Course Filter
    if (teacherCourseFilter.value !== 'ALL') {
      const matchCourse = t.courses?.some(c => String(c.course_id) === String(teacherCourseFilter.value));
      if (!matchCourse) return false;
    }

    return true;
  });
});

// Teacher Statistics
const teacherStats = computed(() => {
  const total = teachersList.value.length;
  const active = teachersList.value.filter(t => t.is_active && t.approval_status !== 'pending').length;
  const inactive = teachersList.value.filter(t => !t.is_active).length;
  const pending = teachersList.value.filter(t => t.approval_status === 'pending').length;
  return { total, active, inactive, pending };
});

// Filtered Invitations
const filteredInvitations = computed(() => {
  return invitationsList.value.filter((inv) => {
    // Search
    if (inviteSearch.value) {
      const q = inviteSearch.value.toLowerCase();
      const matchCode = inv.code?.toLowerCase().includes(q);
      const matchEmail = inv.target_email?.toLowerCase().includes(q);
      if (!matchCode && !matchEmail) return false;
    }

    // Status Filter
    const isUsed = Boolean(inv.used_at);
    const isExpired = !isUsed && new Date(inv.expires_at) < new Date();
    const isPending = !isUsed && !isExpired;

    if (inviteFilter.value === 'PENDING') return isPending;
    if (inviteFilter.value === 'USED') return isUsed;
    if (inviteFilter.value === 'EXPIRED') return isExpired;

    return true;
  });
});

// Invitations Statistics
const inviteStats = computed(() => {
  const now = new Date();
  const total = invitationsList.value.length;
  const pending = invitationsList.value.filter(i => !i.used_at && new Date(i.expires_at) >= now).length;
  const used = invitationsList.value.filter(i => Boolean(i.used_at)).length;
  const expired = invitationsList.value.filter(i => !i.used_at && new Date(i.expires_at) < now).length;
  return { total, pending, used, expired };
});

// Filtered Students
const filteredStudents = computed(() => {
  return studentsList.value.filter(s => {
    // Search by name or email
    if (studentSearch.value) {
      const q = studentSearch.value.toLowerCase();
      if (!s.name?.toLowerCase().includes(q) && !s.email?.toLowerCase().includes(q)) return false;
    }
    // Status filter
    if (studentStatusFilter.value === 'ACTIVE' && !s.is_active) return false;
    if (studentStatusFilter.value === 'INACTIVE' && s.is_active) return false;

    // Department Filter
    if (studentDeptFilter.value !== 'ALL') {
      const matchDirect = String(s.department_id) === String(studentDeptFilter.value);
      const matchCourseDept = s.courses?.some(c => String(c.department_id) === String(studentDeptFilter.value));
      if (!matchDirect && !matchCourseDept) return false;
    }

    // Course Filter
    if (studentCourseFilter.value !== 'ALL') {
      const matchCourse = s.courses?.some(c => String(c.course_id) === String(studentCourseFilter.value));
      if (!matchCourse) return false;
    }

    return true;
  });
});

// Student statistics
const studentStats = computed(() => {
  const total = studentsList.value.length;
  const active = studentsList.value.filter(s => s.is_active).length;
  const inactive = total - active;
  return { total, active, inactive };
});

// Source Teacher workload stats for Transfer Preview
const selectedFromTeacher = computed(() => {
  if (!transferForm.value.fromTeacherId) return null;
  return teachersList.value.find(t => String(t.user_id) === String(transferForm.value.fromTeacherId));
});

// Filtered Departments
const filteredDepartments = computed(() => {
  return departmentsList.value.filter(d => {
    if (deptSearch.value) {
      const q = deptSearch.value.toLowerCase();
      if (!d.name?.toLowerCase().includes(q) && !d.code?.toLowerCase().includes(q)) return false;
    }
    return true;
  });
});

// Department stats
const deptStats = computed(() => {
  const total = departmentsList.value.length;
  const active = departmentsList.value.filter(d => d.status === 'active').length;
  const archived = total - active;
  const totalCourses = departmentsList.value.reduce((sum, d) => sum + (d.course_count || 0), 0);
  const totalUsers = departmentsList.value.reduce((sum, d) => sum + (d.user_count || 0), 0);
  return { total, active, archived, totalCourses, totalUsers };
});

// Filtered Courses
const filteredCourses = computed(() => {
  return coursesList.value.filter(c => {
    if (courseSearch.value) {
      const q = courseSearch.value.toLowerCase();
      if (!c.course_name?.toLowerCase().includes(q) && !c.course_code?.toLowerCase().includes(q) && !c.teacher_name?.toLowerCase().includes(q)) return false;
    }
    if (courseDeptFilter.value !== 'ALL') {
      if (String(c.department_id) !== String(courseDeptFilter.value)) return false;
    }
    if (courseTeacherFilter.value !== 'ALL') {
      if (courseTeacherFilter.value === 'UNASSIGNED') {
        if (c.teacher_id) return false;
      } else if (String(c.teacher_id) !== String(courseTeacherFilter.value)) return false;
    }
    if (courseStatusFilter.value !== 'ALL') {
      if (c.status !== courseStatusFilter.value) return false;
    }
    return true;
  });
});

// Course stats
const courseStats = computed(() => {
  const total = coursesList.value.length;
  const active = coursesList.value.filter(c => c.status === 'active').length;
  const assigned = coursesList.value.filter(c => c.teacher_id).length;
  const unassigned = coursesList.value.filter(c => !c.teacher_id).length;
  const totalStudents = coursesList.value.reduce((sum, c) => sum + (c.student_count || 0), 0);
  return { total, active, assigned, unassigned, totalStudents };
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const showSuccess = (msg) => {
  adminSuccessMessage.value = msg;
  adminErrorMessage.value = '';
  setTimeout(() => {
    if (adminSuccessMessage.value === msg) adminSuccessMessage.value = '';
  }, 6000);
};

const showError = (msg) => {
  adminErrorMessage.value = msg;
  adminSuccessMessage.value = '';
};

const copyToClipboard = (text, label = 'Code') => {
  navigator.clipboard.writeText(text);
  copyToast.value = `${label} copied to clipboard!`;
  setTimeout(() => {
    copyToast.value = '';
  }, 3000);
};

const formatDate = (dateStr) => {
  if (!dateStr) return 'Never';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Never';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatTimeRemaining = (expiresAt) => {
  if (!expiresAt) return '';
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return 'Expired';
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h left`;
  }
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
};

// ============================================================================
// DATA LOADERS
// ============================================================================

const loadTeachers = async () => {
  isLoadingTeachers.value = true;
  try {
    const res = await fetchAdminTeachers(auth.token.value);
    teachersList.value = res.data?.teachers || [];
  } catch (err) {
    showError(err.message || 'Failed to load teachers.');
  } finally {
    isLoadingTeachers.value = false;
  }
};

const loadInvitations = async () => {
  isLoadingInvitations.value = true;
  try {
    const res = await fetchInvitations(auth.token.value);
    invitationsList.value = res.data?.invitations || [];
  } catch (err) {
    showError(err.message || 'Failed to load invitations.');
  } finally {
    isLoadingInvitations.value = false;
  }
};

const loadDepartmentsList = async () => {
  try {
    const res = await fetchDepartments(auth.token.value);
    departmentsList.value = res.data?.departments || [];
  } catch (err) {
    console.error('Could not load departments:', err);
  }
};

const loadStudents = async () => {
  isLoadingStudents.value = true;
  try {
    const res = await fetchAdminStudents(auth.token.value);
    studentsList.value = res.data?.students || [];
  } catch (err) {
    showError(err.message || 'Failed to load students.');
  } finally {
    isLoadingStudents.value = false;
  }
};

const loadCoursesList = async () => {
  isLoadingCourses.value = true;
  try {
    const res = await fetchAdminCourses(auth.token.value);
    coursesList.value = res.data?.courses || [];
  } catch (err) {
    console.error('Could not load courses:', err);
  } finally {
    isLoadingCourses.value = false;
  }
};

const loadAdminDashboard = async () => {
  await Promise.all([
    loadTeachers(),
    loadInvitations(),
    loadDepartmentsList(),
    loadStudents(),
    loadCoursesList()
  ]);
};

// ============================================================================
// CORE ACTION HANDLERS
// ============================================================================

// 1. Generate single-use invitation code with 1h/5h/1d expiry & send to email
const handleCreateTeacherInvite = async () => {
  if (!inviteForm.value.email || !inviteForm.value.email.includes('@')) {
    showError('Please enter a valid teacher email address.');
    return;
  }

  isGeneratingInvite.value = true;
  latestGeneratedInvite.value = null;

  try {
    const res = await createInvitation(auth.token.value, {
      role: 'TEACHER',
      targetEmail: inviteForm.value.email.trim(),
      expiresIn: inviteForm.value.expiresIn // '1h' | '5h' | '1d'
    });

    latestGeneratedInvite.value = {
      code: res.data?.invitation?.code,
      email: inviteForm.value.email.trim(),
      expiryLabel: res.data?.expiryLabel || inviteForm.value.expiresIn,
      expiresAt: res.data?.invitation?.expires_at,
      emailSent: res.data?.emailSent
    };

    showSuccess(res.message || 'Teacher invitation generated and email dispatched!');
    inviteForm.value.email = '';
    await loadInvitations();
  } catch (err) {
    showError(err.message || 'Failed to create teacher invitation.');
  } finally {
    isGeneratingInvite.value = false;
  }
};

// 2. Activate or Deactivate Teacher (Deactivation blocks sign-in immediately, keeps data)
const handleToggleTeacherStatus = async (teacher) => {
  const newActiveState = !teacher.is_active;
  const actionText = newActiveState ? 'activate' : 'deactivate';

  if (!newActiveState) {
    const confirmed = confirm(
      `Deactivating ${teacher.name} will immediately block them from signing in. All of their courses (${teacher.course_count || 0}) and assessments (${teacher.assessment_count || 0}) will be safely kept. Continue?`
    );
    if (!confirmed) return;
  }

  updatingTeacherId.value = teacher.user_id;

  try {
    const res = await updateTeacherStatus(auth.token.value, teacher.user_id, newActiveState);
    showSuccess(res.message);
    await loadTeachers();
  } catch (err) {
    showError(err.message || `Failed to ${actionText} teacher.`);
  } finally {
    updatingTeacherId.value = null;
  }
};

// 3. Approve or Reject Domain Teacher Registration
const handleTeacherApproval = async (teacher, status) => {
  const actionText = status === 'approved' ? 'approve' : 'reject';
  const confirmed = confirm(`Are you sure you want to ${actionText} teacher ${teacher.name} (${teacher.email})?`);
  if (!confirmed) return;

  updatingTeacherId.value = teacher.user_id;

  try {
    const res = await updateTeacherApproval(auth.token.value, teacher.user_id, status);
    showSuccess(res.message);
    await loadTeachers();
  } catch (err) {
    showError(err.message || `Failed to ${actionText} teacher.`);
  } finally {
    updatingTeacherId.value = null;
  }
};

// 4. Revoke Unused Invitation Code
const handleRevokeInvitation = async (invitation) => {
  const confirmed = confirm(`Revoke invitation code "${invitation.code}" bound to "${invitation.target_email || 'General'}"? This code will be permanently invalidated.`);
  if (!confirmed) return;

  revokingInviteId.value = invitation.invitation_id;

  try {
    const res = await revokeInvitation(auth.token.value, invitation.invitation_id);
    showSuccess(res.message || 'Invitation code revoked successfully.');
    await loadInvitations();
  } catch (err) {
    showError(err.message || 'Failed to revoke invitation.');
  } finally {
    revokingInviteId.value = null;
  }
};

// 5. Resend Invitation Code (Refresh 1h/5h/1d expiry & re-dispatch email)
const handleResendInvitation = async (invitation, selectedExpiry = '1d') => {
  resendingInviteId.value = invitation.invitation_id;

  try {
    const res = await resendInvitation(auth.token.value, invitation.invitation_id, {
      expiresIn: selectedExpiry
    });
    showSuccess(res.message || `Invitation code resent to ${invitation.target_email}!`);
    await loadInvitations();
  } catch (err) {
    showError(err.message || 'Failed to resend invitation.');
  } finally {
    resendingInviteId.value = null;
  }
};

// ============================================================================
// LATER REQUIREMENTS HANDLERS
// ============================================================================

// 6. Transfer a Leaving Teacher's Courses and Assessments to Another Teacher
const handleTransferWorkload = async () => {
  if (!transferForm.value.fromTeacherId || !transferForm.value.toTeacherId) {
    showError('Please select both the leaving teacher and the receiving teacher.');
    return;
  }

  if (transferForm.value.fromTeacherId === transferForm.value.toTeacherId) {
    showError('Source teacher and destination teacher cannot be the same educator.');
    return;
  }

  const fromTeacher = teachersList.value.find(t => String(t.user_id) === String(transferForm.value.fromTeacherId));
  const toTeacher = teachersList.value.find(t => String(t.user_id) === String(transferForm.value.toTeacherId));

  const confirmed = confirm(
    `Transfer all courses (${fromTeacher?.course_count || 0}) and assessments (${fromTeacher?.assessment_count || 0}) from ${fromTeacher?.name} to ${toTeacher?.name}?`
  );
  if (!confirmed) return;

  isTransferring.value = true;
  transferResult.value = null;

  try {
    const res = await transferTeacherWorkload(auth.token.value, {
      fromTeacherId: parseInt(transferForm.value.fromTeacherId, 10),
      toTeacherId: parseInt(transferForm.value.toTeacherId, 10)
    });

    transferResult.value = res.data;
    showSuccess(res.message || 'Workload transferred successfully!');
    transferForm.value = { fromTeacherId: '', toTeacherId: '' };
    await loadTeachers();
  } catch (err) {
    showError(err.message || 'Failed to transfer teacher workload.');
  } finally {
    isTransferring.value = false;
  }
};

// 7. Bulk-Invite Teachers from CSV File of Emails
const onBulkFileSelected = (e) => {
  const file = e.target.files[0];
  if (file) {
    bulkFile.value = file;
  }
};

const handleBulkInvite = async () => {
  if (!bulkFile.value && !bulkEmailsText.value.trim()) {
    showError('Please upload a CSV file or paste email addresses.');
    return;
  }

  isBulkInviting.value = true;
  bulkUploadResult.value = null;

  try {
    const res = await bulkInviteTeachers(auth.token.value, {
      file: bulkFile.value,
      emails: bulkEmailsText.value.trim(),
      expiresIn: bulkExpiresIn.value // '1h' | '5h' | '1d'
    });

    bulkUploadResult.value = res.data;
    showSuccess(res.message || 'Bulk teacher invitations created and dispatched successfully!');
    bulkFile.value = null;
    bulkEmailsText.value = '';
    await loadInvitations();
  } catch (err) {
    showError(err.message || 'Bulk teacher invitation failed.');
  } finally {
    isBulkInviting.value = false;
  }
};

// Shortcut to open transfer form for a specific leaving teacher
const initiateTransferFor = (teacherId) => {
  transferForm.value.fromTeacherId = String(teacherId);
  transferForm.value.toTeacherId = '';
  activeTab.value = 'TRANSFER';
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ============================================================================
// DEPARTMENT MANAGEMENT HANDLERS
// ============================================================================

const handleCreateDepartment = async () => {
  if (!deptForm.value.name || !deptForm.value.code) {
    showError('Department name and code are required.');
    return;
  }
  isCreatingDept.value = true;
  try {
    const res = await createDepartment(auth.token.value, {
      name: deptForm.value.name.trim(),
      code: deptForm.value.code.trim()
    });
    showSuccess(res.message || 'Department created successfully!');
    deptForm.value = { name: '', code: '' };
    showCreateDept.value = false;
    await loadDepartmentsList();
  } catch (err) {
    showError(err.message || 'Failed to create department.');
  } finally {
    isCreatingDept.value = false;
  }
};

const startEditDept = (dept) => {
  editingDeptId.value = dept.department_id;
  editDeptForm.value = { name: dept.name, code: dept.code, status: dept.status };
};

const cancelEditDept = () => {
  editingDeptId.value = null;
  editDeptForm.value = { name: '', code: '', status: 'active' };
};

const handleUpdateDepartment = async (deptId) => {
  isUpdatingDept.value = true;
  try {
    const res = await updateDepartment(auth.token.value, deptId, editDeptForm.value);
    showSuccess(res.message || 'Department updated.');
    editingDeptId.value = null;
    await loadDepartmentsList();
  } catch (err) {
    showError(err.message || 'Failed to update department.');
  } finally {
    isUpdatingDept.value = false;
  }
};

const handleArchiveDepartment = async (dept) => {
  const confirmed = confirm(`Archive department "${dept.name}"? This will not delete any teachers or courses, but the department will be marked as archived.`);
  if (!confirmed) return;
  try {
    const res = await deleteDepartment(auth.token.value, dept.department_id);
    showSuccess(res.message || 'Department archived.');
    await loadDepartmentsList();
  } catch (err) {
    showError(err.message || 'Failed to archive department.');
  }
};

// ============================================================================
// COURSE MANAGEMENT HANDLERS
// ============================================================================

const handleCreateCourse = async () => {
  if (!courseForm.value.courseName) {
    showError('Course name is required.');
    return;
  }
  isCreatingCourse.value = true;
  try {
    const res = await createAdminCourse(auth.token.value, {
      courseName: courseForm.value.courseName.trim(),
      courseCode: courseForm.value.courseCode.trim() || undefined,
      teacherId: courseForm.value.teacherId || undefined,
      departmentId: courseForm.value.departmentId || undefined
    });
    showSuccess(res.message || 'Course created successfully!');
    courseForm.value = { courseName: '', courseCode: '', teacherId: '', departmentId: '' };
    showCreateCourse.value = false;
    await loadCoursesList();
  } catch (err) {
    showError(err.message || 'Failed to create course.');
  } finally {
    isCreatingCourse.value = false;
  }
};

const handleAssignTeacherToCourse = async (courseId) => {
  const teacherId = selectedCourseTeacher.value[courseId];
  assigningCourseId.value = courseId;
  try {
    const res = await assignCourseTeacher(auth.token.value, courseId, teacherId || null);
    showSuccess(res.message || 'Teacher assignment updated.');
    await loadCoursesList();
  } catch (err) {
    showError(err.message || 'Failed to assign teacher.');
  } finally {
    assigningCourseId.value = null;
  }
};

const handleAssignDeptToCourse = async (courseId) => {
  const deptId = selectedCourseDept.value[courseId];
  try {
    const res = await updateCourseDepartment(auth.token.value, courseId, deptId || null);
    showSuccess(res.message || 'Course department updated.');
    await loadCoursesList();
  } catch (err) {
    showError(err.message || 'Failed to update course department.');
  }
};

const handleCourseStatus = async (courseId, status) => {
  try {
    const res = await updateCourseStatus(auth.token.value, courseId, status);
    showSuccess(res.message || `Course ${status}.`);
    await loadCoursesList();
  } catch (err) {
    showError(err.message || 'Failed to update course status.');
  }
};

const handleDeleteCourse = async (course) => {
  const confirmed = confirm(`Delete course "${course.course_name}" (${course.course_code || 'No code'})? This will remove associated student enrollments.`);
  if (!confirmed) return;
  try {
    const res = await deleteCourse(auth.token.value, course.course_id);
    showSuccess(res.message || 'Course deleted.');
    await loadCoursesList();
  } catch (err) {
    showError(err.message || 'Failed to delete course.');
  }
};

const handleAssignTeacherDept = async (teacher, deptId) => {
  try {
    const res = await updateTeacherDepartment(auth.token.value, teacher.user_id, deptId || null);
    showSuccess(res.message || 'Teacher department updated.');
    await loadTeachers();
  } catch (err) {
    showError(err.message || 'Failed to update teacher department.');
  }
};

// Navigate to courses filtered by department
const viewDeptCourses = (deptId) => {
  activeSection.value = 'courses';
  courseDeptFilter.value = String(deptId);
};

// Navigate to teachers filtered by department
const viewDeptTeachers = (deptId) => {
  activeSection.value = 'teachers';
  activeTab.value = 'TEACHERS';
  teacherDeptFilter.value = String(deptId);
};

// Navigate to students filtered by department
const viewDeptStudents = (deptId) => {
  activeSection.value = 'students';
  activeTab.value = 'STUDENTS';
  studentDeptFilter.value = String(deptId);
};

// Navigate to students filtered by course
const viewCourseStudents = (courseId) => {
  activeSection.value = 'students';
  activeTab.value = 'STUDENTS';
  studentCourseFilter.value = String(courseId);
};

// Quick link to filter teachers by course
const viewCourseTeacher = (teacherId) => {
  activeSection.value = 'teachers';
  activeTab.value = 'TEACHERS';
  teacherSearch.value = '';
  teacherStatusFilter.value = 'ALL';
  teacherDeptFilter.value = 'ALL';
};

// Open Create Course with department pre-selected
const openCreateCourseInDept = (deptId) => {
  courseForm.value = {
    courseName: '',
    courseCode: '',
    teacherId: '',
    departmentId: String(deptId)
  };
  showCreateCourse.value = true;
  activeSection.value = 'courses';
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// Open Department Roster Modal (Faculty + Students + Courses)
const openDeptMembersModal = async (dept) => {
  showDeptModal.value = true;
  isLoadingDeptMembers.value = true;
  selectedDeptMembers.value = null;
  deptModalTab.value = 'teachers';
  try {
    const res = await fetchDepartmentMembers(auth.token.value, dept.department_id);
    selectedDeptMembers.value = res.data;
  } catch (err) {
    showError(err.message || 'Failed to load department members.');
  } finally {
    isLoadingDeptMembers.value = false;
  }
};

const closeDeptMembersModal = () => {
  showDeptModal.value = false;
  selectedDeptMembers.value = null;
};

// Open Course Roster Modal (Assigned Teacher + Enrolled Students)
const openCourseRosterModal = async (course) => {
  showCourseModal.value = true;
  isLoadingCourseRoster.value = true;
  selectedCourseRoster.value = null;
  try {
    const res = await fetchCourseRoster(auth.token.value, course.course_id);
    selectedCourseRoster.value = res.data;
  } catch (err) {
    showError(err.message || 'Failed to load course roster.');
  } finally {
    isLoadingCourseRoster.value = false;
  }
};

const closeCourseRosterModal = () => {
  showCourseModal.value = false;
  selectedCourseRoster.value = null;
};

// Sign Out
const handleLogout = async () => {
  await auth.logout();
  router.push('/login');
};

// Load Teacher Assigned Courses (for Educator role)
const loadTeacherData = async () => {
  teacherLoading.value = true;
  try {
    const res = await fetchTeacherCourses(auth.token.value);
    teacherCourses.value = res.data?.courses || [];
  } catch (err) {
    console.error('Error fetching teacher courses:', err);
  } finally {
    teacherLoading.value = false;
  }
};

onMounted(async () => {
  if (auth.isTeacher.value) {
    await loadTeacherData();
  } else if (auth.isAdmin.value) {
    await loadAdminDashboard();
  }
});
</script>

<template>
  <div class="dashboard-root">
    <!-- Toast Notification for Copy -->
    <div v-if="copyToast" class="toast-popup">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 6L9 17l-5-5"/>
      </svg>
      {{ copyToast }}
    </div>

    <!-- ========== SIDEBAR ========== -->
    <aside :class="['sidebar', sidebarCollapsed && 'sidebar-collapsed']">
      <!-- Sidebar Header / Brand -->
      <div class="sidebar-header">
        <div class="sidebar-logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div v-if="!sidebarCollapsed" class="sidebar-brand-text">
          <span class="sidebar-brand-name">AutoQuiz Pro</span>
          <span class="sidebar-brand-sub">{{ auth.user.value?.universityName || 'Academic Hub' }}</span>
        </div>
        <button class="sidebar-collapse-btn" @click="sidebarCollapsed = !sidebarCollapsed" title="Toggle sidebar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path v-if="!sidebarCollapsed" d="M15 18l-6-6 6-6"/>
            <path v-else d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      </div>

      <!-- User Profile Card in sidebar -->
      <div v-if="!sidebarCollapsed" class="sidebar-user-card">
        <div class="sidebar-user-avatar">
          <span>{{ auth.user.value?.name?.charAt(0)?.toUpperCase() || '?' }}</span>
        </div>
        <div class="sidebar-user-info">
          <span class="sidebar-user-name">{{ auth.user.value?.name }}</span>
          <span class="sidebar-user-email">{{ auth.user.value?.email }}</span>
        </div>
      </div>
      <div v-else class="sidebar-user-avatar-only">
        <div class="sidebar-user-avatar">
          <span>{{ auth.user.value?.name?.charAt(0)?.toUpperCase() || '?' }}</span>
        </div>
      </div>

      <!-- Role Badge -->
      <div v-if="!sidebarCollapsed" class="sidebar-role-badge-wrap">
        <span :class="['sidebar-role-badge', auth.isAdmin.value ? 'role-admin' : (auth.isTeacher.value ? 'role-teacher' : 'role-student')]">
          <span class="badge-dot"></span>
          {{ auth.role.value }}
        </span>
      </div>

      <!-- Navigation -->
      <nav class="sidebar-nav">
        <div class="sidebar-nav-section-label" v-if="!sidebarCollapsed">Navigation</div>

        <!-- STUDENT nav -->
        <template v-if="auth.isStudent.value">
          <button :class="['sidebar-nav-item', activeSection === 'dashboard' && 'active']" @click="activeSection = 'dashboard'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="nav-icon">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
            <span v-if="!sidebarCollapsed">My Dashboard</span>
          </button>
          <button :class="['sidebar-nav-item', activeSection === 'assessments' && 'active']" @click="activeSection = 'assessments'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="nav-icon">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span v-if="!sidebarCollapsed">My Assessments</span>
          </button>
        </template>

        <!-- TEACHER nav -->
        <template v-if="auth.isTeacher.value">
          <button :class="['sidebar-nav-item', activeSection === 'dashboard' && 'active']" @click="activeSection = 'dashboard'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="nav-icon">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
            <span v-if="!sidebarCollapsed">Overview</span>
          </button>
          <button :class="['sidebar-nav-item', activeSection === 'courses' && 'active']" @click="activeSection = 'courses'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="nav-icon">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
            </svg>
            <span v-if="!sidebarCollapsed">My Courses</span>
          </button>
          <router-link to="/assessments/create" class="sidebar-nav-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="nav-icon">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
            <span v-if="!sidebarCollapsed">Create Assessment</span>
          </router-link>
        </template>

        <!-- ADMIN nav -->
        <template v-if="auth.isAdmin.value">
          <button :class="['sidebar-nav-item', activeSection === 'dashboard' && 'active']" @click="activeSection = 'dashboard'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="nav-icon">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
            <span v-if="!sidebarCollapsed">Overview</span>
          </button>

          <div class="sidebar-nav-section-label" v-if="!sidebarCollapsed">Management</div>

          <button :class="['sidebar-nav-item', activeSection === 'departments' && 'active']" @click="activeSection = 'departments'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="nav-icon">
              <path d="M3 21h18M3 7v14M21 7v14M6 21V11M10 21V11M14 21V11M18 21V11M12 3l9 4H3l9-4z"/>
            </svg>
            <span v-if="!sidebarCollapsed">Departments</span>
            <span v-if="!sidebarCollapsed && deptStats.total > 0" class="sidebar-badge-count">{{ deptStats.total }}</span>
          </button>

          <button :class="['sidebar-nav-item', activeSection === 'courses' && 'active']" @click="activeSection = 'courses'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="nav-icon">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
              <path d="M6 6h10M6 10h10"/>
            </svg>
            <span v-if="!sidebarCollapsed">Courses</span>
            <span v-if="!sidebarCollapsed && courseStats.total > 0" class="sidebar-badge-count sidebar-badge-blue">{{ courseStats.total }}</span>
          </button>

          <button :class="['sidebar-nav-item', activeSection === 'teachers' && 'active']" @click="activeSection = 'teachers'; activeTab = 'TEACHERS'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="nav-icon">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span v-if="!sidebarCollapsed">Teachers</span>
            <span v-if="!sidebarCollapsed && teacherStats.pending > 0" class="sidebar-badge-count">{{ teacherStats.pending }}</span>
          </button>

          <button :class="['sidebar-nav-item', activeSection === 'students' && 'active']" @click="activeSection = 'students'; activeTab = 'STUDENTS'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="nav-icon">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            <span v-if="!sidebarCollapsed">Active Students</span>
            <span v-if="!sidebarCollapsed && studentStats.total > 0" class="sidebar-badge-count sidebar-badge-blue">{{ studentStats.total }}</span>
          </button>

          <button :class="['sidebar-nav-item', activeSection === 'invitations' && 'active']" @click="activeSection = 'invitations'; activeTab = 'REGISTRY'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="nav-icon">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span v-if="!sidebarCollapsed">Invitations</span>
          </button>

          <button :class="['sidebar-nav-item', activeSection === 'bulk' && 'active']" @click="activeSection = 'bulk'; activeTab = 'BULK'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="nav-icon">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span v-if="!sidebarCollapsed">Bulk Invite</span>
          </button>

          <button :class="['sidebar-nav-item', activeSection === 'transfer' && 'active']" @click="activeSection = 'transfer'; activeTab = 'TRANSFER'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="nav-icon">
              <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
              <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
            </svg>
            <span v-if="!sidebarCollapsed">Transfer Workload</span>
          </button>
        </template>
      </nav>

      <!-- Sidebar Footer / Sign Out -->
      <div class="sidebar-footer">
        <button class="sidebar-signout-btn" @click="handleLogout" :title="sidebarCollapsed ? 'Sign Out' : ''">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="nav-icon">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          <span v-if="!sidebarCollapsed">Sign Out</span>
        </button>
      </div>
    </aside>

    <!-- ========== MAIN AREA ========== -->
    <div class="dashboard-main">
      <!-- Top bar inside main area -->
      <header class="topbar glass-card">
        <div class="topbar-left">
          <h1 class="topbar-title">
            <span v-if="auth.isAdmin.value && activeSection === 'departments'">Departments Directory</span>
            <span v-else-if="auth.isAdmin.value && activeSection === 'courses'">Courses Management &amp; Allocation</span>
            <span v-else-if="auth.isAdmin.value && activeSection === 'students'">Active Students</span>
            <span v-else-if="auth.isAdmin.value && activeSection === 'teachers'">Teachers Directory</span>
            <span v-else-if="auth.isAdmin.value && activeSection === 'invitations'">Invitations Registry</span>
            <span v-else-if="auth.isAdmin.value && activeSection === 'bulk'">Bulk Invite</span>
            <span v-else-if="auth.isAdmin.value && activeSection === 'transfer'">Transfer Workload</span>
            <span v-else-if="auth.isTeacher.value && activeSection === 'courses'">My Courses</span>
            <span v-else-if="auth.isAdmin.value && activeSection === 'dashboard'">Institutional Overview</span>
            <span v-else>Dashboard</span>
          </h1>
          <p class="topbar-sub">{{ auth.user.value?.universityName || 'Institutional Academic Hub' }}</p>
        </div>
        <div class="topbar-right">
          <span class="topbar-user-name">{{ auth.user.value?.name }}</span>
          <span :class="['topbar-role-badge', auth.isAdmin.value ? 'role-admin' : (auth.isTeacher.value ? 'role-teacher' : 'role-student')]">
            <span class="badge-dot"></span>
            {{ auth.role.value }}
          </span>
        </div>
      </header>

      <!-- Main Dashboard Content -->
      <main class="dashboard-content">
      <!-- ============================================== -->
      <!-- VIEW 1: STUDENT DASHBOARD                     -->
      <!-- ============================================== -->
      <section v-if="auth.isStudent.value" class="role-view">
        <div class="glass-card banner-card">
          <div class="badge badge-success">
            <span class="badge-dot"></span> {{ auth.user.value?.universityName || 'University Student' }}
          </div>
          <h2 class="banner-title">Welcome, {{ auth.user.value?.name }}!</h2>
          <p class="banner-text">
            Authenticated via your official institutional account (<code>{{ auth.user.value?.email }}</code>).
            Your AI-graded quizzes and examination schedules will appear here.
          </p>
        </div>

        <div class="grid-cards">
          <div class="glass-card stat-card">
            <div class="stat-number">0</div>
            <div class="stat-label">Active Assessments</div>
            <p class="stat-hint">Exams currently open for completion</p>
          </div>

          <div class="glass-card stat-card">
            <div class="stat-number">0</div>
            <div class="stat-label">Completed Assessments</div>
            <p class="stat-hint">Graded submissions with feedback</p>
          </div>

          <div class="glass-card stat-card">
            <div class="stat-number">100%</div>
            <div class="stat-label">Institutional Status</div>
            <p class="stat-hint">Active Student Credential</p>
          </div>
        </div>
      </section>

      <!-- ============================================== -->
      <!-- VIEW 2: TEACHER DASHBOARD                     -->
      <!-- ============================================== -->
      <section v-if="auth.isTeacher.value" class="role-view">
        <div class="glass-card banner-card">
          <div class="badge badge-info">
            <span class="badge-dot"></span> {{ auth.user.value?.universityName || 'Academic Faculty' }}
          </div>
          <h2 class="banner-title">Educator Studio &bull; {{ auth.user.value?.name }}</h2>
          <p class="banner-text">
            Registered with your university invitation code. Course access and exam generation are configured below.
          </p>
        </div>

        <!-- Blank State -->
        <div v-if="!teacherLoading && teacherCourses.length === 0" class="glass-card empty-dashboard-card">
          <div class="empty-icon-circle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
              <path d="M6 6h10M6 10h10"/>
              <circle cx="12" cy="16" r="1.5"/>
            </svg>
          </div>
          <span class="badge badge-warning"><span class="badge-dot"></span> Pending Course Assignment</span>
          <h3 class="empty-title">No Courses Assigned Yet</h3>
          <p class="empty-desc">
            You have successfully registered with <strong>{{ auth.user.value?.universityName || 'your university' }}</strong>, but your Administrator has not assigned courses to your profile yet.
          </p>
          <button class="btn btn-secondary" @click="loadTeacherData">Refresh Course Allocations</button>
        </div>

        <!-- Active Courses State -->
        <div v-else-if="!teacherLoading && teacherCourses.length > 0" class="assigned-courses-section">
          <div class="section-top-row">
            <div>
              <h3 class="section-title">Your Assigned Courses ({{ teacherCourses.length }})</h3>
              <p class="section-desc">Courses assigned to you by your administrator.</p>
            </div>
            <button class="btn btn-secondary btn-sm" @click="loadTeacherData">Refresh</button>
          </div>

          <div class="grid-cards">
            <div v-for="c in teacherCourses" :key="c.course_id" class="glass-card course-card">
              <div class="course-header">
                <span class="course-badge">{{ c.course_code || 'CRS' }}</span>
                <span class="student-count">{{ c.student_count }} Students</span>
              </div>
              <h4 class="course-name">{{ c.course_name }}</h4>
              <p class="course-meta">Assigned curriculum module</p>
              <div class="course-actions">
                <router-link to="/assessments/create" class="btn btn-primary btn-block btn-sm">+ Create / Generate Assessment</router-link>
                <router-link to="/assessments" class="btn btn-secondary btn-block btn-sm">View Assessment Registry</router-link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ============================================== -->
      <!-- VIEW 3: UNIVERSITY ADMIN - TEACHER MANAGEMENT  -->
      <!-- ============================================== -->
      <section v-if="auth.isAdmin.value" class="role-view">
        <!-- Banner (Shown on Dashboard Overview) -->
        <div v-if="activeSection === 'dashboard'" class="glass-card banner-card">
          <div class="badge badge-info">
            <span class="badge-dot"></span> University Academic &amp; Faculty Administration
          </div>
          <h2 class="banner-title">{{ auth.user.value?.universityName || 'Institution Administration' }} &bull; Admin Console</h2>
          <p class="banner-text">
            Configure academic departments, assign courses to faculty educators, oversee enrolled student rosters, manage educator invitations, and monitor university-wide testing.
          </p>
        </div>

        <!-- Alerts -->
        <div v-if="adminSuccessMessage" class="alert alert-success">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="alert-icon">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <path d="M22 4L12 14.01l-3-3"/>
          </svg>
          <span>{{ adminSuccessMessage }}</span>
        </div>
        <div v-if="adminErrorMessage" class="alert alert-error">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="alert-icon">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>{{ adminErrorMessage }}</span>
        </div>

        <!-- Quick Summary Stats Bar -->
        <div class="grid-cards" v-if="activeSection === 'dashboard'">
          <div class="glass-card stat-card" @click="activeSection = 'teachers'; activeTab = 'TEACHERS'; teacherStatusFilter = 'ALL'">
            <div class="stat-number">{{ teacherStats.total }}</div>
            <div class="stat-label">Total Educators</div>
            <p class="stat-hint">{{ teacherStats.active }} active &bull; {{ teacherStats.inactive }} deactivated</p>
          </div>

          <div class="glass-card stat-card" @click="activeSection = 'teachers'; activeTab = 'TEACHERS'; teacherStatusFilter = 'PENDING'">
            <div class="stat-number" :class="{ 'text-amber': teacherStats.pending > 0 }">{{ teacherStats.pending }}</div>
            <div class="stat-label">Domain Approvals Pending</div>
            <p class="stat-hint">Manual approvals required</p>
          </div>

          <div class="glass-card stat-card" @click="activeSection = 'invitations'; activeTab = 'REGISTRY'; inviteFilter = 'PENDING'">
            <div class="stat-number">{{ inviteStats.pending }}</div>
            <div class="stat-label">Pending Invitations</div>
            <p class="stat-hint">Awaiting teacher redemption</p>
          </div>

          <div class="glass-card stat-card" @click="activeSection = 'invitations'; activeTab = 'REGISTRY'; inviteFilter = 'EXPIRED'">
            <div class="stat-number text-dim">{{ inviteStats.expired }}</div>
            <div class="stat-label">Expired Invitations</div>
            <p class="stat-hint">{{ inviteStats.used }} redeemed successfully</p>
          </div>

          <div class="glass-card stat-card" @click="activeSection = 'departments'">
            <div class="stat-number text-primary">{{ deptStats.total }}</div>
            <div class="stat-label">Departments</div>
            <p class="stat-hint">{{ deptStats.totalCourses }} courses &bull; {{ deptStats.totalUsers }} faculty</p>
          </div>

          <div class="glass-card stat-card" @click="activeSection = 'courses'">
            <div class="stat-number text-success">{{ courseStats.total }}</div>
            <div class="stat-label">Courses &amp; Curricula</div>
            <p class="stat-hint">{{ courseStats.assigned }} assigned &bull; {{ courseStats.unassigned }} unassigned</p>
          </div>

          <div class="glass-card stat-card" @click="activeSection = 'students'; activeTab = 'STUDENTS'">
            <div class="stat-number text-blue">{{ studentStats.total }}</div>
            <div class="stat-label">Active Students</div>
            <p class="stat-hint">{{ studentStats.active }} active &bull; {{ studentStats.inactive }} inactive</p>
          </div>
        </div>

        <!-- Primary Admin Horizontal Navigation Tabs (Always Visible Across All Views) -->
        <div class="admin-tabs">
          <button
            :class="['admin-tab-btn', activeSection === 'departments' && 'active']"
            @click="activeSection = 'departments'"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tab-icon">
              <path d="M3 21h18M3 7v14M21 7v14M6 21V11M10 21V11M14 21V11M18 21V11M12 3l9 4H3l9-4z"/>
            </svg>
            <span>Departments</span>
            <span class="badge-mini-count">{{ deptStats.total }}</span>
          </button>

          <button
            :class="['admin-tab-btn', activeSection === 'courses' && 'active']"
            @click="activeSection = 'courses'"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tab-icon">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
              <path d="M6 6h10M6 10h10"/>
            </svg>
            <span>Courses &amp; Allocation</span>
            <span class="badge-mini-count">{{ courseStats.total }}</span>
            <span v-if="courseStats.unassigned > 0" class="badge-mini-amber" title="Unassigned courses">{{ courseStats.unassigned }} unassigned</span>
          </button>

          <button
            :class="['admin-tab-btn', activeSection === 'teachers' && 'active']"
            @click="activeSection = 'teachers'; activeTab = 'TEACHERS'"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tab-icon">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span>Teachers Directory</span>
            <span class="badge-mini-count">{{ teacherStats.total }}</span>
            <span v-if="teacherStats.pending > 0" class="badge-mini-amber">{{ teacherStats.pending }} pending</span>
          </button>

          <button
            :class="['admin-tab-btn', activeSection === 'students' && 'active']"
            @click="activeSection = 'students'; activeTab = 'STUDENTS'"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tab-icon">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <span>Active Students</span>
            <span class="badge-mini-count">{{ studentStats.total }}</span>
          </button>

          <button
            :class="['admin-tab-btn', activeSection === 'invitations' && 'active']"
            @click="activeSection = 'invitations'; activeTab = 'REGISTRY'"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tab-icon">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span>Invitations</span>
            <span class="badge-mini-count">{{ inviteStats.total }}</span>
          </button>

          <button
            :class="['admin-tab-btn', activeSection === 'bulk' && 'active']"
            @click="activeSection = 'bulk'; activeTab = 'BULK'"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tab-icon">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span>Bulk Invite</span>
          </button>

          <button
            :class="['admin-tab-btn', activeSection === 'transfer' && 'active']"
            @click="activeSection = 'transfer'; activeTab = 'TRANSFER'"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tab-icon">
              <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
              <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
            </svg>
            <span>Transfer Workload</span>
          </button>

          <button
            :class="['admin-tab-btn', activeSection === 'dashboard' && 'active']"
            @click="activeSection = 'dashboard'"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tab-icon">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
            <span>Overview &amp; Stats</span>
          </button>
        </div>

        <!-- Dashboard Overview: Quick Action Shortcuts & Live Previews -->
        <div v-if="activeSection === 'dashboard'" class="dashboard-overview-container">
          <!-- Quick Action Bar -->
          <div class="glass-card quick-action-bar">
            <div class="quick-action-info">
              <h4 class="quick-action-title">Academic Management Shortcuts</h4>
              <p class="quick-action-sub">Create departments, register courses, and assign educators to curricula.</p>
            </div>
            <div class="quick-action-buttons">
              <button class="btn btn-primary btn-sm" @click="activeSection = 'departments'; showCreateDept = true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                + Create Department
              </button>
              <button class="btn btn-primary btn-sm" @click="activeSection = 'courses'; showCreateCourse = true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                + Create Course
              </button>
              <button class="btn btn-secondary btn-sm" @click="activeSection = 'invitations'; activeTab = 'INVITE'">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <line x1="19" y1="8" x2="19" y2="14"/>
                  <line x1="22" y1="11" x2="16" y2="11"/>
                </svg>
                + Invite Teacher
              </button>
            </div>
          </div>

          <!-- 2-Column Live Previews: Departments & Courses -->
          <div class="dashboard-overview-grid">
            <!-- Academic Departments Preview Card -->
            <div class="glass-card overview-card">
              <div class="overview-card-header">
                <div>
                  <h3 class="overview-card-title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="title-icon">
                      <path d="M3 21h18M3 7v14M21 7v14M6 21V11M10 21V11M14 21V11M18 21V11M12 3l9 4H3l9-4z"/>
                    </svg>
                    Academic Departments
                  </h3>
                  <p class="overview-card-desc">{{ departmentsList.length }} Registered Departments</p>
                </div>
                <button class="btn btn-outline-primary btn-xs" @click="activeSection = 'departments'">
                  Manage All Departments &rarr;
                </button>
              </div>

              <div v-if="departmentsList.length === 0" class="empty-state-mini">
                <p>No departments registered yet.</p>
                <button class="btn btn-primary btn-xs" @click="activeSection = 'departments'; showCreateDept = true">
                  + Create Department
                </button>
              </div>

              <div v-else class="overview-list">
                <div v-for="d in departmentsList.slice(0, 5)" :key="d.department_id" class="overview-item">
                  <div class="overview-item-main">
                    <span class="code-mono dept-badge">{{ d.code }}</span>
                    <span class="overview-item-name">{{ d.name }}</span>
                  </div>
                  <div class="overview-item-meta">
                    <button class="clickable-stat-pill" @click="viewDeptCourses(d.department_id)" title="View courses">
                      {{ d.course_count || 0 }} Courses
                    </button>
                    <button class="clickable-stat-pill text-blue" @click="viewDeptTeachers(d.department_id)" title="View faculty">
                      {{ d.user_count || 0 }} Faculty
                    </button>
                    <button class="btn btn-secondary btn-xs" @click="openDeptMembersModal(d)">Roster</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Courses & Faculty Allocations Preview Card -->
            <div class="glass-card overview-card">
              <div class="overview-card-header">
                <div>
                  <h3 class="overview-card-title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="title-icon">
                      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
                      <path d="M6 6h10M6 10h10"/>
                    </svg>
                    Courses &amp; Faculty Allocations
                  </h3>
                  <p class="overview-card-desc">{{ coursesList.length }} Active Curricula Modules</p>
                </div>
                <button class="btn btn-outline-primary btn-xs" @click="activeSection = 'courses'">
                  Manage All Courses &rarr;
                </button>
              </div>

              <div v-if="coursesList.length === 0" class="empty-state-mini">
                <p>No courses created yet.</p>
                <button class="btn btn-primary btn-xs" @click="activeSection = 'courses'; showCreateCourse = true">
                  + Create Course
                </button>
              </div>

              <div v-else class="overview-list">
                <div v-for="c in coursesList.slice(0, 5)" :key="c.course_id" class="overview-item">
                  <div class="overview-item-main">
                    <span class="code-mono course-badge">{{ c.course_code || 'CRS' }}</span>
                    <span class="overview-item-name">{{ c.course_name }}</span>
                    <span v-if="c.department_code" class="dept-sub-tag">({{ c.department_code }})</span>
                  </div>
                  <div class="overview-item-meta">
                    <span v-if="c.teacher_name" class="teacher-allocated-tag" title="Assigned educator">
                      👨‍🏫 {{ c.teacher_name }}
                    </span>
                    <span v-else class="badge-mini-amber" title="Needs teacher allocation">
                      ⚠️ Unassigned
                    </span>
                    <button class="btn btn-secondary btn-xs" @click="openCourseRosterModal(c)">Roster</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ============================================================= -->
        <!-- TAB: DEPARTMENTS MANAGEMENT                                   -->
        <!-- ============================================================= -->
        <div v-if="activeSection === 'departments'" class="tab-pane">
          <!-- Intro / Action Bar -->
          <div class="glass-card creator-card">
            <div class="card-intro-row">
              <div>
                <h3 class="section-title">Academic Departments</h3>
                <p class="section-desc">
                  Create and manage academic departments, oversee academic courses within them, and view enrolled students and faculty rosters.
                </p>
              </div>
              <button class="btn btn-primary btn-sm" @click="showCreateDept = !showCreateDept">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                {{ showCreateDept ? 'Close Form' : 'Create Department' }}
              </button>
            </div>

            <!-- Create Department Form -->
            <form v-if="showCreateDept" @submit.prevent="handleCreateDepartment" class="mt-4 pt-4 border-t">
              <div class="form-grid">
                <div class="field-item flex-2">
                  <label class="field-label">Department Name *</label>
                  <input
                    type="text"
                    v-model="deptForm.name"
                    placeholder="e.g. Computer Science &amp; Information Technology"
                    class="input-control"
                    required
                  />
                </div>
                <div class="field-item flex-1">
                  <label class="field-label">Department Code *</label>
                  <input
                    type="text"
                    v-model="deptForm.code"
                    placeholder="e.g. CS"
                    class="input-control uppercase"
                    maxlength="10"
                    required
                  />
                  <span class="field-hint">Unique 2-6 letter academic identifier</span>
                </div>
              </div>
              <div class="form-action-row">
                <button type="submit" class="btn btn-primary" :disabled="isCreatingDept">
                  <span v-if="isCreatingDept">Creating Department...</span>
                  <span v-else>Save &amp; Create Department</span>
                </button>
                <button type="button" class="btn btn-secondary" @click="showCreateDept = false">Cancel</button>
              </div>
            </form>
          </div>

          <!-- Dept Stats -->
          <div class="grid-cards">
            <div class="glass-card stat-card">
              <div class="stat-number text-primary">{{ deptStats.total }}</div>
              <div class="stat-label">Total Departments</div>
              <p class="stat-hint">Active academic faculties</p>
            </div>
            <div class="glass-card stat-card">
              <div class="stat-number">{{ deptStats.active }}</div>
              <div class="stat-label">Active Units</div>
              <p class="stat-hint">{{ deptStats.archived }} archived</p>
            </div>
            <div class="glass-card stat-card">
              <div class="stat-number text-success">{{ deptStats.totalCourses }}</div>
              <div class="stat-label">Total Department Courses</div>
              <p class="stat-hint">Registered curriculum modules</p>
            </div>
            <div class="glass-card stat-card">
              <div class="stat-number text-blue">{{ deptStats.totalUsers }}</div>
              <div class="stat-label">Department Members</div>
              <p class="stat-hint">Faculty assigned to departments</p>
            </div>
          </div>

          <!-- Controls -->
          <div class="glass-card table-control-card">
            <div class="search-input-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                v-model="deptSearch"
                placeholder="Search department by name or code..."
                class="search-input"
              />
              <button v-if="deptSearch" class="btn-clear" @click="deptSearch = ''">&times;</button>
            </div>
            <div class="filter-group">
              <button class="btn btn-secondary btn-sm" @click="loadDepartmentsList" :disabled="isLoadingDepts">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
                  <path d="M23 4v6h-6M1 20v-6h6"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
                Refresh
              </button>
            </div>
          </div>

          <!-- Departments Table -->
          <div class="glass-card table-wrapper-card">
            <div class="card-header-bar">
              <h3 class="section-title">Department Directory</h3>
              <span class="badge-count">{{ filteredDepartments.length }} Departments</span>
            </div>

            <div v-if="isLoadingDepts" class="loading-state">
              <div class="spinner"></div>
              <span>Loading departments...</span>
            </div>

            <div v-else-if="filteredDepartments.length === 0" class="empty-table-state">
              <p>{{ deptSearch ? 'No departments match your search.' : 'No departments registered yet. Click "Create Department" above to get started.' }}</p>
              <button v-if="deptSearch" class="btn btn-secondary btn-sm" @click="deptSearch = ''">Clear Search</button>
            </div>

            <div v-else class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Department Name &amp; Code</th>
                    <th>Status</th>
                    <th>Courses</th>
                    <th>Faculty</th>
                    <th class="text-right">Roster &amp; Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="dept in filteredDepartments" :key="dept.department_id">
                    <td>
                      <!-- Inline Edit Mode -->
                      <div v-if="editingDeptId === dept.department_id" class="inline-edit-box">
                        <input type="text" v-model="editDeptForm.name" class="input-control input-sm" placeholder="Dept Name" />
                        <input type="text" v-model="editDeptForm.code" class="input-control input-sm uppercase" style="max-width: 80px;" placeholder="Code" />
                        <button class="btn btn-primary btn-xs" @click="handleUpdateDepartment(dept.department_id)" :disabled="isUpdatingDept">Save</button>
                        <button class="btn btn-secondary btn-xs" @click="cancelEditDept">Cancel</button>
                      </div>
                      <!-- Normal Display -->
                      <div v-else class="dept-identity-cell">
                        <div class="dept-icon-square">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 21h18M3 7v14M21 7v14M6 21V11M10 21V11M14 21V11M18 21V11M12 3l9 4H3l9-4z"/>
                          </svg>
                        </div>
                        <div>
                          <div class="dept-title-name">{{ dept.name }}</div>
                          <span class="code-mono dept-badge">{{ dept.code }}</span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span :class="['badge', dept.status === 'active' ? 'badge-success' : 'badge-warning']">
                        <span class="badge-dot"></span>
                        {{ dept.status === 'active' ? 'Active' : 'Archived' }}
                      </span>
                    </td>

                    <td>
                      <button class="clickable-stat-pill" @click="viewDeptCourses(dept.department_id)" title="View courses in this department">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon-xs">
                          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
                        </svg>
                        {{ dept.course_count || 0 }} Courses &rarr;
                      </button>
                    </td>

                    <td>
                      <button class="clickable-stat-pill text-blue" @click="viewDeptTeachers(dept.department_id)" title="View teachers in this department">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon-xs">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                        </svg>
                        {{ dept.user_count || 0 }} Faculty &rarr;
                      </button>
                    </td>

                    <td class="text-right">
                      <div class="action-buttons-cell">
                        <!-- View full Roster: Teachers & Students in this Department -->
                        <button class="btn btn-primary btn-xs" @click="openDeptMembersModal(dept)" title="View teachers, students, and courses in this department">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon-xs">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                          </svg>
                          View Roster
                        </button>

                        <!-- Add Course shortcut -->
                        <button class="btn btn-secondary btn-xs" @click="openCreateCourseInDept(dept.department_id)" title="Add a new course to this department">
                          + Add Course
                        </button>

                        <!-- Edit Button -->
                        <button v-if="editingDeptId !== dept.department_id" class="btn btn-outline-secondary btn-xs" @click="startEditDept(dept)">
                          Edit
                        </button>

                        <!-- Archive Button -->
                        <button v-if="dept.status === 'active'" class="btn btn-outline-danger btn-xs" @click="handleArchiveDepartment(dept)" title="Archive department">
                          Archive
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- ============================================================= -->
        <!-- TAB: COURSES MANAGEMENT & TEACHER ALLOCATION                 -->
        <!-- ============================================================= -->
        <div v-if="activeSection === 'courses'" class="tab-pane">
          <!-- Intro / Action Bar -->
          <div class="glass-card creator-card">
            <div class="card-intro-row">
              <div>
                <h3 class="section-title">Courses Management &amp; Teacher Assignment</h3>
                <p class="section-desc">
                  Create academic courses within departments, assign or reassign faculty educators, and inspect enrolled students for each course.
                </p>
              </div>
              <button class="btn btn-primary btn-sm" @click="showCreateCourse = !showCreateCourse">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                {{ showCreateCourse ? 'Close Form' : 'Create Course' }}
              </button>
            </div>

            <!-- Create Course Form -->
            <form v-if="showCreateCourse" @submit.prevent="handleCreateCourse" class="mt-4 pt-4 border-t">
              <div class="form-grid">
                <!-- Course Name -->
                <div class="field-item flex-2">
                  <label class="field-label">Course Name *</label>
                  <input
                    type="text"
                    v-model="courseForm.courseName"
                    placeholder="e.g. Data Structures &amp; Algorithms"
                    class="input-control"
                    required
                  />
                </div>

                <!-- Course Code -->
                <div class="field-item flex-1">
                  <label class="field-label">Course Code (Optional)</label>
                  <input
                    type="text"
                    v-model="courseForm.courseCode"
                    placeholder="e.g. CS-201"
                    class="input-control uppercase"
                  />
                </div>

                <!-- Department Selection (REQUIRED) -->
                <div class="field-item flex-2">
                  <label class="field-label">Department *</label>
                  <select v-model="courseForm.departmentId" class="select-control" required>
                    <option value="" disabled>Select Department...</option>
                    <option v-for="d in departmentsList" :key="d.department_id" :value="String(d.department_id)">
                      {{ d.name }} ({{ d.code }})
                    </option>
                  </select>
                </div>

                <!-- Teacher Assignment (OPTIONAL) -->
                <div class="field-item flex-2">
                  <label class="field-label">Assign Faculty / Teacher (Optional)</label>
                  <select v-model="courseForm.teacherId" class="select-control">
                    <option value="">Leave unassigned for now</option>
                    <option v-for="t in teachersList" :key="t.user_id" :value="String(t.user_id)">
                      {{ t.name }} ({{ t.email }})
                    </option>
                  </select>
                </div>
              </div>

              <div class="form-action-row">
                <button type="submit" class="btn btn-primary" :disabled="isCreatingCourse">
                  <span v-if="isCreatingCourse">Creating Course...</span>
                  <span v-else>Save &amp; Create Course</span>
                </button>
                <button type="button" class="btn btn-secondary" @click="showCreateCourse = false">Cancel</button>
              </div>
            </form>
          </div>

          <!-- Course Stats -->
          <div class="grid-cards">
            <div class="glass-card stat-card">
              <div class="stat-number text-primary">{{ courseStats.total }}</div>
              <div class="stat-label">Total Courses</div>
              <p class="stat-hint">Active &amp; archived curriculums</p>
            </div>
            <div class="glass-card stat-card">
              <div class="stat-number">{{ courseStats.active }}</div>
              <div class="stat-label">Active Modules</div>
              <p class="stat-hint">Available for testing</p>
            </div>
            <div class="glass-card stat-card">
              <div class="stat-number text-success">{{ courseStats.assigned }}</div>
              <div class="stat-label">Assigned to Teachers</div>
              <p class="stat-hint">Led by active faculty</p>
            </div>
            <div class="glass-card stat-card" :class="{ 'card-highlight-amber': courseStats.unassigned > 0 }">
              <div class="stat-number" :class="{ 'text-amber': courseStats.unassigned > 0 }">{{ courseStats.unassigned }}</div>
              <div class="stat-label">Unassigned Courses</div>
              <p class="stat-hint">Need teacher allocation</p>
            </div>
            <div class="glass-card stat-card">
              <div class="stat-number text-blue">{{ courseStats.totalStudents }}</div>
              <div class="stat-label">Enrolled Students</div>
              <p class="stat-hint">Across all course rosters</p>
            </div>
          </div>

          <!-- Controls -->
          <div class="glass-card table-control-card">
            <div class="search-input-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                v-model="courseSearch"
                placeholder="Search course by name, code, or educator..."
                class="search-input"
              />
              <button v-if="courseSearch" class="btn-clear" @click="courseSearch = ''">&times;</button>
            </div>

            <div class="filter-group">
              <!-- Department Filter -->
              <select v-if="departmentsList.length > 0" v-model="courseDeptFilter" class="select-control">
                <option value="ALL">All Departments</option>
                <option v-for="d in departmentsList" :key="d.department_id" :value="String(d.department_id)">
                  {{ d.name }} ({{ d.code }})
                </option>
              </select>

              <!-- Teacher Allocation Filter -->
              <select v-model="courseTeacherFilter" class="select-control">
                <option value="ALL">All Teacher Allocations</option>
                <option value="UNASSIGNED">Unassigned Only ({{ courseStats.unassigned }})</option>
                <option v-for="t in teachersList" :key="t.user_id" :value="String(t.user_id)">
                  {{ t.name }}
                </option>
              </select>

              <!-- Status Filter -->
              <select v-model="courseStatusFilter" class="select-control">
                <option value="ALL">All Statuses</option>
                <option value="active">Active Only</option>
                <option value="archived">Archived Only</option>
              </select>

              <button class="btn btn-secondary btn-sm" @click="loadCoursesList" :disabled="isLoadingCourses">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
                  <path d="M23 4v6h-6M1 20v-6h6"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
                Refresh
              </button>
            </div>
          </div>

          <!-- Courses Table -->
          <div class="glass-card table-wrapper-card">
            <div class="card-header-bar">
              <h3 class="section-title">Courses Roster &amp; Faculty Assignments</h3>
              <span class="badge-count">{{ filteredCourses.length }} Courses</span>
            </div>

            <div v-if="isLoadingCourses" class="loading-state">
              <div class="spinner"></div>
              <span>Loading courses...</span>
            </div>

            <div v-else-if="filteredCourses.length === 0" class="empty-table-state">
              <p>{{ courseSearch || courseDeptFilter !== 'ALL' || courseTeacherFilter !== 'ALL' ? 'No courses match your filter criteria.' : 'No courses created yet. Click "Create Course" to add one within a department.' }}</p>
              <button class="btn btn-secondary btn-sm" @click="courseSearch = ''; courseDeptFilter = 'ALL'; courseTeacherFilter = 'ALL'; courseStatusFilter = 'ALL'">
                Clear Filters
              </button>
            </div>

            <div v-else class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Course Name &amp; Code</th>
                    <th>Department</th>
                    <th>Assigned Faculty Educator</th>
                    <th>Students</th>
                    <th>Status</th>
                    <th class="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="c in filteredCourses" :key="c.course_id">
                    <td>
                      <div class="course-name-cell">
                        <div class="course-main-name">{{ c.course_name }}</div>
                        <span class="code-mono course-code-badge">{{ c.course_code || 'NO-CODE' }}</span>
                      </div>
                    </td>

                    <td>
                      <!-- Department Badge or Assign -->
                      <div class="dept-select-wrap">
                        <span v-if="c.department_name" class="dept-pill" :title="c.department_name">
                          {{ c.department_code || c.department_name }}
                        </span>
                        <span v-else class="text-dim text-xs">No Department</span>
                        <select
                          v-model="selectedCourseDept[c.course_id]"
                          @change="handleAssignDeptToCourse(c.course_id)"
                          class="select-control-mini"
                          title="Change department"
                        >
                          <option :value="undefined">Change Dept...</option>
                          <option v-for="d in departmentsList" :key="d.department_id" :value="d.department_id">
                            {{ d.code }} - {{ d.name }}
                          </option>
                        </select>
                      </div>
                    </td>

                    <td>
                      <!-- Teacher Assignment Cell -->
                      <div class="teacher-assignment-cell">
                        <div v-if="c.teacher_id" class="assigned-teacher-info">
                          <div class="avatar-circle-sm">{{ c.teacher_name?.charAt(0)?.toUpperCase() || 'T' }}</div>
                          <div>
                            <div class="teacher-name-compact">{{ c.teacher_name }}</div>
                            <div class="teacher-email-compact">{{ c.teacher_email }}</div>
                          </div>
                        </div>
                        <div v-else class="unassigned-badge">
                          <span class="badge badge-warning"><span class="badge-dot"></span> Unassigned</span>
                        </div>

                        <!-- Quick Reassign Dropdown -->
                        <div class="inline-reassign-box">
                          <select
                            v-model="selectedCourseTeacher[c.course_id]"
                            @change="handleAssignTeacherToCourse(c.course_id)"
                            :disabled="assigningCourseId === c.course_id"
                            class="select-control-sm"
                            title="Assign or reassign teacher"
                          >
                            <option :value="undefined">Assign / Change Teacher...</option>
                            <option value="">-- Remove / Unassign Teacher --</option>
                            <option v-for="t in teachersList" :key="t.user_id" :value="String(t.user_id)">
                              {{ t.name }} ({{ t.email }})
                            </option>
                          </select>
                          <span v-if="assigningCourseId === c.course_id" class="spinner-sm"></span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <button class="clickable-stat-pill" @click="openCourseRosterModal(c)" title="View enrolled students">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon-xs">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                        </svg>
                        {{ c.student_count || 0 }} Students &rarr;
                      </button>
                    </td>

                    <td>
                      <span :class="['badge', c.status === 'active' ? 'badge-success' : 'badge-warning']">
                        <span class="badge-dot"></span>
                        {{ c.status === 'active' ? 'Active' : 'Archived' }}
                      </span>
                    </td>

                    <td class="text-right">
                      <div class="action-buttons-cell">
                        <!-- View Enrolled Students Modal -->
                        <button class="btn btn-primary btn-xs" @click="openCourseRosterModal(c)" title="View enrolled students list">
                          View Roster
                        </button>

                        <!-- Toggle Active/Archived -->
                        <button
                          class="btn btn-outline-secondary btn-xs"
                          @click="handleCourseStatus(c.course_id, c.status === 'active' ? 'archived' : 'active')"
                          title="Archive or restore course"
                        >
                          {{ c.status === 'active' ? 'Archive' : 'Restore' }}
                        </button>

                        <!-- Delete Course -->
                        <button class="btn btn-outline-danger btn-xs" @click="handleDeleteCourse(c)" title="Delete course">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- ============================================================= -->
        <!-- TAB: STUDENTS                                                 -->
        <!-- ============================================================= -->
        <div v-if="activeSection === 'students'" class="tab-pane">
          <!-- Student Stats -->
          <div class="grid-cards">
            <div class="glass-card stat-card">
              <div class="stat-number text-blue">{{ studentStats.total }}</div>
              <div class="stat-label">Total Registered</div>
              <p class="stat-hint">Students in your institution</p>
            </div>
            <div class="glass-card stat-card">
              <div class="stat-number">{{ studentStats.active }}</div>
              <div class="stat-label">Active Accounts</div>
              <p class="stat-hint">Can sign in and take exams</p>
            </div>
            <div class="glass-card stat-card">
              <div class="stat-number text-dim">{{ studentStats.inactive }}</div>
              <div class="stat-label">Deactivated</div>
              <p class="stat-hint">Blocked from signing in</p>
            </div>
          </div>

          <!-- Search & Controls -->
          <div class="glass-card table-control-card">
            <div class="search-input-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                v-model="studentSearch"
                placeholder="Search student by name or email..."
                class="search-input"
              />
              <button v-if="studentSearch" class="btn-clear" @click="studentSearch = ''">&times;</button>
            </div>
            <div class="filter-group">
              <!-- Department Filter -->
              <select v-if="departmentsList.length > 0" v-model="studentDeptFilter" class="select-control">
                <option value="ALL">All Departments</option>
                <option v-for="d in departmentsList" :key="d.department_id" :value="String(d.department_id)">
                  {{ d.name }} ({{ d.code }})
                </option>
              </select>

              <!-- Course Filter -->
              <select v-if="coursesList.length > 0" v-model="studentCourseFilter" class="select-control">
                <option value="ALL">All Courses</option>
                <option v-for="c in coursesList" :key="c.course_id" :value="String(c.course_id)">
                  {{ c.course_name }} ({{ c.course_code || 'No code' }})
                </option>
              </select>

              <!-- Status Filter -->
              <select v-model="studentStatusFilter" class="select-control">
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active Accounts</option>
                <option value="INACTIVE">Deactivated</option>
              </select>

              <button class="btn btn-secondary btn-sm" @click="loadStudents" :disabled="isLoadingStudents">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
                  <path d="M23 4v6h-6M1 20v-6h6"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
                Refresh
              </button>
            </div>
          </div>

          <!-- Students Table -->
          <div class="glass-card table-wrapper-card">
            <div class="card-header-bar">
              <h3 class="section-title">Registered Students</h3>
              <span class="badge-count">{{ filteredStudents.length }} Students</span>
            </div>

            <div v-if="isLoadingStudents" class="loading-state">
              <div class="spinner"></div>
              <span>Loading student registry...</span>
            </div>

            <div v-else-if="filteredStudents.length === 0" class="empty-table-state">
              <p>{{ studentSearch || studentDeptFilter !== 'ALL' || studentCourseFilter !== 'ALL' ? 'No students match your filter criteria.' : 'No registered students found for your institution.' }}</p>
              <button class="btn btn-secondary btn-sm" @click="studentSearch = ''; studentDeptFilter = 'ALL'; studentCourseFilter = 'ALL'; studentStatusFilter = 'ALL'">Clear Filters</button>
            </div>

            <div v-else class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Student Name &amp; Email</th>
                    <th>Department</th>
                    <th>Enrolled Courses</th>
                    <th>Registered</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="student in filteredStudents" :key="student.user_id">
                    <td>
                      <div class="teacher-identity">
                        <div class="teacher-avatar">{{ student.name?.charAt(0)?.toUpperCase() }}</div>
                        <div>
                          <div class="teacher-name">{{ student.name }}</div>
                          <div class="teacher-email">{{ student.email }}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span v-if="student.department_name" class="dept-pill">{{ student.department_code || student.department_name }}</span>
                      <span v-else-if="student.courses?.length > 0 && student.courses[0].department_name" class="dept-pill">{{ student.courses[0].department_name }}</span>
                      <span v-else class="text-dim text-xs">General / Unassigned</span>
                    </td>
                    <td>
                      <div v-if="student.courses?.length > 0" class="student-courses-wrap">
                        <span
                          v-for="c in student.courses"
                          :key="c.course_id"
                          class="course-micro-badge"
                          :title="c.course_name"
                        >
                          {{ c.course_code || c.course_name }}
                        </span>
                      </div>
                      <span v-else class="text-dim text-xs">No courses enrolled</span>
                    </td>
                    <td class="cell-date">{{ formatDate(student.created_at) }}</td>
                    <td>
                      <span :class="['status-pill', student.is_active ? 'status-active' : 'status-inactive']">{{ student.is_active ? 'Active' : 'Inactive' }}</span>
                    </td>
                    <td class="actions-cell">
                      <button
                        :class="['btn', 'btn-sm', student.is_active ? 'btn-danger-outline' : 'btn-success-outline']"
                        :disabled="updatingStudentId === student.user_id"
                        @click="async () => { updatingStudentId = student.user_id; try { const res = await updateStudentStatus(auth.token.value, student.user_id, !student.is_active); showSuccess(res.message || 'Student updated.'); await loadStudents(); } catch(e) { showError(e.message); } finally { updatingStudentId = null; } }"
                      >
                        <span v-if="updatingStudentId === student.user_id">...</span>
                        <span v-else-if="student.is_active">Deactivate</span>
                        <span v-else>Activate</span>
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- ============================================================= -->
        <!-- TAB 1: TEACHERS DIRECTORY                                    -->
        <!-- ============================================================= -->
        <div v-if="activeSection === 'teachers'" class="tab-pane">
          <!-- Filter & Search Bar -->
          <div class="glass-card table-control-card">
            <div class="search-input-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                v-model="teacherSearch"
                placeholder="Search teacher by name or official email..."
                class="search-input"
              />
              <button v-if="teacherSearch" class="btn-clear" @click="teacherSearch = ''">&times;</button>
            </div>

            <div class="filter-group">
              <select v-model="teacherStatusFilter" class="select-control">
                <option value="ALL">All Statuses ({{ teacherStats.total }})</option>
                <option value="ACTIVE">Active ({{ teacherStats.active }})</option>
                <option value="INACTIVE">Deactivated ({{ teacherStats.inactive }})</option>
                <option value="PENDING">Pending Approval ({{ teacherStats.pending }})</option>
              </select>

              <select v-if="departmentsList.length > 0" v-model="teacherDeptFilter" class="select-control">
                <option value="ALL">All Departments</option>
                <option v-for="d in departmentsList" :key="d.department_id" :value="d.department_id">
                  {{ d.name }} ({{ d.code }})
                </option>
              </select>

              <select v-if="coursesList.length > 0" v-model="teacherCourseFilter" class="select-control">
                <option value="ALL">All Courses</option>
                <option v-for="c in coursesList" :key="c.course_id" :value="String(c.course_id)">
                  {{ c.course_name }} ({{ c.course_code || 'No code' }})
                </option>
              </select>

              <button class="btn btn-secondary btn-sm" @click="loadTeachers" :disabled="isLoadingTeachers">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
                  <path d="M23 4v6h-6M1 20v-6h6"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
                Refresh
              </button>
            </div>
          </div>

          <!-- Teachers Table Card -->
          <div class="glass-card table-wrapper-card">
            <div class="card-header-bar">
              <h3 class="section-title">Institutional Faculty Directory</h3>
              <span class="badge-count">{{ filteredTeachers.length }} Educators</span>
            </div>

            <div v-if="isLoadingTeachers" class="loading-state">
              <div class="spinner"></div>
              <span>Loading faculty directory...</span>
            </div>

            <div v-else-if="filteredTeachers.length === 0" class="empty-table-state">
              <p>No teachers found matching your search or filter criteria.</p>
              <button class="btn btn-secondary btn-sm" @click="teacherSearch = ''; teacherStatusFilter = 'ALL'; teacherDeptFilter = 'ALL'; teacherCourseFilter = 'ALL'">
                Clear Filters
              </button>
            </div>

            <div v-else class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Teacher Name &amp; Email</th>
                    <th>Department</th>
                    <th>Status</th>
                    <th>Last Sign-In</th>
                    <th>Assigned Courses</th>
                    <th>Assessments</th>
                    <th class="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="t in filteredTeachers" :key="t.user_id">
                    <td>
                      <div class="user-cell">
                        <div class="avatar-circle">
                          {{ t.name?.charAt(0).toUpperCase() || 'T' }}
                        </div>
                        <div>
                          <div class="user-fullname">{{ t.name }}</div>
                          <div class="user-email-sub">{{ t.email }}</div>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span v-if="t.department_name" class="dept-pill">
                        {{ t.department_code || t.department_name }}
                      </span>
                      <span v-else class="text-dim text-xs">Unassigned</span>
                    </td>

                    <td>
                      <!-- Approval status badge -->
                      <span v-if="t.approval_status === 'pending'" class="badge badge-warning" title="Manual approval required for institutional domain sign-in">
                        <span class="badge-dot"></span> Pending Approval
                      </span>
                      <span v-else-if="t.is_active" class="badge badge-success">
                        <span class="badge-dot"></span> Active
                      </span>
                      <span v-else class="badge badge-error">
                        <span class="badge-dot"></span> Deactivated (Blocked)
                      </span>
                    </td>

                    <td>
                      <span class="text-xs text-dim">{{ formatDate(t.last_sign_in) }}</span>
                    </td>

                    <td>
                      <div v-if="t.courses?.length > 0" class="student-courses-wrap">
                        <span
                          v-for="c in t.courses"
                          :key="c.course_id"
                          class="course-micro-badge"
                          :title="c.course_name + ' (Click to view enrolled students)'"
                          @click="viewCourseStudents(c.course_id)"
                          style="cursor: pointer;"
                        >
                          {{ c.course_code || c.course_name }} &rarr;
                        </span>
                      </div>
                      <span v-else class="text-dim text-xs">No courses assigned</span>
                    </td>

                    <td>
                      <span class="stat-badge assessment-badge-count">
                        {{ t.assessment_count || 0 }} Assessment{{ t.assessment_count === 1 ? '' : 's' }}
                      </span>
                    </td>

                    <td class="text-right">
                      <div class="action-buttons-cell">
                        <!-- Pending Manual Approval Actions -->
                        <template v-if="t.approval_status === 'pending'">
                          <button
                            class="btn btn-success btn-xs"
                            @click="handleTeacherApproval(t, 'approved')"
                            :disabled="updatingTeacherId === t.user_id"
                          >
                            Approve
                          </button>
                          <button
                            class="btn btn-danger btn-xs"
                            @click="handleTeacherApproval(t, 'rejected')"
                            :disabled="updatingTeacherId === t.user_id"
                          >
                            Reject
                          </button>
                        </template>

                        <!-- Standard Status Activation / Deactivation -->
                        <template v-else>
                          <button
                            :class="['btn btn-xs', t.is_active ? 'btn-outline-danger' : 'btn-outline-success']"
                            @click="handleToggleTeacherStatus(t)"
                            :disabled="updatingTeacherId === t.user_id"
                            :title="t.is_active ? 'Deactivate (blocks login immediately, preserves data)' : 'Activate (restore login)'"
                          >
                            {{ t.is_active ? 'Deactivate' : 'Activate' }}
                          </button>
                        </template>

                        <!-- Transfer Workload Shortcut -->
                        <button
                          class="btn btn-secondary btn-xs"
                          @click="initiateTransferFor(t.user_id)"
                          title="Transfer courses and assessments to another educator"
                        >
                          Transfer
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- ============================================================= -->
        <!-- TAB 2: SINGLE TEACHER INVITATION GENERATOR                     -->
        <!-- ============================================================= -->
        <div v-if="activeSection === 'invitations'" class="tab-pane">
          <div class="glass-card creator-card">
            <div class="card-intro-row">
              <div>
                <h3 class="section-title">Invite Teacher with Single-Use Expiring Code</h3>
                <p class="section-desc">
                  An expiring, single-use invitation code will be generated and dispatched directly to the teacher's email address. The teacher will use this code to access the Educator Studio.
                </p>
              </div>
            </div>

            <form @submit.prevent="handleCreateTeacherInvite" class="invite-form">
              <div class="form-grid">
                <!-- Teacher Email -->
                <div class="field-item flex-2">
                  <label class="field-label">Teacher's Official Email Address *</label>
                  <input
                    type="email"
                    v-model="inviteForm.email"
                    placeholder="e.g. professor.ahmed@ptut.edu.pk"
                    required
                    class="input-control"
                  />
                  <span class="field-hint">The single-use invitation code will be strictly bound to this email address.</span>
                </div>

                <!-- Expiry Duration Selector (Strictly: 1 hour, 5 hours, 1 day) -->
                <div class="field-item flex-1">
                  <label class="field-label">Code Expiry Time *</label>
                  <div class="expiry-radio-group">
                    <label :class="['expiry-pill', inviteForm.expiresIn === '1h' && 'selected']">
                      <input type="radio" value="1h" v-model="inviteForm.expiresIn" />
                      <span class="expiry-name">1 Hour</span>
                      <span class="expiry-sub">Quick invite</span>
                    </label>

                    <label :class="['expiry-pill', inviteForm.expiresIn === '5h' && 'selected']">
                      <input type="radio" value="5h" v-model="inviteForm.expiresIn" />
                      <span class="expiry-name">5 Hours</span>
                      <span class="expiry-sub">Same day</span>
                    </label>

                    <label :class="['expiry-pill', inviteForm.expiresIn === '1d' && 'selected']">
                      <input type="radio" value="1d" v-model="inviteForm.expiresIn" />
                      <span class="expiry-name">1 Day</span>
                      <span class="expiry-sub">24 hours</span>
                    </label>
                  </div>
                </div>
              </div>

              <div class="form-action-row">
                <button
                  type="submit"
                  class="btn btn-primary btn-lg"
                  :disabled="isGeneratingInvite || !inviteForm.email"
                >
                  <svg v-if="!isGeneratingInvite" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                  <span v-if="isGeneratingInvite">Generating & Dispatching Email...</span>
                  <span v-else>Generate Code & Send to Teacher</span>
                </button>
              </div>
            </form>

            <!-- Latest Generated Code Display Box -->
            <div v-if="latestGeneratedInvite" class="generated-code-box">
              <div class="code-box-header">
                <span class="badge badge-success"><span class="badge-dot"></span> Dispatched to Email</span>
                <span class="code-expiry-tag">Valid for {{ latestGeneratedInvite.expiryLabel }}</span>
              </div>

              <div class="code-display-row">
                <div class="code-text-wrapper">
                  <span class="code-string">{{ latestGeneratedInvite.code }}</span>
                </div>
                <button class="btn btn-secondary" @click="copyToClipboard(latestGeneratedInvite.code, 'Teacher Code')">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                  Copy Code
                </button>
              </div>

              <div class="code-details-box">
                <p>
                  <strong>Recipient:</strong> <code>{{ latestGeneratedInvite.email }}</code>
                </p>
                <p>
                  <strong>Expiration:</strong> Invalidated after <strong>{{ formatDate(latestGeneratedInvite.expiresAt) }}</strong>. The teacher will NOT be able to register after this time.
                </p>
                <p v-if="latestGeneratedInvite.emailSent" class="text-success text-xs">
                  &bull; Official invitation email with registration link dispatched successfully.
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- ============================================================= -->
        <!-- TAB 3: INVITATIONS REGISTRY (PENDING, USED, EXPIRED)          -->
        <!-- ============================================================= -->
        <div v-if="activeSection === 'invitations'" class="tab-pane">
          <div class="glass-card table-control-card">
            <div class="search-input-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                v-model="inviteSearch"
                placeholder="Search by invitation code or teacher email..."
                class="search-input"
              />
              <button v-if="inviteSearch" class="btn-clear" @click="inviteSearch = ''">&times;</button>
            </div>

            <div class="filter-group">
              <div class="segmented-filters">
                <button :class="['pill-btn', inviteFilter === 'ALL' && 'active']" @click="inviteFilter = 'ALL'">
                  All ({{ inviteStats.total }})
                </button>
                <button :class="['pill-btn', inviteFilter === 'PENDING' && 'active']" @click="inviteFilter = 'PENDING'">
                  Pending ({{ inviteStats.pending }})
                </button>
                <button :class="['pill-btn', inviteFilter === 'USED' && 'active']" @click="inviteFilter = 'USED'">
                  Used ({{ inviteStats.used }})
                </button>
                <button :class="['pill-btn', inviteFilter === 'EXPIRED' && 'active']" @click="inviteFilter = 'EXPIRED'">
                  Expired ({{ inviteStats.expired }})
                </button>
              </div>

              <button class="btn btn-secondary btn-sm" @click="loadInvitations" :disabled="isLoadingInvitations">
                Refresh
              </button>
            </div>
          </div>

          <div class="glass-card table-wrapper-card">
            <div class="card-header-bar">
              <h3 class="section-title">Invitation Codes Registry</h3>
              <span class="badge-count">{{ filteredInvitations.length }} Codes</span>
            </div>

            <div v-if="isLoadingInvitations" class="loading-state">
              <div class="spinner"></div>
              <span>Loading invitation records...</span>
            </div>

            <div v-else-if="filteredInvitations.length === 0" class="empty-table-state">
              <p>No invitation records found matching your selection.</p>
              <button class="btn btn-secondary btn-sm" @click="inviteSearch = ''; inviteFilter = 'ALL'">Reset Filter</button>
            </div>

            <div v-else class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Invitation Code</th>
                    <th>Designated Teacher Email</th>
                    <th>Status</th>
                    <th>Expires At</th>
                    <th>Created</th>
                    <th class="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="inv in filteredInvitations" :key="inv.invitation_id">
                    <td>
                      <div class="code-cell">
                        <span class="code-mono">{{ inv.code }}</span>
                        <button class="btn-icon-subtle" @click="copyToClipboard(inv.code, 'Code')" title="Copy code">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                          </svg>
                        </button>
                      </div>
                    </td>

                    <td>
                      <span v-if="inv.target_email" class="email-tag">
                        {{ inv.target_email }}
                      </span>
                      <span v-else class="text-dim text-xs">Unbound (Any official email)</span>
                    </td>

                    <td>
                      <span v-if="inv.used_at" class="badge badge-info">
                        <span class="badge-dot"></span> Used by {{ inv.used_by_name || 'Teacher' }}
                      </span>
                      <span v-else-if="new Date(inv.expires_at) < new Date()" class="badge badge-error">
                        <span class="badge-dot"></span> Expired
                      </span>
                      <span v-else class="badge badge-warning">
                        <span class="badge-dot"></span> Pending ({{ formatTimeRemaining(inv.expires_at) }})
                      </span>
                    </td>

                    <td>
                      <div class="expiry-cell">
                        <span>{{ formatDate(inv.expires_at) }}</span>
                        <span v-if="!inv.used_at && new Date(inv.expires_at) >= new Date()" class="text-xs text-primary">
                          {{ formatTimeRemaining(inv.expires_at) }}
                        </span>
                      </div>
                    </td>

                    <td>
                      <span class="text-xs text-dim">{{ formatDate(inv.created_at) }}</span>
                    </td>

                    <td class="text-right">
                      <div class="action-buttons-cell">
                        <!-- If unused (pending or expired), allow Resend with refreshed expiry -->
                        <div v-if="!inv.used_at" class="resend-dropdown-wrapper">
                          <button
                            class="btn btn-secondary btn-xs"
                            @click="handleResendInvitation(inv, '1d')"
                            :disabled="resendingInviteId === inv.invitation_id"
                            title="Resend email and refresh expiry"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon-xs">
                              <line x1="22" y1="2" x2="11" y2="13"/>
                              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                            </svg>
                            Resend Email
                          </button>

                          <!-- Revoke Button -->
                          <button
                            class="btn btn-outline-danger btn-xs"
                            @click="handleRevokeInvitation(inv)"
                            :disabled="revokingInviteId === inv.invitation_id"
                            title="Revoke and cancel invitation"
                          >
                            Revoke
                          </button>
                        </div>

                        <!-- If Used -->
                        <span v-else class="text-xs text-dim">
                          Redeemed on {{ formatDate(inv.used_at) }}
                        </span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- ============================================================= -->
        <!-- TAB 4: TRANSFER WORKLOAD (COURSES & ASSESSMENTS)              -->
        <!-- ============================================================= -->
        <div v-if="activeSection === 'transfer'" class="tab-pane">
          <div class="glass-card creator-card">
            <div class="card-intro-row">
              <div>
                <h3 class="section-title">Transfer Leaving Teacher's Workload</h3>
                <p class="section-desc">
                  Safely reallocate all assigned courses, student rosters, and assessments from a departing teacher to an active teacher in your institution.
                </p>
              </div>
            </div>

            <form @submit.prevent="handleTransferWorkload" class="transfer-form">
              <div class="form-grid">
                <!-- Source (Leaving) Teacher -->
                <div class="field-item">
                  <label class="field-label">Source Teacher (Leaving Faculty) *</label>
                  <select v-model="transferForm.fromTeacherId" class="select-control" required>
                    <option value="" disabled>Select departing educator...</option>
                    <option
                      v-for="t in teachersList"
                      :key="t.user_id"
                      :value="String(t.user_id)"
                    >
                      {{ t.name }} ({{ t.email }}) &bull; {{ t.course_count || 0 }} courses, {{ t.assessment_count || 0 }} exams
                    </option>
                  </select>
                </div>

                <!-- Arrow Indicator -->
                <div class="transfer-arrow-box">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="5" y1="12" x2="19" y2="12"/>
                    <polyline points="12 5 19 12 12 19"/>
                  </svg>
                </div>

                <!-- Destination (Receiving) Teacher -->
                <div class="field-item">
                  <label class="field-label">Destination Teacher (Receiving Faculty) *</label>
                  <select v-model="transferForm.toTeacherId" class="select-control" required>
                    <option value="" disabled>Select receiving educator...</option>
                    <option
                      v-for="t in teachersList"
                      :key="t.user_id"
                      :value="String(t.user_id)"
                      :disabled="String(t.user_id) === String(transferForm.fromTeacherId)"
                    >
                      {{ t.name }} ({{ t.email }})
                    </option>
                  </select>
                </div>
              </div>

              <!-- Workload Preview Box -->
              <div v-if="selectedFromTeacher" class="workload-preview-card">
                <div class="preview-title">Workload Transfer Summary</div>
                <div class="preview-metrics">
                  <div class="metric-pill">
                    <span class="metric-number">{{ selectedFromTeacher.course_count || 0 }}</span>
                    <span class="metric-text">Courses to transfer</span>
                  </div>
                  <div class="metric-pill">
                    <span class="metric-number">{{ selectedFromTeacher.assessment_count || 0 }}</span>
                    <span class="metric-text">Assessments to transfer</span>
                  </div>
                </div>
                <p class="preview-hint">
                  Once confirmed, all courses and curriculum evaluations created by <strong>{{ selectedFromTeacher.name }}</strong> will be instantly reassigned. You can subsequently deactivate their profile.
                </p>
              </div>

              <div class="form-action-row">
                <button
                  type="submit"
                  class="btn btn-primary btn-lg"
                  :disabled="isTransferring || !transferForm.fromTeacherId || !transferForm.toTeacherId"
                >
                  <span v-if="isTransferring">Transferring Curriculum Workload...</span>
                  <span v-else>Confirm Workload Transfer</span>
                </button>
              </div>
            </form>

            <!-- Transfer Success Summary -->
            <div v-if="transferResult" class="alert alert-success">
              <h4>Transfer Complete!</h4>
              <p>
                Successfully moved <strong>{{ transferResult.transferredCourses }}</strong> course(s) and <strong>{{ transferResult.transferredAssessments }}</strong> assessment(s) from <strong>{{ transferResult.fromTeacher }}</strong> to <strong>{{ transferResult.toTeacher }}</strong>.
              </p>
            </div>
          </div>
        </div>

        <!-- ============================================================= -->
        <!-- TAB 5: BULK INVITE FROM CSV                                  -->
        <!-- ============================================================= -->
        <div v-if="activeSection === 'bulk'" class="tab-pane">
          <div class="glass-card creator-card">
            <div class="card-intro-row">
              <div>
                <h3 class="section-title">Bulk-Invite Teachers from CSV</h3>
                <p class="section-desc">
                  Upload a CSV file containing teacher email addresses. The system will create single-use codes bound to each email, configure the chosen expiration window, and dispatch invitations automatically.
                </p>
              </div>
            </div>

            <form @submit.prevent="handleBulkInvite" class="bulk-form">
              <div class="form-grid">
                <!-- CSV File Upload -->
                <div class="field-item flex-2">
                  <label class="field-label">Upload CSV File with Emails</label>
                  <input
                    type="file"
                    accept=".csv,text/csv,text/plain"
                    @change="onBulkFileSelected"
                    class="file-input-control"
                  />
                  <span class="field-hint">CSV file with teacher email addresses (one per row, or standard email column).</span>
                </div>

                <!-- Expiry Duration -->
                <div class="field-item flex-1">
                  <label class="field-label">Bulk Code Expiration *</label>
                  <div class="expiry-radio-group">
                    <label :class="['expiry-pill', bulkExpiresIn === '1h' && 'selected']">
                      <input type="radio" value="1h" v-model="bulkExpiresIn" />
                      <span class="expiry-name">1 Hour</span>
                    </label>
                    <label :class="['expiry-pill', bulkExpiresIn === '5h' && 'selected']">
                      <input type="radio" value="5h" v-model="bulkExpiresIn" />
                      <span class="expiry-name">5 Hours</span>
                    </label>
                    <label :class="['expiry-pill', bulkExpiresIn === '1d' && 'selected']">
                      <input type="radio" value="1d" v-model="bulkExpiresIn" />
                      <span class="expiry-name">1 Day</span>
                    </label>
                  </div>
                </div>
              </div>

              <!-- Or Paste Emails directly -->
              <div class="field-item">
                <label class="field-label">Or Paste Email Addresses (comma or newline separated)</label>
                <textarea
                  v-model="bulkEmailsText"
                  placeholder="teacher1@ptut.edu.pk, teacher2@ptut.edu.pk&#10;teacher3@ptut.edu.pk"
                  rows="3"
                  class="textarea-control"
                ></textarea>
              </div>

              <div class="form-action-row">
                <button
                  type="submit"
                  class="btn btn-primary btn-lg"
                  :disabled="isBulkInviting || (!bulkFile && !bulkEmailsText.trim())"
                >
                  <span v-if="isBulkInviting">Processing Bulk Invitations...</span>
                  <span v-else>Dispatch Bulk Invitations</span>
                </button>
              </div>
            </form>

            <!-- Bulk Result Display -->
            <div v-if="bulkUploadResult" class="bulk-results-card">
              <h4>Bulk Invitation Results</h4>
              <p>
                Successfully dispatched <strong>{{ bulkUploadResult.invitedCount }}</strong> teacher invitation(s).
              </p>
              <div v-if="bulkUploadResult.invitations?.length > 0" class="bulk-codes-preview">
                <div v-for="inv in bulkUploadResult.invitations" :key="inv.invitation_id" class="bulk-code-item">
                  <span>{{ inv.target_email }}</span>
                  <code class="code-mono">{{ inv.code }}</code>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ============================================================= -->
        <!-- MODAL 1: DEPARTMENT MEMBERS & ROSTER MODAL                    -->
        <!-- ============================================================= -->
        <div v-if="showDeptModal" class="modal-overlay" @click.self="closeDeptMembersModal">
          <div class="modal-card modal-lg">
            <div class="modal-header">
              <div class="modal-title-wrap">
                <div class="dept-icon-square">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 21h18M3 7v14M21 7v14M6 21V11M10 21V11M14 21V11M18 21V11M12 3l9 4H3l9-4z"/>
                  </svg>
                </div>
                <div>
                  <h3 class="modal-title">
                    {{ selectedDeptMembers?.department?.name || 'Department Roster' }}
                    <span v-if="selectedDeptMembers?.department?.code" class="code-mono dept-badge">
                      {{ selectedDeptMembers?.department?.code }}
                    </span>
                  </h3>
                  <p class="modal-subtitle">
                    Faculty educators, registered students, and curriculum courses belonging to this department.
                  </p>
                </div>
              </div>
              <button class="modal-close-btn" @click="closeDeptMembersModal">&times;</button>
            </div>

            <!-- Modal Sub-Tabs -->
            <div class="modal-nav-tabs">
              <button
                :class="['modal-tab-btn', deptModalTab === 'teachers' && 'active']"
                @click="deptModalTab = 'teachers'"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon-xs">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                </svg>
                Faculty / Teachers ({{ selectedDeptMembers?.teachers?.length || 0 }})
              </button>
              <button
                :class="['modal-tab-btn', deptModalTab === 'students' && 'active']"
                @click="deptModalTab = 'students'"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon-xs">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
                Students ({{ selectedDeptMembers?.students?.length || 0 }})
              </button>
              <button
                :class="['modal-tab-btn', deptModalTab === 'courses' && 'active']"
                @click="deptModalTab = 'courses'"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon-xs">
                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
                </svg>
                Courses ({{ selectedDeptMembers?.courses?.length || 0 }})
              </button>
            </div>

            <div class="modal-body">
              <div v-if="isLoadingDeptMembers" class="loading-state">
                <div class="spinner"></div>
                <span>Loading department roster...</span>
              </div>

              <!-- Tab: Teachers -->
              <div v-else-if="deptModalTab === 'teachers'">
                <div v-if="!selectedDeptMembers?.teachers || selectedDeptMembers.teachers.length === 0" class="empty-table-state">
                  <p>No faculty educators assigned to this department yet.</p>
                </div>
                <div v-else class="table-responsive">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>Faculty Educator</th>
                        <th>Status</th>
                        <th>Department Courses Taught</th>
                        <th class="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="t in selectedDeptMembers.teachers" :key="t.user_id">
                        <td>
                          <div class="user-cell">
                            <div class="avatar-circle-sm">{{ t.name?.charAt(0)?.toUpperCase() || 'T' }}</div>
                            <div>
                              <div class="user-fullname">{{ t.name }}</div>
                              <div class="user-email-sub">{{ t.email }}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span :class="['status-pill', t.is_active ? 'status-active' : 'status-inactive']">
                            {{ t.is_active ? 'Active' : 'Inactive' }}
                          </span>
                        </td>
                        <td>
                          <div v-if="t.department_courses?.length > 0" class="student-courses-wrap">
                            <span v-for="c in t.department_courses" :key="c.course_id" class="course-micro-badge">
                              {{ c.course_code || c.course_name }}
                            </span>
                          </div>
                          <span v-else class="text-dim text-xs">No specific courses assigned</span>
                        </td>
                        <td class="text-right">
                          <button class="btn btn-secondary btn-xs" @click="closeDeptMembersModal(); activeSection = 'teachers'; activeTab = 'TEACHERS'; teacherSearch = t.email;">
                            View Details
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- Tab: Students -->
              <div v-else-if="deptModalTab === 'students'">
                <div v-if="!selectedDeptMembers?.students || selectedDeptMembers.students.length === 0" class="empty-table-state">
                  <p>No students registered or enrolled in this department yet.</p>
                </div>
                <div v-else class="table-responsive">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>Student Name &amp; Email</th>
                        <th>Status</th>
                        <th>Enrolled Department Courses</th>
                        <th>Registered</th>
                        <th class="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="s in selectedDeptMembers.students" :key="s.user_id">
                        <td>
                          <div class="user-cell">
                            <div class="avatar-circle-sm">{{ s.name?.charAt(0)?.toUpperCase() || 'S' }}</div>
                            <div>
                              <div class="user-fullname">{{ s.name }}</div>
                              <div class="user-email-sub">{{ s.email }}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span :class="['status-pill', s.is_active ? 'status-active' : 'status-inactive']">
                            {{ s.is_active ? 'Active' : 'Inactive' }}
                          </span>
                        </td>
                        <td>
                          <div v-if="s.enrolled_dept_courses?.length > 0" class="student-courses-wrap">
                            <span v-for="c in s.enrolled_dept_courses" :key="c.course_id" class="course-micro-badge">
                              {{ c.course_code || c.course_name }}
                            </span>
                          </div>
                          <span v-else class="text-dim text-xs">Direct Department Member</span>
                        </td>
                        <td class="cell-date">{{ formatDate(s.created_at) }}</td>
                        <td class="text-right">
                          <button class="btn btn-secondary btn-xs" @click="closeDeptMembersModal(); activeSection = 'students'; activeTab = 'STUDENTS'; studentSearch = s.email;">
                            View Profile
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- Tab: Courses -->
              <div v-else-if="deptModalTab === 'courses'">
                <div v-if="!selectedDeptMembers?.courses || selectedDeptMembers.courses.length === 0" class="empty-table-state">
                  <p>No courses created for this department yet.</p>
                  <button class="btn btn-primary btn-sm" @click="closeDeptMembersModal(); openCreateCourseInDept(selectedDeptMembers?.department?.department_id)">
                    + Create Course Now
                  </button>
                </div>
                <div v-else class="table-responsive">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>Course Name &amp; Code</th>
                        <th>Assigned Educator</th>
                        <th>Enrolled Students</th>
                        <th>Status</th>
                        <th class="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="c in selectedDeptMembers.courses" :key="c.course_id">
                        <td>
                          <div class="course-name-cell">
                            <div class="course-main-name">{{ c.course_name }}</div>
                            <span class="code-mono course-code-badge">{{ c.course_code || 'NO-CODE' }}</span>
                          </div>
                        </td>
                        <td>
                          <div v-if="c.teacher_name" class="assigned-teacher-info">
                            <span class="teacher-name-compact">{{ c.teacher_name }}</span>
                            <span class="teacher-email-compact">{{ c.teacher_email }}</span>
                          </div>
                          <span v-else class="badge badge-warning"><span class="badge-dot"></span> Unassigned</span>
                        </td>
                        <td>
                          <span class="badge badge-info">{{ c.student_count || 0 }} Students</span>
                        </td>
                        <td>
                          <span :class="['status-pill', c.status === 'active' ? 'status-active' : 'status-inactive']">
                            {{ c.status }}
                          </span>
                        </td>
                        <td class="text-right">
                          <button class="btn btn-primary btn-xs" @click="closeDeptMembersModal(); openCourseRosterModal(c)">
                            View Students
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div class="modal-footer">
              <button class="btn btn-secondary" @click="closeDeptMembersModal">Close</button>
            </div>
          </div>
        </div>

        <!-- ============================================================= -->
        <!-- MODAL 2: COURSE ROSTER & ENROLLED STUDENTS MODAL              -->
        <!-- ============================================================= -->
        <div v-if="showCourseModal" class="modal-overlay" @click.self="closeCourseRosterModal">
          <div class="modal-card modal-lg">
            <div class="modal-header">
              <div class="modal-title-wrap">
                <div class="course-badge" style="font-size: 1.1rem; padding: 0.4rem 0.8rem;">
                  {{ selectedCourseRoster?.course?.course_code || 'CRS' }}
                </div>
                <div>
                  <h3 class="modal-title">
                    {{ selectedCourseRoster?.course?.course_name || 'Course Roster' }}
                  </h3>
                  <p class="modal-subtitle">
                    Department: <strong>{{ selectedCourseRoster?.course?.department_name || 'General / Unassigned' }}</strong> &bull;
                    Enrolled Students: <strong>{{ selectedCourseRoster?.students?.length || 0 }}</strong>
                  </p>
                </div>
              </div>
              <button class="modal-close-btn" @click="closeCourseRosterModal">&times;</button>
            </div>

            <!-- Teacher Banner in Course Modal -->
            <div class="course-teacher-banner">
              <div class="banner-label">Assigned Faculty Educator:</div>
              <div v-if="selectedCourseRoster?.teacher" class="assigned-teacher-row">
                <div class="avatar-circle-sm">{{ selectedCourseRoster.teacher.name?.charAt(0)?.toUpperCase() || 'T' }}</div>
                <div class="teacher-details">
                  <span class="teacher-name font-bold">{{ selectedCourseRoster.teacher.name }}</span>
                  <span class="teacher-email text-dim text-xs">({{ selectedCourseRoster.teacher.email }})</span>
                </div>
              </div>
              <div v-else class="unassigned-notice">
                <span class="badge badge-warning"><span class="badge-dot"></span> No Teacher Assigned</span>
                <span class="text-xs text-dim">You can assign a teacher from the Courses Management table.</span>
              </div>
            </div>

            <div class="modal-body">
              <div v-if="isLoadingCourseRoster" class="loading-state">
                <div class="spinner"></div>
                <span>Loading enrolled student roster...</span>
              </div>

              <div v-else-if="!selectedCourseRoster?.students || selectedCourseRoster.students.length === 0" class="empty-table-state">
                <p>No students enrolled in this course yet.</p>
                <p class="text-xs text-dim">Students are enrolled when they join via course code, are bulk loaded, or take an assessment in this course.</p>
              </div>

              <div v-else class="table-responsive">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Student Name</th>
                      <th>Email Address</th>
                      <th>Roll Number</th>
                      <th>Account Status</th>
                      <th>Enrolled On</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="student in selectedCourseRoster.students" :key="student.student_id || student.email">
                      <td>
                        <div class="user-cell">
                          <div class="avatar-circle-sm">{{ (student.user_name || student.enrolled_name || 'S').charAt(0).toUpperCase() }}</div>
                          <span class="user-fullname">{{ student.user_name || student.enrolled_name || 'Student' }}</span>
                        </div>
                      </td>
                      <td>
                        <span class="email-tag">{{ student.email }}</span>
                      </td>
                      <td>
                        <span class="code-mono">{{ student.roll_number || 'N/A' }}</span>
                      </td>
                      <td>
                        <span v-if="student.user_id" :class="['status-pill', student.is_active ? 'status-active' : 'status-inactive']">
                          {{ student.is_active ? 'Active User' : 'Inactive User' }}
                        </span>
                        <span v-else class="badge badge-warning">
                          <span class="badge-dot"></span> Enrolled (Unregistered)
                        </span>
                      </td>
                      <td class="cell-date">
                        {{ formatDate(student.created_at) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div class="modal-footer">
              <button
                class="btn btn-primary"
                @click="closeCourseRosterModal(); viewCourseStudents(selectedCourseRoster?.course?.course_id)"
              >
                Manage in Students Directory
              </button>
              <button class="btn btn-secondary" @click="closeCourseRosterModal">Close</button>
            </div>
          </div>
        </div>
      </section>
    </main>
    </div>
  </div>
</template>

<style scoped>
/* ============================
   LAYOUT: Sidebar + Main
   ============================ */
.dashboard-root {
  display: flex;
  min-height: 100vh;
  background-color: var(--bg-page);
  overflow: hidden;
}

/* Sidebar */
.sidebar {
  width: 270px;
  min-width: 270px;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  height: 100vh;
  position: sticky;
  top: 0;
  overflow-y: auto;
  overflow-x: hidden;
  transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 100;
  border-right: 1px solid var(--border-sky);
  box-shadow: 2px 0 16px rgba(135, 206, 235, 0.15);
}

.sidebar-collapsed {
  width: 68px;
  min-width: 68px;
}

/* Sidebar Header */
.sidebar-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1.25rem 1.1rem 1rem;
  border-bottom: 1px solid var(--border-light);
  min-height: 64px;
  background: var(--bg-hover);
}

.sidebar-logo {
  width: 38px;
  height: 38px;
  min-width: 38px;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-vivid));
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(56, 189, 248, 0.35);
}

.sidebar-logo svg {
  width: 20px;
  height: 20px;
  stroke: #ffffff;
}

.sidebar-brand-text {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-brand-name {
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--text-main);
  letter-spacing: -0.02em;
  white-space: nowrap;
}

.sidebar-brand-sub {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--accent-deep);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 150px;
}

.sidebar-collapse-btn {
  margin-left: auto;
  background: #ffffff;
  border: 1px solid var(--border-light);
  cursor: pointer;
  color: var(--text-secondary);
  padding: 0.3rem;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  transition: var(--transition-fast);
}
.sidebar-collapse-btn:hover { 
  color: var(--accent-deep); 
  background: var(--bg-active); 
  border-color: var(--border-focus);
}
.sidebar-collapse-btn svg { width: 16px; height: 16px; }

/* Sidebar User Card */
.sidebar-user-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.95rem 1rem 0.65rem;
  margin: 0.5rem 0.65rem 0.25rem;
  background: var(--bg-page);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
}

.sidebar-user-avatar {
  width: 38px;
  height: 38px;
  min-width: 38px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-deep));
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 0.95rem;
  color: #ffffff;
  box-shadow: 0 2px 6px rgba(56, 189, 248, 0.3);
}

.sidebar-user-avatar-only {
  display: flex;
  justify-content: center;
  padding: 0.75rem 0;
}

.sidebar-user-info {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-user-name {
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-user-email {
  font-size: 0.72rem;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Role badge in sidebar */
.sidebar-role-badge-wrap {
  padding: 0.25rem 1rem 0.5rem;
}

.sidebar-role-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  letter-spacing: 0.03em;
}

.sidebar-role-badge.role-admin {
  background: var(--bg-warning);
  color: var(--color-warning);
  border: 1px solid var(--border-warning);
}
.sidebar-role-badge.role-teacher {
  background: var(--bg-hover);
  color: var(--accent-deep);
  border: 1px solid var(--border-sky);
}
.sidebar-role-badge.role-student {
  background: var(--bg-success);
  color: var(--color-success);
  border: 1px solid var(--border-success);
}

/* Nav */
.sidebar-nav {
  flex: 1;
  padding: 0.5rem 0.65rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  overflow-y: auto;
}

.sidebar-nav-section-label {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  padding: 0.65rem 0.6rem 0.25rem;
}

.sidebar-nav-item {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.62rem 0.8rem;
  border-radius: var(--radius-sm);
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  text-decoration: none;
  transition: var(--transition-fast);
  white-space: nowrap;
  width: 100%;
  text-align: left;
}

.sidebar-nav-item:hover {
  background: var(--bg-hover);
  color: var(--accent-deep);
  border-color: var(--border-light);
}

.sidebar-nav-item.active {
  background: var(--bg-hover);
  color: var(--accent-deep);
  font-weight: 700;
  border: 1px solid var(--border-sky);
  box-shadow: 0 1px 4px rgba(135, 206, 235, 0.2);
}

.nav-icon {
  width: 18px;
  height: 18px;
  min-width: 18px;
  color: inherit;
}

.sidebar-badge-count {
  margin-left: auto;
  background: var(--bg-warning);
  color: var(--color-warning);
  border: 1px solid var(--border-warning);
  font-size: 0.7rem;
  font-weight: 800;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
}

.sidebar-badge-blue {
  background: var(--bg-active);
  color: var(--accent-deep);
  border: 1px solid var(--border-sky);
}

/* Sidebar Footer */
.sidebar-footer {
  padding: 0.75rem 0.65rem 1rem;
  border-top: 1px solid var(--border-light);
  background: var(--bg-page);
}

.sidebar-signout-btn {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  width: 100%;
  padding: 0.62rem 0.8rem;
  border-radius: var(--radius-sm);
  background: var(--bg-error);
  border: 1px solid var(--border-error);
  color: var(--color-error);
  font-size: 0.88rem;
  font-weight: 700;
  cursor: pointer;
  transition: var(--transition-fast);
  white-space: nowrap;
  text-align: left;
}

.sidebar-signout-btn:hover {
  background: #fee2e2;
  color: #991b1b;
  border-color: #fca5a5;
  box-shadow: 0 2px 6px rgba(239, 68, 68, 0.12);
}

/* Main area */
.dashboard-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

/* Top bar */
.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  margin: 1rem 1.5rem 0;
  border-radius: var(--radius-md);
  background: #ffffff;
  border: 1px solid var(--border-sky);
  box-shadow: 0 2px 10px rgba(135, 206, 235, 0.12);
}

.topbar-left {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.topbar-title {
  font-size: 1.25rem;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.2;
}

.topbar-sub {
  font-size: 0.78rem;
  color: #64748b;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.topbar-user-name {
  font-size: 0.88rem;
  font-weight: 600;
  color: #334155;
}

.topbar-role-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.73rem;
  font-weight: 700;
  padding: 0.22rem 0.6rem;
  border-radius: 999px;
}

.topbar-role-badge.role-admin {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fde68a;
}
.topbar-role-badge.role-teacher {
  background: #e0f2fe;
  color: #0369a1;
  border: 1px solid #bae6fd;
}
.topbar-role-badge.role-student {
  background: #d1fae5;
  color: #065f46;
  border: 1px solid #a7f3d0;
}

/* Dashboard content area */
.dashboard-content {
  flex: 1;
  padding: 1.5rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

/* Toast Notification */
.toast-popup {
  position: fixed;
  top: 1.5rem;
  right: 1.5rem;
  z-index: 9999;
  background: #0f172a;
  color: #ffffff;
  padding: 0.75rem 1.25rem;
  border-radius: var(--radius-md);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.88rem;
  font-weight: 600;
  animation: slideInDown 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.toast-popup svg {
  width: 18px;
  height: 18px;
  color: #38bdf8;
}

@keyframes slideInDown {
  from { transform: translateY(-20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

/* Navbar */
.navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1.5rem;
  padding: 1.25rem 2rem;
  background: var(--bg-card);
  border: 1px solid var(--border-sky);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.logo-box {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-vivid));
  display: flex;
  align-items: center;
  justify-content: center;
  color: #FFFFFF;
  box-shadow: 0 4px 12px rgba(56, 189, 248, 0.35);
}

.logo-box svg {
  width: 24px;
  height: 24px;
}

.nav-title {
  font-family: var(--font-heading);
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text-main);
}

.nav-subtitle {
  font-size: 0.82rem;
  color: var(--text-secondary);
}

.nav-user {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  flex-wrap: wrap;
}

.user-info {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.user-name {
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text-main);
}

.user-email {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.role-view {
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
}

/* Banner Card */
.banner-card {
  padding: 2.25rem 2.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: var(--bg-card);
  border: 1px solid var(--border-sky);
  border-left: 4px solid var(--accent-primary);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.banner-title {
  font-family: var(--font-heading);
  font-size: 1.65rem;
  font-weight: 800;
  color: var(--text-main);
}

.banner-text {
  font-size: 0.95rem;
  color: var(--text-secondary);
  max-width: 800px;
  line-height: 1.6;
}

/* Sub-Navigation Tabs */
.admin-tabs {
  display: flex;
  gap: 0.65rem;
  border-bottom: 1px solid var(--border-sky);
  padding-bottom: 0.75rem;
  overflow-x: auto;
}

.admin-tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: #FFFFFF;
  color: var(--text-main);
  border: 1px solid var(--border-sky);
  font-size: 0.88rem;
  font-weight: 600;
  padding: 0.65rem 1.15rem;
  border-radius: var(--radius-md);
  white-space: nowrap;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: var(--transition-fast);
}

.admin-tab-btn:hover {
  background: var(--bg-hover);
  border-color: var(--border-focus);
  color: var(--accent-vivid);
}

.admin-tab-btn.active {
  background: var(--bg-active);
  color: var(--accent-deep);
  border: 1px solid var(--accent-vivid);
  font-weight: 700;
}

.tab-icon {
  width: 17px;
  height: 17px;
}

.badge-mini-amber {
  background: #fef3c7;
  color: #92400e;
  font-size: 0.72rem;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  font-weight: 700;
}

.badge-mini-count {
  background: rgba(14, 165, 233, 0.12);
  color: #0284c7;
  font-size: 0.72rem;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  font-weight: 700;
}

.badge-mini-blue {
  background: #e0f2fe;
  color: #0369a1;
  font-size: 0.72rem;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  font-weight: 700;
}

/* Dashboard Overview Preview Layout */
.dashboard-overview-container {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  margin-top: 1rem;
}

.quick-action-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1.25rem;
  padding: 1.25rem 1.5rem;
  background: #ffffff;
  border: 1px solid var(--border-sky);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.quick-action-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 0.2rem;
}

.quick-action-sub {
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin: 0;
}

.quick-action-buttons {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.dashboard-overview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
  gap: 1.5rem;
}

.overview-card {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  background: #ffffff;
}

.overview-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-bottom: 0.85rem;
  border-bottom: 1px solid var(--border-sky);
}

.overview-card-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 0.2rem;
}

.overview-card-desc {
  font-size: 0.82rem;
  color: var(--text-secondary);
  margin: 0;
}

.overview-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.overview-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 0.9rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: var(--radius-md);
  transition: var(--transition-fast);
}

.overview-item:hover {
  background: #f0f9ff;
  border-color: #bae6fd;
}

.overview-item-main {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  overflow: hidden;
}

.overview-item-name {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.overview-item-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.teacher-allocated-tag {
  font-size: 0.78rem;
  font-weight: 600;
  color: #0369a1;
  background: #e0f2fe;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  white-space: nowrap;
}

.dept-sub-tag {
  font-size: 0.75rem;
  font-weight: 700;
  color: #64748b;
}

.course-dept-pill {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 600;
  color: #0284c7;
  background: #e0f2fe;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  margin-top: 0.25rem;
}

.tab-pane {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* Grid & Stat Cards */
.grid-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.25rem;
}

.stat-card {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  background: var(--bg-card);
  border: 1px solid var(--border-sky);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease;
}

.stat-card:hover {
  transform: translateY(-2px);
  border-color: var(--border-focus);
}

.stat-number {
  font-size: 2.25rem;
  font-weight: 800;
  color: var(--accent-deep);
}

.stat-label {
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text-main);
}

.stat-hint {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.text-amber {
  color: #d97706 !important;
}

/* Control & Filter Card */
.table-control-card {
  padding: 1rem 1.25rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border-sky);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.search-input-box {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  background: #ffffff;
  border: 1px solid var(--border-sky);
  border-radius: var(--radius-md);
  padding: 0.4rem 0.8rem;
  flex: 1;
  min-width: 280px;
}

.search-input-box svg {
  width: 17px;
  height: 17px;
  color: var(--text-secondary);
}

.search-input {
  border: none;
  outline: none;
  font-size: 0.88rem;
  width: 100%;
  color: var(--text-main);
  background: transparent;
}

.btn-clear {
  background: none;
  border: none;
  font-size: 1.1rem;
  cursor: pointer;
  color: var(--text-secondary);
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.select-control {
  background: #ffffff;
  border: 1px solid var(--border-sky);
  padding: 0.45rem 0.8rem;
  border-radius: var(--radius-md);
  font-size: 0.85rem;
  color: var(--text-main);
  outline: none;
}

/* Segmented Filters */
.segmented-filters {
  display: flex;
  background: #f1f5f9;
  border-radius: var(--radius-md);
  padding: 0.2rem;
  gap: 0.2rem;
}

.pill-btn {
  background: transparent;
  border: none;
  padding: 0.35rem 0.75rem;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.pill-btn.active {
  background: #ffffff;
  color: var(--accent-deep);
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

/* Table Wrapper */
.table-wrapper-card {
  background: var(--bg-card);
  border: 1px solid var(--border-sky);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.card-header-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.1rem 1.5rem;
  border-bottom: 1px solid var(--border-sky);
  background: var(--bg-hover);
}

.section-title {
  font-family: var(--font-heading);
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-main);
}

.badge-count {
  font-size: 0.78rem;
  font-weight: 700;
  background: #ffffff;
  color: var(--accent-deep);
  border: 1px solid var(--border-sky);
  padding: 0.2rem 0.65rem;
  border-radius: var(--radius-full);
}

.table-responsive {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
  text-align: left;
}

.data-table th {
  background: #f8fafc;
  color: var(--text-secondary);
  font-weight: 600;
  padding: 0.85rem 1.25rem;
  border-bottom: 1px solid var(--border-sky);
  text-transform: uppercase;
  font-size: 0.74rem;
  letter-spacing: 0.05em;
}

.data-table td {
  padding: 0.95rem 1.25rem;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: middle;
}

.data-table tr:hover {
  background-color: #f8fafc;
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.avatar-circle {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-vivid));
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.88rem;
}

.user-fullname {
  font-weight: 600;
  color: var(--text-main);
}

.user-email-sub {
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.dept-pill {
  display: inline-block;
  background: var(--bg-hover);
  border: 1px solid var(--border-sky);
  color: var(--accent-deep);
  font-size: 0.76rem;
  font-weight: 600;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
}

.stat-badge {
  display: inline-block;
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  font-size: 0.78rem;
  font-weight: 600;
}

.course-badge-count {
  background: #e0f2fe;
  color: #0369a1;
}

.assessment-badge-count {
  background: #f0fdf4;
  color: #15803d;
}

.action-buttons-cell {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.code-cell {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.code-mono {
  font-family: 'Courier New', Courier, monospace;
  font-weight: 700;
  color: var(--accent-deep);
  background: #f1f5f9;
  padding: 0.2rem 0.45rem;
  border-radius: 4px;
}

.email-tag {
  font-weight: 500;
  color: var(--text-main);
}

.expiry-cell {
  display: flex;
  flex-direction: column;
}

.text-right {
  text-align: right;
}

/* Creator & Form Cards */
.creator-card {
  padding: 2.25rem 2.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  background: var(--bg-card);
  border: 1px solid var(--border-sky);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.card-intro-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.section-desc {
  font-size: 0.92rem;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-top: 0.25rem;
}

.invite-form,
.transfer-form,
.bulk-form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.form-grid {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
  align-items: flex-start;
}

.field-item {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  flex: 1;
  min-width: 260px;
}

.flex-2 {
  flex: 2;
}

.flex-1 {
  flex: 1;
}

.field-label {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-main);
}

.field-hint {
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.input-control,
.textarea-control,
.file-input-control {
  width: 100%;
  padding: 0.65rem 0.9rem;
  border: 1px solid var(--border-sky);
  border-radius: var(--radius-md);
  font-size: 0.9rem;
  color: var(--text-main);
  background: #ffffff;
  outline: none;
}

.input-control:focus,
.textarea-control:focus {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.15);
}

/* Expiry Radio Pills */
.expiry-radio-group {
  display: flex;
  gap: 0.75rem;
}

.expiry-pill {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0.6rem 0.9rem;
  border: 1px solid var(--border-sky);
  border-radius: var(--radius-md);
  background: #ffffff;
  cursor: pointer;
  flex: 1;
  text-align: center;
  transition: all 0.15s;
}

.expiry-pill input {
  display: none;
}

.expiry-pill:hover {
  background: var(--bg-hover);
  border-color: var(--border-focus);
}

.expiry-pill.selected {
  background: var(--bg-active);
  border-color: var(--accent-vivid);
}

.expiry-name {
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--accent-deep);
}

.expiry-sub {
  font-size: 0.72rem;
  color: var(--text-secondary);
}

.form-action-row {
  display: flex;
  justify-content: flex-start;
}

/* Generated Code Display Box */
.generated-code-box {
  background: #f8fafc;
  border: 2px dashed #38bdf8;
  border-radius: var(--radius-lg);
  padding: 1.75rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.code-box-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.code-expiry-tag {
  font-size: 0.82rem;
  font-weight: 600;
  color: #d97706;
}

.code-display-row {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.code-text-wrapper {
  background: #ffffff;
  border: 1px solid #bae6fd;
  border-radius: var(--radius-md);
  padding: 0.75rem 1.5rem;
}

.code-string {
  font-family: 'Courier New', Courier, monospace;
  font-size: 1.75rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: var(--accent-deep);
}

.code-details-box {
  font-size: 0.88rem;
  color: var(--text-secondary);
  line-height: 1.6;
}

.code-details-box code {
  color: var(--accent-deep);
  font-weight: 700;
}

/* Transfer Arrow Box */
.transfer-arrow-box {
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: 1.8rem;
}

.transfer-arrow-box svg {
  width: 24px;
  height: 24px;
  color: var(--accent-primary);
}

/* Workload Preview Card */
.workload-preview-card {
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: var(--radius-md);
  padding: 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.preview-title {
  font-size: 0.92rem;
  font-weight: 700;
  color: #0369a1;
}

.preview-metrics {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.metric-pill {
  background: #ffffff;
  border: 1px solid #bae6fd;
  border-radius: var(--radius-md);
  padding: 0.6rem 1rem;
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.metric-number {
  font-size: 1.5rem;
  font-weight: 800;
  color: #0284c7;
}

.metric-text {
  font-size: 0.82rem;
  color: var(--text-secondary);
}

.preview-hint {
  font-size: 0.85rem;
  color: #075985;
  line-height: 1.5;
}

/* Bulk Results Card */
.bulk-results-card {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: var(--radius-md);
  padding: 1.25rem 1.5rem;
}

.bulk-codes-preview {
  margin-top: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  max-height: 200px;
  overflow-y: auto;
}

.bulk-code-item {
  display: flex;
  justify-content: space-between;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  padding: 0.4rem 0.8rem;
  border-radius: 4px;
  font-size: 0.82rem;
}

/* General UI Elements */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem 0.65rem;
  border-radius: var(--radius-full);
  font-size: 0.78rem;
  font-weight: 600;
  width: fit-content;
}

.badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.badge-warning {
  background: #fef3c7;
  color: #92400e;
}
.badge-warning .badge-dot {
  background: #f59e0b;
}

.badge-info {
  background: #e0f2fe;
  color: #0369a1;
}
.badge-info .badge-dot {
  background: #0284c7;
}

.badge-success {
  background: #d1fae5;
  color: #065f46;
}
.badge-success .badge-dot {
  background: #10b981;
}

.badge-error {
  background: #fee2e2;
  color: #991b1b;
}
.badge-error .badge-dot {
  background: #ef4444;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  font-family: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  padding: 0.65rem 1.15rem;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: var(--transition-fast);
  border: 1px solid transparent;
  text-decoration: none;
}

.btn-sm {
  padding: 0.4rem 0.8rem;
  font-size: 0.8rem;
}

.btn-xs {
  padding: 0.25rem 0.6rem;
  font-size: 0.76rem;
}

.btn-lg {
  padding: 0.8rem 1.5rem;
  font-size: 0.95rem;
}

.btn-primary {
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-vivid));
  color: #ffffff;
}

.btn-primary:hover {
  filter: brightness(1.08);
  box-shadow: 0 4px 12px rgba(56, 189, 248, 0.35);
}

.btn-secondary {
  background: #ffffff;
  color: var(--text-main);
  border-color: var(--border-sky);
}

.btn-secondary:hover {
  background: var(--bg-hover);
  border-color: var(--border-focus);
}

.btn-success {
  background: #10b981;
  color: #ffffff;
}
.btn-success:hover {
  background: #059669;
}

.btn-danger {
  background: #ef4444;
  color: #ffffff;
}
.btn-danger:hover {
  background: #dc2626;
}

.btn-outline-danger {
  background: #ffffff;
  border-color: #fca5a5;
  color: #b91c1c;
}
.btn-outline-danger:hover {
  background: #fee2e2;
}

.btn-outline-success {
  background: #ffffff;
  border-color: #86efac;
  color: #15803d;
}
.btn-outline-success:hover {
  background: #dcfce7;
}

.btn-icon-subtle {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 0.2rem;
  display: flex;
  align-items: center;
}
.btn-icon-subtle svg {
  width: 14px;
  height: 14px;
}
.btn-icon-subtle:hover {
  color: var(--accent-primary);
}

.btn-icon {
  width: 16px;
  height: 16px;
}
.btn-icon-xs {
  width: 13px;
  height: 13px;
}

.alert {
  padding: 0.9rem 1.25rem;
  border-radius: var(--radius-md);
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.alert-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.alert-success {
  background: #d1fae5;
  color: #065f46;
  border: 1px solid #a7f3d0;
}

.alert-error {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.loading-state,
.empty-table-state {
  padding: 3rem 1.5rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  color: var(--text-secondary);
  font-size: 0.92rem;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(56, 189, 248, 0.2);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.text-dim {
  color: var(--text-secondary);
}
.text-xs {
  font-size: 0.75rem;
}
.text-success {
  color: #16a34a;
}
.text-primary {
  color: #0284c7;
}

/* Educator view styles */
.empty-dashboard-card {
  padding: 3.5rem 2.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 1.25rem;
  background: var(--bg-card);
  border: 2px dashed var(--border-sky);
  border-radius: var(--radius-lg);
}

.empty-icon-circle {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--bg-hover);
  border: 1px solid var(--border-sky);
  color: var(--accent-vivid);
  display: flex;
  align-items: center;
  justify-content: center;
}
.empty-icon-circle svg {
  width: 36px;
  height: 36px;
}

.empty-title {
  font-family: var(--font-heading);
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-main);
}

.empty-desc {
  font-size: 0.95rem;
  color: var(--text-secondary);
  max-width: 600px;
  line-height: 1.6;
}

.assigned-courses-section {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.section-top-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.course-card {
  padding: 1.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: var(--bg-card);
  border: 1px solid var(--border-sky);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.course-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.course-badge {
  font-family: monospace;
  background: var(--bg-hover);
  color: var(--accent-deep);
  border: 1px solid var(--border-sky);
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 700;
}

.student-count {
  font-size: 0.82rem;
  color: var(--accent-deep);
  font-weight: 600;
}

.course-name {
  font-family: var(--font-heading);
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-main);
}

.course-meta {
  font-size: 0.82rem;
  color: var(--text-secondary);
}

.course-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

/* ─── Active Students & Utility Colors ─── */
.text-blue {
  color: #0284c7 !important;
}

.text-dim {
  color: var(--text-secondary);
}

.text-amber {
  color: #d97706;
}

.btn-danger-outline {
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #dc2626;
  background: #fef2f2;
  font-size: 0.78rem;
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s ease;
}

.btn-danger-outline:hover:not(:disabled) {
  background: #fee2e2;
  border-color: #ef4444;
  color: #b91c1c;
}

.btn-danger-outline:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-success-outline {
  border: 1px solid rgba(34, 197, 94, 0.4);
  color: #16a34a;
  background: #f0fdf4;
  font-size: 0.78rem;
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s ease;
}

.btn-success-outline:hover:not(:disabled) {
  background: #dcfce7;
  border-color: #22c55e;
  color: #15803d;
}

.btn-success-outline:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.role-view {
  width: 100%;
}

/* ─── Departments & Courses Management Styles ─── */
.dept-identity-cell {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.dept-icon-square {
  width: 38px;
  height: 38px;
  min-width: 38px;
  border-radius: var(--radius-md, 8px);
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.15), rgba(14, 165, 233, 0.25));
  border: 1px solid var(--border-sky);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-vivid);
}
.dept-icon-square svg {
  width: 20px;
  height: 20px;
}

.dept-title-name {
  font-weight: 700;
  color: var(--text-main);
  font-size: 0.95rem;
  line-height: 1.3;
}

.dept-badge {
  font-size: 0.75rem;
  padding: 0.15rem 0.5rem;
  background: var(--bg-hover);
  color: var(--accent-deep);
  border-radius: 4px;
  border: 1px solid var(--border-sky);
  display: inline-block;
  margin-top: 0.2rem;
}

.clickable-stat-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: var(--bg-hover);
  border: 1px solid var(--border-sky);
  color: var(--text-main);
  font-size: 0.82rem;
  font-weight: 600;
  padding: 0.35rem 0.75rem;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.clickable-stat-pill:hover {
  background: #e0f2fe;
  border-color: var(--accent-primary);
  color: var(--accent-deep);
  transform: translateY(-1px);
}

.inline-edit-box {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.input-sm {
  padding: 0.35rem 0.6rem;
  font-size: 0.85rem;
  border-radius: 6px;
}
.btn-xs {
  padding: 0.3rem 0.6rem;
  font-size: 0.78rem;
  border-radius: 5px;
}

/* Courses Table Specifics */
.course-name-cell {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.course-main-name {
  font-weight: 700;
  color: var(--text-main);
  font-size: 0.95rem;
}
.course-code-badge {
  font-size: 0.75rem;
  padding: 0.15rem 0.5rem;
  background: var(--bg-page);
  border: 1px solid var(--border-light);
  border-radius: 4px;
  color: var(--text-secondary);
  width: fit-content;
}

.dept-select-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.select-control-mini {
  padding: 0.2rem 0.4rem;
  font-size: 0.75rem;
  border-radius: 4px;
  border: 1px solid var(--border-light);
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
}

.teacher-assignment-cell {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.assigned-teacher-info {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}
.avatar-circle-sm {
  width: 28px;
  height: 28px;
  min-width: 28px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-vivid));
  color: #ffffff;
  font-size: 0.75rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.teacher-name-compact {
  font-weight: 600;
  font-size: 0.88rem;
  color: var(--text-main);
}
.teacher-email-compact {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.inline-reassign-box {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.select-control-sm {
  padding: 0.3rem 0.55rem;
  font-size: 0.8rem;
  border-radius: 6px;
  border: 1px solid var(--border-sky);
  background: #ffffff;
  color: var(--text-main);
  cursor: pointer;
  max-width: 220px;
}

.card-highlight-amber {
  border-color: rgba(245, 158, 11, 0.4);
  background: linear-gradient(180deg, #fffbeb 0%, #ffffff 100%);
}

.student-courses-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.course-micro-badge {
  display: inline-flex;
  align-items: center;
  font-size: 0.72rem;
  font-weight: 600;
  background: #f0fdf4;
  color: #166534;
  border: 1px solid #bbf7d0;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
}

/* ─── Modals (Department & Course Roster) ─── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.65);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1.5rem;
  animation: fadeIn 0.2s ease-out;
}

.modal-card {
  background: #ffffff;
  border-radius: var(--radius-lg, 16px);
  box-shadow: 0 20px 45px rgba(0, 0, 0, 0.25);
  border: 1px solid var(--border-sky);
  display: flex;
  flex-direction: column;
  max-height: 85vh;
  width: 100%;
  animation: scaleUp 0.2s ease-out;
  overflow: hidden;
}

.modal-lg {
  max-width: 860px;
}

.modal-header {
  padding: 1.25rem 1.75rem;
  border-bottom: 1px solid var(--border-light);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-hover);
}

.modal-title-wrap {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.modal-title {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text-main);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.modal-subtitle {
  margin: 0.2rem 0 0;
  font-size: 0.82rem;
  color: var(--text-secondary);
}

.modal-close-btn {
  background: transparent;
  border: none;
  font-size: 1.75rem;
  color: var(--text-secondary);
  cursor: pointer;
  line-height: 1;
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
  transition: all 0.15s ease;
}
.modal-close-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  color: var(--text-main);
}

.modal-nav-tabs {
  display: flex;
  padding: 0 1.75rem;
  background: var(--bg-hover);
  border-bottom: 1px solid var(--border-light);
  gap: 0.5rem;
}

.modal-tab-btn {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 0.75rem 1rem;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  transition: all 0.2s ease;
}
.modal-tab-btn.active {
  color: var(--accent-vivid);
  border-bottom-color: var(--accent-vivid);
  background: #ffffff;
  border-top-left-radius: 6px;
  border-top-right-radius: 6px;
}

.modal-body {
  padding: 1.5rem 1.75rem;
  overflow-y: auto;
  flex: 1;
}

.modal-footer {
  padding: 1rem 1.75rem;
  border-top: 1px solid var(--border-light);
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  background: #ffffff;
}

.course-teacher-banner {
  padding: 0.95rem 1.75rem;
  background: #f8fafc;
  border-bottom: 1px solid var(--border-light);
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}
.course-teacher-banner .banner-label {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-secondary);
}
.assigned-teacher-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.unassigned-notice {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes scaleUp {
  from { transform: scale(0.96); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
</style>
