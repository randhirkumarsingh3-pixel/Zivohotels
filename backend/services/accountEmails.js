/**
 * Account messages: welcome after sign-up, and the security notice when a password changes.
 * Sent through the notification hub (bell + email).
 */
import { notifyUser } from './notifyService.js';
import { emailLayout } from './emailLayout.js';
import { escapeHtml as h } from '../utils/html.js';

export const sendWelcome = async (user) => {
  const first = String(user.name || '').split(' ')[0];
  return notifyUser(user.id, {
    type: 'WELCOME',
    title: 'Welcome to ZivoPlus',
    message: 'Your account is ready. Find a stay and book in a few taps.',
    link: '/',
    email: {
      jobType: 'SEND_WELCOME',
      subject: 'Welcome to ZivoPlus',
      html: await emailLayout({
        title: `Welcome${first ? `, ${first}` : ''}!`,
        body: `<p>Your ZivoPlus account is ready. You can now book stays, keep all your bookings in one place, and earn Zivo Rewards points on every stay.</p>`,
        rows: [['Email', user.email], ['Mobile', user.phone]],
        cta: { label: 'Find a stay', href: '/' },
      }),
    },
  });
};

export const sendPasswordChanged = async (user, { ip } = {}) => notifyUser(user.id, {
  type: 'PASSWORD_CHANGED',
  title: 'Your password was changed',
  message: "If this wasn't you, reset your password now and contact support.",
  link: '/account',
  email: {
    jobType: 'SEND_PASSWORD_CHANGED',
    priority: 1,
    subject: 'Your ZivoPlus password was changed',
    html: await emailLayout({
      title: 'Your password was changed',
      body: `<p>Hi ${h(String(user.name || '').split(' ')[0] || 'there')}, the password for your ZivoPlus account (${h(user.email)}) was just changed, and you were signed out on your other devices.</p>
        <p><b>If this wasn't you</b>, reset your password straight away with "Forgot password" and contact ZivoPlus support.</p>`,
      rows: [['When', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })], ['From', ip]],
      cta: { label: 'Reset password', href: '/forgot-password' },
    }),
  },
});

/** A hotel owner who signed up from "List your property": what happens next. */
export const sendPartnerWelcome = async (user, { propertyName } = {}) => notifyUser(user.id, {
  type: 'WELCOME',
  title: 'Welcome to ZivoPlus for partners',
  message: `Finish registering ${propertyName || 'your property'}: it goes live once our team approves it.`,
  link: '/extranet/onboarding',
  email: {
    jobType: 'SEND_WELCOME',
    subject: `Welcome to ZivoPlus: let's list ${propertyName || 'your property'}`,
    html: await emailLayout({
      title: `Welcome, ${h(String(user.name || '').split(' ')[0] || 'partner')}!`,
      body: `<p>Your partner account is ready. Next:</p>
        <ol style="padding-left:18px;margin:8px 0">
          <li>Finish registering <b>${h(propertyName || 'your property')}</b>: location, photos, rooms, rates and policies.</li>
          <li>Add your legal and bank details, and accept the partner agreement.</li>
          <li>Submit it: our team reviews it, usually within 2 working days, and you're live.</li>
        </ol>
        <p>Your progress is saved as you go.</p>`,
      cta: { label: 'Continue registration', href: '/extranet/onboarding' },
      note: 'Questions? Write to partners@zivoplus.com.',
    }),
  },
});
