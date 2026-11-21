/**
 * Text messages (SMS). One provider is active, chosen by SMS_PROVIDER:
 *
 *  - test   (default): nothing is sent. Sign-in codes are shown on the screen instead, marked
 *                      "Test mode". Use only until a real provider is connected.
 *  - msg91:  MSG91 (India). MSG91_AUTH_KEY, MSG91_OTP_TEMPLATE_ID (a DLT-approved OTP template
 *            with the code as ##OTP##), optional MSG91_SMS_TEMPLATE_ID for other messages
 *            (variable ##message##).
 *  - twilio: Twilio. TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (a Twilio number or
 *            sender id).
 *
 * In India every SMS template must be registered on DLT (TRAI) through the provider first.
 */

export const smsProvider = () => {
  const p = String(process.env.SMS_PROVIDER || 'test').trim().toLowerCase();
  return ['msg91', 'twilio'].includes(p) ? p : 'test';
};

/** True while no real SMS provider is connected: codes are shown on screen. */
export const smsTestMode = () => smsProvider() === 'test';

/**
 * Indian or international phone number to E.164 ("+919876543210"), or null if it isn't one.
 * 10 digits starting 6-9 are taken as Indian mobiles.
 */
export const normalizePhone = (input) => {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, '');
  if (raw.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
  if (/^0[6-9]\d{9}$/.test(digits)) return `+91${digits.slice(1)}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return `+${digits}`;
  return null;
};

/** "+91 98765 43210" -> "+91 ••••• •3210" for showing where a code went. */
export const maskPhone = (e164) => {
  const s = String(e164 || '');
  return s.length > 4 ? `${s.slice(0, 3)} ••••• •${s.slice(-4)}` : s;
};

const msg91 = async (to, { text, otp }) => {
  const key = process.env.MSG91_AUTH_KEY;
  if (!key) throw new Error('MSG91_AUTH_KEY is not set');
  const mobile = to.replace(/^\+/, '');
  if (otp && process.env.MSG91_OTP_TEMPLATE_ID) {
    const url = `https://control.msg91.com/api/v5/otp?template_id=${encodeURIComponent(process.env.MSG91_OTP_TEMPLATE_ID)}&mobile=${mobile}&otp=${otp}`;
    const r = await fetch(url, { method: 'POST', headers: { authkey: key, 'Content-Type': 'application/json' }, body: '{}' });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || body.type === 'error') throw new Error(`MSG91: ${body.message || r.status}`);
    return body;
  }
  const template = process.env.MSG91_SMS_TEMPLATE_ID;
  if (!template) throw new Error('MSG91_SMS_TEMPLATE_ID is not set');
  const r = await fetch('https://control.msg91.com/api/v5/flow', {
    method: 'POST',
    headers: { authkey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ template_id: template, short_url: '0', recipients: [{ mobiles: mobile, message: text }] }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || body.type === 'error') throw new Error(`MSG91: ${body.message || r.status}`);
  return body;
};

const twilio = async (to, { text }) => {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) throw new Error('TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM must be set');
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: to, From: from, Body: text }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Twilio: ${body.message || r.status}`);
  return body;
};

/**
 * Sends one SMS. `otp` marks a sign-in code (MSG91 sends those through its OTP template).
 * In test mode nothing leaves the server. Returns { sent, provider }.
 */
export const sendSms = async (to, text, { otp } = {}) => {
  const provider = smsProvider();
  if (provider === 'test') {
    if (process.env.NODE_ENV !== 'test') console.log(`[SMS test mode] to ${maskPhone(to)}: ${otp ? '(sign-in code)' : text}`);
    return { sent: false, provider };
  }
  if (provider === 'msg91') await msg91(to, { text, otp });
  else await twilio(to, { text });
  return { sent: true, provider };
};
