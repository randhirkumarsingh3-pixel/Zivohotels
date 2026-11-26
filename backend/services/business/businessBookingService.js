/**
 * Booking at business rates (Partner Hub agents; companies use the same flow).
 *
 *  rates   which of the given hotels offer this organisation a business rate, and how
 *  quote   the exact price of a stay: the hotel's daily rates priced by the same engine as the
 *          website, then the business rate:
 *            CORPORATE   the company discount, before GST (GST worked out on the lower tariff)
 *            NET         the agent's net rate (trade discount before GST) + their own markup
 *            COMMISSION  the public price; the agent earns the trade discount (hotel-funded, taken
 *                        from the hotel's payout) plus any extra ZivoPlus gives, credited to the
 *                        agency's account at check-out less TDS (194H)
 *  book    paid from the organisation's account (wallet, then credit) or held until a deadline
 *          and paid later; the confirmation goes to the booker, never to the agent's customer
 *  cancel  under the hotel's cancellation policy; the refund goes back to the account
 */
import prisma from '../../config/db.js';
import eventBus from '../../events/eventBus.js';
import { pricingDomain } from '../../domains/pricingDomain.js';
import { roomLinesFrom } from '../../domains/roomLines.js';
import { getDatesInRange } from '../../utils/dateUtils.js';
import bookingService, { loadStayRooms, describeRooms, pricingSettings } from '../bookingService.js';
import { cancelBookingWithRefund, previewGuestCancellation, CancellationError } from '../cancellationService.js';
import { sendBookingConfirmationEmail } from '../emailService.js';
import { scheduleRecompute } from '../dynamicPricingService.js';
import ledgerService from '../finance/ledgerService.js';
import { businessOffer, commissionPayout } from './businessPricing.js';
import { getBusinessSettings, termsFor } from './businessSettings.js';
import { postEntry, accountSummary } from './orgLedger.js';
import { membershipFor, can, PORTAL } from './organisationService.js';
import { policyOf, evaluate, approvalSteps, activeDelegations } from './travelPolicy.js';
import { assertAgreementForBooking } from './orgAgreementService.js';
import { tripForBooking, markTripBooked } from './tripRequests.js';
import { notifyUser } from '../notifyService.js';
import { emailLayout, siteUrl } from '../emailLayout.js';

const fail = (m, code = 400) => Object.assign(new Error(m), { statusCode: code });
const round = (n) => Math.round(Number(n) || 0);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || ''));
const fmt = (d) => new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

/** The organisation, its member, terms and settings, checked for booking. */
const bookingContext = async (orgId, user, action = 'bookings.create') => {
  const { org, member } = await membershipFor(orgId, user, action);
  if (org.status !== 'ACTIVE') throw fail(org.status === 'SUSPENDED' ? 'Your account is suspended: booking is paused. Contact ZivoPlus support.' : 'You can book once ZivoPlus approves your organisation.', 409);
  const settings = await getBusinessSettings();
  if (action === 'bookings.create') await assertAgreementForBooking(org, settings);
  return { org, member, settings, terms: termsFor(org, settings) };
};

/** Which of these hotels offer this organisation a business rate. */
export const ratesFor = async (orgId, user, hotelIds = []) => {
  const { org, terms } = await bookingContext(orgId, user);
  const ids = [...new Set((Array.isArray(hotelIds) ? hotelIds : String(hotelIds || '').split(',')).map(String).filter(Boolean))].slice(0, 200);
  const where = ids.length ? { hotelId: { in: ids } } : {};
  where[org.kind === 'AGENCY' ? 'agentEnabled' : 'corporateEnabled'] = true;
  const rows = await prisma.hotelBusinessRate.findMany({ where, include: { hotel: { select: { id: true, name: true, city: true, status: true, isDeleted: true } } }, take: 500 });
  return rows
    .filter((r) => r.hotel && !r.hotel.isDeleted && ['LIVE', 'ACTIVE'].includes(r.hotel.status))
    .map((r) => ({ hotelId: r.hotelId, hotelName: r.hotel.name, city: r.hotel.city, offer: businessOffer(r, org, terms) }))
    .filter((x) => x.offer);
};

/**
 * The price of a stay for the organisation. Returns { pricing, businessPricing }: pricing is the
 * engine's result for what the organisation pays (net of a company / agent discount).
 */
