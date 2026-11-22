import { createPaymentOrder, verifyPaymentApi, createExtensionApi, verifyExtensionApi } from '../services/api';

/**
 * Pays an existing unpaid booking online with Razorpay (reserve now, pay later; My Bookings and the
 * reservation screen). Resolves 'paid' when the payment is verified, 'closed' when the guest closes
 * the payment window; rejects with a message the guest can read. The booking stays reserved until
 * its deadline whatever happens here.
 */
const loadRazorpay = () => new Promise((resolve) => {
  if (window.Razorpay) return resolve(true);
  const script = document.createElement('script');
  script.src = 'https://checkout.razorpay.com/v1/checkout.js';
  script.onload = () => resolve(true);
  script.onerror = () => resolve(false);
  document.body.appendChild(script);
});

export const payForBooking = async (booking, prefill = {}) => {
  if (!(await loadRazorpay())) throw new Error('The payment window could not load. Check your connection and try again.');
  const orderRes = await createPaymentOrder(booking.id);
  const order = orderRes.data;
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: import.meta.env.VITE_RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: order.currency,
      name: 'ZivoHotels',
      description: `Booking ${booking.bookingRef}`,
      order_id: order.id,
      prefill: { name: prefill.name || booking.guestName, email: prefill.email || booking.guestEmail, contact: prefill.phone || booking.guestPhone },
      theme: { color: '#1a56db' },
      handler: async (response) => {
        try {
          await verifyPaymentApi({ ...response, bookingId: booking.id });
          resolve('paid');
        } catch (err) {
          reject(new Error(err?.message || 'We could not confirm the payment. If money was taken, it is refunded automatically.'));
        }
      },
      modal: { ondismiss: () => resolve('closed') },
    });
    rzp.on('payment.failed', (r) => reject(new Error(r?.error?.description || 'The payment failed. You can try again before the deadline.')));
    rzp.open();
  });
};

/**
 * Pays for extra hours on an hourly stay: a Razorpay order for the difference, then the stay is
 * extended once the payment is confirmed. Resolves 'paid' or 'closed'; rejects with a message.
 */
export const payForExtension = async (booking, hours) => {
  if (!(await loadRazorpay())) throw new Error('The payment window could not load. Check your connection and try again.');
  const { order, option } = await createExtensionApi(booking.id, hours);
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: import.meta.env.VITE_RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: order.currency,
      name: 'ZivoHotels',
      description: `${option.hours} extra hour${option.hours === 1 ? '' : 's'} · ${booking.bookingRef}`,
      order_id: order.id,
      prefill: { name: booking.guestName, email: booking.guestEmail, contact: booking.guestPhone },
      theme: { color: '#1a56db' },
      handler: async (response) => {
        try {
          await verifyExtensionApi(booking.id, response);
          resolve('paid');
        } catch (err) {
          reject(new Error(err?.message || 'We could not confirm the payment. If money was taken, it is refunded automatically.'));
        }
      },
      modal: { ondismiss: () => resolve('closed') },
    });
    rzp.on('payment.failed', (r) => reject(new Error(r?.error?.description || 'The payment failed. Please try again.')));
    rzp.open();
  });
};

/** "Sat, 21 Nov, 6:30 pm" (India time) */
export const deadlineLabel = (d) => new Date(d).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

/** A booking still waiting for its payment before its deadline: pay later, or an hourly stay held for 30 minutes. */
export const needsPayment = (b) => b?.status === 'PENDING' && (b?.paymentType === 'PAY_AT_HOTEL' || b?.stayType === 'HOURLY') && b?.paymentStatus !== 'PAID'
  && b?.expiresAt && new Date(b.expiresAt) > new Date();

