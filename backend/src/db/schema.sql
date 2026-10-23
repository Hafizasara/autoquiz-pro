-- AutoQuiz Pro: Database Schema & Authentication Migration
-- Multi-Tenant Educational Architecture
-- Roles: ADMIN, TEACHER, STUDENT

-- 1. Create Universities Table
CREATE TABLE IF NOT EXISTS public.universities (
  university_id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  domain VARCHAR(255) NOT NULL UNIQUE,
  contact_email VARCHAR(255),
  website VARCHAR(255),
  logo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create Users Table (Server-decided user roles)
CREATE TABLE IF NOT EXISTS public.users (
  user_id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255),
  role VARCHAR(50) NOT NULL CHECK (role IN ('ADMIN', 'TEACHER', 'STUDENT')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  supabase_uid UUID UNIQUE,
  auth_provider VARCHAR(20) NOT NULL DEFAULT 'email',
  avatar_url TEXT,
  university_id INTEGER REFERENCES public.universities(university_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create One-Time Invitations Table (Tied to university)
CREATE TABLE IF NOT EXISTS public.invitations (
  invitation_id BIGSERIAL PRIMARY KEY,
  code VARCHAR(255) NOT NULL UNIQUE,
  role VARCHAR(50) NOT NULL CHECK (role IN ('ADMIN', 'TEACHER')),
  university_id INTEGER REFERENCES public.universities(university_id) ON DELETE CASCADE,
  created_by BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,
  used_by BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Create Courses Table
CREATE TABLE IF NOT EXISTS public.courses (
  course_id BIGSERIAL PRIMARY KEY,
  university_id INTEGER REFERENCES public.universities(university_id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL, -- Assigned teacher
  course_name VARCHAR(255) NOT NULL,
  course_code VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Create Students Table
CREATE TABLE IF NOT EXISTS public.students (
  student_id BIGSERIAL PRIMARY KEY,
  university_id INTEGER REFERENCES public.universities(university_id) ON DELETE CASCADE,
  course_id BIGINT REFERENCES public.courses(course_id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  roll_number VARCHAR(100) NOT NULL,
  email VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_university ON public.users(university_id);
CREATE INDEX IF NOT EXISTS idx_invitations_code ON public.invitations(code);
CREATE INDEX IF NOT EXISTS idx_courses_user ON public.courses(user_id);
CREATE INDEX IF NOT EXISTS idx_courses_university ON public.courses(university_id);

-- 7. Seed Demo Universities
INSERT INTO public.universities (name, code, domain, contact_email, website)
VALUES 
  ('Punjab Tianjin University of Technology', 'PTUT', 'ptut.edu.pk', 'admin@ptut.edu.pk', 'https://ptut.edu.pk'),
  ('Global Academic Demo University', 'GLOBAL-EDU', 'edu', 'contact@global-edu.org', 'https://global-edu.org')
ON CONFLICT (domain) DO NOTHING;
