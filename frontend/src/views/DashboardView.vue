<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../store/auth';
import {
  fetchTeacherCourses,
  fetchTeacherOverview,
  createTeacherCourse,
  publishAssessment,
  revertAssessmentDraft,
  deleteDraftAssessment,
  reviewStudentAttempt,
  createQuizExport,
  retryAiFailure,
  dismissAiFailure,
  fetchCourseHub,
  enrollSingleStudent,
  enrollBulkStudents,
  updateCourseStudent,
  checkStudentAttempts,
  unenrollCourseStudent,
  addCourseMaterial,
  deleteCourseMaterial,
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
  updateAdminCourse,
  assignCourseTeacher,
  updateCourseDepartment,
  updateCourseStatus,
  deleteCourse,
  fetchCourseRoster,
  enrollStudentInCourse,
  unenrollStudentFromCourse
} from '../api';

const router = useRouter();
const auth = useAuth();

// Teacher Complete State
const teacherCourses = ref([]);
const teacherDrafts = ref([]);
const teacherPublished = ref([]);
const teacherReviewQueue = ref([]);
const teacherFlaggedCount = ref(0);
const teacherExports = ref([]);
const teacherAiFailures = ref([]);
const teacherDepartments = ref([]);
const educatorDashboardStats = ref({
  coursesCount: 0,
  draftsCount: 0,
  publishedCount: 0,
  waitingReviewCount: 0,
  flaggedCount: 0,
  recentExportsCount: 0,
  aiFailuresCount: 0
});
const teacherLoading = ref(true);
const teacherActiveTab = ref('COURSES'); // 'COURSES' | 'DRAFTS' | 'PUBLISHED' | 'REVIEWS' | 'EXPORTS_AI'
const reviewFilter = ref('ALL'); // 'ALL' | 'FLAGGED'

// Teacher Modals & Action States
const showTeacherNewCourseModal = ref(false);
const teacherNewCourseForm = ref({ courseName: '', courseCode: '', departmentId: '' });
const isCreatingTeacherCourse = ref(false);

const showReviewAttemptModal = ref(false);
const selectedReviewAttempt = ref(null);
const reviewForm = ref({ score: 0, feedback: '', clearFlag: true });
const isSubmittingReview = ref(false);

const showExportQuizModal = ref(false);
const exportForm = ref({ assessmentTitle: '', format: 'PDF', courseCode: 'CRS' });
const isCreatingExport = ref(false);

const showInspectQuizModal = ref(false);
const selectedInspectQuiz = ref(null);

const retryingFailureId = ref(null);
const isPublishingDraftId = ref(null);
const teacherToast = ref('');

// --- Teacher Course Search & Course Page Hub State ---
const courseSearchQuery = ref('');
const selectedCourseHub = ref(null);
const courseHubTab = ref('students'); // 'students' | 'materials' | 'assessments' | 'results'
const isLoadingCourseHub = ref(false);
const courseHubData = ref({
  course: null,
  students: [],
  materials: [],
  assessments: [],
  results: [],
  analytics: {},
  approvedDomains: []
});
const studentRosterSearch = ref('');

// Single Student Add Modal
const showSingleStudentModal = ref(false);
const singleStudentForm = ref({ name: '', rollNumber: '', email: '' });
const isEnrollingSingle = ref(false);

// Bulk Students Add Modal
const showBulkStudentModal = ref(false);
const bulkEnrollMode = ref('paste'); // 'paste' | 'csv'
const bulkPasteText = ref('');
const bulkParsedRows = ref([]);
const bulkDuplicatesCount = ref(0);
const bulkInvalidCount = ref(0);
const bulkNonInstitutionalCount = ref(0);
const isEnrollingBulk = ref(false);

// Edit Student Modal
const showEditStudentModal = ref(false);
const editStudentForm = ref({ student_id: null, name: '', rollNumber: '', email: '' });
const isUpdatingStudent = ref(false);

// Remove Student Decision Workflow
const showRemoveDecisionModal = ref(false);
const studentToRemove = ref(null);
const studentAttemptsCheck = ref({ hasAttempts: false, attemptCount: 0 });
const isCheckingAttempts = ref(false);
const isRemovingStudent = ref(false);
const removalResolutionChoice = ref('archive'); // 'archive' | 'block' | 'purge'

// Course Material Add Modal
const showAddMaterialModal = ref(false);
const materialForm = ref({ title: '', fileName: '', sourceType: 'PDF' });
const isAddingMaterial = ref(false);

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
const deptStatusFilter = ref('ALL'); // 'ALL' | 'active' | 'archived'

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

// Edit Course Modal State
const showEditCourseModal = ref(false);
const editCourseForm = ref({ course_id: null, courseName: '', courseCode: '', teacherId: '', departmentId: '', status: 'active' });
const isUpdatingCourse = ref(false);

// Roster Modals State
const showDeptModal = ref(false);
const selectedDeptMembers = ref(null);
const isLoadingDeptMembers = ref(false);
const deptModalTab = ref('teachers'); // 'teachers' | 'students' | 'courses'
const deptAssignTeacherId = ref('');
const isAssigningDeptTeacher = ref(false);

