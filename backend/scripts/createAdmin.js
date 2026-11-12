/**
 * createAdmin.js — create the first ADMIN account (or promote an existing user to ADMIN).
 *
 * Safe to run against production: it never deletes anything and only touches the one
 * email given. Run it once after `prisma migrate deploy` on a new database.
 *
 *   ADMIN_PASSWORD='a-long-password' node scripts/createAdmin.js --email you@zivohotels.com --name "Your Name"
 *
 * If ADMIN_PASSWORD is not set, the password is asked for interactively (input hidden).
 * Re-running for an existing user promotes them to ADMIN and, if a password is given,
 * resets it and signs out their existing sessions.
 */
import 'dotenv/config';
import readline from 'readline';
import bcrypt from 'bcryptjs';
import { parseArgs } from 'util';
import prisma from '../config/db.js';

const MIN_PASSWORD_LENGTH = 12;

const askHidden = (question) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); };
    rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });

const fail = (message) => {
  console.error(`❌ ${message}`);
  process.exit(1);
};

const main = async () => {
  // Built-in parser: minimist is a dev dependency and isn't in the production image
  const { values: argv } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' } } });
  const email = (argv.email || '').trim().toLowerCase();
  const name = (argv.name || '').trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fail('Usage: node scripts/createAdmin.js --email you@example.com --name "Your Name"');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing && !name) fail('--name is required when creating a new account.');

  let password = process.env.ADMIN_PASSWORD;
  if (!password && !existing) password = await askHidden(`Password for ${email} (min ${MIN_PASSWORD_LENGTH} characters): `);
  if (password !== undefined && password !== '' && password.length < MIN_PASSWORD_LENGTH) {
    fail(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (!existing && !password) fail('A password is required for a new account.');

  const hashed = password ? await bcrypt.hash(password, 12) : undefined;

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        role: 'ADMIN',
        status: 'ACTIVE',
        ...(name && { name }),
        ...(hashed && { password: hashed, tokenVersion: { increment: 1 }, mustChangePassword: false }),
      },
    });
    console.log(`✅ ${email} is now an ADMIN${hashed ? ' (password reset, existing sessions signed out)' : ''}.`);
  } else {
    await prisma.user.create({ data: { email, name, password: hashed, role: 'ADMIN', status: 'ACTIVE' } });
    console.log(`✅ Created ADMIN account ${email}.`);
  }

  await prisma.auditLog.create({
    data: {
      action: existing ? 'ADMIN_PROMOTED_VIA_SCRIPT' : 'ADMIN_CREATED_VIA_SCRIPT',
      entityType: 'USER',
      entityId: email,
      userId: 'SYSTEM',
      details: { email, passwordChanged: Boolean(hashed) },
    },
  }).catch(() => {});
};

main()
  .catch((err) => fail(err.message))
  .finally(() => prisma.$disconnect());
