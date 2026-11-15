import { downloadVoucher } from '../services/api';

/** Downloads a booking voucher PDF and saves it (guest confirmation or hotelier voucher). */
export const saveVoucher = async (bookingId, bookingRef, type = 'guest') => {
  const blob = await downloadVoucher(bookingId, type);
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${type === 'hotelier' ? 'Hotelier-Voucher' : 'Booking-Voucher'}-${bookingRef || bookingId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => window.URL.revokeObjectURL(url), 10000);
};