const priceFor = ({ org, terms, offer, model, markupPct }) => (stayInput) => {
  const base = pricingDomain.calculateStay(stayInput);
  const subtotal = base.subtotal - base.discountAmount; // room charges before GST
  const common = { kind: org.kind, organisationId: org.id, organisationCode: org.code, organisationName: org.name, invoiceMode: terms.invoiceMode, publicAmount: base.finalAmount, publicPreTax: base.baseAmount };
  if (offer.kind === 'CORPORATE' || model === 'NET') {
    const pct = offer.kind === 'CORPORATE' ? offer.discountPct : offer.tradeDiscountPct;
    const pricing = pricingDomain.calculateStay({ ...stayInput, businessDiscountAmount: round(subtotal * pct / 100) });
    const out = { ...common, model: offer.kind === 'CORPORATE' ? 'CORPORATE' : 'NET', discountPct: pct, discountAmount: pricing.businessDiscountAmount, payAmount: pricing.finalAmount };
    if (out.model === 'NET') {
      const mk = markupPct == null || markupPct === '' ? offer.defaultMarkupPct : Number(markupPct);
      if (!Number.isFinite(mk) || mk < 0 || mk > offer.maxMarkupPct) throw fail(`Markup must be between 0 and ${offer.maxMarkupPct}%.`);
      // The agent's markup is on the room charges (before GST); what their customer pays is theirs to set
      out.markupPct = mk;
      out.markupAmount = round(pricing.baseAmount * mk / 100);
      out.sellAmount = pricing.finalAmount + out.markupAmount;
    }
    return { pricing, businessPricing: out };
  }
  // COMMISSION: the public price; commission on the room charges before GST
  const commissionPct = round2(offer.tradeDiscountPct + offer.extraCommissionPct);
  const hotelFunded = round(subtotal * offer.tradeDiscountPct / 100);
  const commissionAmount = round(subtotal * commissionPct / 100);
  const payout = commissionPayout(commissionAmount, terms.tdsPct);
  return {
    pricing: base,
    businessPricing: {
      ...common, model: 'COMMISSION', discountPct: 0, discountAmount: 0, payAmount: base.finalAmount, sellAmount: base.finalAmount,
      commissionPct, commissionAmount, hotelFundedCommission: hotelFunded, zivoFundedCommission: commissionAmount - hotelFunded,
      tdsPct: terms.tdsPct, tdsAmount: payout.tds, netCommission: payout.net,
    },
  };
};

const stayFromInput = (input) => {
  const checkIn = new Date(input.checkIn); const checkOut = new Date(input.checkOut);
  if (Number.isNaN(+checkIn) || Number.isNaN(+checkOut) || checkOut <= checkIn) throw fail('Choose check-in and check-out dates.');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (checkIn < today) throw fail('Check-in can\'t be in the past.');
  return { checkIn, checkOut };
};

/** When a held booking must be paid: the hold time from settings, and at least a day before check-in. */
const holdDeadline = (settings, kind, checkIn) => {
  const hours = Number((kind === 'AGENCY' ? settings.agency : settings.corporate).holdHours ?? 24);
  if (!(hours > 0)) return null;
  const until = new Date(Math.min(Date.now() + hours * 3600000, new Date(checkIn).getTime() - 24 * 3600000));
  return until.getTime() - Date.now() >= 3600000 ? until : null;
};

const offerAt = async (org, terms, hotelId) => {
  const rate = await prisma.hotelBusinessRate.findUnique({ where: { hotelId: String(hotelId) } });
  const offer = businessOffer(rate, org, terms);
  if (!offer) throw fail('This hotel doesn\'t offer business rates to your account.', 404);
  return offer;
};

/** The company traveller for a stay: themselves for a traveller; anyone in the company for the others. */
const travellerFor = async (org, member, travellerMemberId) => {
  if (org.kind !== 'CORPORATE') return null;
  let t = member;
  if (travellerMemberId && travellerMemberId !== member.id) {
    if (member.role === 'TRAVELLER') throw fail('Travellers book their own stays. Ask a booker to book for someone else.', 403);
    t = await prisma.orgMember.findFirst({ where: { id: String(travellerMemberId), organisationId: org.id, status: 'ACTIVE' } });
    if (!t) throw fail('Choose a traveller from your company.');
  }
  const u = await prisma.user.findUnique({ where: { id: t.userId }, select: { id: true, name: true, email: true, phone: true } });
  return { ...t, user: u };
};

/** Prices a stay for the organisation (the website's price for it, then the business rate). */
const priceStay = async ({ org, terms, offer }, input) => {
  const { checkIn, checkOut } = stayFromInput(input);
  const lines = roomLinesFrom({ ...input, guestName: input.guestName || 'Guest' });
  const { rooms, hotel } = await loadStayRooms(lines, { hotelId: String(input.hotelId), checkInDate: checkIn, checkOutDate: checkOut });
  const { taxRules } = await pricingSettings();
  const stayInput = { rooms, hotel, taxRules, prepaidDiscountPercent: 0, checkInDate: checkIn, checkOutDate: checkOut, paymentType: 'PREPAID', dynamicContext: { safeMode: true, userSegment: 'STANDARD', device: 'WEB' } };
  const model = offer.kind === 'AGENCY' ? (input.model || offer.models[0]) : 'CORPORATE';
  if (offer.kind === 'AGENCY' && !offer.models.includes(model)) throw fail('This pricing isn\'t available for your account.');
  const { pricing, businessPricing } = priceFor({ org, terms, offer, model, markupPct: input.markupPct })(stayInput);
  return { checkIn, checkOut, lines, rooms, hotel, model, pricing, businessPricing };
};

/** The company's travel policy for this stay (null for agencies). */
const policyCheck = (org, traveller, hotel, pricing) => {
  if (org.kind !== 'CORPORATE') return null;
  const perNight = pricing.baseAmount / Math.max(1, (pricing.nights || 1) * (pricing.rooms || 1));
  return evaluate(policyOf(org), traveller, hotel.city, perNight);
};
const travellerView = (t) => (t ? { memberId: t.id, userId: t.userId, name: t.user?.name, grade: t.grade || null, costCenter: t.costCenter || null } : null);

