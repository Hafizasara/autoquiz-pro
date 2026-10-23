import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;

export async function runDeviceVerificationMigration() {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: false });
  await c.connect();
  console.log('🔄 Applying Device Verification & Browser Security Schema Migrations...');

  await c.query(`
    -- 1. Add email_verified to users
    ALTER TABLE public.users 
    ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;

    -- 2. Create User Devices table for browser device trust tracking
    CREATE TABLE IF NOT EXISTS public.user_devices (
      device_id BIGSERIAL PRIMARY KEY,
      user_id BIGINT REFERENCES public.users(user_id) ON DELETE CASCADE,
      device_token VARCHAR(255) NOT NULL,
      browser_info VARCHAR(255),
      ip_address VARCHAR(100),
      is_verified BOOLEAN NOT NULL DEFAULT FALSE,
      verified_at TIMESTAMPTZ,
      last_login TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, device_token)
    );

    -- 3. Create Email Verifications table for email confirmation links
    CREATE TABLE IF NOT EXISTS public.email_verifications (
      verification_id BIGSERIAL PRIMARY KEY,
      user_id BIGINT REFERENCES public.users(user_id) ON DELETE CASCADE,
      token VARCHAR(255) NOT NULL UNIQUE,
      device_token VARCHAR(255) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_user_devices_token ON public.user_devices(user_id, device_token);
    CREATE INDEX IF NOT EXISTS idx_email_verifications_token ON public.email_verifications(token);
  `);

  console.log('✅ Device Verification & Browser Security Schema Migrations applied successfully!');
  await c.end();
}

if (process.argv[1] === import.meta.filename) {
  runDeviceVerificationMigration()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('❌ Migration failed:', err);
      process.exit(1);
    });
}
