/**
 * Checks on a property's legal and bank details during onboarding. What each check really proves:
 *
 *  PAN     format, and that its 4th letter (holder type) fits the business type. It can't tell
 *          whether the PAN is issued or whose it is (that needs a paid PAN-verification service).
 *  GSTIN   format, check digit (catches typos), that the PAN inside it is the PAN entered, and
 *          that its state is the property's state.
 *  IFSC    looked up in Razorpay's free public IFSC directory: bank, branch and city. If the
 *          directory can't be reached, the bank is named from the code's first four letters.
 *  Account the "₹1 test deposit" (penny drop) through RazorpayX when it's set up
 *          (RAZORPAYX_ACCOUNT_NUMBER); it returns the name the bank holds for the account, which
 *          is compared with the legal name. Without it, ZivoPlus checks the account against the
 *          cancelled cheque during review ("Verify by hand").
 */
import axios from 'axios';

// ─── PAN ─────────────────────────────────────────────────────────────────────
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const PAN_HOLDER = { P: 'an individual', C: 'a company', H: 'a Hindu Undivided Family', F: 'a firm or LLP', A: 'an association of persons', T: 'a trust', B: 'a body of individuals', L: 'a local authority', J: 'an artificial juridical person', G: 'a government body' };
// Business type in the Finance step -> PAN 4th letters that fit it
const FITS = { INDIVIDUAL: ['P'], PARTNERSHIP: ['F'], LLP: ['F'], PVT_LTD: ['C'], PUBLIC_LTD: ['C'], HUF: ['H'], TRUST: ['T'] };

export const checkPan = (panIn, incorporationType) => {
  const pan = String(panIn || '').trim().toUpperCase();
  if (!PAN_RE.test(pan)) return { ok: false, pan, message: 'A PAN has 5 letters, 4 digits and a letter, e.g. ABCDE1234F.' };
  const kind = pan[3];
  const holder = PAN_HOLDER[kind];
  if (!holder) return { ok: false, pan, message: `The 4th letter of a PAN shows who holds it; "${kind}" isn't a valid one. Check the PAN.` };
  const fits = FITS[incorporationType];
  if (fits && !fits.includes(kind)) {
    return { ok: false, pan, holder, message: `This PAN belongs to ${holder}, but the business type is ${String(incorporationType).replace('_', ' ').toLowerCase()}. Use the PAN of the business that will receive payouts, or change the business type.` };
  }
  return { ok: true, pan, holder, message: `Valid PAN format. Held by ${holder}.` };
};

