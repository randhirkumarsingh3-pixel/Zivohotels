/** "5% off (up to ₹750)" / "₹300 off" for a first-booking offer. */
export const offerText = (o) => {
  if (!o) return '';
  if (o.discountType === 'FLAT') return `₹${Math.round(o.value).toLocaleString('en-IN')} off`;
  return `${o.value}% off${o.maxDiscount ? ` (up to ₹${Math.round(o.maxDiscount).toLocaleString('en-IN')})` : ''}`;
};

/** "₹99 ZivoPlus service fee" / "2% ZivoPlus service fee (up to ₹500)", for a fee that is on. */
export const serviceFeeText = (f) => {
  if (!f) return '';
  if (f.type === 'FLAT') return `₹${Math.round(f.value).toLocaleString('en-IN')} ZivoPlus service fee per booking`;
  return `${f.value}% ZivoPlus service fee${f.maxAmount ? ` (up to ₹${Math.round(f.maxAmount).toLocaleString('en-IN')})` : ''}`;
};