export const quote = async (orgId, user, input = {}) => {
  const { org, member, settings, terms } = await bookingContext(orgId, user);
  const offer = await offerAt(org, terms, input.hotelId);
  const traveller = await travellerFor(org, member, input.travellerMemberId);
  const { checkIn, checkOut, lines, rooms, hotel, pricing, businessPricing } = await priceStay({ org, terms, offer }, input);
  const summary = await accountSummary(org, { settings });
  const policy = policyCheck(org, traveller, hotel, pricing);
  const steps = org.kind === 'CORPORATE' && member.role !== 'ADMIN' ? await approvalSteps(org, policyOf(org), policy, traveller, user.id, pricing.finalAmount) : [];
  return {
    hotel: { id: hotel.id, name: hotel.name, city: hotel.city },
    checkIn, checkOut, nights: pricing.nights, rooms: describeRooms(pricing, rooms, lines),
    price: { roomCharges: pricing.subtotal, discount: pricing.businessDiscountAmount || 0, beforeTax: pricing.baseAmount, tax: pricing.taxAmount, taxBreakdown: pricing.taxBreakdown, total: pricing.finalAmount },
    business: businessPricing, offer, traveller: travellerView(traveller),
    policy, needsApproval: steps.length > 0, approvalSteps: steps.map((x) => x.label),
    canPayNow: summary.available >= pricing.finalAmount, available: can(member, 'account.view') ? summary.available : null,
    holdUntil: holdDeadline(settings, org.kind, checkIn),
  };
};

const confirmFromAccount = async (tx, { org, terms, booking, user }) => {
  await postEntry({
    organisationId: org.id, type: 'BOOKING', amount: -Number(booking.totalAmount), reference: booking.bookingRef, bookingId: booking.id,
    note: `Booking ${booking.bookingRef} · ${booking.guestName}`, dueAt: new Date(Date.now() + terms.creditDays * 86400000), createdById: user.id,
  }, tx);
  return tx.booking.update({ where: { id: booking.id }, data: { status: 'CONFIRMED', paymentStatus: 'PAID', paidAmount: booking.totalAmount, remainingAmount: 0, expiresAt: null } });
};