// ─── GSTIN ───────────────────────────────────────────────────────────────────
export const GST_STATES = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  10: 'Bihar', 11: 'Sikkim', 12: 'Arunachal Pradesh', 13: 'Nagaland', 14: 'Manipur', 15: 'Mizoram', 16: 'Tripura', 17: 'Meghalaya', 18: 'Assam', 19: 'West Bengal',
  20: 'Jharkhand', 21: 'Odisha', 22: 'Chhattisgarh', 23: 'Madhya Pradesh', 24: 'Gujarat', 26: 'Dadra and Nagar Haveli and Daman and Diu', 27: 'Maharashtra', 29: 'Karnataka',
  30: 'Goa', 31: 'Lakshadweep', 32: 'Kerala', 33: 'Tamil Nadu', 34: 'Puducherry', 35: 'Andaman and Nicobar Islands', 36: 'Telangana', 37: 'Andhra Pradesh', 38: 'Ladakh',
};
const GST_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** GSTIN check digit (mod 36, the GSTN algorithm). */
export const gstCheckDigit = (first14) => {
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const v = CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(v / 36) + (v % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
};

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
const sameState = (a, b) => {
  const x = norm(a); const y = norm(b);
  if (!x || !y) return true;
  return x === y || (x.includes('delhi') && y.includes('delhi')) || (x.includes('dadra') && y.includes('daman'));
};

export const checkGstin = (gstIn, { pan, state } = {}) => {
  const gstin = String(gstIn || '').trim().toUpperCase();
  if (!gstin) return { ok: true, gstin: '', message: 'No GSTIN (optional).' };
  if (!GST_RE.test(gstin)) return { ok: false, gstin, message: 'A GSTIN has 15 characters: 2-digit state code, the 10-character PAN, then 3 more, e.g. 29ABCDE1234F1Z5.' };
  if (gstCheckDigit(gstin.slice(0, 14)) !== gstin[14]) return { ok: false, gstin, message: 'This GSTIN has a typo: its last character doesn\'t match the rest. Check it against the GST certificate.' };
  const stateCode = gstin.slice(0, 2);
  const stateName = GST_STATES[stateCode] || GST_STATES[Number(stateCode)];
  if (!stateName) return { ok: false, gstin, message: `${stateCode} isn't a GST state code.` };
  const panIn = gstin.slice(2, 12);
  if (pan && String(pan).toUpperCase() !== panIn) return { ok: false, gstin, stateCode, stateName, message: `This GSTIN is registered to PAN ${panIn}, not ${String(pan).toUpperCase()}. Both must belong to the same business.` };
  if (state && !sameState(stateName, state)) return { ok: false, gstin, stateCode, stateName, message: `This GSTIN is registered in ${stateName}, but the property is in ${state}. Use the GSTIN for the property's state.` };
  return { ok: true, gstin, stateCode, stateName, pan: panIn, message: `Valid GSTIN, registered in ${stateName}.` };
};

// ─── IFSC ────────────────────────────────────────────────────────────────────
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const BANK_CODES = {
  SBIN: 'State Bank of India', HDFC: 'HDFC Bank', ICIC: 'ICICI Bank', UTIB: 'Axis Bank', KKBK: 'Kotak Mahindra Bank', INDB: 'IndusInd Bank', YESB: 'Yes Bank',
  PUNB: 'Punjab National Bank', BARB: 'Bank of Baroda', CNRB: 'Canara Bank', UBIN: 'Union Bank of India', IDFB: 'IDFC First Bank', BKID: 'Bank of India',
  CBIN: 'Central Bank of India', IOBA: 'Indian Overseas Bank', IDIB: 'Indian Bank', UCBA: 'UCO Bank', MAHB: 'Bank of Maharashtra', PSIB: 'Punjab & Sind Bank',
  FDRL: 'Federal Bank', SIBL: 'South Indian Bank', KARB: 'Karnataka Bank', KVBL: 'Karur Vysya Bank', CIUB: 'City Union Bank', TMBL: 'Tamilnad Mercantile Bank',
  RATN: 'RBL Bank', DLXB: 'Dhanlaxmi Bank', JAKA: 'Jammu & Kashmir Bank', AUBL: 'AU Small Finance Bank', ESFB: 'Equitas Small Finance Bank', UJVN: 'Ujjivan Small Finance Bank',
  AIRP: 'Airtel Payments Bank', PYTM: 'Paytm Payments Bank', IPOS: 'India Post Payments Bank', DBSS: 'DBS Bank India', SCBL: 'Standard Chartered Bank', HSBC: 'HSBC', CITI: 'Citibank',
  BDBL: 'Bandhan Bank', CSBK: 'CSB Bank', NKGS: 'NKGSB Co-operative Bank', SVCB: 'SVC Co-operative Bank', COSB: 'Cosmos Co-operative Bank', SRCB: 'Saraswat Co-operative Bank',
};
const ifscCache = new Map();

export const lookupIfsc = async (codeIn) => {
  const ifsc = String(codeIn || '').trim().toUpperCase();
  if (!IFSC_RE.test(ifsc)) return { ok: false, ifsc, message: 'An IFSC has 11 characters: 4 letters, a zero, then 6 letters or digits, e.g. HDFC0001234.' };
  if (ifscCache.has(ifsc)) return ifscCache.get(ifsc);
  try {
    const { data, status } = await axios.get(`https://ifsc.razorpay.com/${ifsc}`, { timeout: 6000, validateStatus: () => true });
    if (status === 404) {
      const r = { ok: false, ifsc, message: 'No bank branch has this IFSC. Check it on your cheque book or bank statement.' };
      ifscCache.set(ifsc, r);
      return r;
    }
    if (status === 200 && data?.BANK) {
      const r = { ok: true, ifsc, source: 'directory', bank: data.BANK, branch: data.BRANCH, address: data.ADDRESS, city: data.CITY, state: data.STATE, upi: Boolean(data.UPI), imps: Boolean(data.IMPS), neft: Boolean(data.NEFT), message: `${data.BANK}, ${data.BRANCH}` };
      ifscCache.set(ifsc, r);
      return r;
    }
  } catch { /* directory unreachable: fall back below */ }
  const bank = BANK_CODES[ifsc.slice(0, 4)];
  return { ok: true, ifsc, source: 'code', bank: bank || null, branch: null, message: bank ? `${bank}. The branch couldn't be looked up right now; type it in.` : 'The bank directory can\'t be reached right now. Type the bank and branch in; ZivoPlus checks them against the cancelled cheque.' };
};

// ─── Account (penny drop) ────────────────────────────────────────────────────
export const pennyDropConfigured = () => Boolean(process.env.RAZORPAYX_ACCOUNT_NUMBER && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

/** How alike two names are, 0..1, ignoring titles, "pvt ltd" and punctuation. */
export const nameMatch = (a, b) => {
  const clean = (s) => String(s || '').toLowerCase().replace(/\b(m\/s|mr|mrs|ms|dr|shri|smt|private|pvt|limited|ltd|llp|the|and|&)\b/g, ' ').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const x = new Set(clean(a)); const y = new Set(clean(b));
  if (!x.size || !y.size) return 0;
  let common = 0; x.forEach((w) => { if (y.has(w)) common += 1; });
  return common / Math.max(x.size, y.size);
};

const rzpx = () => axios.create({
  baseURL: 'https://api.razorpay.com/v1', timeout: 15000, validateStatus: () => true,
  auth: { username: process.env.RAZORPAY_KEY_ID, password: process.env.RAZORPAY_KEY_SECRET },
});

/**
 * Starts a ₹1 test deposit to the account. Returns { status: 'PENDING'|'VERIFIED'|'FAILED'|'MANUAL', ... }.
 * status MANUAL: no provider set up; the account is checked against the cancelled cheque.
 */
export const startAccountCheck = async ({ accountNumber, ifsc, holderName, contactName, email }) => {
  if (!pennyDropConfigured()) return { status: 'MANUAL', method: 'MANUAL', message: 'Automatic account check isn\'t set up yet. ZivoPlus will check the account against your cancelled cheque during review.' };
  const api = rzpx();
  const contact = await api.post('/contacts', { name: (contactName || holderName || 'Property owner').slice(0, 50), email, type: 'vendor' });
  if (contact.status >= 300) return { status: 'FAILED', method: 'PENNY_DROP', message: contact.data?.error?.description || 'Could not start the account check.' };
  const fa = await api.post('/fund_accounts', { contact_id: contact.data.id, account_type: 'bank_account', bank_account: { name: (holderName || '').slice(0, 120), ifsc, account_number: accountNumber } });
  if (fa.status >= 300) return { status: 'FAILED', method: 'PENNY_DROP', message: fa.data?.error?.description || 'The bank rejected these account details.' };
  const v = await api.post('/fund_accounts/validations', { account_number: process.env.RAZORPAYX_ACCOUNT_NUMBER, fund_account: { id: fa.data.id }, amount: 100, currency: 'INR', notes: { purpose: 'ZivoPlus payout account check' } });
  if (v.status >= 300) return { status: 'FAILED', method: 'PENNY_DROP', message: v.data?.error?.description || 'Could not start the account check.' };
  return readValidation(v.data, holderName);
};

const readValidation = (d, holderName) => {
  const res = d?.results || {};
  if (d?.status === 'completed') {
    const active = res.account_status === 'active';
    const bankName = res.registered_name || '';
    const score = nameMatch(bankName, holderName);
    return {
      status: active ? (score >= 0.5 ? 'VERIFIED' : 'NAME_MISMATCH') : 'FAILED', method: 'PENNY_DROP', ref: d.id, bankHolderName: bankName, nameScore: Math.round(score * 100) / 100,
      message: !active ? 'The bank says this account can\'t receive money. Check the number and IFSC.' : score >= 0.5 ? `Account verified. Name at the bank: ${bankName}.` : `The account works, but the bank has it in the name "${bankName}", which doesn't match ${holderName}. Payouts must go to the business's own account.`,
    };
  }
  if (d?.status === 'failed') return { status: 'FAILED', method: 'PENNY_DROP', ref: d.id, message: 'The test deposit failed. Check the account number and IFSC.' };
  return { status: 'PENDING', method: 'PENNY_DROP', ref: d?.id, message: 'Test deposit sent. The result usually arrives within a minute.' };
};

export const pollAccountCheck = async (ref, holderName) => {
  if (!pennyDropConfigured() || !ref) return null;
  const r = await rzpx().get(`/fund_accounts/validations/${ref}`);
  if (r.status >= 300) return null;
  return readValidation(r.data, holderName);
};

export default { checkPan, checkGstin, gstCheckDigit, lookupIfsc, startAccountCheck, pollAccountCheck, pennyDropConfigured, nameMatch, GST_STATES };