const showCourseModal = ref(false);
const selectedCourseRoster = ref(null);
const isLoadingCourseRoster = ref(false);
const showEnrollStudentForm = ref(false);
const enrollStudentForm = ref({ email: '', name: '' });
const isEnrollingStudent = ref(false);
const isUnenrollingStudentId = ref(null);

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
    if (deptStatusFilter.value !== 'ALL') {
      if (d.status !== deptStatusFilter.value) return false;
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

const handleToggleDeptStatus = async (dept) => {
  const newStatus = dept.status === 'active' ? 'archived' : 'active';
  try {
    const res = await updateDepartment(auth.token.value, dept.department_id, {
      name: dept.name,
      code: dept.code,
      status: newStatus
    });
    showSuccess(res.message || `Department ${newStatus === 'active' ? 'restored' : 'archived'}.`);
    await loadDepartmentsList();
  } catch (err) {
    showError(err.message || 'Failed to update department status.');
  }
};

const handleDeleteDepartmentPermanent = async (dept) => {
  const confirmed = confirm(
    `PERMANENTLY DELETE department "${dept.name}" (${dept.code})?\n\nThis will permanently remove the department record. Any assigned courses and teachers will be unlinked safely.\n\nContinue?`
  );
  if (!confirmed) return;
  try {
    const res = await deleteDepartment(auth.token.value, dept.department_id, true);
    showSuccess(res.message || 'Department permanently deleted.');
    await loadDepartmentsList();
    await loadCoursesList();
    await loadTeachers();
  } catch (err) {
    showError(err.message || 'Failed to permanently delete department.');
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

const startEditCourse = (course) => {
  editCourseForm.value = {
    course_id: course.course_id,
    courseName: course.course_name,
    courseCode: course.course_code || '',
    teacherId: course.teacher_id ? String(course.teacher_id) : '',
    departmentId: course.department_id ? String(course.department_id) : '',
    status: course.status || 'active'
  };
  showEditCourseModal.value = true;
};

const cancelEditCourse = () => {
  showEditCourseModal.value = false;
  editCourseForm.value = { course_id: null, courseName: '', courseCode: '', teacherId: '', departmentId: '', status: 'active' };
};

const handleUpdateCourse = async () => {
  if (!editCourseForm.value.courseName) {
    showError('Course name is required.');
    return;
  }
  isUpdatingCourse.value = true;
  try {
    const res = await updateAdminCourse(auth.token.value, editCourseForm.value.course_id, {
      courseName: editCourseForm.value.courseName.trim(),
      courseCode: editCourseForm.value.courseCode.trim() || undefined,
      teacherId: editCourseForm.value.teacherId || null,
      departmentId: editCourseForm.value.departmentId || null,
      status: editCourseForm.value.status
    });
    showSuccess(res.message || 'Course updated successfully!');
    showEditCourseModal.value = false;
    await loadCoursesList();
  } catch (err) {
    showError(err.message || 'Failed to update course.');
  } finally {
    isUpdatingCourse.value = false;
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

const handleEnrollStudentInModal = async () => {
  if (!enrollStudentForm.value.email || !enrollStudentForm.value.email.includes('@')) {
    showError('Please enter a valid student email address.');
    return;
  }
  isEnrollingStudent.value = true;
  try {
    const res = await enrollStudentInCourse(
      auth.token.value,
      selectedCourseRoster.value.course.course_id,
      {
        email: enrollStudentForm.value.email.trim(),
        name: enrollStudentForm.value.name.trim() || undefined
      }
    );
    showSuccess(res.message || 'Student enrolled successfully!');
    enrollStudentForm.value = { email: '', name: '' };
    showEnrollStudentForm.value = false;
    const rosterRes = await fetchCourseRoster(auth.token.value, selectedCourseRoster.value.course.course_id);
    selectedCourseRoster.value = rosterRes.data;
    await loadCoursesList();
  } catch (err) {
    showError(err.message || 'Failed to enroll student.');
  } finally {
    isEnrollingStudent.value = false;
  }
};

const handleUnenrollStudentInModal = async (student) => {
  const confirmed = confirm(
    `Unenroll student "${student.user_name || student.enrolled_name || student.email}" from course "${selectedCourseRoster.value?.course?.course_name}"?`
  );
  if (!confirmed) return;
  isUnenrollingStudentId.value = student.student_id;
  try {
    const res = await unenrollStudentFromCourse(
      auth.token.value,
      selectedCourseRoster.value.course.course_id,
      student.student_id
    );
    showSuccess(res.message || 'Student unenrolled from course.');
    const rosterRes = await fetchCourseRoster(auth.token.value, selectedCourseRoster.value.course.course_id);
    selectedCourseRoster.value = rosterRes.data;
    await loadCoursesList();
  } catch (err) {
    showError(err.message || 'Failed to unenroll student.');
  } finally {
    isUnenrollingStudentId.value = null;
  }
};

const handleAssignTeacherToDeptInModal = async () => {
  if (!deptAssignTeacherId.value || !selectedDeptMembers.value?.department?.department_id) {
    showError('Please select a teacher to assign to this department.');
    return;
  }
  isAssigningDeptTeacher.value = true;
  try {
    await updateTeacherDepartment(auth.token.value, deptAssignTeacherId.value, selectedDeptMembers.value.department.department_id);
    showSuccess('Teacher assigned to department successfully.');
    deptAssignTeacherId.value = '';
    const res = await fetchDepartmentMembers(auth.token.value, selectedDeptMembers.value.department.department_id);
    selectedDeptMembers.value = res.data;
    await loadDepartmentsList();
    await loadTeachers();
  } catch (err) {
    showError(err.message || 'Failed to assign teacher.');
  } finally {
    isAssigningDeptTeacher.value = false;
  }
};

const handleRemoveTeacherFromDeptInModal = async (teacher) => {
  const confirmed = confirm(`Remove ${teacher.name} from department "${selectedDeptMembers.value?.department?.name}"?`);
  if (!confirmed) return;
  try {
    await updateTeacherDepartment(auth.token.value, teacher.user_id, null);
    showSuccess(`Removed ${teacher.name} from department.`);
    const res = await fetchDepartmentMembers(auth.token.value, selectedDeptMembers.value.department.department_id);
    selectedDeptMembers.value = res.data;
    await loadDepartmentsList();
    await loadTeachers();
  } catch (err) {
    showError(err.message || 'Failed to remove teacher from department.');
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

// Load Teacher Assigned Courses & Complete Overview (for Educator role)
const loadTeacherData = async () => {
  teacherLoading.value = true;
  try {
    const res = await fetchTeacherOverview(auth.token.value);
    const data = res.data || {};
    teacherCourses.value = data.courses || [];
    teacherDrafts.value = data.drafts || [];
    teacherPublished.value = data.published || [];
    teacherReviewQueue.value = data.reviewQueue || [];
    teacherFlaggedCount.value = data.flaggedCount || 0;
    teacherExports.value = data.recentExports || [];
    teacherAiFailures.value = data.recentAiFailures || [];
    teacherDepartments.value = data.departments || [];
    if (data.stats) {
      educatorDashboardStats.value = data.stats;
    }
  } catch (err) {
    console.warn('Error fetching teacher overview, falling back to courses:', err);
    try {
      const fallback = await fetchTeacherCourses(auth.token.value);
      teacherCourses.value = fallback.data?.courses || [];
    } catch (cErr) {
      console.error('Error fetching teacher fallback courses:', cErr);
    }
  } finally {
    teacherLoading.value = false;
  }
};

const filteredReviewQueue = computed(() => {
  if (reviewFilter.value === 'FLAGGED') {
    return teacherReviewQueue.value.filter(a => a.is_flagged);
  }
  return teacherReviewQueue.value;
});

const handleCreateTeacherCourse = async () => {
  if (!teacherNewCourseForm.value.courseName) return;
  isCreatingTeacherCourse.value = true;
  try {
    const res = await createTeacherCourse(auth.token.value, teacherNewCourseForm.value);
    triggerCopyToast(res.message || 'Course created successfully!');
    teacherNewCourseForm.value = { courseName: '', courseCode: '', departmentId: '' };
    showTeacherNewCourseModal.value = false;
    await loadTeacherData();
  } catch (err) {
    triggerCopyToast(err.message || 'Failed to create course.');
  } finally {
    isCreatingTeacherCourse.value = false;
  }
};

const handlePublishDraft = async (assessmentId) => {
  isPublishingDraftId.value = assessmentId;
  try {
    const res = await publishAssessment(auth.token.value, assessmentId);
    triggerCopyToast(res.message || 'Assessment published successfully!');
    await loadTeacherData();
  } catch (err) {
    triggerCopyToast(err.message || 'Failed to publish assessment.');
  } finally {
    isPublishingDraftId.value = null;
  }
};

const handleRevertToDraft = async (assessmentId) => {
  try {
    const res = await revertAssessmentDraft(auth.token.value, assessmentId);
    triggerCopyToast(res.message || 'Quiz moved to Draft status.');
    await loadTeacherData();
  } catch (err) {
    triggerCopyToast(err.message || 'Failed to revert quiz.');
  }
};

const handleDeleteDraft = async (assessmentId) => {
  if (!confirm('Are you sure you want to discard this draft assessment?')) return;
  try {
    const res = await deleteDraftAssessment(auth.token.value, assessmentId);
    triggerCopyToast(res.message || 'Draft discarded.');
    await loadTeacherData();
  } catch (err) {
    triggerCopyToast(err.message || 'Failed to delete draft.');
  }
};

const openReviewModal = (attempt) => {
  selectedReviewAttempt.value = attempt;
  reviewForm.value = {
    score: attempt.score,
    feedback: attempt.teacher_notes || '',
    clearFlag: true
  };
  showReviewAttemptModal.value = true;
};

const handleFinalizeReview = async () => {
  if (!selectedReviewAttempt.value) return;
  isSubmittingReview.value = true;
  try {
    const res = await reviewStudentAttempt(
      auth.token.value,
      selectedReviewAttempt.value.attempt_id,
      reviewForm.value
    );
    triggerCopyToast(res.message || 'Student attempt reviewed and grade released.');
    showReviewAttemptModal.value = false;
    selectedReviewAttempt.value = null;
    await loadTeacherData();
  } catch (err) {
    triggerCopyToast(err.message || 'Failed to finalize review.');
  } finally {
    isSubmittingReview.value = false;
  }
};

const openExportModal = (quiz = null) => {
  exportForm.value = {
    assessmentTitle: quiz ? quiz.title : (teacherPublished.value[0]?.title || 'Curriculum Assessment Paper'),
    format: 'PDF',
    courseCode: quiz?.course_code || 'CRS'
  };
  showExportQuizModal.value = true;
};

const handleGenerateExport = async () => {
  isCreatingExport.value = true;
  try {
    const res = await createQuizExport(auth.token.value, exportForm.value);
    triggerCopyToast(res.message || 'Export generated successfully!');
    
    // Trigger download in browser
    const content = `AutoQuiz Pro Export Package\nTitle: ${exportForm.value.assessmentTitle}\nFormat: ${exportForm.value.format}\nGenerated At: ${new Date().toLocaleString()}\nInstitution: ${auth.user.value?.universityName || 'PTUT'}\nTeacher: ${auth.user.value?.name}\n`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${exportForm.value.assessmentTitle.toLowerCase().replace(/[^a-z0-9]/g, '-')}.${exportForm.value.format.toLowerCase()}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showExportQuizModal.value = false;
    await loadTeacherData();
  } catch (err) {
    triggerCopyToast(err.message || 'Failed to generate export.');
  } finally {
    isCreatingExport.value = false;
  }
};

const handleRetryAiFailure = async (failureId) => {
  retryingFailureId.value = failureId;
  try {
    const res = await retryAiFailure(auth.token.value, failureId);
    triggerCopyToast(res.message || 'AI task retried successfully.');
    await loadTeacherData();
  } catch (err) {
    triggerCopyToast(err.message || 'Retry failed.');
  } finally {
    retryingFailureId.value = null;
  }
};

const handleDismissAiFailure = async (failureId) => {
  try {
    const res = await dismissAiFailure(auth.token.value, failureId);
    triggerCopyToast(res.message || 'AI alert dismissed.');
    await loadTeacherData();
  } catch (err) {
    triggerCopyToast(err.message || 'Failed to dismiss alert.');
  }
};

const openInspectQuizModal = (quiz) => {
  selectedInspectQuiz.value = quiz;
  showInspectQuizModal.value = true;
};

// ==============================================================================
// TEACHER COURSE HUB & ROSTER MANAGEMENT METHODS
// ==============================================================================

const filteredTeacherCourses = computed(() => {
  if (!courseSearchQuery.value.trim()) return teacherCourses.value;
  const q = courseSearchQuery.value.toLowerCase().trim();
  return teacherCourses.value.filter(c => {
    return (c.course_name && c.course_name.toLowerCase().includes(q)) ||
           (c.course_code && c.course_code.toLowerCase().includes(q)) ||
           (c.department_name && c.department_name.toLowerCase().includes(q));
  });
});

const openCourseHub = async (course) => {
  selectedCourseHub.value = course;
  courseHubTab.value = 'students';
  await loadCourseHubData(course.course_id);
};

const closeCourseHub = () => {
  selectedCourseHub.value = null;
  studentRosterSearch.value = '';
};

const loadCourseHubData = async (courseId) => {
  isLoadingCourseHub.value = true;
  try {
    const res = await fetchCourseHub(auth.token.value, courseId);
    courseHubData.value = res.data || {
      course: null,
      students: [],
      materials: [],
      assessments: [],
      results: [],
      analytics: {},
      approvedDomains: []
    };
  } catch (err) {
    triggerCopyToast(err.message || 'Failed to load course details.');
  } finally {
    isLoadingCourseHub.value = false;
  }
};

const filteredCourseStudents = computed(() => {
  const list = courseHubData.value?.students || [];
  if (!studentRosterSearch.value.trim()) return list;
  const q = studentRosterSearch.value.toLowerCase().trim();
  return list.filter(s => {
    return (s.name && s.name.toLowerCase().includes(q)) ||
           (s.roll_number && s.roll_number.toLowerCase().includes(q)) ||
           (s.email && s.email.toLowerCase().includes(q));
  });
});

const singleDomainWarning = computed(() => {
  const em = (singleStudentForm.value.email || '').trim().toLowerCase();
  if (!em || !em.includes('@')) return null;
  const domain = em.split('@')[1];
  const consumerDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'mail.com', 'live.com', 'aol.com'];
  if (consumerDomains.includes(domain)) {
    return `Non-institutional consumer domain detected (@${domain}). Official university student email (e.g. @students.ptut.edu.pk) recommended.`;
  }
  return null;
});

const handleEnrollSingleStudent = async () => {
  if (!selectedCourseHub.value) return;
  isEnrollingSingle.value = true;
  try {
    const res = await enrollSingleStudent(auth.token.value, selectedCourseHub.value.course_id, singleStudentForm.value);
    triggerCopyToast(res.message || 'Student enrolled successfully!');
    singleStudentForm.value = { name: '', rollNumber: '', email: '' };
    showSingleStudentModal.value = false;
    await loadCourseHubData(selectedCourseHub.value.course_id);
    await loadTeacherData();
  } catch (err) {
    triggerCopyToast(err.message || 'Failed to enroll student.');
  } finally {
    isEnrollingSingle.value = false;
  }
};

const parseBulkInput = () => {
  const text = bulkPasteText.value.trim();
  if (!text) {
    bulkParsedRows.value = [];
    bulkDuplicatesCount.value = 0;
    bulkInvalidCount.value = 0;
    bulkNonInstitutionalCount.value = 0;
    return;
  }

  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  const rows = [];
  const seenEmails = new Set();
  const consumerDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'mail.com', 'live.com', 'aol.com'];
  
  let dups = 0;
  let invalids = 0;
  let nonInst = 0;

  for (const line of lines) {
    // Skip header line if detected
    if (/name.*roll.*email/i.test(line) || /student.*roll/i.test(line)) continue;

    const parts = line.includes('\t') ? line.split('\t') : line.split(',');
    if (parts.length < 3) {
      invalids++;
      continue;
    }

    const name = parts[0].trim();
    const rollNumber = parts[1].trim().toUpperCase();
    const email = parts[2].trim().toLowerCase();

    const isValidEmail = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
    if (!name || !rollNumber || !isValidEmail) {
      invalids++;
      continue;
    }

    if (seenEmails.has(email)) {
      dups++;
      continue;
    }
    seenEmails.add(email);

    const domain = email.split('@')[1];
    const isNonInst = consumerDomains.includes(domain);
    if (isNonInst) nonInst++;

    rows.push({
      name,
      rollNumber,
      email,
      isNonInstitutional: isNonInst
    });
  }

  bulkParsedRows.value = rows;
  bulkDuplicatesCount.value = dups;
  bulkInvalidCount.value = invalids;
  bulkNonInstitutionalCount.value = nonInst;
};

const handleCSVFileUpload = (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    bulkPasteText.value = e.target.result;
    parseBulkInput();
  };
  reader.readAsText(file);
};

const handleEnrollBulkStudents = async () => {
  if (!selectedCourseHub.value || bulkParsedRows.value.length === 0) return;
  isEnrollingBulk.value = true;
  try {
    const res = await enrollBulkStudents(
      auth.token.value,
      selectedCourseHub.value.course_id,
      bulkParsedRows.value
    );
    triggerCopyToast(res.message || 'Bulk student enrollment complete!');
    bulkPasteText.value = '';
    bulkParsedRows.value = [];
    showBulkStudentModal.value = false;
    await loadCourseHubData(selectedCourseHub.value.course_id);
    await loadTeacherData();
  } catch (err) {
    triggerCopyToast(err.message || 'Bulk enrollment failed.');
  } finally {
    isEnrollingBulk.value = false;
  }
};

const openEditStudentModal = (student) => {
  editStudentForm.value = {
    student_id: student.student_id,
    name: student.name,
    rollNumber: student.roll_number,
    email: student.email
  };
  showEditStudentModal.value = true;
};

const handleUpdateStudent = async () => {
  if (!selectedCourseHub.value || !editStudentForm.value.student_id) return;
  isUpdatingStudent.value = true;
  try {
    const res = await updateCourseStudent(
      auth.token.value,
      selectedCourseHub.value.course_id,
      editStudentForm.value.student_id,
      editStudentForm.value
    );
    triggerCopyToast(res.message || 'Student updated successfully.');
    showEditStudentModal.value = false;
    await loadCourseHubData(selectedCourseHub.value.course_id);
  } catch (err) {
    triggerCopyToast(err.message || 'Failed to update student.');
  } finally {
    isUpdatingStudent.value = false;
  }
};

const handleInitiateRemoveStudent = async (student) => {
  if (!selectedCourseHub.value) return;
  isCheckingAttempts.value = true;
  studentToRemove.value = student;
  try {
    const res = await checkStudentAttempts(
      auth.token.value,
      selectedCourseHub.value.course_id,
      student.student_id
    );
    studentAttemptsCheck.value = res.data || { hasAttempts: false, attemptCount: 0 };
    
    if (res.data?.hasAttempts && res.data?.attemptCount > 0) {
      // Student has attempts: show Decision Modal
      removalResolutionChoice.value = 'archive';
      showRemoveDecisionModal.value = true;
    } else {
      // Student has no attempts: direct confirmation
      if (confirm(`Unenroll student "${student.name}" (${student.roll_number}) from this course?`)) {
        await unenrollCourseStudent(auth.token.value, selectedCourseHub.value.course_id, student.student_id, 'archive');
        triggerCopyToast(`Removed "${student.name}" from course roster.`);
        await loadCourseHubData(selectedCourseHub.value.course_id);
        await loadTeacherData();
      }
    }
  } catch (err) {
    triggerCopyToast(err.message || 'Error checking student attempts.');
  } finally {
    isCheckingAttempts.value = false;
  }
};

const handleConfirmStudentRemoval = async () => {
  if (!selectedCourseHub.value || !studentToRemove.value) return;
  isRemovingStudent.value = true;
  try {
    const res = await unenrollCourseStudent(
      auth.token.value,
      selectedCourseHub.value.course_id,
      studentToRemove.value.student_id,
      removalResolutionChoice.value
    );
    triggerCopyToast(res.message || 'Student unenrollment processed.');
    showRemoveDecisionModal.value = false;
    studentToRemove.value = null;
    await loadCourseHubData(selectedCourseHub.value.course_id);
    await loadTeacherData();
  } catch (err) {
    triggerCopyToast(err.message || 'Failed to process student removal.');
  } finally {
    isRemovingStudent.value = false;
  }
};

const handleAddCourseMaterial = async () => {
  if (!selectedCourseHub.value || !materialForm.value.title) return;
  isAddingMaterial.value = true;
  try {
    const res = await addCourseMaterial(
      auth.token.value,
      selectedCourseHub.value.course_id,
      materialForm.value
    );
    triggerCopyToast(res.message || 'Material added successfully.');
    materialForm.value = { title: '', fileName: '', sourceType: 'PDF' };
    showAddMaterialModal.value = false;
    await loadCourseHubData(selectedCourseHub.value.course_id);
  } catch (err) {
    triggerCopyToast(err.message || 'Failed to add material.');
  } finally {
    isAddingMaterial.value = false;
  }
};

const handleDeleteCourseMaterial = async (materialId) => {
  if (!confirm('Delete this course material?')) return;
  try {
    await deleteCourseMaterial(auth.token.value, selectedCourseHub.value.course_id, materialId);
    triggerCopyToast('Course material deleted.');
    await loadCourseHubData(selectedCourseHub.value.course_id);
  } catch (err) {
    triggerCopyToast(err.message || 'Failed to delete material.');
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
          <button :class="['sidebar-nav-item', activeSection === 'dashboard' && teacherActiveTab === 'COURSES' && 'active']" @click="activeSection = 'dashboard'; teacherActiveTab = 'COURSES'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="nav-icon">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
            <span v-if="!sidebarCollapsed">Overview</span>
          </button>
          <button :class="['sidebar-nav-item', (activeSection === 'courses' || (activeSection === 'dashboard' && teacherActiveTab === 'COURSES')) && 'active']" @click="activeSection = 'dashboard'; teacherActiveTab = 'COURSES'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="nav-icon">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
            </svg>
            <span v-if="!sidebarCollapsed">My Courses</span>
            <span v-if="!sidebarCollapsed && teacherCourses.length > 0" class="sidebar-badge-count sidebar-badge-blue">{{ teacherCourses.length }}</span>
          </button>
          <button :class="['sidebar-nav-item', activeSection === 'dashboard' && teacherActiveTab === 'DRAFTS' && 'active']" @click="activeSection = 'dashboard'; teacherActiveTab = 'DRAFTS'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="nav-icon">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            <span v-if="!sidebarCollapsed">Draft Assessments</span>
            <span v-if="!sidebarCollapsed && teacherDrafts.length > 0" class="sidebar-badge-count">{{ teacherDrafts.length }}</span>
          </button>
          <button :class="['sidebar-nav-item', activeSection === 'dashboard' && teacherActiveTab === 'PUBLISHED' && 'active']" @click="activeSection = 'dashboard'; teacherActiveTab = 'PUBLISHED'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="nav-icon">
              <circle cx="12" cy="12" r="10"/>
              <polygon points="10 8 16 12 10 16 10 8"/>
            </svg>
            <span v-if="!sidebarCollapsed">Published Quizzes</span>
            <span v-if="!sidebarCollapsed && teacherPublished.length > 0" class="sidebar-badge-count sidebar-badge-blue">{{ teacherPublished.length }}</span>
          </button>
          <button :class="['sidebar-nav-item', activeSection === 'dashboard' && teacherActiveTab === 'REVIEWS' && 'active']" @click="activeSection = 'dashboard'; teacherActiveTab = 'REVIEWS'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="nav-icon">
              <path d="M9 11l3 3L22 4"/>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
            <span v-if="!sidebarCollapsed">Review Submissions</span>
            <span v-if="!sidebarCollapsed && teacherFlaggedCount > 0" class="sidebar-badge-count text-danger" title="Flagged attempts">{{ teacherFlaggedCount }} ⚠️</span>
          </button>
          <button :class="['sidebar-nav-item', activeSection === 'dashboard' && teacherActiveTab === 'EXPORTS_AI' && 'active']" @click="activeSection = 'dashboard'; teacherActiveTab = 'EXPORTS_AI'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="nav-icon">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span v-if="!sidebarCollapsed">Exports &amp; AI Health</span>
            <span v-if="!sidebarCollapsed && teacherAiFailures.filter(f => f.status !== 'RESOLVED').length > 0" class="sidebar-badge-count text-amber">!</span>
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
        <!-- Banner Card -->
        <div class="glass-card banner-card">
          <div class="badge badge-info">
            <span class="badge-dot"></span> {{ auth.user.value?.universityName || 'Academic Faculty' }}
          </div>
          <h2 class="banner-title">Educator Studio &bull; {{ auth.user.value?.name }}</h2>
          <p class="banner-text">
            Manage your courses, draft &amp; published assessments, review student submissions with proctoring flags, export evaluation packages, and monitor AI generation health.
          </p>
        </div>

        <!-- Shortcuts Bar: New Course, New Assessment, Quick Export, Review Queue -->
        <div class="glass-card quick-action-bar">
          <div class="quick-action-info">
            <h4 class="quick-action-title">Educator Action Shortcuts</h4>
            <p class="quick-action-sub">Quickly launch new courses, design assessments, export test papers, or clear pending reviews.</p>
          </div>
          <div class="quick-action-buttons">
            <button class="btn btn-primary btn-sm" @click="showTeacherNewCourseModal = true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              + New Course
            </button>
            <router-link to="/assessments/create" class="btn btn-primary btn-sm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
              </svg>
              + New Assessment
            </router-link>
            <button class="btn btn-secondary btn-sm" @click="openExportModal()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Quick Export
            </button>
            <button class="btn btn-secondary btn-sm" @click="teacherActiveTab = 'REVIEWS'">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
                <path d="M9 11l3 3L22 4"/>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
              </svg>
              Reviews ({{ teacherReviewQueue.length }})
              <span v-if="teacherFlaggedCount > 0" class="badge-mini-danger ml-1">{{ teacherFlaggedCount }} Flagged</span>
            </button>
          </div>
        </div>

        <!-- Metric Stat Cards -->
        <div class="grid-cards">
          <div class="glass-card stat-card" @click="teacherActiveTab = 'COURSES'">
            <div class="stat-number text-blue">{{ educatorDashboardStats.coursesCount }}</div>
            <div class="stat-label">My Courses</div>
            <p class="stat-hint">Assigned &amp; created curriculum classes</p>
          </div>

          <div class="glass-card stat-card" @click="teacherActiveTab = 'DRAFTS'">
            <div class="stat-number text-amber">{{ educatorDashboardStats.draftsCount }}</div>
            <div class="stat-label">Draft Assessments</div>
            <p class="stat-hint">Saved internally for educator revision</p>
          </div>

          <div class="glass-card stat-card" @click="teacherActiveTab = 'PUBLISHED'">
            <div class="stat-number text-success">{{ educatorDashboardStats.publishedCount }}</div>
            <div class="stat-label">Published Quizzes</div>
            <p class="stat-hint">Live &amp; active tests available to students</p>
          </div>

          <div class="glass-card stat-card" @click="teacherActiveTab = 'REVIEWS'">
            <div class="stat-number" :class="{ 'text-danger': educatorDashboardStats.flaggedCount > 0 }">
              {{ educatorDashboardStats.waitingReviewCount }}
            </div>
            <div class="stat-label">Waiting for Review</div>
            <p class="stat-hint">
              <span v-if="educatorDashboardStats.flaggedCount > 0" class="text-danger font-bold">⚠️ {{ educatorDashboardStats.flaggedCount }} flagged</span>
              <span v-else>0 flagged for integrity</span>
              &bull; Needs grade release
            </p>
          </div>
        </div>

        <!-- Teacher Navigation Tabs -->
        <div class="admin-tabs mt-4">
          <button
            :class="['admin-tab-btn', teacherActiveTab === 'COURSES' && 'active']"
            @click="teacherActiveTab = 'COURSES'"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tab-icon">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
            </svg>
            My Courses ({{ teacherCourses.length }})
          </button>
          <button
            :class="['admin-tab-btn', teacherActiveTab === 'DRAFTS' && 'active']"
            @click="teacherActiveTab = 'DRAFTS'"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tab-icon">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            Draft Assessments ({{ teacherDrafts.length }})
          </button>
          <button
            :class="['admin-tab-btn', teacherActiveTab === 'PUBLISHED' && 'active']"
            @click="teacherActiveTab = 'PUBLISHED'"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tab-icon">
              <circle cx="12" cy="12" r="10"/>
              <polygon points="10 8 16 12 10 16 10 8"/>
            </svg>
            Published Quizzes ({{ teacherPublished.length }})
          </button>
          <button
            :class="['admin-tab-btn', teacherActiveTab === 'REVIEWS' && 'active']"
            @click="teacherActiveTab = 'REVIEWS'"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tab-icon">
              <path d="M9 11l3 3L22 4"/>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
            Waiting Review ({{ teacherReviewQueue.length }})
            <span v-if="teacherFlaggedCount > 0" class="badge-mini-danger">⚠️ {{ teacherFlaggedCount }} Flagged</span>
          </button>
          <button
            :class="['admin-tab-btn', teacherActiveTab === 'EXPORTS_AI' && 'active']"
            @click="teacherActiveTab = 'EXPORTS_AI'"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tab-icon">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Exports &amp; AI Failures ({{ teacherExports.length }})
            <span v-if="teacherAiFailures.filter(f => f.status !== 'RESOLVED').length > 0" class="badge-mini-amber">
              {{ teacherAiFailures.filter(f => f.status !== 'RESOLVED').length }} AI Alerts
            </span>
          </button>
        </div>

        <!-- ============================================== -->
        <!-- TAB 1: MY COURSES & DEDICATED COURSE PAGE (HUB)-->
        <!-- ============================================== -->
        <div v-if="teacherActiveTab === 'COURSES'" class="tab-content-panel mt-3">
          <!-- SUB-VIEW A: ALL COURSES DIRECTORY (when no course selected) -->
          <div v-if="!selectedCourseHub">
            <div class="section-top-row">
              <div>
                <h3 class="section-title">My Courses ({{ teacherCourses.length }})</h3>
                <p class="section-desc">Curriculum modules assigned to you or created under your educator profile. Click any course to open its full Course Page.</p>
              </div>
              <div class="action-btn-group">
                <button class="btn btn-primary btn-sm" @click="showTeacherNewCourseModal = true">
                  + New Course
                </button>
                <button class="btn btn-secondary btn-sm" @click="loadTeacherData">
                  Refresh
                </button>
              </div>
            </div>

            <!-- Course Search Filter Input -->
            <div class="search-filter-row mb-4">
              <div class="search-input-wrap flex-1">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="search-icon">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  type="text"
                  v-model="courseSearchQuery"
                  class="search-input"
                  placeholder="Search courses by name (e.g. Information Security), code (e.g. ST-101), or department..."
                />
                <button v-if="courseSearchQuery" class="clear-search-btn" @click="courseSearchQuery = ''">&times;</button>
              </div>
              <span v-if="courseSearchQuery" class="badge-mini-count">
                {{ filteredTeacherCourses.length }} of {{ teacherCourses.length }} courses
              </span>
            </div>

            <!-- Empty Courses State -->
            <div v-if="!teacherLoading && teacherCourses.length === 0" class="glass-card empty-dashboard-card">
              <div class="empty-icon-circle">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
                  <path d="M6 6h10M6 10h10"/>
                </svg>
              </div>
              <h3 class="empty-title">No Courses Assigned Yet</h3>
              <p class="empty-desc">
                You haven't been assigned any courses yet. Use the <strong>+ New Course</strong> shortcut to register a course.
              </p>
              <button class="btn btn-primary" @click="showTeacherNewCourseModal = true">+ Create New Course</button>
            </div>

            <!-- Search No Results State -->
            <div v-else-if="filteredTeacherCourses.length === 0" class="glass-card empty-dashboard-card">
              <h3 class="empty-title">No Courses Match "{{ courseSearchQuery }}"</h3>
              <p class="empty-desc">Try searching for a different course name or course code.</p>
              <button class="btn btn-secondary" @click="courseSearchQuery = ''">Clear Search Filter</button>
            </div>

            <!-- Active Courses Grid -->
            <div v-else class="grid-cards">
              <div v-for="c in filteredTeacherCourses" :key="c.course_id" class="glass-card course-card">
                <div class="course-header">
                  <span class="course-badge font-bold">{{ c.course_code || 'CRS' }}</span>
                  <span class="student-count">{{ c.student_count || 0 }} Students</span>
                </div>
                <h4 class="course-name">{{ c.course_name }}</h4>
                <p class="course-meta">{{ c.department_name || 'Academic Department' }}</p>
                <div class="course-actions">
                  <button
                    class="btn btn-primary btn-block btn-sm"
                    @click="openCourseHub(c)"
                  >
                    🚀 Open Course Page (Hub)
                  </button>
                  <router-link
                    :to="`/assessments/create?courseId=${c.course_id}`"
                    class="btn btn-secondary btn-block btn-sm"
                  >
                    + Create Assessment for Course
                  </router-link>
                </div>
              </div>
            </div>
          </div>

          <!-- SUB-VIEW B: DEDICATED COURSE PAGE (HUB) WITH 4 TABS -->
          <div v-else class="course-hub-page">
            <!-- Breadcrumbs / Back Bar -->
            <div class="course-hub-nav-bar mb-3">
              <button class="btn btn-secondary btn-sm" @click="closeCourseHub">
                &larr; Back to All Courses
              </button>
              <div class="course-hub-breadcrumb text-sm text-muted">
                Educator Studio &bull; <strong>{{ selectedCourseHub.course_name }}</strong> ({{ selectedCourseHub.course_code || 'CRS' }})
              </div>
            </div>

            <!-- Course Header Summary Card -->
            <div class="glass-card course-hub-header-card mb-4">
              <div class="course-hub-header-left">
                <div class="badge badge-info mb-2">
                  <span class="badge-dot"></span> {{ courseHubData.course?.department_name || selectedCourseHub.department_name || 'Academic Department' }}
                </div>
                <h2 class="course-hub-title">
                  {{ selectedCourseHub.course_name }}
                  <span class="code-mono course-code-badge ml-2">{{ selectedCourseHub.course_code }}</span>
                </h2>
                <p class="course-hub-desc text-muted">
                  Curriculum Module &bull; {{ courseHubData.students?.length || 0 }} Enrolled Students &bull; {{ courseHubData.assessments?.length || 0 }} Course Assessments
                </p>
              </div>
              <div class="course-hub-header-stats">
                <div class="hub-stat-item">
                  <span class="hub-stat-val text-blue">{{ courseHubData.students?.length || 0 }}</span>
                  <span class="hub-stat-lbl">Enrolled Students</span>
                </div>
                <div class="hub-stat-item">
                  <span class="hub-stat-val text-amber">{{ courseHubData.assessments?.length || 0 }}</span>
                  <span class="hub-stat-lbl">Assessments</span>
                </div>
                <div class="hub-stat-item">
                  <span class="hub-stat-val text-success">{{ courseHubData.analytics?.passRate || 0 }}%</span>
                  <span class="hub-stat-lbl">Class Pass Rate</span>
                </div>
              </div>
            </div>

            <!-- Course Page 4 Tabs Navigation -->
            <div class="admin-tabs mb-4">
              <button
                :class="['admin-tab-btn', courseHubTab === 'students' && 'active']"
                @click="courseHubTab = 'students'"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tab-icon">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                1. Students &amp; Roster ({{ courseHubData.students?.length || 0 }})
              </button>

              <button
                :class="['admin-tab-btn', courseHubTab === 'materials' && 'active']"
                @click="courseHubTab = 'materials'"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tab-icon">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                </svg>
                2. Materials ({{ courseHubData.materials?.length || 0 }})
              </button>

              <button
                :class="['admin-tab-btn', courseHubTab === 'assessments' && 'active']"
                @click="courseHubTab = 'assessments'"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tab-icon">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                3. Assessments ({{ courseHubData.assessments?.length || 0 }})
              </button>

              <button
                :class="['admin-tab-btn', courseHubTab === 'results' && 'active']"
                @click="courseHubTab = 'results'"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tab-icon">
                  <line x1="18" y1="20" x2="18" y2="10"/>
                  <line x1="12" y1="20" x2="12" y2="4"/>
                  <line x1="6" y1="20" x2="6" y2="14"/>
                </svg>
                4. Results &amp; Analytics ({{ courseHubData.results?.length || 0 }})
              </button>
            </div>

            <!-- ============================================== -->
            <!-- COURSE HUB TAB 1: STUDENTS & ROSTER            -->
            <!-- ============================================== -->
            <div v-if="courseHubTab === 'students'" class="course-hub-tab-panel">
              <div class="section-top-row">
                <div>
                  <h4 class="section-title">Enrolled Student Roster ({{ courseHubData.students?.length || 0 }})</h4>
                  <p class="section-desc">Manage enrolled student university emails, track sign-in status, and maintain student records.</p>
                </div>
                <div class="action-btn-group">
                  <button class="btn btn-primary btn-sm" @click="showSingleStudentModal = true">
                    + Add Student
                  </button>
                  <button class="btn btn-secondary btn-sm" @click="showBulkStudentModal = true">
                    📥 Bulk Enroll (Paste / CSV)
                  </button>
                </div>
              </div>

              <!-- Roster Status Summary Bar -->
              <div class="roster-status-strip mb-3 p-3 bg-white rounded border flex items-center justify-between flex-wrap gap-2">
                <div class="flex items-center gap-3 text-xs">
                  <span class="font-bold text-gray-700">Roster Status:</span>
                  <span class="badge badge-success">
                    <span class="badge-dot"></span> {{ courseHubData.analytics?.signedInCount || 0 }} Signed In
                  </span>
                  <span class="badge badge-warning">
                    <span class="badge-dot"></span> {{ courseHubData.analytics?.neverSignedInCount || 0 }} Never Signed In
                  </span>
                  <span v-if="courseHubData.analytics?.nonInstitutionalCount > 0" class="badge-mini-danger font-bold">
                    ⚠️ {{ courseHubData.analytics?.nonInstitutionalCount }} Non-Institutional Domain Warning
                  </span>
                </div>
                <div class="search-input-wrap text-xs">
                  <input
                    type="text"
                    v-model="studentRosterSearch"
                    placeholder="Filter roster by name, roll, email..."
                    class="search-input py-1 text-xs"
                  />
                </div>
              </div>

              <!-- Empty Students State -->
              <div v-if="!isLoadingCourseHub && courseHubData.students?.length === 0" class="glass-card empty-dashboard-card">
                <div class="empty-icon-circle">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                  </svg>
                </div>
                <h3 class="empty-title">No Students Enrolled in this Course Yet</h3>
                <p class="empty-desc">Add university student emails individually or in bulk using a pasted list or CSV.</p>
                <div class="action-btn-group justify-center">
                  <button class="btn btn-primary" @click="showSingleStudentModal = true">+ Add Student</button>
                  <button class="btn btn-secondary" @click="showBulkStudentModal = true">📥 Bulk Enroll from List/CSV</button>
                </div>
              </div>

              <!-- Students Table -->
              <div v-else class="table-responsive glass-card p-0">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Student Name</th>
                      <th>Roll Number</th>
                      <th>University Email</th>
                      <th>Domain Validation</th>
                      <th>Account Sign-In Status</th>
                      <th>Attempts</th>
                      <th class="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="s in filteredCourseStudents" :key="s.student_id">
                      <td>
                        <div class="student-name font-bold">{{ s.name }}</div>
                      </td>
                      <td>
                        <span class="code-mono font-bold">{{ s.roll_number }}</span>
                      </td>
                      <td>
                        <span class="code-mono text-sm">{{ s.email }}</span>
                      </td>
                      <td>
                        <span v-if="s.is_approved_domain" class="badge badge-success text-xs">
                          <span class="badge-dot"></span> Institutional Domain
                        </span>
                        <span v-else class="badge-mini-danger font-bold text-xs" title="Not on university approved domain">
                          ⚠️ Non-Institutional (@{{ s.email.split('@')[1] }})
                        </span>
                      </td>
                      <td>
                        <span v-if="s.has_signed_in" class="badge badge-success text-xs">
                          <span class="badge-dot"></span> Signed In / Active
                        </span>
                        <span v-else class="badge badge-warning text-xs">
                          <span class="badge-dot"></span> Never Signed In
                        </span>
                      </td>
                      <td>
                        <span :class="['badge', s.attempt_count > 0 ? 'badge-info' : 'badge-light']">
                          {{ s.attempt_count }} Attempts
                        </span>
                      </td>
                      <td class="text-right">
                        <div class="action-btn-group justify-end">
                          <button
                            class="btn btn-secondary btn-xs"
                            @click="openEditStudentModal(s)"
                            title="Edit student name, roll number, or email"
                          >
                            Edit
                          </button>
                          <button
                            class="btn btn-outline-danger btn-xs"
                            @click="handleInitiateRemoveStudent(s)"
                            title="Remove student from this course"
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- ============================================== -->
            <!-- COURSE HUB TAB 2: MATERIALS                    -->
            <!-- ============================================== -->
            <div v-if="courseHubTab === 'materials'" class="course-hub-tab-panel">
              <div class="section-top-row">
                <div>
                  <h4 class="section-title">Course Learning Materials ({{ courseHubData.materials?.length || 0 }})</h4>
                  <p class="section-desc">Upload and manage lecture slides, syllabi, reading packs, and reference notes for students.</p>
                </div>
                <button class="btn btn-primary btn-sm" @click="showAddMaterialModal = true">
                  + Add Course Material
                </button>
              </div>

              <!-- Empty Materials State -->
              <div v-if="courseHubData.materials?.length === 0" class="glass-card empty-dashboard-card">
                <div class="empty-icon-circle">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                  </svg>
                </div>
                <h3 class="empty-title">No Course Materials Uploaded Yet</h3>
                <p class="empty-desc">Share lecture slides, reading materials, and curriculum handouts with enrolled students.</p>
                <button class="btn btn-primary" @click="showAddMaterialModal = true">+ Upload First Material</button>
              </div>

              <!-- Materials Table -->
              <div v-else class="table-responsive glass-card p-0">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Material Title</th>
                      <th>File Name / Reference</th>
                      <th>Type</th>
                      <th>Uploaded Date</th>
                      <th class="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="m in courseHubData.materials" :key="m.material_id">
                      <td>
                        <div class="font-bold text-sm">{{ m.title }}</div>
                      </td>
                      <td>
                        <span class="code-mono text-xs">{{ m.file_name }}</span>
                      </td>
                      <td>
                        <span class="badge badge-info">{{ m.source_type || 'PDF' }}</span>
                      </td>
                      <td class="cell-date">{{ formatDate(m.created_at) }}</td>
                      <td class="text-right">
                        <div class="action-btn-group justify-end">
                          <button class="btn btn-secondary btn-xs" @click="triggerCopyToast(`Opening ${m.file_name}`)">
                            Download / View
                          </button>
                          <button class="btn btn-outline-danger btn-xs" @click="handleDeleteCourseMaterial(m.material_id)">
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- ============================================== -->
            <!-- COURSE HUB TAB 3: ASSESSMENTS                  -->
            <!-- ============================================== -->
            <div v-if="courseHubTab === 'assessments'" class="course-hub-tab-panel">
              <div class="section-top-row">
                <div>
                  <h4 class="section-title">Course Assessments ({{ courseHubData.assessments?.length || 0 }})</h4>
                  <p class="section-desc">Assessments and quizzes specifically assigned to this curriculum module.</p>
                </div>
                <router-link
                  :to="`/assessments/create?courseId=${selectedCourseHub.course_id}`"
                  class="btn btn-primary btn-sm"
                >
                  + Create Assessment for Course
                </router-link>
              </div>

              <!-- Empty Assessments -->
              <div v-if="courseHubData.assessments?.length === 0" class="glass-card empty-dashboard-card">
                <div class="empty-icon-circle">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
                  </svg>
                </div>
                <h3 class="empty-title">No Assessments Created for this Course</h3>
                <p class="empty-desc">Create your first AI-generated assessment quiz for this curriculum.</p>
                <router-link :to="`/assessments/create?courseId=${selectedCourseHub.course_id}`" class="btn btn-primary">
                  + Create Assessment
                </router-link>
              </div>

              <!-- Assessments Table -->
              <div v-else class="table-responsive glass-card p-0">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Assessment Title</th>
                      <th>Questions</th>
                      <th>Total Marks</th>
                      <th>Duration</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th class="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="a in courseHubData.assessments" :key="a.assessment_id">
                      <td>
                        <div class="font-bold text-sm">{{ a.title }}</div>
                      </td>
                      <td>
                        <span class="badge badge-info">{{ a.questions_count || 0 }} Items</span>
                      </td>
                      <td>{{ a.total_marks }} pts</td>
                      <td>{{ a.duration_minutes }} mins</td>
                      <td>
                        <span :class="['badge', (a.status || '').toUpperCase() === 'PUBLISHED' ? 'badge-success' : 'badge-warning']">
                          <span class="badge-dot"></span> {{ a.status }}
                        </span>
                      </td>
                      <td class="cell-date">{{ formatDate(a.created_at) }}</td>
                      <td class="text-right">
                        <button class="btn btn-secondary btn-xs" @click="openInspectQuizModal(a)">
                          Inspect
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- ============================================== -->
            <!-- COURSE HUB TAB 4: RESULTS & ANALYTICS          -->
            <!-- ============================================== -->
            <div v-if="courseHubTab === 'results'" class="course-hub-tab-panel">
              <div class="section-top-row">
                <div>
                  <h4 class="section-title">Course Examination Results &amp; Analytics</h4>
                  <p class="section-desc">Class performance overview, score distributions, and individual student attempt records.</p>
                </div>
                <button class="btn btn-secondary btn-sm" @click="openExportModal({ title: `${selectedCourseHub.course_name} Gradebook` })">
                  📥 Export Gradebook (CSV)
                </button>
              </div>

              <!-- Metrics Strip -->
              <div class="grid-cards mb-4">
                <div class="glass-card stat-card">
                  <div class="stat-number text-blue">{{ courseHubData.analytics?.totalSubmissions || 0 }}</div>
                  <div class="stat-label">Total Submissions</div>
                  <p class="stat-hint">Evaluated student exam papers</p>
                </div>
                <div class="glass-card stat-card">
                  <div class="stat-number text-success">{{ courseHubData.analytics?.averageScore || 0 }}%</div>
                  <div class="stat-label">Class Average Score</div>
                  <p class="stat-hint">Overall academic cohort average</p>
                </div>
                <div class="glass-card stat-card">
                  <div class="stat-number text-amber">{{ courseHubData.analytics?.passRate || 0 }}%</div>
                  <div class="stat-label">Pass Rate</div>
                  <p class="stat-hint">Students meeting passing criteria</p>
                </div>
              </div>

              <!-- Empty Results -->
              <div v-if="courseHubData.results?.length === 0" class="glass-card empty-dashboard-card">
                <h3 class="empty-title">No Examination Attempts Yet</h3>
                <p class="empty-desc">When students take quizzes assigned to this course, results and scorecards will automatically appear here.</p>
              </div>

              <!-- Results Table -->
              <div v-else class="table-responsive glass-card p-0">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Roll Number</th>
                      <th>Assessment</th>
                      <th>Score</th>
                      <th>Percentage</th>
                      <th>Status</th>
                      <th>Submitted Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="r in courseHubData.results" :key="r.attempt_id">
                      <td>
                        <div class="student-name font-bold">{{ r.student_name }}</div>
                      </td>
                      <td>
                        <span class="code-mono font-bold">{{ r.roll_number }}</span>
                      </td>
                      <td>{{ r.assessment_title }}</td>
                      <td>
                        <strong>{{ r.score }}</strong> / {{ r.total_marks }}
                      </td>
                      <td>
                        <span class="font-bold">{{ r.percentage }}%</span>
                      </td>
                      <td>
                        <span :class="['badge', r.status === 'PASSED' ? 'badge-success' : 'badge-danger']">
                          {{ r.status }}
                        </span>
                      </td>
                      <td class="cell-date">{{ formatDate(r.submitted_at) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <!-- ============================================== -->
        <!-- TAB 2: DRAFT ASSESSMENTS                       -->
        <!-- ============================================== -->
        <div v-if="teacherActiveTab === 'DRAFTS'" class="tab-content-panel mt-3">
          <div class="section-top-row">
            <div>
              <h3 class="section-title">Draft Assessments ({{ teacherDrafts.length }})</h3>
              <p class="section-desc">Assessments saved as drafts. Publish when ready to make them live for student participation.</p>
            </div>
            <router-link to="/assessments/create" class="btn btn-primary btn-sm">
              + New Assessment Draft
            </router-link>
          </div>

          <!-- Empty Drafts -->
          <div v-if="teacherDrafts.length === 0" class="glass-card empty-dashboard-card">
            <div class="empty-icon-circle">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
            <h3 class="empty-title">No Draft Assessments</h3>
            <p class="empty-desc">You do not have any pending assessment drafts. Start generating new assessments with AI assistance.</p>
            <router-link to="/assessments/create" class="btn btn-primary">+ Create Assessment</router-link>
          </div>

          <!-- Drafts Table -->
          <div v-else class="table-responsive glass-card p-0">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Title &amp; Module</th>
                  <th>Questions</th>
                  <th>Total Marks</th>
                  <th>Duration</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="d in teacherDrafts" :key="d.assessment_id">
                  <td>
                    <div class="course-name-cell">
                      <div class="course-main-name font-bold">{{ d.title }}</div>
                      <span class="code-mono course-code-badge">{{ d.course_code || 'CRS' }}</span>
                    </div>
                  </td>
                  <td>
                    <span class="badge badge-info">{{ Array.isArray(d.questions) ? d.questions.length : (d.questions ? JSON.parse(d.questions || '[]').length : 0) }} Questions</span>
                  </td>
                  <td>{{ d.total_marks || 100 }} pts</td>
                  <td>{{ d.duration_minutes || 60 }} mins</td>
                  <td>
                    <span class="badge badge-warning">
                      <span class="badge-dot"></span> Draft
                    </span>
                  </td>
                  <td class="cell-date">{{ formatDate(d.created_at) }}</td>
                  <td class="text-right">
                    <div class="action-btn-group justify-end">
                      <button
                        class="btn btn-primary btn-xs"
                        :disabled="isPublishingDraftId === d.assessment_id"
                        @click="handlePublishDraft(d.assessment_id)"
                        title="Publish and make live for students"
                      >
                        <span v-if="isPublishingDraftId === d.assessment_id">Publishing...</span>
                        <span v-else>🚀 Publish Quiz</span>
                      </button>
                      <button
                        class="btn btn-outline-danger btn-xs"
                        @click="handleDeleteDraft(d.assessment_id)"
                        title="Discard draft"
                      >
                        Discard
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- ============================================== -->
        <!-- TAB 3: PUBLISHED QUIZZES                       -->
        <!-- ============================================== -->
        <div v-if="teacherActiveTab === 'PUBLISHED'" class="tab-content-panel mt-3">
          <div class="section-top-row">
            <div>
              <h3 class="section-title">Published Quizzes ({{ teacherPublished.length }})</h3>
              <p class="section-desc">Live and scheduled assessments currently active for students.</p>
            </div>
            <div class="action-btn-group">
              <button class="btn btn-secondary btn-sm" @click="openExportModal()">
                📥 Export Exam Paper
              </button>
              <router-link to="/assessments/create" class="btn btn-primary btn-sm">
                + New Assessment
              </router-link>
            </div>
          </div>

          <!-- Empty Published -->
          <div v-if="teacherPublished.length === 0" class="glass-card empty-dashboard-card">
            <div class="empty-icon-circle">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <circle cx="12" cy="12" r="10"/>
                <polygon points="10 8 16 12 10 16 10 8"/>
              </svg>
            </div>
            <h3 class="empty-title">No Published Quizzes Yet</h3>
            <p class="empty-desc">You do not have any published quizzes live yet. Publish a draft or create a new assessment.</p>
            <router-link to="/assessments/create" class="btn btn-primary">+ Create &amp; Publish</router-link>
          </div>

          <!-- Published Table -->
          <div v-else class="table-responsive glass-card p-0">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Quiz Title &amp; Module</th>
                  <th>Questions</th>
                  <th>Marks (Passing / Total)</th>
                  <th>Duration</th>
                  <th>Status</th>
                  <th>Published Date</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in teacherPublished" :key="p.assessment_id">
                  <td>
                    <div class="course-name-cell">
                      <div class="course-main-name font-bold">{{ p.title }}</div>
                      <span class="code-mono course-code-badge">{{ p.course_code || 'CRS' }}</span>
                    </div>
                  </td>
                  <td>
                    <span class="badge badge-info">{{ Array.isArray(p.questions) ? p.questions.length : (p.questions ? JSON.parse(p.questions || '[]').length : 0) }} Items</span>
                  </td>
                  <td>{{ p.passing_marks || 50 }} / {{ p.total_marks || 100 }} pts</td>
                  <td>{{ p.duration_minutes || 60 }} mins</td>
                  <td>
                    <span class="badge badge-success">
                      <span class="badge-dot"></span> Live
                    </span>
                  </td>
                  <td class="cell-date">{{ formatDate(p.created_at) }}</td>
                  <td class="text-right">
                    <div class="action-btn-group justify-end">
                      <button
                        class="btn btn-secondary btn-xs"
                        @click="openInspectQuizModal(p)"
                        title="Preview quiz details & questions"
                      >
                        Inspect
                      </button>
                      <button
                        class="btn btn-secondary btn-xs"
                        @click="openExportModal(p)"
                        title="Export assessment"
                      >
                        Export
                      </button>
                      <button
                        class="btn btn-outline-amber btn-xs"
                        @click="handleRevertToDraft(p.assessment_id)"
                        title="Revert to Draft for revisions"
                      >
                        Revert Draft
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- ============================================== -->
        <!-- TAB 4: ATTEMPTS WAITING FOR REVIEW (WITH FLAGGED)-->
        <!-- ============================================== -->
        <div v-if="teacherActiveTab === 'REVIEWS'" class="tab-content-panel mt-3">
          <div class="section-top-row">
            <div>
              <h3 class="section-title">
                Student Attempts Waiting for Review ({{ teacherReviewQueue.length }})
              </h3>
              <p class="section-desc">
                Submissions requiring educator evaluation, subjective scoring, or academic integrity review.
              </p>
            </div>
            <div class="action-btn-group">
              <button
                :class="['btn btn-xs', reviewFilter === 'ALL' ? 'btn-primary' : 'btn-secondary']"
                @click="reviewFilter = 'ALL'"
              >
                All Pending ({{ teacherReviewQueue.length }})
              </button>
              <button
                :class="['btn btn-xs', reviewFilter === 'FLAGGED' ? 'btn-danger' : 'btn-secondary']"
                @click="reviewFilter = 'FLAGGED'"
              >
                ⚠️ Flagged Only ({{ teacherFlaggedCount }})
              </button>
            </div>
          </div>

          <!-- Flagged Alert Banner -->
          <div v-if="teacherFlaggedCount > 0" class="alert alert-warning mb-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="alert-icon">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <div>
              <strong>Academic Integrity Notice:</strong>
              {{ teacherFlaggedCount }} attempt(s) have been flagged for proctoring anomalies (window tab switching, lockdown exit, or paste events). Review before releasing final scores.
            </div>
          </div>

          <!-- Empty Reviews -->
          <div v-if="filteredReviewQueue.length === 0" class="glass-card empty-dashboard-card">
            <div class="empty-icon-circle">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <path d="M22 4L12 14.01l-3-3"/>
              </svg>
            </div>
            <h3 class="empty-title">All Submissions Reviewed!</h3>
            <p class="empty-desc">There are no student attempts waiting for your review matching the current filter.</p>
            <button class="btn btn-secondary" @click="reviewFilter = 'ALL'">Show All Attempts</button>
          </div>

          <!-- Reviews Table -->
          <div v-else class="table-responsive glass-card p-0">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Student &amp; Roll Number</th>
                  <th>Assessment &amp; Course</th>
                  <th>Submitted At</th>
                  <th>Score / Marks</th>
                  <th>Integrity &amp; Flag Status</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="att in filteredReviewQueue" :key="att.attempt_id">
                  <td>
                    <div class="student-name font-bold">{{ att.student_name }}</div>
                    <span class="code-mono text-xs">{{ att.roll_number }}</span>
                  </td>
                  <td>
                    <div>{{ att.assessment_title }}</div>
                    <span class="code-mono course-code-badge">{{ att.course_code }}</span>
                  </td>
                  <td class="cell-date">{{ formatDate(att.submitted_at) }}</td>
                  <td>
                    <strong>{{ att.score }}</strong> / {{ att.total_marks }}
                  </td>
                  <td>
                    <div v-if="att.is_flagged" class="badge-mini-danger font-bold">
                      ⚠️ Flagged: {{ att.flag_reasons[0] || 'Integrity anomaly detected' }}
                    </div>
                    <div v-else class="badge badge-info">
                      <span class="badge-dot"></span> Awaiting Subjective Review
                    </div>
                  </td>
                  <td class="text-right">
                    <button class="btn btn-primary btn-xs" @click="openReviewModal(att)">
                      Review &amp; Grade
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- ============================================== -->
        <!-- TAB 5: RECENT EXPORTS AND RECENT AI FAILURES   -->
        <!-- ============================================== -->
        <div v-if="teacherActiveTab === 'EXPORTS_AI'" class="tab-content-panel mt-3">
          <div class="dashboard-overview-grid">
            <!-- Left Column: Recent Exports -->
            <div class="glass-card overview-card">
              <div class="overview-card-header">
                <div>
                  <h3 class="overview-card-title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="title-icon">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Recent Assessment &amp; Grade Exports ({{ teacherExports.length }})
                  </h3>
                  <p class="overview-card-sub">Export assessment papers, printable answer sheets, and student gradebooks.</p>
                </div>
                <button class="btn btn-primary btn-xs" @click="openExportModal()">+ New Export</button>
              </div>

              <div v-if="teacherExports.length === 0" class="empty-state-mini">
                <p>No exports generated yet.</p>
              </div>

              <div v-else class="table-responsive">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Format</th>
                      <th>Size</th>
                      <th>Date</th>
                      <th class="text-right">Download</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="exp in teacherExports" :key="exp.export_id">
                      <td>
                        <div class="font-bold text-sm">{{ exp.title }}</div>
                      </td>
                      <td>
                        <span :class="['badge', exp.format === 'PDF' ? 'badge-danger' : (exp.format === 'CSV' ? 'badge-success' : 'badge-info')]">
                          {{ exp.format }}
                        </span>
                      </td>
                      <td class="text-xs">{{ exp.file_size }}</td>
                      <td class="cell-date">{{ formatDate(exp.created_at) }}</td>
                      <td class="text-right">
                        <button class="btn btn-secondary btn-xs" @click="handleGenerateExport()">
                          Download
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Right Column: Recent AI Failures & Health -->
            <div class="glass-card overview-card">
              <div class="overview-card-header">
                <div>
                  <h3 class="overview-card-title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="title-icon text-amber">
                      <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                    </svg>
                    Recent AI Failures &amp; Health
                  </h3>
                  <p class="overview-card-sub">Monitors Gemini AI question generation, rate limits, and auto-marking issues.</p>
                </div>
                <span :class="['badge', teacherAiFailures.filter(f => f.status !== 'RESOLVED').length > 0 ? 'badge-warning' : 'badge-success']">
                  {{ teacherAiFailures.filter(f => f.status !== 'RESOLVED').length > 0 ? 'Action Required' : 'All Systems Normal' }}
                </span>
              </div>

              <div v-if="teacherAiFailures.length === 0" class="empty-state-mini text-center p-4">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="empty-mini-icon text-success">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <path d="M22 4L12 14.01l-3-3"/>
                </svg>
                <p class="text-success font-bold mt-2">Zero AI Generation Failures</p>
                <span class="text-xs text-muted">Gemini 1.5 Flash is operating at 100% capacity.</span>
              </div>

              <div v-else class="ai-failures-list">
                <div
                  v-for="fail in teacherAiFailures"
                  :key="fail.failure_id"
                  :class="['ai-failure-card', fail.status === 'RESOLVED' && 'resolved']"
                >
                  <div class="ai-failure-header">
                    <div>
                      <span class="badge badge-info">{{ fail.feature }}</span>
                      <span class="code-mono ml-2 text-xs">{{ fail.model }}</span>
                    </div>
                    <span :class="['status-pill', fail.status === 'RESOLVED' ? 'status-active' : 'status-inactive']">
                      {{ fail.status }}
                    </span>
                  </div>
                  <div class="ai-failure-topic font-bold mt-1">{{ fail.prompt_topic }}</div>
                  <p class="ai-failure-msg">{{ fail.error_message }}</p>
                  <div class="ai-failure-footer">
                    <span class="text-xs text-muted">{{ formatDate(fail.created_at) }}</span>
                    <div class="action-btn-group">
                      <button
                        v-if="fail.status !== 'RESOLVED'"
                        class="btn btn-primary btn-xs"
                        :disabled="retryingFailureId === fail.failure_id"
                        @click="handleRetryAiFailure(fail.failure_id)"
                      >
                        <span v-if="retryingFailureId === fail.failure_id">Retrying...</span>
                        <span v-else>🔄 Retry with AI</span>
                      </button>
                      <button
                        class="btn btn-secondary btn-xs"
                        @click="handleDismissAiFailure(fail.failure_id)"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ============================================================= -->
        <!-- MODAL 1: CREATE NEW COURSE (SHORTCUT)                         -->
        <!-- ============================================================= -->
        <div v-if="showTeacherNewCourseModal" class="modal-overlay" @click.self="showTeacherNewCourseModal = false">
          <div class="modal-card">
            <div class="modal-header">
              <div class="modal-title-wrap">
                <h3 class="modal-title">+ Create New Course Shortcut</h3>
                <p class="modal-subtitle">Register a new curriculum course assigned directly to your faculty profile.</p>
              </div>
              <button class="modal-close-btn" @click="showTeacherNewCourseModal = false">&times;</button>
            </div>
            <form @submit.prevent="handleCreateTeacherCourse" class="modal-body">
              <div class="form-grid">
                <div class="field-item flex-2">
                  <label class="field-label">Course Name *</label>
                  <input
                    type="text"
                    v-model="teacherNewCourseForm.courseName"
                    class="input-control"
                    placeholder="e.g. Advanced Artificial Intelligence"
                    required
                  />
                </div>
                <div class="field-item flex-1">
                  <label class="field-label">Course Code</label>
                  <input
                    type="text"
                    v-model="teacherNewCourseForm.courseCode"
                    class="input-control uppercase"
                    placeholder="e.g. AI-401"
                  />
                </div>
              </div>
              <div class="form-grid mt-3">
                <div class="field-item flex-1">
                  <label class="field-label">Academic Department</label>
                  <select v-model="teacherNewCourseForm.departmentId" class="select-control">
                    <option value="">Select Department (Optional)...</option>
                    <option v-for="d in teacherDepartments" :key="d.department_id" :value="String(d.department_id)">
                      {{ d.name }} ({{ d.code }})
                    </option>
                  </select>
                </div>
              </div>
              <div class="modal-footer mt-4">
                <button type="submit" class="btn btn-primary" :disabled="isCreatingTeacherCourse">
                  <span v-if="isCreatingTeacherCourse">Creating Course...</span>
                  <span v-else>Register &amp; Assign to Me</span>
                </button>
                <button type="button" class="btn btn-secondary" @click="showTeacherNewCourseModal = false">Cancel</button>
              </div>
            </form>
          </div>
        </div>

        <!-- ============================================================= -->
        <!-- MODAL 2: REVIEW STUDENT ATTEMPT                               -->
        <!-- ============================================================= -->
        <div v-if="showReviewAttemptModal && selectedReviewAttempt" class="modal-overlay" @click.self="showReviewAttemptModal = false">
          <div class="modal-card">
            <div class="modal-header">
              <div class="modal-title-wrap">
                <h3 class="modal-title">Review Student Submission</h3>
                <p class="modal-subtitle">
                  {{ selectedReviewAttempt.student_name }} ({{ selectedReviewAttempt.roll_number }}) &bull; {{ selectedReviewAttempt.assessment_title }}
                </p>
              </div>
              <button class="modal-close-btn" @click="showReviewAttemptModal = false">&times;</button>
            </div>
            <form @submit.prevent="handleFinalizeReview" class="modal-body">
              <!-- Flag Warning Notice -->
              <div v-if="selectedReviewAttempt.is_flagged" class="alert alert-warning mb-3">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="alert-icon">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <div>
                  <strong>Proctoring Events Flagged:</strong>
                  <ul class="mt-1 pl-3 text-xs">
                    <li v-for="(r, idx) in selectedReviewAttempt.flag_reasons" :key="idx">{{ r }}</li>
                  </ul>
                </div>
              </div>

              <!-- Student Response Preview -->
              <div class="field-item mt-2">
                <label class="field-label">Student Submitted Answers / Subjective Synthesis</label>
                <div class="p-3 bg-gray-50 rounded border text-sm text-gray-800 leading-relaxed">
                  {{ selectedReviewAttempt.student_response }}
                </div>
              </div>

              <!-- Scoring & Notes Form -->
              <div class="form-grid mt-3">
                <div class="field-item flex-1">
                  <label class="field-label">Total Score Awarded (out of {{ selectedReviewAttempt.total_marks }}) *</label>
                  <input
                    type="number"
                    v-model="reviewForm.score"
                    min="0"
                    :max="selectedReviewAttempt.total_marks"
                    class="input-control"
                    required
                  />
                </div>
                <div class="field-item flex-2">
                  <label class="field-label">Educator Feedback &amp; Rubric Notes</label>
                  <input
                    type="text"
                    v-model="reviewForm.feedback"
                    class="input-control"
                    placeholder="e.g. Excellent explanation of RSA encryption. Minor notation error."
                  />
                </div>
              </div>

              <div class="form-grid mt-3">
                <label class="checkbox-label flex items-center gap-2 text-sm">
                  <input type="checkbox" v-model="reviewForm.clearFlag" />
                  Clear integrity flags and release final grade to student portal
                </label>
              </div>

              <div class="modal-footer mt-4">
                <button type="submit" class="btn btn-primary" :disabled="isSubmittingReview">
                  <span v-if="isSubmittingReview">Submitting Review...</span>
                  <span v-else>Approve &amp; Release Grade</span>
                </button>
                <button type="button" class="btn btn-secondary" @click="showReviewAttemptModal = false">Cancel</button>
              </div>
            </form>
          </div>
        </div>

        <!-- ============================================================= -->
        <!-- MODAL 3: EXPORT QUIZ MODAL                                    -->
        <!-- ============================================================= -->
        <div v-if="showExportQuizModal" class="modal-overlay" @click.self="showExportQuizModal = false">
          <div class="modal-card">
            <div class="modal-header">
              <div class="modal-title-wrap">
                <h3 class="modal-title">Export Assessment Package</h3>
                <p class="modal-subtitle">Generate downloadable examination papers or student gradebook rosters.</p>
              </div>
              <button class="modal-close-btn" @click="showExportQuizModal = false">&times;</button>
            </div>
            <form @submit.prevent="handleGenerateExport" class="modal-body">
              <div class="field-item">
                <label class="field-label">Assessment Title *</label>
                <input
                  type="text"
                  v-model="exportForm.assessmentTitle"
                  class="input-control"
                  required
                />
              </div>

              <div class="form-grid mt-3">
                <div class="field-item flex-1">
                  <label class="field-label">Export Format *</label>
                  <select v-model="exportForm.format" class="select-control" required>
                    <option value="PDF">Printable Exam Paper (PDF)</option>
                    <option value="CSV">Student Marks &amp; Gradebook (CSV)</option>
                    <option value="DOCX">Microsoft Word Package (DOCX)</option>
                    <option value="MOODLE">LMS / Moodle XML Package</option>
                  </select>
                </div>
              </div>

              <div class="modal-footer mt-4">
                <button type="submit" class="btn btn-primary" :disabled="isCreatingExport">
                  <span v-if="isCreatingExport">Generating Package...</span>
                  <span v-else>📥 Generate &amp; Download</span>
                </button>
                <button type="button" class="btn btn-secondary" @click="showExportQuizModal = false">Cancel</button>
              </div>
            </form>
          </div>
        </div>

        <!-- ============================================================= -->
        <!-- MODAL 4: INSPECT QUIZ PREVIEW                                 -->
        <!-- ============================================================= -->
        <div v-if="showInspectQuizModal && selectedInspectQuiz" class="modal-overlay" @click.self="showInspectQuizModal = false">
          <div class="modal-card">
            <div class="modal-header">
              <div class="modal-title-wrap">
                <h3 class="modal-title">{{ selectedInspectQuiz.title }}</h3>
                <p class="modal-subtitle">
                  {{ selectedInspectQuiz.course_code || 'CRS' }} &bull; {{ selectedInspectQuiz.duration_minutes }} mins &bull; {{ selectedInspectQuiz.total_marks }} marks
                </p>
              </div>
              <button class="modal-close-btn" @click="showInspectQuizModal = false">&times;</button>
            </div>
            <div class="modal-body">
              <div class="badge badge-success mb-3">
                <span class="badge-dot"></span> Status: {{ selectedInspectQuiz.status }}
              </div>
              <h4 class="text-sm font-bold mb-2">Curriculum Questions &amp; Items:</h4>
              <div class="questions-preview-list">
                <div
                  v-for="(q, idx) in (Array.isArray(selectedInspectQuiz.questions) ? selectedInspectQuiz.questions : JSON.parse(selectedInspectQuiz.questions || '[]'))"
                  :key="idx"
                  class="p-3 mb-2 rounded bg-gray-50 border text-sm"
                >
                  <div class="font-bold">Q{{ idx + 1 }}: {{ q.question || q.title }}</div>
                  <div v-if="q.options" class="mt-2 pl-3 text-xs text-gray-700">
                    <div v-for="(opt, oIdx) in q.options" :key="oIdx" class="py-0.5">
                      &bull; {{ opt }}
                    </div>
                  </div>
                  <div v-if="q.answer || q.correctAnswer" class="mt-2 text-xs text-success font-bold">
                    Correct Key: {{ q.answer || q.correctAnswer }}
                  </div>
                </div>
              </div>
              <div class="modal-footer mt-4">
                <button type="button" class="btn btn-primary" @click="openExportModal(selectedInspectQuiz)">
                  Export This Paper
                </button>
                <button type="button" class="btn btn-secondary" @click="showInspectQuizModal = false">Close</button>
              </div>
            </div>
          </div>
        </div>

        <!-- ============================================================= -->
        <!-- MODAL 5: SINGLE STUDENT ENROLL MODAL                          -->
        <!-- ============================================================= -->
        <div v-if="showSingleStudentModal && selectedCourseHub" class="modal-overlay" @click.self="showSingleStudentModal = false">
          <div class="modal-card">
            <div class="modal-header">
              <div class="modal-title-wrap">
                <h3 class="modal-title">Enroll Student</h3>
                <p class="modal-subtitle">
                  Enrolling into: <strong>{{ selectedCourseHub.course_name }}</strong> ({{ selectedCourseHub.course_code || 'CRS' }})
                </p>
              </div>
              <button class="modal-close-btn" @click="showSingleStudentModal = false">&times;</button>
            </div>
            <form @submit.prevent="handleEnrollSingleStudent" class="modal-body">
              <div class="field-item mb-3">
                <label class="field-label">Student Full Name *</label>
                <input
                  type="text"
                  v-model="singleStudentForm.name"
                  class="input-control"
                  placeholder="e.g. Fatima Ali"
                  required
                />
              </div>

              <div class="form-grid mb-3">
                <div class="field-item flex-1">
                  <label class="field-label">University Roll Number *</label>
                  <input
                    type="text"
                    v-model="singleStudentForm.rollNumber"
                    class="input-control"
                    placeholder="e.g. 24-ST-045"
                    required
                  />
                </div>
                <div class="field-item flex-2">
                  <label class="field-label">Student University Email *</label>
                  <input
                    type="email"
                    v-model="singleStudentForm.email"
                    class="input-control"
                    placeholder="e.g. 24-st-045@students.ptut.edu.pk"
                    required
                  />
                </div>
              </div>

              <!-- Domain Warning Alert -->
              <div v-if="singleDomainWarning" class="alert alert-warning mb-3">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="alert-icon">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <div class="text-xs">
                  <strong>Domain Notice:</strong> {{ singleDomainWarning }}
                </div>
              </div>

              <p class="text-xs text-muted">
                ℹ️ Emails are automatically converted to lowercase. Format is verified, and existing roster enrollments are checked to prevent duplicate entries.
              </p>

              <div class="modal-footer mt-4">
                <button type="submit" class="btn btn-primary" :disabled="isEnrollingSingle">
                  <span v-if="isEnrollingSingle">Enrolling Student...</span>
                  <span v-else>Enroll Student</span>
                </button>
                <button type="button" class="btn btn-secondary" @click="showSingleStudentModal = false">Cancel</button>
              </div>
            </form>
          </div>
        </div>

        <!-- ============================================================= -->
        <!-- MODAL 6: BULK STUDENT ENROLL MODAL (PASTE OR CSV)             -->
        <!-- ============================================================= -->
        <div v-if="showBulkStudentModal && selectedCourseHub" class="modal-overlay" @click.self="showBulkStudentModal = false">
          <div class="modal-card modal-lg">
            <div class="modal-header">
              <div class="modal-title-wrap">
                <h3 class="modal-title">Bulk Enroll Students</h3>
                <p class="modal-subtitle">
                  Course: <strong>{{ selectedCourseHub.course_name }}</strong> ({{ selectedCourseHub.course_code || 'CRS' }})
                </p>
              </div>
              <button class="modal-close-btn" @click="showBulkStudentModal = false">&times;</button>
            </div>
            <div class="modal-body">
              <!-- Mode Tabs -->
              <div class="flex gap-2 mb-3">
                <button
                  type="button"
                  :class="['btn btn-sm', bulkEnrollMode === 'paste' ? 'btn-primary' : 'btn-secondary']"
                  @click="bulkEnrollMode = 'paste'"
                >
                  📋 Paste Text List
                </button>
                <button
                  type="button"
                  :class="['btn btn-sm', bulkEnrollMode === 'csv' ? 'btn-primary' : 'btn-secondary']"
                  @click="bulkEnrollMode = 'csv'"
                >
                  📁 Upload CSV File
                </button>
              </div>

              <!-- Paste Mode -->
              <div v-if="bulkEnrollMode === 'paste'">
                <label class="field-label mb-1">Paste Student Records (Name, Roll Number, Email):</label>
                <textarea
                  v-model="bulkPasteText"
                  @input="parseBulkInput"
                  rows="6"
                  class="input-control font-mono text-xs"
                  placeholder="Fatima Ali, 24-ST-001, fatima@students.ptut.edu.pk&#10;Ali Hassan, 24-ST-002, ali.hassan@students.ptut.edu.pk&#10;Zainab Bibi, 24-ST-003, zainab@gmail.com"
                ></textarea>
                <p class="text-xs text-muted mt-1">
                  💡 Supports comma-separated or tab-separated (copy-paste directly from Excel/Google Sheets). Header rows are automatically detected and skipped.
                </p>
              </div>

              <!-- CSV Mode -->
              <div v-else class="csv-upload-box p-4 border border-dashed rounded text-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-8 h-8 mx-auto mb-2 text-primary">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <p class="text-sm font-bold mb-1">Select CSV File</p>
                <p class="text-xs text-muted mb-3">Expected columns: Name, Roll Number, Email</p>
                <input
                  type="file"
                  accept=".csv,.txt"
                  @change="handleCSVFileUpload"
                  class="text-xs"
                />
              </div>

              <!-- Validation & Parsing Summary -->
              <div v-if="bulkParsedRows.length > 0 || bulkDuplicatesCount > 0 || bulkInvalidCount > 0" class="mt-3 p-3 bg-gray-50 rounded border">
                <div class="flex items-center justify-between flex-wrap gap-2 text-xs">
                  <div class="flex items-center gap-2">
                    <span class="badge badge-success font-bold">
                      ✓ {{ bulkParsedRows.length }} Valid Entries
                    </span>
                    <span v-if="bulkDuplicatesCount > 0" class="badge badge-warning font-bold">
                      ⚠️ {{ bulkDuplicatesCount }} Duplicates Skipped
                    </span>
                    <span v-if="bulkInvalidCount > 0" class="badge badge-danger font-bold">
                      ✗ {{ bulkInvalidCount }} Invalid Format Skipped
                    </span>
                  </div>
                  <div v-if="bulkNonInstitutionalCount > 0" class="badge-mini-danger font-bold">
                    ⚠️ {{ bulkNonInstitutionalCount }} Non-Institutional Domain Warning(s)
                  </div>
                </div>
              </div>

              <!-- Preview Table -->
              <div v-if="bulkParsedRows.length > 0" class="mt-3 max-h-48 overflow-y-auto border rounded">
                <table class="data-table text-xs">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Roll Number</th>
                      <th>Normalized Email</th>
                      <th>Domain Check</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, rIdx) in bulkParsedRows" :key="rIdx">
                      <td class="font-bold">{{ row.name }}</td>
                      <td class="font-mono">{{ row.rollNumber }}</td>
                      <td class="font-mono">{{ row.email }}</td>
                      <td>
                        <span v-if="row.isNonInstitutional" class="badge-mini-danger">
                          ⚠️ Consumer Domain
                        </span>
                        <span v-else class="badge badge-success text-xs">
                          ✓ Institutional
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="modal-footer mt-4">
                <button
                  type="button"
                  class="btn btn-primary"
                  :disabled="bulkParsedRows.length === 0 || isEnrollingBulk"
                  @click="handleEnrollBulkStudents"
                >
                  <span v-if="isEnrollingBulk">Enrolling Roster...</span>
                  <span v-else>Enroll {{ bulkParsedRows.length }} Student(s)</span>
                </button>
                <button type="button" class="btn btn-secondary" @click="showBulkStudentModal = false">Cancel</button>
              </div>
            </div>
          </div>
        </div>

        <!-- ============================================================= -->
        <!-- MODAL 7: EDIT STUDENT MODAL                                   -->
        <!-- ============================================================= -->
        <div v-if="showEditStudentModal && selectedCourseHub" class="modal-overlay" @click.self="showEditStudentModal = false">
          <div class="modal-card">
            <div class="modal-header">
              <div class="modal-title-wrap">
                <h3 class="modal-title">Edit Student Entry</h3>
                <p class="modal-subtitle">
                  Update student roster information for <strong>{{ selectedCourseHub.course_name }}</strong>
                </p>
              </div>
              <button class="modal-close-btn" @click="showEditStudentModal = false">&times;</button>
            </div>
            <form @submit.prevent="handleUpdateStudent" class="modal-body">
              <div class="field-item mb-3">
                <label class="field-label">Student Name *</label>
                <input
                  type="text"
                  v-model="editStudentForm.name"
                  class="input-control"
                  required
                />
              </div>

              <div class="form-grid mb-3">
                <div class="field-item flex-1">
                  <label class="field-label">Roll Number *</label>
                  <input
                    type="text"
                    v-model="editStudentForm.rollNumber"
                    class="input-control"
                    required
                  />
                </div>
                <div class="field-item flex-2">
                  <label class="field-label">University Email *</label>
                  <input
                    type="email"
                    v-model="editStudentForm.email"
                    class="input-control"
                    required
                  />
                </div>
              </div>

              <p class="text-xs text-muted">
                ℹ️ Email will be converted to lowercase. The student will be matched to their portal submissions by this email.
              </p>

              <div class="modal-footer mt-4">
                <button type="submit" class="btn btn-primary" :disabled="isUpdatingStudent">
                  <span v-if="isUpdatingStudent">Saving Changes...</span>
                  <span v-else>Save Changes</span>
                </button>
                <button type="button" class="btn btn-secondary" @click="showEditStudentModal = false">Cancel</button>
              </div>
            </form>
          </div>
        </div>

        <!-- ============================================================= -->
        <!-- MODAL 8: REMOVE STUDENT DECISION MODAL                        -->
        <!-- ============================================================= -->
        <div v-if="showRemoveDecisionModal && studentToRemove" class="modal-overlay" @click.self="showRemoveDecisionModal = false">
          <div class="modal-card">
            <div class="modal-header">
              <div class="modal-title-wrap">
                <h3 class="modal-title text-danger">Remove Student with Attempts</h3>
                <p class="modal-subtitle">
                  {{ studentToRemove.name }} ({{ studentToRemove.roll_number }}) &bull; {{ studentToRemove.email }}
                </p>
              </div>
              <button class="modal-close-btn" @click="showRemoveDecisionModal = false">&times;</button>
            </div>
            <form @submit.prevent="handleConfirmStudentRemoval" class="modal-body">
              <!-- Warning Banner -->
              <div class="alert alert-warning mb-4">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="alert-icon">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <div>
                  <strong>Student Has Active Quiz Attempts:</strong>
                  <p class="mt-1 text-xs">
                    This student has already completed <strong>{{ studentAttemptsCheck.attemptCount }}</strong> quiz attempt(s) in this course. Please decide how to handle their records:
                  </p>
                </div>
              </div>

              <!-- Decision Options -->
              <div class="space-y-3">
                <label class="decision-option-card flex items-start gap-3 p-3 border rounded cursor-pointer transition hover:bg-gray-50" :class="{ 'border-primary bg-sky-50': removalResolutionChoice === 'archive' }">
                  <input
                    type="radio"
                    name="removalResolution"
                    value="archive"
                    v-model="removalResolutionChoice"
                    class="mt-1"
                  />
                  <div>
                    <div class="font-bold text-sm text-gray-800">Archive &amp; Keep Attempts (Recommended)</div>
                    <p class="text-xs text-muted mt-0.5">
                      Remove the student from the active course roster, but safely preserve all their quiz submissions, scores, and integrity logs in the gradebook and historical analytics.
                    </p>
                  </div>
                </label>

                <label class="decision-option-card flex items-start gap-3 p-3 border rounded cursor-pointer transition hover:bg-gray-50" :class="{ 'border-primary bg-sky-50': removalResolutionChoice === 'block' }">
                  <input
                    type="radio"
                    name="removalResolution"
                    value="block"
                    v-model="removalResolutionChoice"
                    class="mt-1"
                  />
                  <div>
                    <div class="font-bold text-sm text-gray-800">Block Removal (Cancel)</div>
                    <p class="text-xs text-muted mt-0.5">
                      Prevent removal completely. The student will remain enrolled in the course roster.
                    </p>
                  </div>
                </label>

                <label class="decision-option-card flex items-start gap-3 p-3 border rounded cursor-pointer transition hover:bg-red-50" :class="{ 'border-danger bg-red-50': removalResolutionChoice === 'purge' }">
                  <input
                    type="radio"
                    name="removalResolution"
                    value="purge"
                    v-model="removalResolutionChoice"
                    class="mt-1"
                  />
                  <div>
                    <div class="font-bold text-sm text-danger">Permanent Purge (Wipe All Records)</div>
                    <p class="text-xs text-muted mt-0.5">
                      Permanently delete the student AND wipe all their quiz attempts and score history from the database. This action cannot be undone.
                    </p>
                  </div>
                </label>
              </div>

              <div class="modal-footer mt-4">
                <button
                  type="submit"
                  :class="['btn', removalResolutionChoice === 'purge' ? 'btn-outline-danger' : (removalResolutionChoice === 'block' ? 'btn-secondary' : 'btn-primary')]"
                  :disabled="isRemovingStudent"
                >
                  <span v-if="isRemovingStudent">Processing...</span>
                  <span v-else-if="removalResolutionChoice === 'archive'">Keep Attempts &amp; Remove Student</span>
                  <span v-else-if="removalResolutionChoice === 'block'">Keep Student Enrolled</span>
                  <span v-else>Purge Student &amp; All Attempts</span>
                </button>
                <button type="button" class="btn btn-secondary" @click="showRemoveDecisionModal = false">Cancel</button>
              </div>
            </form>
          </div>
        </div>

        <!-- ============================================================= -->
        <!-- MODAL 9: ADD COURSE MATERIAL MODAL                            -->
        <!-- ============================================================= -->
        <div v-if="showAddMaterialModal && selectedCourseHub" class="modal-overlay" @click.self="showAddMaterialModal = false">
          <div class="modal-card">
            <div class="modal-header">
              <div class="modal-title-wrap">
                <h3 class="modal-title">Upload Course Material</h3>
                <p class="modal-subtitle">
                  Course: <strong>{{ selectedCourseHub.course_name }}</strong> ({{ selectedCourseHub.course_code || 'CRS' }})
                </p>
              </div>
              <button class="modal-close-btn" @click="showAddMaterialModal = false">&times;</button>
            </div>
            <form @submit.prevent="handleAddCourseMaterial" class="modal-body">
              <div class="field-item mb-3">
                <label class="field-label">Material / Document Title *</label>
                <input
                  type="text"
                  v-model="materialForm.title"
                  class="input-control"
                  placeholder="e.g. Week 1 - Introduction to Relational Algebra"
                  required
                />
              </div>

              <div class="form-grid mb-3">
                <div class="field-item flex-2">
                  <label class="field-label">File Name or Reference Document</label>
                  <input
                    type="text"
                    v-model="materialForm.fileName"
                    class="input-control"
                    placeholder="e.g. lecture_01_relational_algebra.pdf"
                  />
                </div>
                <div class="field-item flex-1">
                  <label class="field-label">Source Type *</label>
                  <select v-model="materialForm.sourceType" class="select-control" required>
                    <option value="PDF">PDF Document</option>
                    <option value="DOCX">Word Document</option>
                    <option value="TXT">Plain Text / Notes</option>
                    <option value="LINK">External URL / LMS Link</option>
                  </select>
                </div>
              </div>

              <div class="modal-footer mt-4">
                <button type="submit" class="btn btn-primary" :disabled="isAddingMaterial">
                  <span v-if="isAddingMaterial">Adding Material...</span>
                  <span v-else>Add Material</span>
                </button>
                <button type="button" class="btn btn-secondary" @click="showAddMaterialModal = false">Cancel</button>
              </div>
            </form>
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
              <select v-model="deptStatusFilter" class="select-control">
                <option value="ALL">All Statuses</option>
                <option value="active">Active Only</option>
                <option value="archived">Archived Only</option>
              </select>

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

                        <!-- Toggle Archive / Restore -->
                        <button
                          :class="['btn btn-xs', dept.status === 'active' ? 'btn-outline-warning' : 'btn-outline-success']"
                          @click="handleToggleDeptStatus(dept)"
                          :title="dept.status === 'active' ? 'Archive department' : 'Restore department'"
                        >
                          {{ dept.status === 'active' ? 'Archive' : 'Restore' }}
                        </button>

                        <!-- Delete Button -->
                        <button class="btn btn-outline-danger btn-xs" @click="handleDeleteDepartmentPermanent(dept)" title="Permanently delete department">
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
                        <!-- Edit Course Modal -->
                        <button class="btn btn-outline-primary btn-xs" @click="startEditCourse(c)" title="Edit course name, code, teacher, and department">
                          Edit
                        </button>

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

          <!-- Invitations Registry Controls -->
          <div class="glass-card table-control-card mt-4">
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
                <!-- Assign Educator to Department Control -->
                <div class="glass-card p-3 mb-3" style="display: flex; gap: 0.75rem; align-items: center; justify-content: space-between;">
                  <div style="flex: 1; display: flex; gap: 0.5rem; align-items: center;">
                    <label class="text-xs text-dim" style="white-space: nowrap;">Assign Faculty:</label>
                    <select v-model="deptAssignTeacherId" class="select-control input-sm" style="flex: 1;">
                      <option value="">Select educator to assign to this department...</option>
                      <option v-for="t in teachersList" :key="t.user_id" :value="String(t.user_id)">
                        {{ t.name }} ({{ t.email }})
                      </option>
                    </select>
                  </div>
                  <button
                    class="btn btn-primary btn-xs"
                    @click="handleAssignTeacherToDeptInModal"
                    :disabled="!deptAssignTeacherId || isAssigningDeptTeacher"
                  >
                    <span v-if="isAssigningDeptTeacher">Assigning...</span>
                    <span v-else>+ Assign to Department</span>
                  </button>
                </div>

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
                          <div class="action-buttons-cell" style="justify-content: flex-end;">
                            <button class="btn btn-secondary btn-xs" @click="closeDeptMembersModal(); activeSection = 'teachers'; activeTab = 'TEACHERS'; teacherSearch = t.email;">
                              View Details
                            </button>
                            <button class="btn btn-outline-danger btn-xs" @click="handleRemoveTeacherFromDeptInModal(t)" title="Remove from department">
                              Remove
                            </button>
                          </div>
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

              <!-- Quick Enroll Student Bar -->
              <div v-else class="glass-card p-3 mb-3">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span class="text-sm font-semibold">Enrolled Students ({{ selectedCourseRoster?.students?.length || 0 }})</span>
                  <button class="btn btn-primary btn-xs" @click="showEnrollStudentForm = !showEnrollStudentForm">
                    {{ showEnrollStudentForm ? 'Close Form' : '+ Enroll Student' }}
                  </button>
                </div>

                <form v-if="showEnrollStudentForm" @submit.prevent="handleEnrollStudentInModal" class="mt-3 pt-3 border-t">
                  <div class="form-grid">
                    <div class="field-item flex-2">
                      <label class="field-label">Student Email *</label>
                      <input
                        type="email"
                        v-model="enrollStudentForm.email"
                        placeholder="student@university.edu"
                        class="input-control input-sm"
                        required
                      />
                    </div>
                    <div class="field-item flex-2">
                      <label class="field-label">Student Name</label>
                      <input
                        type="text"
                        v-model="enrollStudentForm.name"
                        placeholder="e.g. John Doe"
                        class="input-control input-sm"
                      />
                    </div>
                  </div>
                  <div class="form-action-row mt-2">
                    <button type="submit" class="btn btn-primary btn-xs" :disabled="isEnrollingStudent || !enrollStudentForm.email">
                      <span v-if="isEnrollingStudent">Enrolling...</span>
                      <span v-else>Confirm &amp; Enroll</span>
                    </button>
                    <button type="button" class="btn btn-secondary btn-xs" @click="showEnrollStudentForm = false">Cancel</button>
                  </div>
                </form>
              </div>

              <div v-if="!isLoadingCourseRoster && (!selectedCourseRoster?.students || selectedCourseRoster.students.length === 0)" class="empty-table-state">
                <p>No students enrolled in this course yet.</p>
                <p class="text-xs text-dim">Use the "+ Enroll Student" button above to add students to this roster.</p>
              </div>

              <div v-else-if="!isLoadingCourseRoster" class="table-responsive">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Student Name</th>
                      <th>Email Address</th>
                      <th>Roll Number</th>
                      <th>Account Status</th>
                      <th>Enrolled On</th>
                      <th class="text-right">Actions</th>
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
                      <td class="text-right">
                        <button
                          class="btn btn-outline-danger btn-xs"
                          @click="handleUnenrollStudentInModal(student)"
                          :disabled="isUnenrollingStudentId === student.student_id"
                          title="Unenroll student from this course"
                        >
                          <span v-if="isUnenrollingStudentId === student.student_id">Removing...</span>
                          <span v-else>Unenroll</span>
                        </button>
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

        <!-- ============================================================= -->
        <!-- MODAL: EDIT COURSE                                            -->
        <!-- ============================================================= -->
        <div v-if="showEditCourseModal" class="modal-overlay" @click.self="cancelEditCourse">
          <div class="modal-card">
            <div class="modal-header">
              <div class="modal-title-wrap">
                <h3 class="modal-title">Edit Course Details</h3>
                <p class="modal-subtitle">Update course name, code, department, teacher allocation, or status.</p>
              </div>
              <button class="modal-close-btn" @click="cancelEditCourse">&times;</button>
            </div>
            <form @submit.prevent="handleUpdateCourse" class="modal-body">
              <div class="form-grid">
                <div class="field-item flex-2">
                  <label class="field-label">Course Name *</label>
                  <input type="text" v-model="editCourseForm.courseName" class="input-control" required />
                </div>
                <div class="field-item flex-1">
                  <label class="field-label">Course Code</label>
                  <input type="text" v-model="editCourseForm.courseCode" class="input-control uppercase" />
                </div>
              </div>
              <div class="form-grid mt-3">
                <div class="field-item flex-1">
                  <label class="field-label">Department *</label>
                  <select v-model="editCourseForm.departmentId" class="select-control" required>
                    <option value="" disabled>Select Department...</option>
                    <option v-for="d in departmentsList" :key="d.department_id" :value="String(d.department_id)">
                      {{ d.name }} ({{ d.code }})
                    </option>
                  </select>
                </div>
                <div class="field-item flex-1">
                  <label class="field-label">Assigned Teacher</label>
                  <select v-model="editCourseForm.teacherId" class="select-control">
                    <option value="">Leave unassigned</option>
                    <option v-for="t in teachersList" :key="t.user_id" :value="String(t.user_id)">
                      {{ t.name }} ({{ t.email }})
                    </option>
                  </select>
                </div>
              </div>
              <div class="form-grid mt-3">
                <div class="field-item flex-1">
                  <label class="field-label">Course Status</label>
                  <select v-model="editCourseForm.status" class="select-control">
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>
              <div class="modal-footer mt-4">
                <button type="submit" class="btn btn-primary" :disabled="isUpdatingCourse">
                  <span v-if="isUpdatingCourse">Saving...</span>
                  <span v-else>Save Changes</span>
                </button>
                <button type="button" class="btn btn-secondary" @click="cancelEditCourse">Cancel</button>
              </div>
            </form>
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

.badge-mini-danger {
  background: #fee2e2;
  color: #b91c1c;
  font-size: 0.72rem;
  padding: 0.18rem 0.5rem;
  border-radius: 999px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.badge-danger {
  background: #fee2e2;
  color: #b91c1c;
  font-size: 0.78rem;
  padding: 0.2rem 0.55rem;
  border-radius: var(--radius-sm);
  font-weight: 700;
}

.btn-outline-amber {
  background: transparent;
  color: #b45309;
  border: 1px solid #f59e0b;
}

.btn-outline-amber:hover {
  background: #fef3c7;
}

.btn-outline-danger {
  background: transparent;
  color: #dc2626;
  border: 1px solid #ef4444;
}

.btn-outline-danger:hover {
  background: #fee2e2;
}

.ai-failures-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.ai-failure-card {
  padding: 0.95rem;
  background: #fff;
  border: 1px solid #fecaca;
  border-left: 4px solid #ef4444;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  transition: var(--transition-fast);
}

.ai-failure-card.resolved {
  border-color: #bbf7d0;
  border-left-color: #22c55e;
  background: #f0fdf4;
}

.ai-failure-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.ai-failure-topic {
  font-size: 0.88rem;
  color: var(--text-main);
  margin-top: 0.35rem;
}

.ai-failure-msg {
  font-size: 0.8rem;
  color: #b91c1c;
  margin: 0.35rem 0;
  line-height: 1.45;
}

.ai-failure-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px dashed var(--border-light);
}

.text-danger {
  color: #dc2626 !important;
}

.text-amber {
  color: #d97706 !important;
}

.text-muted {
  color: #64748b;
}

.text-xs {
  font-size: 0.75rem;
}

.font-bold {
  font-weight: 700;
}

.justify-end {
  justify-content: flex-end;
}

.empty-mini-icon {
  width: 32px;
  height: 32px;
  margin: 0 auto;
}

.questions-preview-list {
  max-height: 320px;
  overflow-y: auto;
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

/* ===================================================
   COURSE HUB & ROSTER MANAGEMENT STYLES
   =================================================== */
.course-hub-page {
  animation: fadeIn 0.2s ease-in-out;
}

.course-hub-nav-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.course-hub-breadcrumb {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.course-hub-header-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  flex-wrap: wrap;
  padding: 1.5rem;
}

.course-hub-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
  display: flex;
  align-items: center;
}

.course-hub-desc {
  font-size: 0.85rem;
  margin-top: 0.25rem;
}

.course-hub-header-stats {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.hub-stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.5rem 1rem;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid var(--border-light);
  border-radius: 8px;
  min-width: 90px;
}

.hub-stat-val {
  font-size: 1.4rem;
  font-weight: 800;
  line-height: 1.1;
}

.hub-stat-lbl {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-top: 0.2rem;
}

.course-hub-tab-panel {
  animation: fadeIn 0.2s ease;
}

.roster-status-strip {
  background: #ffffff;
  border: 1px solid var(--border-light);
  border-radius: 8px;
}

.badge-mini-danger {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.5rem;
  font-size: 0.72rem;
  font-weight: 600;
  color: #b91c1c;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 9999px;
}

.badge-light {
  background: #f3f4f6;
  color: #4b5563;
  border: 1px solid #e5e7eb;
}

.search-filter-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.search-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.search-input {
  padding: 0.45rem 0.75rem;
  font-size: 0.85rem;
  border: 1px solid var(--border-light);
  border-radius: 6px;
  outline: none;
  background: #ffffff;
  transition: border-color 0.15s ease;
}

.search-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2);
}

.clear-search-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0.2rem 0.4rem;
  font-size: 0.85rem;
}

.decision-option-card {
  border-width: 1.5px;
}

.bg-sky-50 {
  background-color: #f0f9ff;
}

.border-primary {
  border-color: var(--primary, #0284c7) !important;
}

.border-danger {
  border-color: #ef4444 !important;
}

.csv-upload-box {
  background: #f8fafc;
  border: 2px dashed #cbd5e1;
  border-radius: 8px;
  cursor: pointer;
}
</style>
