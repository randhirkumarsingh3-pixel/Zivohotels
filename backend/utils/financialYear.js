/**
 * India's financial year (1 April to 31 March), in India time. GST invoice and note numbers run
 * per financial year: fyStart(2026-11-26) = 2026, fyLabel(2026) = '26-27'.
 */
export const fyStart = (date = new Date()) => {
  const d = new Date(new Date(date).getTime() + 5.5 * 3600000);
  return d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
};
export const fyLabel = (start) => `${String(start % 100).padStart(2, '0')}-${String((start + 1) % 100).padStart(2, '0')}`;
/** A document number: PREFIX/26-27/000001 (16 characters with a 3-letter prefix) */
export const fyNumber = (prefix, start, n) => `${String(prefix).slice(0, 3)}/${fyLabel(start)}/${String(n).padStart(6, '0')}`;
export default { fyStart, fyLabel, fyNumber };
