-- AutoQuiz Pro: Database Schema & Authentication Migration
-- Roles: ADMIN, TEACHER, STUDENT

-- 1. Create Profiles Table (Server-decided user roles)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'TEACHER', 'STUDENT')),
  avatar_url TEXT,
  auth_provider TEXT NOT NULL DEFAULT 'email' CHECK (auth_provider IN ('google', 'email')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create One-Time Invitations Table
CREATE TABLE IF NOT EXISTS public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'TEACHER')),
  email TEXT, -- Optional: restrict invite to specific email address
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  used_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create University Domains Table for Student Verification
CREATE TABLE IF NOT EXISTS public.university_domains (
  id SERIAL PRIMARY KEY,
  domain TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Create Indexes for High Performance Queries
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_invitations_code ON public.invitations(code);
CREATE INDEX IF NOT EXISTS idx_invitations_is_used ON public.invitations(is_used);

-- 5. Seed University Domains (PTUT & Generic Higher Ed Domains)
INSERT INTO public.university_domains (domain, description)
VALUES 
  ('ptut.edu.pk', 'Punjab Tianjin University of Technology'),
  ('edu.pk', 'Pakistan Higher Education Network'),
  ('edu', 'Global Educational Institutions'),
  ('ac.uk', 'United Kingdom Academic Network'),
  ('edu.au', 'Australian Academic Network')
ON CONFLICT (domain) DO NOTHING;

-- 6. Seed Initial System Bootstrap Admin Invitation Code
-- This enables the creation of the primary administrator without manual DB hacking
INSERT INTO public.invitations (code, role, expires_at)
VALUES 
  ('ADMIN-AUTOQUIZ-MASTER-2026', 'ADMIN', NOW() + INTERVAL '365 days'),
  ('TEACHER-WELCOME-DEMO-2026', 'TEACHER', NOW() + INTERVAL '365 days')
ON CONFLICT (code) DO NOTHING;

-- 7. Configure Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.university_domains ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own profile
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Allow public read of active university domains
DROP POLICY IF EXISTS "Public read university domains" ON public.university_domains;
CREATE POLICY "Public read university domains"
  ON public.university_domains
  FOR SELECT
  USING (is_active = TRUE);
