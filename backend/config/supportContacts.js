/**
 * ZivoPlus guest support contacts: phone, email, WhatsApp and hours.
 *
 * Set in Admin → Platform Settings → Support (stored as system config "support_settings");
 * until then the ZIVO_SUPPORT_PHONE / ZIVO_SUPPORT_EMAIL settings of the server. Used by the help
 * page, My Bookings, booking emails and vouchers, so a change shows everywhere within a minute.
 */
import { getSystemConfig } from './systemConfig.js';

const clean = (v) => String(v ?? '').trim();

/** "9663035520" -> "919663035520" (WhatsApp needs the country code) */
export const whatsappDigits = (phone) => {
  const d = clean(phone).replace(/\D/g, '');
  if (!d) return '';
  return d.length === 10 ? `91${d}` : d.replace(/^0+/, '');
};

export const supportFrom = (saved = {}) => {
  const phone = clean(saved.phone) || clean(process.env.ZIVO_SUPPORT_PHONE);
  const email = clean(saved.email) || clean(process.env.ZIVO_SUPPORT_EMAIL);
  const whatsapp = clean(saved.whatsapp) || phone;
  return {
    phone,
    email: email.toLowerCase(),
    whatsapp,
    whatsappLink: whatsapp ? `https://wa.me/${whatsappDigits(whatsapp)}` : '',
    hours: clean(saved.hours) || '',
  };
};

export const getSupportContacts = async () => supportFrom((await getSystemConfig()).support_settings || {});
