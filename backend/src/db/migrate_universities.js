import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;

export async function runUniversityMigration() {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: false });
  await c.connect();
  console.log('🔄 Applying Multi-Tenant University Schema Migrations...');

  await c.query(`
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

    -- 2. Add university_id to users
    ALTER TABLE public.users 
    ADD COLUMN IF NOT EXISTS university_id INTEGER REFERENCES public.universities(university_id) ON DELETE SET NULL;

    -- 3. Add university_id to invitations
    ALTER TABLE public.invitations 
    ADD COLUMN IF NOT EXISTS university_id INTEGER REFERENCES public.universities(university_id) ON DELETE CASCADE;

    -- 4. Add university_id to courses and make user_id nullable (for admin-created courses awaiting teacher assignment)
    ALTER TABLE public.courses 
    ADD COLUMN IF NOT EXISTS university_id INTEGER REFERENCES public.universities(university_id) ON DELETE CASCADE;

    ALTER TABLE public.courses 
    ALTER COLUMN user_id DROP NOT NULL;

    -- 5. Add university_id to students
    ALTER TABLE public.students 
    ADD COLUMN IF NOT EXISTS university_id INTEGER REFERENCES public.universities(university_id) ON DELETE CASCADE;

    -- 6. Create indexes for university lookups
    CREATE INDEX IF NOT EXISTS idx_universities_domain ON public.universities(domain);
    CREATE INDEX IF NOT EXISTS idx_users_university_id ON public.users(university_id);
    CREATE INDEX IF NOT EXISTS idx_invitations_university_id ON public.invitations(university_id);
    CREATE INDEX IF NOT EXISTS idx_courses_university_id ON public.courses(university_id);
    CREATE INDEX IF NOT EXISTS idx_courses_user_id ON public.courses(user_id);

    -- 7. Seed Demo University
    INSERT INTO public.universities (name, code, domain, contact_email, website)
    VALUES 
      ('Punjab Tianjin University of Technology', 'PTUT', 'ptut.edu.pk', 'admin@ptut.edu.pk', 'https://ptut.edu.pk'),
      ('Global Academic Demo University', 'GLOBAL-EDU', 'edu', 'contact@global-edu.org', 'https://global-edu.org')
    ON CONFLICT (domain) DO UPDATE 
    SET name = EXCLUDED.name, code = EXCLUDED.code;

    -- Link initial bootstrap invitations to demo university
    UPDATE public.invitations 
    SET university_id = (SELECT university_id FROM public.universities WHERE domain = 'ptut.edu.pk' LIMIT 1)
    WHERE university_id IS NULL;
  `);

  console.log('✅ Universities Schema Migrations applied successfully!');
  await c.end();
}

if (process.argv[1] === import.meta.filename) {
  runUniversityMigration()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('❌ Migration failed:', err);
      process.exit(1);
    });
}
