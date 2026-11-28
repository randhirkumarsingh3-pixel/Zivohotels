/** Choices for a company's or travel agent's details (public application and Admin → Business & Partners). */
export const STATES = ['Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'];
export const TYPES = [['PVT_LTD', 'Private limited company'], ['PUBLIC_LTD', 'Public limited company'], ['LLP', 'LLP'], ['PARTNERSHIP', 'Partnership firm'], ['INDIVIDUAL', 'Proprietorship (individual)'], ['HUF', 'HUF'], ['TRUST', 'Trust / society']];
/** First two digits of a GSTIN → state */
export const GST_STATE_CODES = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  10: 'Bihar', 11: 'Sikkim', 12: 'Arunachal Pradesh', 13: 'Nagaland', 14: 'Manipur', 15: 'Mizoram', 16: 'Tripura', 17: 'Meghalaya', 18: 'Assam', 19: 'West Bengal',
  20: 'Jharkhand', 21: 'Odisha', 22: 'Chhattisgarh', 23: 'Madhya Pradesh', 24: 'Gujarat', 26: 'Dadra and Nagar Haveli and Daman and Diu', 27: 'Maharashtra', 29: 'Karnataka',
  30: 'Goa', 31: 'Lakshadweep', 32: 'Kerala', 33: 'Tamil Nadu', 34: 'Puducherry', 35: 'Andaman and Nicobar Islands', 36: 'Telangana', 37: 'Andhra Pradesh', 38: 'Ladakh',
};
export const ACCREDITATION_BODIES = [['', 'None'], ['IATA', 'IATA'], ['TAAI', 'TAAI'], ['TAFI', 'TAFI'], ['MOT', 'Ministry of Tourism'], ['OTHER', 'Other']];
export const MONTHLY_BOOKINGS = ['1-10', '11-50', '51-200', '200+'];
export const PRICING_PREFERENCES = [['', 'Choose…'], ['NET', 'Net rates with my markup'], ['COMMISSION', 'Public price with commission'], ['NOT_SURE', 'Not sure yet']];
export const PROFILE_FIELDS = ['name', 'legalName', 'incorporationType', 'pan', 'gstin', 'address', 'city', 'state', 'pincode', 'billingEmail', 'phone', 'website', 'contactName', 'contactDesignation', 'isSignatory', 'accreditation', 'businessProfile', 'gstDeclaration'];
