/** "5% off (up to ₹750)" / "₹300 off" for a first-booking offer. */
export const offerText = (o) => {
  if (!o) return '';
  if (o.discountType === 'FLAT') return `₹${Math.round(o.value).toLocaleString('en-IN')} off`;
  return `${o.value}% off${o.maxDiscount ? ` (up to ₹${Math.round(o.maxDiscount).toLocaleString('en-IN')})` : ''}`;
};
