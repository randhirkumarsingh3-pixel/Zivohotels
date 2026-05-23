/**
 * audit_env.js
 * Final Environment Variable Verification for Production
 */

import dotenv from 'dotenv';
dotenv.config();

const REQUIRED_VARS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'NODE_ENV'
];

function audit() {
  console.log('🔍 Auditing Production Environment...');
  let errors = 0;

  REQUIRED_VARS.forEach(v => {
    const val = process.env[v];
    if (!val) {
      console.error(`❌ MISSING: ${v}`);
      errors++;
    } else {
      // Basic Format Checks
      if (v === 'DATABASE_URL' && !val.includes('postgres')) console.warn(`⚠️  ${v}: Potential invalid protocol`);
      if (v === 'RAZORPAY_KEY_ID' && !val.startsWith('rzp_')) console.warn(`⚠️  ${v}: Invalid prefix`);
      if (v === 'NODE_ENV' && val !== 'production') console.warn(`⚠️  ${v}: Not set to 'production'`);
      
      console.log(`✅ VERIFIED: ${v} [Length: ${val.length}]`);
    }
  });

  if (errors > 0) {
    console.error(`\n🚨 AUDIT FAILED: ${errors} missing variables! DO NOT DEPLOY.`);
    process.exit(1);
  } else {
    console.log('\n✨ AUDIT PASSED: Environment is production-ready.');
  }
}

audit();