export const book = async (orgId, user, input = {}, ctx = {}) => {
  const { org, member, settings, terms } = await bookingContext(orgId, user);
  const offer = await offerAt(org, terms, input.hotelId);
  const traveller = await travellerFor(org, member, input.travellerMemberId);
  const trip = org.kind === 'CORPORATE' ? await tripForBooking(org, member, input.tripRequestId, traveller?.id) : null;
  const guestName = String(input.guestName || traveller?.user?.name || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  const guestPhone = String(input.guestPhone || traveller?.user?.phone || '').replace(/[^\d+]/g, '').slice(0, 15);
  if (guestName.length < 2) throw fail('Enter the lead traveller\'s name (as on their ID).');
  if (guestPhone.replace(/\D/g, '').length < 10) throw fail('Enter the lead traveller\'s phone number (the hotel may call).');
  const customerEmail = input.customerEmail ? String(input.customerEmail).trim().toLowerCase() : null;
  if (customerEmail && !isEmail(customerEmail)) throw fail('Enter a valid email for the traveller, or leave it empty.');

  // Travel policy (companies): over the cap needs a reason, and approval when the policy says so
  const priced = await priceStay({ org, terms, offer }, input);
  const policy = policyCheck(org, traveller, priced.hotel, priced.pricing);
  const policyReason = String(input.policyReason || '').trim().replace(/\s+/g, ' ').slice(0, 300);
  if (policy?.enabled && !policy.within && policy.requireReason && policyReason.length < 5) {
    throw fail(`This stay is ${inr(policy.perNight)} a night, over the ${inr(policy.cap)} limit for ${policy.gradeName} in ${policy.metro ? 'metro' : 'other'} cities. Give a reason for the exception.`);
  }
  const steps = org.kind === 'CORPORATE' && member.role !== 'ADMIN' ? await approvalSteps(org, policyOf(org), policy, traveller, user.id, priced.pricing.finalAmount) : [];
  const needsApproval = steps.length > 0;
  const hold = input.hold === true || needsApproval;
  const holdUntil = hold ? holdDeadline(settings, org.kind, priced.checkIn) : null;
  if (needsApproval && !holdUntil) throw fail('This stay is too close to check-in to wait for approval. Ask a company admin to book it.', 409);
  if (hold && !holdUntil) throw fail('This stay is too close to check-in to hold. Book and pay now instead.');
  const missing = steps.find((x) => !x.approverMemberIds.length);
  if (missing) throw fail(`No one can give the ${missing.label.toLowerCase()} approval for this trip yet. Ask your company admin to add ${missing.key === 'FINANCE' ? 'a finance member' : 'an approver'}.`, 409);
  const model = priced.model;
  const price = priceFor({ org, terms, offer, model, markupPct: input.markupPct });
  const reference = input.clientReference ? String(input.clientReference).trim().slice(0, 60) : null;

  const lines = roomLinesFrom({ ...input, guestName });
  const dates = getDatesInRange(priced.checkIn, priced.checkOut);
  const result = await bookingService.createBooking(user.id, String(input.hotelId), lines[0].roomTypeId, dates, {
    roomLines: input.roomLines, rooms: input.rooms, adults: input.adults, children: input.children, extraBeds: input.extraBeds,
  }, {
    // The booker gets the confirmation; the traveller's details are for the hotel
    guestName, guestEmail: user.email, guestPhone, ratePlanId: lines[0].ratePlanId, paymentType: 'PREPAID', requestId: ctx.requestId,
    company: { name: org.legalName, gstin: org.gstin || null, address: `${org.address}, ${org.city}, ${org.state} ${org.pincode}` },
    business: {
      organisationId: org.id, channel: org.kind, holdUntil,
      price: async (stayInput) => {
        const r = price(stayInput);
        r.businessPricing = {
          ...r.businessPricing, bookedBy: { id: user.id, name: user.name, email: user.email }, customerEmail, clientReference: reference, held: hold,
          ...(traveller ? { traveller: travellerView(traveller) } : {}),
          ...(trip ? { tripRequestId: trip.id, tripPurpose: trip.purpose } : {}),
          ...(policy?.enabled ? { policy: { ...policy, reason: policyReason || null } } : {}),
          ...(needsApproval ? { approval: { status: 'PENDING', steps, current: 0, approverMemberIds: steps[0].approverMemberIds, history: [], requestedBy: user.id, requestedByName: user.name, requestedAt: new Date().toISOString() } } : {}),
        };
        return r;
      },
      afterCreate: async (tx, booking) => (hold ? booking : confirmFromAccount(tx, { org, terms, booking, user })),
      timeline: (b) => (b.status === 'CONFIRMED'
        ? { status: 'CONFIRMED', title: 'Booking Confirmed', message: `Paid from ${org.name}'s ZivoPlus account (${org.code}).` }
        : needsApproval
          ? { status: 'PENDING_PAYMENT', title: 'Waiting for approval', message: `Held until ${fmt(holdUntil)} IST for approval (${steps.map((x) => x.label.toLowerCase()).join(', then ')})${policy && !policy.within ? `; over policy: ${policyReason}` : ''}.` }
          : { status: 'PENDING_PAYMENT', title: 'Held', message: `Held for ${org.name} until ${fmt(holdUntil)} IST. Pay from the account by then, or it is released.` }),
    },
  });
  await prisma.auditLog.create({ data: { action: needsApproval ? 'ORG_BOOKING_APPROVAL_REQUESTED' : hold ? 'ORG_BOOKING_HELD' : 'ORG_BOOKING_CREATED', entityType: 'ORGANISATION', entityId: org.id, userId: user.id, details: { bookingId: result.booking.id, ref: result.booking.bookingRef, total: Number(result.booking.totalAmount), model, ...(policy?.enabled ? { withinPolicy: policy.within } : {}) } } }).catch(() => {});
  if (trip) await markTripBooked(org, member, user, trip, await prisma.booking.findUnique({ where: { id: result.booking.id }, include: { hotel: { select: { name: true } } } }));
  if (needsApproval) {
    await notifyApprovers(org, await prisma.booking.findUnique({ where: { id: result.booking.id }, include: { hotel: { select: { name: true, city: true } } } }), steps[0]);
  }
  return bookingView(await prisma.booking.findUnique({ where: { id: result.booking.id }, include: { hotel: { select: { id: true, name: true, city: true } } } }));
};

const bookingView = (b) => ({
  id: b.id, bookingRef: b.bookingRef, status: b.status, paymentStatus: b.paymentStatus, hotel: b.hotel ? { id: b.hotel.id, name: b.hotel.name, city: b.hotel.city } : { id: b.hotelId },
  checkIn: b.checkIn, checkOut: b.checkOut, rooms: b.rooms, adults: b.adults, children: b.children, guestName: b.guestName, guestPhone: b.guestPhone,
  total: Number(b.totalAmount), tax: Number(b.taxAmount || 0), paid: Number(b.paidAmount || 0), refund: Number(b.refundAmount || 0),
  heldUntil: b.status === 'PENDING' ? b.expiresAt : null, createdAt: b.createdAt, cancelledAt: b.cancelledAt, userId: b.userId,
  business: b.businessPricing || null,
});

/** Bookings of the organisation (all of them for admins, bookers, approvers and finance; travellers their own). */
export const listBookings = async (orgId, user, { status, search, page = 1, pageSize = 30 } = {}) => {
  const { org, member } = await membershipFor(orgId, user);
  const where = { organisationId: org.id };
  if (!can(member, 'bookings.viewAll')) where.userId = user.id;
  if (['PENDING', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(status)) where.status = status;
  const q = String(search || '').trim().slice(0, 60);
  if (q) where.OR = [{ bookingRef: { contains: q, mode: 'insensitive' } }, { guestName: { contains: q, mode: 'insensitive' } }];
  const take = Math.min(Math.max(Number(pageSize) || 30, 1), 100);
  const [rows, total] = await Promise.all([
    prisma.booking.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (Math.max(Number(page) || 1, 1) - 1) * take, take, include: { hotel: { select: { id: true, name: true, city: true } } } }),
    prisma.booking.count({ where }),
  ]);
  return { bookings: rows.map(bookingView), total, page: Math.max(Number(page) || 1, 1), pageSize: take };
};

const loadOwnBooking = async (orgId, user, bookingId) => {
  const { org, member } = await membershipFor(orgId, user);
  const b = await prisma.booking.findFirst({ where: { id: String(bookingId), organisationId: org.id }, include: { hotel: { select: { id: true, name: true, city: true } } } });
  if (!b || (!can(member, 'bookings.viewAll') && b.userId !== user.id)) throw fail('Booking not found', 404);
  return { org, member, booking: b };
};

export const getBooking = async (orgId, user, bookingId) => {
  const { booking } = await loadOwnBooking(orgId, user, bookingId);
  const timeline = await prisma.bookingTimelineEvent.findMany({ where: { bookingId: booking.id }, orderBy: { createdAt: 'asc' }, select: { status: true, title: true, message: true, createdAt: true } });
  const cancellation = ['PENDING', 'CONFIRMED'].includes(booking.status) ? await previewGuestCancellation(booking) : null;
  return { ...bookingView(booking), timeline, cancellation };
};

