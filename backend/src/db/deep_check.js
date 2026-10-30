import { testSupabaseConnection, dbPool, supabaseAdmin, supabase } from '../config/supabase.js';
import { getGeminiModel } from '../config/gemini.js';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

async function runDeepDiagnostic() {
  console.log('==================================================');
  console.log('       AUTOQUIZ PRO DEEP DIAGNOSTIC CHECK         ');
  console.log('==================================================\n');

  // 1. SUPABASE CONNECTION TEST
  console.log('[1/5] Testing Supabase Connection Status...');
  const connTest = await testSupabaseConnection();
  console.log('Status:', JSON.stringify(connTest, null, 2));

  // 2. DIRECT POSTGRES POOL CHECK
  console.log('\n[2/5] Testing Direct PostgreSQL Pool (Port 6543/5432)...');
  if (dbPool) {
    try {
      const client = await dbPool.connect();
      console.log('✅ Direct PostgreSQL Pool: CONNECTED');
      const tableRes = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name;
      `);
      console.log('Tables found via Direct Pool:');
      tableRes.rows.forEach(r => console.log(`  - ${r.table_name}`));
      client.release();
    } catch (err) {
      console.log('⚠️ Direct PostgreSQL Pool connection failed/blocked (ISP or firewall timeout):', err.message);
      console.log('ℹ️ Note: AutoQuiz Pro has an automatic fallback to HTTPS Port 443 via Supabase JS SDK.');
    }
  } else {
    console.log('Direct DB Pool not configured.');
  }

  // 3. SUPABASE HTTPS DATA CHECK
  console.log('\n[3/5] Testing Supabase REST API (Port 443) Table Access & Counts...');
  const client = supabaseAdmin || supabase;
  if (!client) {
    console.error('❌ Supabase client is not available!');
  } else {
    const tables = [
      'universities',
      'users',
      'user_devices',
      'email_verifications',
      'invitations',
      'courses',
      'assessments',
      'questions',
      'quizzes',
      'evaluations'
    ];

    for (const tbl of tables) {
      try {
        const { count, error } = await client.from(tbl).select('*', { count: 'exact', head: true });
        if (error) {
          console.log(`  ❌ ${tbl.padEnd(20)}: Error (${error.message})`);
        } else {
          console.log(`  ✅ ${tbl.padEnd(20)}: ${count} rows`);
        }
      } catch (err) {
        console.log(`  ❌ ${tbl.padEnd(20)}: Exception (${err.message})`);
      }
    }

    // Inspect Universities data
    const { data: univs } = await client.from('universities').select('university_id, name, code, domain, is_active');
    console.log('\nRegistered Universities:');
    (univs || []).forEach(u => console.log(`  - [${u.code}] ${u.name} (Domain: ${u.domain}) - Active: ${u.is_active}`));

    // Inspect Users summary
    const { data: users } = await client.from('users').select('user_id, email, name, role, email_verified, is_active');
    console.log('\nRegistered Users Sample:');
    (users || []).slice(0, 10).forEach(u => console.log(`  - ${u.email} (${u.name}) [Role: ${u.role}, Verified: ${u.email_verified}]`));
  }

  // 4. GEMINI AI TEST
  console.log('\n[4/5] Testing Google Gemini AI Integration...');
  try {
    const model = await getGeminiModel();
    if (!model) {
      console.log('❌ Gemini model could not be initialized.');
    } else {
      const prompt = 'Generate a 1-sentence assessment question about JavaScript.';
      const res = await model.generateContent(prompt);
      console.log('✅ Gemini API is WORKING!');
      console.log('Sample generation:', res.response.text().trim());
    }
  } catch (err) {
    console.error('❌ Gemini Error:', err.message);
  }

  // 5. SMTP EMAIL CONFIGURATION CHECK
  console.log('\n[5/5] Testing SMTP Email Configuration...');
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
    await transporter.verify();
    console.log('✅ SMTP Server Connection: VERIFIED and READY (Gmail)');
  } catch (err) {
    console.log('⚠️ SMTP Verification failed:', err.message);
  }

  console.log('\n==================================================');
  console.log('          DIAGNOSTIC COMPLETED                    ');
  console.log('==================================================');
}

runDeepDiagnostic().catch(console.error);
