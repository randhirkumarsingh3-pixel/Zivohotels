/** Today and tomorrow as YYYY-MM-DD in the visitor's time zone (default dates for quick searches). */
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const defaultStay = () => {
  const a = new Date();
  const b = new Date(a); b.setDate(a.getDate() + 1);
  return { checkin: ymd(a), checkout: ymd(b) };
};

/** Results page for a city with tonight's dates, 2 guests, 1 room. */
export const cityLink = (city) => `/hotels?${new URLSearchParams({ city, ...defaultStay(), guests: '2', rooms: '1' })}`;