/** Pays a held booking from the account. */
export const payHeld = async (orgId, user, bookingId) => {
  const { org, terms } = await bookingContext(orgId, user);
  const { booking } = await loadOwnBooking(orgId, user, bookingId);
  if (booking.status !== 'PENDING') throw fail('This booking isn\'t waiting for payment.', 409);
  if (booking.businessPricing?.approval?.status === 'PENDING') throw fail('This trip is waiting for approval: it is paid when an approver approves it.', 409);
  if (booking.expiresAt && booking.expiresAt < new Date()) throw fail('The hold has expired and the rooms were released. Please book again.', 409);
  const updated = await prisma.$transaction(async (tx) => {
    const fresh = await tx.booking.findUnique({ where: { id: booking.id } });
    if (fresh.status !== 'PENDING') throw fail('This booking isn\'t waiting for payment.', 409);
    const b = await confirmFromAccount(tx, { org, terms, booking: fresh, user });
    await tx.bookingTimelineEvent.create({ data: { bookingId: b.id, status: 'CONFIRMED', title: 'Booking Confirmed', message: `Paid from ${org.name}'s ZivoPlus account (${org.code}).` } });
    return b;
  });
  sendBookingConfirmationEmail(updated.id).catch((e) => console.error('[Business] confirmation email failed:', e.message));
  eventBus.emitEvent('BOOKING_CONFIRMED', { bookingId: updated.id });
  return getBooking(orgId, user, updated.id);
};

export const cancelBooking = async (orgId, user, bookingId, ctx = {}) => {
  const { member, booking } = await loadOwnBooking(orgId, user, bookingId);
  if (!can(member, 'bookings.create') && booking.userId !== user.id) throw fail('Your role can\'t cancel bookings.', 403);
  try {
    await cancelBookingWithRefund({ bookingId: booking.id, initiatedBy: 'GUEST', userId: user.id, requestId: ctx.requestId });
  } catch (e) {
    if (e instanceof CancellationError) throw fail(e.message, e.statusCode || 400);
    throw e;
  }
  scheduleRecompute(booking.hotelId);
  return getBooking(orgId, user, booking.id);
};

/**
 * Check-out of an agent's booking on commission: the commission (hotel-funded part taken from the
 * hotel's settlement, the rest from ZivoPlus) is credited to the agency's account, less TDS (194H).
 * Called inside the check-out transaction; recorded once per booking.
 */
export const creditCommission = async (tx, booking) => {
  const bp = booking.businessPricing;
  if (!booking.organisationId || bp?.model !== 'COMMISSION' || !(bp.commissionAmount > 0)) return;
  const tds = round2(bp.tdsAmount || 0);
  const { duplicate } = await postEntry({ organisationId: booking.organisationId, type: 'COMMISSION', amount: bp.commissionAmount, reference: `COM-${booking.bookingRef}`, bookingId: booking.id, note: `Commission ${bp.commissionPct}% on ${booking.bookingRef}`, force: true }, tx);
  if (duplicate) return;
  if (tds > 0) await postEntry({ organisationId: booking.organisationId, type: 'TDS', amount: -tds, reference: `TDS-${booking.bookingRef}`, bookingId: booking.id, note: `TDS ${bp.tdsPct}% (194H) on commission for ${booking.bookingRef}`, force: true }, tx);
  await ledgerService.record([
    { referenceId: booking.id, account: 'AGENT_COMMISSION', type: 'DEBIT', amount: bp.hotelFundedCommission || 0, description: `Hotel-funded agent commission paid, ${booking.bookingRef}` },
    { referenceId: booking.id, account: 'ZIVO_PROMOTIONS', type: 'DEBIT', amount: bp.zivoFundedCommission || 0, description: `Extra agent commission paid by ZivoPlus, ${booking.bookingRef}` },
    { referenceId: booking.id, account: 'ORG_ACCOUNTS', type: 'CREDIT', amount: round2(bp.commissionAmount - tds), description: `Commission credited to ${bp.organisationCode}, ${booking.bookingRef}` },
    { referenceId: booking.id, account: 'TDS_194H_PAYABLE', type: 'CREDIT', amount: tds, description: `TDS (194H) on agent commission, ${booking.bookingRef}` },
  ].filter((e) => Number(e.amount) > 0), tx);
};

/** Commission earned in a period (credited at check-out), with TDS. */
export const commissionStatement = async (orgId, user, { from, to } = {}) => {
  const { org } = await membershipFor(orgId, user, 'account.view');
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end.getFullYear(), end.getMonth(), 1);
  const entries = await prisma.orgLedgerEntry.findMany({ where: { organisationId: org.id, type: { in: ['COMMISSION', 'TDS'] }, createdAt: { gte: start, lte: end } }, orderBy: { createdAt: 'asc' } });
  const ids = [...new Set(entries.map((e) => e.bookingId).filter(Boolean))];
  const bookings = await prisma.booking.findMany({ where: { id: { in: ids } }, select: { id: true, bookingRef: true, guestName: true, checkIn: true, checkOut: true, businessPricing: true, hotel: { select: { name: true } } } });
  const rows = bookings.map((b) => {
    const com = entries.find((e) => e.bookingId === b.id && e.type === 'COMMISSION');
    const tds = entries.find((e) => e.bookingId === b.id && e.type === 'TDS');
    return { bookingRef: b.bookingRef, hotel: b.hotel?.name, guestName: b.guestName, checkIn: b.checkIn, checkOut: b.checkOut, commissionPct: b.businessPricing?.commissionPct, commission: Number(com?.amount || 0), tds: -Number(tds?.amount || 0), net: round2(Number(com?.amount || 0) + Number(tds?.amount || 0)), creditedAt: com?.createdAt };
  });
  const sum = (k) => round2(rows.reduce((t, r) => t + r[k], 0));
  return { organisation: { name: org.name, legalName: org.legalName, code: org.code, pan: org.pan, gstin: org.gstin }, from: start, to: end, rows, totals: { commission: sum('commission'), tds: sum('tds'), net: sum('net') }, portal: PORTAL[org.kind].name };
};

