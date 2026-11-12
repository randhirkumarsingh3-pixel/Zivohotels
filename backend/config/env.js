/**
 * env.js — load .env and validate configuration BEFORE any other module is evaluated.
 * Imported as the very first import in server.js (ES modules evaluate imports in order),
 * so a missing setting fails with a clear message instead of a crash deep inside a
 * module (e.g. `new Razorpay()` throwing "key_id or oauthToken is mandatory").
 */
import 'dotenv/config';

const REQUIRED = ['DATABASE_URL', 'JWT_SECRET', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'];
const RECOMMENDED = {
  DIRECT_URL: 'Prisma CLI (migrate/db push) needs it; set it to the same value as DATABASE_URL locally',
  RAZORPAY_WEBHOOK_SECRET: 'Razorpay webhooks will be rejected',
  RESEND_API_KEY: 'emails (OTP, booking confirmations) will not be sent',
};

const isProduction = process.env.NODE_ENV === 'production';
const missing = REQUIRED.filter((name) => !process.env[name] || !process.env[name].trim());
const problems = missing.map((name) => `  - ${name} is not set`);

if (isProduction && process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  problems.push('  - JWT_SECRET must be at least 32 characters in production');
}

if (problems.length > 0) {
  console.error(
    `\n❌ ZivoHotels backend cannot start — configuration problems:\n${problems.join('\n')}\n` +
    '   Add them to backend/.env (local) or the service environment / Secret Manager (cloud).\n'
  );
  process.exit(1);
}

for (const [name, impact] of Object.entries(RECOMMENDED)) {
  if (!process.env[name]) console.warn(`⚠️  ${name} is not set — ${impact}.`);
}
