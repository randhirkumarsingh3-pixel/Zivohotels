import prisma from '../config/db.js';
import { Resend } from 'resend';
import dotenv from 'dotenv';
dotenv.config();

const runVerification = async () => {
  console.log('--- OTP System Verification ---');
  let pass = true;

  try {
    // 1. DB Check
    console.log('[1] Checking Database Connectivity...');
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Database connected');

    // 2. EmailOTP Table
    console.log('[2] Checking EmailOTP Table...');
    const count = await prisma.emailOTP.count();
    console.log(`✅ EmailOTP Table exists (Contains ${count} records)`);

    // 3. Env Vars
    console.log('[3] Checking Environment Variables...');
    if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY.includes('REPLACE_ME') || process.env.RESEND_API_KEY.includes('YOUR_TEST_KEY')) {
      console.warn('⚠️ RESEND_API_KEY is not configured or is a placeholder.');
      pass = false;
    } else {
      console.log('✅ RESEND_API_KEY found');
    }

    if (!process.env.RESEND_FROM_EMAIL) {
      console.warn('⚠️ RESEND_FROM_EMAIL is missing.');
      pass = false;
    } else {
      console.log('✅ RESEND_FROM_EMAIL found');
    }

    // 4. Resend API Connectivity
    if (process.env.RESEND_API_KEY && !process.env.RESEND_API_KEY.includes('YOUR_TEST_KEY')) {
      console.log('[4] Checking Resend Connectivity...');
      const resend = new Resend(process.env.RESEND_API_KEY);
      try {
        const _domains = await resend.domains.list();
        console.log('✅ Resend connected successfully');
      } catch (err) {
        console.warn('⚠️ Resend API Connection failed:', err.message);
        pass = false;
      }
    } else {
      console.log('[4] Skipping Resend Connectivity Check (No Valid Key)');
    }

    console.log('-------------------------------');
    if (pass) {
      console.log('✅ OTP SYSTEM READY FOR PRODUCTION');
      process.exit(0);
    } else {
      console.log('❌ OTP SYSTEM VERIFICATION FAILED. Review warnings above.');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Verification script crashed:', error);
    process.exit(1);
  }
};

runVerification();