// ─── Approvals (companies) ───────────────────────────────────────────────────
/** Admins; the current step's approvers; and anyone an approver delegated to while away. */
const canApprove = (member, booking, delegations = {}) => {
  if (member.status !== 'ACTIVE') return false;
  if (member.role === 'ADMIN') return true;
  const ids = booking.businessPricing?.approval?.approverMemberIds || [];
  return ids.includes(member.id) || ids.some((id) => delegations[id] === member.id);
};

/** Emails and notifies a step's approvers (and their delegates) that a trip waits for them. */
const notifyApprovers = async (org, b, step) => {
  const bp = b.businessPricing || {};
  const delegations = await activeDelegations(org.id);
  const ids = [...new Set([...step.approverMemberIds, ...step.approverMemberIds.map((id) => delegations[id]).filter(Boolean)])];
  const members = await prisma.orgMember.findMany({ where: { id: { in: ids } }, select: { userId: true } });
  const pol = bp.policy;
  const html = await emailLayout({
    title: `A trip needs your approval${step.key === 'FINANCE' ? ' (finance)' : ''}`, eyebrow: PORTAL[org.kind].name, ref: b.bookingRef, status: { label: 'Waiting for you', tone: 'warn' },
    rows: [['Traveller', b.guestName], ['Hotel', `${b.hotel?.name || ''}, ${b.hotel?.city || ''}`], ['Dates', `${fmt(b.checkIn).split(',')[0]} to ${fmt(b.checkOut).split(',')[0]}`], ['Amount', inr(b.totalAmount)], ['Booked by', bp.approval?.requestedByName || bp.bookedBy?.name || ''],
      ...(pol ? [['Policy', pol.within ? `Within the ${inr(pol.cap)}/night limit` : `${inr(pol.perNight)}/night, over the ${inr(pol.cap)} limit`]] : []), ...(pol?.reason ? [['Reason', pol.reason]] : []),
      ...((bp.approval?.history || []).map((h) => [`${h.label} approval`, `${h.by}${h.note ? `: ${h.note}` : ''}`]))],
    body: `<p>The rooms are held until <b>${fmt(b.expiresAt)} IST</b>. If it isn't approved by then, they are released.</p>`,
    cta: { label: 'Review the trip', href: `${siteUrl()}${PORTAL[org.kind].path}?tab=approvals` },
  });
  for (const m of members) {
    await notifyUser(m.userId, {
      type: 'ORG_APPROVAL_REQUESTED', title: `A trip needs your ${step.key === 'FINANCE' ? 'finance ' : ''}approval`, link: `${PORTAL[org.kind].path}?tab=approvals`,
      message: `${b.guestName} at ${b.hotel?.name}, ${inr(b.totalAmount)}. Approve by ${fmt(b.expiresAt)} IST or the rooms are released.`,
      email: { subject: `Approve a trip: ${b.guestName} at ${b.hotel?.name}`, html },
    });
  }
};

/** Trips waiting for approval that this person can approve (admins: all of them). */
export const listApprovals = async (orgId, user) => {
  const { org, member } = await membershipFor(orgId, user);
  const rows = await prisma.booking.findMany({
    where: { organisationId: org.id, status: 'PENDING', businessPricing: { path: ['approval', 'status'], equals: 'PENDING' } },
    orderBy: { expiresAt: 'asc' }, include: { hotel: { select: { id: true, name: true, city: true } } },
  });
  const delegations = await activeDelegations(org.id);
  return rows.filter((b) => canApprove(member, b, delegations) && b.businessPricing.approval.requestedBy !== user.id).map(bookingView);
};

