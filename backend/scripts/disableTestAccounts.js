/**
 * disableTestAccounts.js — switch off the logins created by the sample data (prisma/seed.js),
 * whose passwords are written in the code. Run it on any server that real people can reach.
 *
 *   node scripts/disableTestAccounts.js            (lists what it would change)
 *   node scripts/disableTestAccounts.js --apply    (blocks them)
 *
 * Each account is blocked, gets a random unknown password and is signed out everywhere. Their
 * bookings, hotels and history stay. Your own admin (scripts/createAdmin.js) is not touched.
 */
import 'dotenv/config';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from '../config/db.js';

const TEST_EMAILS = ['admin@zivohotels.com', 'extranet@zivotechretreat.com', 'user@zivohotels.com'];

const main = async () => {
  const apply = process.argv.includes('--apply');
  const users = await prisma.user.findMany({ where: { email: { in: TEST_EMAILS } }, select: { id: true, email: true, role: true, status: true } });
  if (!users.length) { console.log('No test accounts found. Nothing to do.'); return; }

  // Don't lock everyone out: there must be another active admin first
  if (users.some((u) => u.role === 'ADMIN')) {
    const otherAdmins = await prisma.user.count({ where: { role: 'ADMIN', status: 'ACTIVE', email: { notIn: TEST_EMAILS } } });
    if (!otherAdmins) {
      console.error('❌ No other active admin. Create yours first: node scripts/createAdmin.js --email you@example.com --name "Your Name"');
      process.exit(1);
    }
  }

  for (const u of users) console.log(`${apply ? 'Blocking' : 'Would block'}: ${u.email} (${u.role}, now ${u.status})`);
  if (!apply) { console.log('\nRun again with --apply to block them.'); return; }

  for (const u of users) {
    await prisma.user.update({
      where: { id: u.id },
      data: {
        status: 'BLOCKED',
        password: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
        tokenVersion: { increment: 1 },
      },
    });
  }
  console.log(`✅ ${users.length} test account(s) blocked.`);
};

main()
  .catch((e) => { console.error('❌', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
