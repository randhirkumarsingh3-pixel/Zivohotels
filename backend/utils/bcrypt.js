/**
 * Password hashing. Uses the native `bcrypt` package, which hashes on a background thread so a
 * sign-in never holds up other requests on the same server process. Falls back to `bcryptjs`
 * (pure JavaScript, blocks while hashing) only if the native build can't load on this machine.
 * Both read and write the same hashes, so existing passwords keep working.
 */
import { createRequire } from 'module';
import bcryptjs from 'bcryptjs';

const require = createRequire(import.meta.url);
let impl = bcryptjs;
try {
  impl = require('bcrypt');
} catch (err) {
  console.warn(`[bcrypt] Native bcrypt unavailable (${err.message.split('\n')[0]}); using bcryptjs`);
}

export const usingNativeBcrypt = impl !== bcryptjs;

const bcrypt = {
  hash: (data, saltOrRounds) => impl.hash(data, saltOrRounds),
  // No password set (e.g. a Google-only account) or nothing typed: simply not a match
  compare: async (data, encrypted) => (typeof data === 'string' && typeof encrypted === 'string' && encrypted ? impl.compare(data, encrypted) : false),
  genSalt: (rounds) => impl.genSalt(rounds),
};

export default bcrypt;