export const decideApproval = async (orgId, user, bookingId, { decision, note } = {}, ctx = {}) => {
  const { org, member } = await membershipFor(orgId, user);
  const b = await prisma.booking.findFirst({ where: { id: String(bookingId), organisationId: org.id } });
  const ap = b?.businessPricing?.approval;
  if (!b || !ap) throw fail('Trip not found', 404);
  if (!canApprove(member, b, await activeDelegations(org.id))) throw fail('You aren\'t an approver for this trip.', 403);
  if (ap.requestedBy === user.id) throw fail('You can\'t approve your own trip.', 403);
  if (ap.status !== 'PENDING' || b.status !== 'PENDING') throw fail('This trip was already decided, or its hold has ended.', 409);
  if (b.expiresAt && b.expiresAt < new Date()) throw fail('The hold has expired and the rooms were released.', 409);
  const text = String(note || '').trim().slice(0, 300);
  const decided = { ...ap, decidedBy: { id: user.id, name: user.name }, decidedAt: new Date().toISOString(), note: text || null };
  const steps = Array.isArray(ap.steps) && ap.steps.length ? ap.steps : [{ key: 'MANAGER', label: 'Manager', approverMemberIds: ap.approverMemberIds || [] }];
  const current = Number(ap.current) || 0;
  const history = [...(ap.history || []), ...(decision === 'APPROVE' ? [{ key: steps[current].key, label: steps[current].label, by: user.name, byId: user.id, at: new Date().toISOString(), note: text || null }] : [])];
  if (decision === 'APPROVE' && current < steps.length - 1) {
    // More approval to come (e.g. finance after the manager): move to the next step
    const next = { ...ap, history, current: current + 1, approverMemberIds: steps[current + 1].approverMemberIds };
    const updated = await prisma.booking.update({ where: { id: b.id }, data: { businessPricing: { ...b.businessPricing, approval: next } }, include: { hotel: { select: { name: true, city: true } } } });
    await prisma.bookingTimelineEvent.create({ data: { bookingId: b.id, status: 'PENDING_PAYMENT', title: `${steps[current].label} approved`, message: `Approved by ${user.name}${text ? `: ${text}` : ''}. Now waiting for ${steps[current + 1].label.toLowerCase()} approval.` } });
    await prisma.auditLog.create({ data: { action: 'ORG_TRIP_STEP_APPROVED', entityType: 'ORGANISATION', entityId: org.id, userId: user.id, details: { bookingId: b.id, step: steps[current].key } } }).catch(() => {});
    await notifyApprovers(org, updated, steps[current + 1]);
    return getBooking(orgId, user, b.id);
  }
  if (decision === 'APPROVE') {
    const settings = await getBusinessSettings();
    const terms = termsFor(org, settings);
    await prisma.$transaction(async (tx) => {
      const fresh = await tx.booking.findUnique({ where: { id: b.id } });
      if (fresh.status !== 'PENDING') throw fail('This trip was already decided, or its hold has ended.', 409);
      try {
        await confirmFromAccount(tx, { org, terms, booking: fresh, user });
      } catch (e) {
        if (e.statusCode === 402) throw fail(`${e.message} The trip stays held until ${fmt(b.expiresAt)} IST.`, 402);
        throw e;
      }
      await tx.booking.update({ where: { id: b.id }, data: { businessPricing: { ...fresh.businessPricing, approval: { ...decided, history, status: 'APPROVED' } } } });
      await tx.bookingTimelineEvent.create({ data: { bookingId: b.id, status: 'CONFIRMED', title: 'Approved and confirmed', message: `Approved by ${user.name}${text ? `: ${text}` : ''}. Paid from ${org.name}'s ZivoPlus account.` } });
    });
    sendBookingConfirmationEmail(b.id).catch((e) => console.error('[Business] confirmation email failed:', e.message));
    eventBus.emitEvent('BOOKING_CONFIRMED', { bookingId: b.id });
  } else if (decision === 'REJECT') {
    if (text.length < 3) throw fail('Write a short reason for the traveller.');
    await prisma.booking.update({ where: { id: b.id }, data: { businessPricing: { ...b.businessPricing, approval: { ...decided, status: 'REJECTED' } } } });
    try {
      await cancelBookingWithRefund({ bookingId: b.id, initiatedBy: 'GUEST', userId: user.id, requestId: ctx.requestId });
    } catch (e) {
      if (e instanceof CancellationError) throw fail(e.message, e.statusCode || 400);
      throw e;
    }
    await prisma.bookingTimelineEvent.create({ data: { bookingId: b.id, status: 'CANCELLED', title: 'Not approved', message: `Not approved by ${user.name}: ${text}` } });
  } else {
    throw fail('Choose approve or reject.');
  }
  await prisma.auditLog.create({ data: { action: decision === 'APPROVE' ? 'ORG_TRIP_APPROVED' : 'ORG_TRIP_REJECTED', entityType: 'ORGANISATION', entityId: org.id, userId: user.id, details: { bookingId: b.id, ref: b.bookingRef, note: text || null } } }).catch(() => {});
  const ok = decision === 'APPROVE';
  await notifyUser(ap.requestedBy, {
    type: ok ? 'ORG_TRIP_APPROVED' : 'ORG_TRIP_REJECTED', title: ok ? 'Trip approved' : 'Trip not approved', link: `${PORTAL[org.kind].path}?tab=bookings`,
    message: ok ? `${b.guestName}'s stay (${b.bookingRef}) was approved by ${user.name} and is confirmed.` : `${b.guestName}'s stay (${b.bookingRef}) was not approved by ${user.name}: ${text}. The rooms were released.`,
    email: { subject: ok ? `Approved: ${b.bookingRef}` : `Not approved: ${b.bookingRef}`, html: await emailLayout({
      title: ok ? 'Your trip is approved' : 'Your trip wasn\'t approved', eyebrow: PORTAL[org.kind].name, ref: b.bookingRef, status: { label: ok ? 'Confirmed' : 'Not approved', tone: ok ? 'ok' : 'off' },
      body: ok ? `<p>${user.name} approved ${b.guestName}'s stay. It is confirmed and paid from the company account.</p>` : `<p>${user.name} didn't approve ${b.guestName}'s stay${text ? `: ${text.replace(/[<>&]/g, '')}` : ''}. The rooms were released.</p>`,
      cta: { label: 'Open bookings', href: `${siteUrl()}${PORTAL[org.kind].path}?tab=bookings` },
    }) },
  });
  return getBooking(orgId, user, b.id);
};

