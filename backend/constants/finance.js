/**
 * Statutory rates applied to every hotel settlement (owner-confirmed, Nov 2026).
 * Percentages. Change them here if the law or the owner's accountant says so.
 *
 * - GST on ZivoHotels' commission: 18%, split CGST 9% + SGST 9% when ZivoHotels and the hotel are
 *   in the same state, otherwise IGST 18%.
 * - TCS under GST (section 52): 0.5% of the pre-GST value of what ZivoHotels collected online,
 *   only for GST-registered hotels (CGST 0.25% + SGST 0.25%).
 * - TDS under income tax (section 194-O): 0.1% of the pre-GST value of the stay.
 */
export const COMMISSION_GST_PERCENT = 18;
export const TCS_PERCENT = 0.5;
export const TDS_PERCENT = 0.1;
export const DEFAULT_COMMISSION_PERCENT = 15;

/**
 * ZivoHotels' own GST state code (first two digits of its GSTIN), e.g. "27" for Maharashtra.
 * Set ZIVO_GSTIN or ZIVO_GST_STATE_CODE in production; without it every commission is treated
 * as inter-state (IGST).
 */
export const zivoGstStateCode = () =>
  (process.env.ZIVO_GST_STATE_CODE || process.env.ZIVO_GSTIN || '').trim().slice(0, 2) || null;

/** GST state codes by state / union territory name (lower case). */
export const GST_STATE_CODES = {
  'jammu and kashmir': '01', 'himachal pradesh': '02', 'punjab': '03', 'chandigarh': '04',
  'uttarakhand': '05', 'haryana': '06', 'delhi': '07', 'rajasthan': '08', 'uttar pradesh': '09',
  'bihar': '10', 'sikkim': '11', 'arunachal pradesh': '12', 'nagaland': '13', 'manipur': '14',
  'mizoram': '15', 'tripura': '16', 'meghalaya': '17', 'assam': '18', 'west bengal': '19',
  'jharkhand': '20', 'odisha': '21', 'chhattisgarh': '22', 'madhya pradesh': '23', 'gujarat': '24',
  'dadra and nagar haveli and daman and diu': '26', 'maharashtra': '27', 'karnataka': '29',
  'goa': '30', 'lakshadweep': '31', 'kerala': '32', 'tamil nadu': '33', 'puducherry': '34',
  'andaman and nicobar islands': '35', 'telangana': '36', 'andhra pradesh': '37', 'ladakh': '38',
};

/** A hotel's GST state code: from its GSTIN if it has one, else from its state name. */
export const hotelGstStateCode = (hotel) => {
  const fromGstin = String(hotel?.gstin || '').trim().slice(0, 2);
  if (/^\d{2}$/.test(fromGstin)) return fromGstin;
  return GST_STATE_CODES[String(hotel?.state || '').trim().toLowerCase()] || null;
};
