-- ============================================================================
-- AutoQuiz Pro: Admin Portal Database Migration
-- Adds: departments, audit_log, approved_domains, sign_in_log, ai_usage_log
-- Adds columns: department_id on users/courses, last_sign_in on users
-- ============================================================================

-- 1. Departments Table
CREATE TABLE IF NOT EXISTS public.departments (
  department_id SERIAL PRIMARY KEY,
  university_id INTEGER REFERENCES public.universities(university_id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(university_id, code)
);

-- 2. Add department_id to users and courses
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='department_id') THEN
    ALTER TABLE public.users ADD COLUMN department_id INTEGER REFERENCES public.departments(department_id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='courses' AND column_name='department_id') THEN
    ALTER TABLE public.courses ADD COLUMN department_id INTEGER REFERENCES public.departments(department_id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Add last_sign_in to users
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='last_sign_in') THEN
    ALTER TABLE public.users ADD COLUMN last_sign_in TIMESTAMPTZ;
  END IF;
END $$;

-- 4. Add status field to courses for archiving
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='courses' AND column_name='status') THEN
    ALTER TABLE public.courses ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted'));
  END IF;
END $$;

-- 5. Add target_email to invitations for email-bound invites
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invitations' AND column_name='target_email') THEN
    ALTER TABLE public.invitations ADD COLUMN target_email VARCHAR(255);
  END IF;
END $$;

-- 6. Admin Audit Log
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  log_id BIGSERIAL PRIMARY KEY,
  university_id INTEGER REFERENCES public.universities(university_id) ON DELETE CASCADE,
  admin_user_id BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(50),
  target_id BIGINT,
  details JSONB DEFAULT '{}',
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Approved Email Domains
CREATE TABLE IF NOT EXISTS public.approved_domains (
  domain_id SERIAL PRIMARY KEY,
  university_id INTEGER REFERENCES public.universities(university_id) ON DELETE CASCADE,
  domain VARCHAR(255) NOT NULL,
  role_scope VARCHAR(20) NOT NULL DEFAULT 'STUDENT' CHECK (role_scope IN ('STUDENT', 'TEACHER', 'ALL')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(university_id, domain, role_scope)
);

-- 8. Sign-In Activity Log
CREATE TABLE IF NOT EXISTS public.sign_in_log (
  log_id BIGSERIAL PRIMARY KEY,
  university_id INTEGER,
  user_id BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,
  email VARCHAR(255),
  success BOOLEAN NOT NULL DEFAULT FALSE,
  failure_reason VARCHAR(255),
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. AI Usage Log
CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  log_id BIGSERIAL PRIMARY KEY,
  university_id INTEGER,
  user_id BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,
  request_type VARCHAR(50) NOT NULL CHECK (request_type IN ('generation', 'marking', 'other')),
  model VARCHAR(100),
  tokens_used INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Indexes
CREATE INDEX IF NOT EXISTS idx_departments_university ON public.departments(university_id);
CREATE INDEX IF NOT EXISTS idx_users_department ON public.users(department_id);
CREATE INDEX IF NOT EXISTS idx_courses_department ON public.courses(department_id);
CREATE INDEX IF NOT EXISTS idx_courses_status ON public.courses(status);
CREATE INDEX IF NOT EXISTS idx_audit_log_university ON public.admin_audit_log(university_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON public.admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approved_domains_university ON public.approved_domains(university_id);
CREATE INDEX IF NOT EXISTS idx_sign_in_log_created ON public.sign_in_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sign_in_log_user ON public.sign_in_log(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_created ON public.ai_usage_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_user ON public.ai_usage_log(user_id);
CREATE INDEX IF NOT EXISTS idx_invitations_target_email ON public.invitations(target_email);
