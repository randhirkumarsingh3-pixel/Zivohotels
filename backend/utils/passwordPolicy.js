/**
 * One password policy for every place a password is set (sign-up, change, reset, accepting an
 * invite). Length first (8+, staff and hotel teams 10+), then no common or guessable passwords:
 * a list of the most used ones, keyboard and number runs, one repeated character, and nothing
 * built from the person's own email, phone or name. Returns why a password is refused, or null.
 */
const COMMON = new Set(`password password1 password12 password123 passw0rd p@ssw0rd p@ssword 123456789 1234567890 12345678 123456 1234567 87654321 11111111 00000000
12341234 11223344 123123123 123qwe 1q2w3e4r 1q2w3e4r5t qwerty qwerty123 qwertyuiop qwerty12 asdfghjkl asdf1234 zxcvbnm zxcvbnm123 abc12345 abcd1234 abcdefgh
iloveyou iloveyou1 welcome welcome1 welcome123 letmein letmein1 monkey123 dragon123 sunshine princess football baseball superman batman123 trustno1 master123
admin admin123 admin1234 administrator root1234 changeme changeme1 default1 guest123 test1234 testing123 secret123 login123 user1234 pass1234
india123 india@123 bharat123 mumbai123 delhi123 bangalore cricket123 sachin123 krishna123 ganesh123 shivaji123 jaihind1
zivoplus zivoplus1 zivoplus123 zivoplus@123 zivohotels zivohotels123 zivo1234 hotel123 hotel1234 booking123 travel123 holiday123 goa12345
samsung123 nokia1234 google123 facebook1 whatsapp1 computer internet1 qazwsxedc 1qaz2wsx`.split(/\s+/).filter(Boolean));

const RUNS = ['0123456789', 'abcdefghijklmnopqrstuvwxyz', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1qaz2wsx3edc'];

/** Minimum length: staff (ADMIN) and hotel teams (OWNER) guard more than one person's data. */
export const minLength = (role) => (['ADMIN', 'OWNER'].includes(role) ? 10 : 8);

export const weakPasswordReason = (password, { email, phone, name, role } = {}) => {
  const pw = String(password || '');
  const min = minLength(role);
  if (pw.length < min) return `Use at least ${min} characters for the password`;
  if (pw.length > 128) return 'Use at most 128 characters';
  const low = pw.toLowerCase();
  if (COMMON.has(low) || COMMON.has(low.replace(/[!@#$%^&*.]+$/, ''))) return 'This password is too common. Choose something harder to guess';
  if (/^(.)\1+$/.test(pw)) return 'Don\'t use one character over and over';
  const letters = low.replace(/[^a-z0-9]/g, '');
  // A run with a few digits added (abcdefgh1, qwerty2026) is still a run
  const isRun = (x) => x.length >= 6 && RUNS.some((r) => r.includes(x) || r.split('').reverse().join('').includes(x));
  if (isRun(letters) || isRun(letters.replace(/\d{1,4}$/, ''))) return 'Don\'t use a run of keys or numbers (like 12345678 or qwerty)';
  const local = String(email || '').toLowerCase().split('@')[0].replace(/[^a-z0-9]/g, '');
  if (local.length >= 4 && low.replace(/[^a-z0-9]/g, '').includes(local)) return 'Don\'t use your email in the password';
  const digits = String(phone || '').replace(/\D/g, '').slice(-8);
  if (digits.length === 8 && pw.includes(digits)) return 'Don\'t use your mobile number in the password';
  const parts = String(name || '').toLowerCase().split(/\s+/).filter((p) => p.length >= 4);
  if (parts.some((p) => low.includes(p)) && pw.length < 16) return 'Don\'t build the password from your name';
  return null;
};

export default { weakPasswordReason, minLength };
