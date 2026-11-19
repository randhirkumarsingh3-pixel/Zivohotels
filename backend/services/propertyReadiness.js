import prisma from '../config/db.js';

/**
 * Rules a property must meet before it can be submitted for review and before an admin
 * can approve it. Shared by the owner extranet, the admin wizard and the review queue so
 * the three paths can't drift apart.
 *
 * - Bank details are always required (payouts go to this account).
 * - KYC documents: PAN and a cancelled cheque / bank proof always; the GST certificate only
 *   when the property has a GSTIN.
 * - Submit: each required document must be uploaded and not rejected or expired.
 * - Approve: each required document must be VERIFIED by an admin.
 */

export const KYC_LABELS = {
  PAN: 'PAN card',
  GST: 'GST certificate',
  BANK_PROOF: 'Cancelled cheque / bank proof',
  OWNERSHIP_PROOF: 'Ownership / lease proof',
  TRADE_LICENSE: 'Trade license',
  FIRE_SAFETY: 'Fire NOC / safety certificate',
};

export const requiredKycTypes = (hotel) => {
  const types = ['PAN', 'BANK_PROOF'];
  if (hotel?.gstin && String(hotel.gstin).trim()) types.push('GST');
  return types;
};

const BANK_FIELDS = [
  ['accountName', 'account holder name'],
  ['bankName', 'bank name'],
  ['accountNumber', 'account number'],
  ['ifscCode', 'IFSC code'],
];

export const bankDetailProblems = (bankDetail) => {
  if (!bankDetail) return ['Bank details are missing'];
  const missing = BANK_FIELDS
    .filter(([key]) => !bankDetail[key] || !String(bankDetail[key]).trim())
    .map(([, label]) => label);
  return missing.length ? [`Bank details are incomplete (missing ${missing.join(', ')})`] : [];
};

/**
 * Pure check, so it can be unit-tested without a database.
 * @param {'submit'|'approve'} stage
 */
export const evaluateReadiness = ({ hotel, bankDetail, kycRecords = [] }, stage) => {
  const problems = [...bankDetailProblems(bankDetail)];

  for (const type of requiredKycTypes(hotel)) {
    const label = KYC_LABELS[type] || type;
    const doc = kycRecords.find((r) => r.documentType === type);
    if (!doc) {
      problems.push(`${label} has not been uploaded`);
    } else if (doc.documentStatus === 'REJECTED') {
      problems.push(`${label} was rejected; upload a corrected file`);
    } else if (doc.documentStatus === 'EXPIRED') {
      problems.push(`${label} has expired; upload a current file`);
    } else if (stage === 'approve' && doc.documentStatus !== 'VERIFIED') {
      problems.push(`${label} has not been verified yet`);
    }
  }

  return problems;
};

export const MIN_PHOTOS = 5;

/**
 * What guests need to find and book the property: its map pin (near-me search, directions), its
 * area (search by locality), photos, and a room with a price (a hotel with no priced room never
 * appears in search results). Pure, for unit tests.
 */
export const listingProblems = ({ hotel, photoCount = 0, pricedRoomTypes = 0 }) => {
  const problems = [];
  const lat = Number(hotel?.latitude);
  const lng = Number(hotel?.longitude);
  if (!(Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng))) problems.push('Set the property on the map (Location step)');
  if (!String(hotel?.integrationSettings?.addressDetails?.area || '').trim()) problems.push('Add the area or locality (Location step), e.g. Marathahalli');
  if (photoCount < MIN_PHOTOS) problems.push(`Add at least ${MIN_PHOTOS} photos (${photoCount} so far)`);
  if (pricedRoomTypes < 1) problems.push('Add at least one room type with a rate plan that has a price');
  return problems;
};

export const checkPropertyReadiness = async (hotel, stage) => {
  const [bankDetail, kycRecords, full, photoCount, pricedRoomTypes] = await Promise.all([
    prisma.bankDetail.findUnique({ where: { hotelId: hotel.id } }),
    prisma.kYCRecord.findMany({
      where: { hotelId: hotel.id },
      select: { documentType: true, documentStatus: true },
    }),
    prisma.hotel.findUnique({ where: { id: hotel.id }, select: { latitude: true, longitude: true, integrationSettings: true } }),
    prisma.hotelImage.count({ where: { hotelId: hotel.id } }),
    prisma.roomType.count({ where: { hotelId: hotel.id, isActive: { not: false }, ratePlans: { some: { isActive: true, basePrice: { gt: 0 } } } } }),
  ]);
  return [
    ...listingProblems({ hotel: { ...hotel, ...full }, photoCount, pricedRoomTypes }),
    ...evaluateReadiness({ hotel, bankDetail, kycRecords }, stage),
  ];
};
