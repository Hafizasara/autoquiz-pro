import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;

async function migrate() {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: false });
  await c.connect();
  console.log('🔄 Connected to PostgreSQL. Applying AutoQuiz Pro schema updates...');

  await c.query(`
    -- 1. Update chk_users_role to include STUDENT
    ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_role;
    ALTER TABLE users ADD CONSTRAINT chk_users_role CHECK (role IN ('ADMIN', 'TEACHER', 'STUDENT'));

    -- 2. Add supabase_uid and auth_provider to users if not exists
    ALTER TABLE users ADD COLUMN IF NOT EXISTS supabase_uid UUID UNIQUE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) DEFAULT 'email';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

    -- 3. Allow password_hash to be NULL for Google OAuth users
    ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

    -- 4. Create university_domains table for official university email validation
    CREATE TABLE IF NOT EXISTS public.university_domains (
      domain_id SERIAL PRIMARY KEY,
      domain VARCHAR(255) NOT NULL UNIQUE,
      institution_name VARCHAR(255),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    INSERT INTO public.university_domains (domain, institution_name)
    VALUES 
      ('ptut.edu.pk', 'Punjab Tianjin University of Technology'),
      ('edu.pk', 'Pakistan Higher Education Network'),
      ('edu', 'Global Educational Domain'),
      ('ac.uk', 'UK Academic Network'),
      ('edu.au', 'Australian Academic Network')
    ON CONFLICT (domain) DO NOTHING;

    -- 5. Ensure bootstrap invitations exist
    INSERT INTO public.invitations (code, role, expires_at)
    VALUES 
      ('ADMIN-PRO-INIT-2026', 'ADMIN', NOW() + INTERVAL '365 days'),
      ('TEACHER-INVITE-2026', 'TEACHER', NOW() + INTERVAL '365 days')
    ON CONFLICT (code) DO NOTHING;
  `);

  console.log('✅ Schema updates applied successfully!');
  await c.end();
}

migrate().catch(err => {
  console.error('❌ Migration error:', err);
  process.exit(1);
});