// ─── Spend reports (companies) ───────────────────────────────────────────────
const SPENT = ['CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'NO_SHOW'];
const reportBookings = async (org, { from, to }) => {
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end.getFullYear(), end.getMonth(), 1);
  if (Number.isNaN(+start) || Number.isNaN(+end) || end < start) throw fail('Choose a valid date range.');
  const rows = await prisma.booking.findMany({
    where: { organisationId: org.id, status: { in: SPENT }, checkIn: { gte: start, lte: end } },
    orderBy: { checkIn: 'asc' },
    include: { hotel: { select: { name: true, city: true, state: true, gstin: true } }, invoice: { select: { invoiceRef: true, createdAt: true } } },
  });
  return { start, end, rows };
};
const nightsOf = (b) => Math.max(1, Math.round((new Date(b.checkOut) - new Date(b.checkIn)) / 86400000)) * (b.rooms || 1);

/** Spend in a period: totals, savings against the public price, policy compliance, by traveller / city / hotel / cost centre. */
export const spendReport = async (orgId, user, q = {}) => {
  const { org } = await membershipFor(orgId, user, 'account.view');
  const { start, end, rows } = await reportBookings(org, q);
  const group = (keyFn) => {
    const m = new Map();
    for (const b of rows) {
      const k = keyFn(b) || '(not set)';
      const g = m.get(k) || { key: k, bookings: 0, roomNights: 0, spend: 0, savings: 0 };
      g.bookings += 1; g.roomNights += nightsOf(b); g.spend = round2(g.spend + Number(b.totalAmount));
      g.savings = round2(g.savings + Math.max(0, Number(b.businessPricing?.publicAmount || b.totalAmount) - Number(b.totalAmount)));
      m.set(k, g);
    }
    return [...m.values()].sort((a, c) => c.spend - a.spend);
  };
  const withPolicy = rows.filter((b) => b.businessPricing?.policy);
  const spend = round2(rows.reduce((t, b) => t + Number(b.totalAmount), 0));
  return {
    from: start, to: end,
    totals: {
      bookings: rows.length, roomNights: rows.reduce((t, b) => t + nightsOf(b), 0), spend, tax: round2(rows.reduce((t, b) => t + Number(b.taxAmount || 0), 0)),
      savings: round2(rows.reduce((t, b) => t + Math.max(0, Number(b.businessPricing?.publicAmount || b.totalAmount) - Number(b.totalAmount)), 0)),
      averagePerNight: rows.length ? round2(rows.reduce((t, b) => t + Number(b.baseAmount || 0), 0) / Math.max(1, rows.reduce((t, b) => t + nightsOf(b), 0))) : 0,
      checkedAgainstPolicy: withPolicy.length, outOfPolicy: withPolicy.filter((b) => !b.businessPricing.policy.within).length,
    },
    byTraveller: group((b) => b.businessPricing?.traveller?.name || b.guestName),
    byCity: group((b) => b.hotel?.city),
    byHotel: group((b) => b.hotel?.name),
    byCostCenter: group((b) => b.businessPricing?.traveller?.costCenter),
    outOfPolicy: withPolicy.filter((b) => !b.businessPricing.policy.within).map((b) => ({ bookingRef: b.bookingRef, traveller: b.businessPricing?.traveller?.name || b.guestName, hotel: b.hotel?.name, city: b.hotel?.city, perNight: b.businessPricing.policy.perNight, cap: b.businessPricing.policy.cap, reason: b.businessPricing.policy.reason, approvedBy: b.businessPricing?.approval?.decidedBy?.name || null })),
  };
};

const csvCell = (v) => { const t = v == null ? '' : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
/** Bookings with GST details, for input tax credit (match with GSTR-2B) and expense systems. */
export const spendCsv = async (orgId, user, q = {}) => {
  const { org } = await membershipFor(orgId, user, 'account.view');
  const { rows } = await reportBookings(org, q);
  const head = ['Booking', 'Invoice number', 'Invoice date', 'Hotel', 'City', 'Hotel state', 'Hotel GSTIN', 'Check-in', 'Check-out', 'Room nights', 'Traveller', 'Cost centre', 'Booked by', 'Your GSTIN', 'Taxable value', 'GST', 'Total', 'Public price', 'Within policy', 'Policy reason', 'Status'];
  const d = (x) => (x ? new Date(x).toISOString().slice(0, 10) : '');
  const lines = rows.map((b) => {
    const bp = b.businessPricing || {};
    return [b.bookingRef, b.invoice?.invoiceRef, d(b.invoice?.createdAt), b.hotel?.name, b.hotel?.city, b.hotel?.state, b.hotel?.gstin, d(b.checkIn), d(b.checkOut), nightsOf(b),
      bp.traveller?.name || b.guestName, bp.traveller?.costCenter, bp.bookedBy?.name, b.guestCompanyGstin, Number(b.baseAmount || 0).toFixed(2), Number(b.taxAmount || 0).toFixed(2),
      Number(b.totalAmount).toFixed(2), bp.publicAmount != null ? Number(bp.publicAmount).toFixed(2) : '', bp.policy ? (bp.policy.within ? 'Yes' : 'No') : '', bp.policy?.reason, b.status].map(csvCell).join(',');
  });
  return [head.join(','), ...lines].join('\n');
};

export { inr };
export default { ratesFor, quote, book, listBookings, getBooking, payHeld, cancelBooking, creditCommission, commissionStatement, listApprovals, decideApproval, spendReport, spendCsv };
