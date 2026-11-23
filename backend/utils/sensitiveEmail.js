/**
 * Sign-in / verification code emails (job type SEND_OTP) must not show or keep their code
 * anywhere but the recipient's inbox: the admin email log shows them masked, and once the email
 * is sent (or has given up) the stored copy loses its code and body.
 */
export const CODE_EMAIL_TYPES = ['SEND_OTP'];

/** "466351 is your ZivoPlus sign-in code" -> "•••••• is your ZivoPlus sign-in code" */
export const maskCodes = (text) => String(text || '').replace(/\b\d{4,8}\b/g, '••••••');

export const isCodeEmail = (jobType) => CODE_EMAIL_TYPES.includes(jobType);

/** What stays of a code email after it was sent or gave up: who, masked subject, no body. */
export const scrubbedPayload = (payload) => ({
  to: payload?.to,
  subject: maskCodes(payload?.subject),
  scrubbed: true,
});

/** A code is only worth sending while it can still be used. */
export const CODE_EMAIL_MAX_AGE_MS = 15 * 60 * 1000;

export default { maskCodes, isCodeEmail, scrubbedPayload, CODE_EMAIL_TYPES, CODE_EMAIL_MAX_AGE_MS };
