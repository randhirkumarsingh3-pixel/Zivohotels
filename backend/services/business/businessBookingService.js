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
import { ratesForStay, stayDiscount, describeRate, forOrganisation as agreedRatesOf } from './corporateRates.js';
import { notifyUser, notifyHotel } from '../notifyService.js';
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
  const out = rows
    .filter((r) => r.hotel && !r.hotel.isDeleted && ['LIVE', 'ACTIVE'].includes(r.hotel.status))
    .map((r) => ({ hotelId: r.hotelId, hotelName: r.hotel.name, city: r.hotel.city, offer: businessOffer(r, org, terms) }))
    .filter((x) => x.offer);
  if (org.kind !== 'CORPORATE') return out;
  // Companies: also the hotels with a rate agreed for them, even without a general company discount
  const agreed = (await agreedRatesOf(org.id)).filter((r) => !ids.length || ids.includes(r.hotelId));
  for (const r of agreed) {
    let row = out.find((x) => x.hotelId === r.hotelId);
    if (!row) {
      const h = await prisma.hotel.findFirst({ where: { id: r.hotelId, isDeleted: false, status: { in: ['LIVE', 'ACTIVE'] } }, select: { id: true, name: true, city: true } });
      if (!h) continue;
      row = { hotelId: h.id, hotelName: h.name, city: h.city, offer: { kind: 'CORPORATE', discountPct: 0 } };
      out.push(row);
    }
    row.agreedRates = [...(row.agreedRates || []), { id: r.id, label: r.label, validFrom: r.validFrom, validTo: r.validTo, state: r.state }];
  }
  return out;
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
    // Companies with a rate agreed at this hotel: room by room, the agreed rate or the general discount
    const agreed = offer.kind === 'CORPORATE' && offer.agreedRates?.length
      ? stayDiscount(base, offer.agreedRates, { generalPct: pct, checkIn: stayInput.checkInDate })
      : null;
    const pricing = pricingDomain.calculateStay({ ...stayInput, businessDiscountAmount: agreed ? agreed.amount : round(subtotal * pct / 100) });
    const out = { ...common, model: offer.kind === 'CORPORATE' ? 'CORPORATE' : 'NET', discountPct: pct, discountAmount: pricing.businessDiscountAmount, payAmount: pricing.finalAmount };
    if (agreed?.rateIds.length) out.agreedRate = { rateIds: agreed.rateIds, rooms: agreed.rooms.filter((r) => r.rateId), amount: agreed.amount };
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

const offerView = ({ agreedRates, ...o }) => (agreedRates ? { ...o, agreedRates: agreedRates.map((r) => ({ id: r.id, label: describeRate(r) })) } : o);
/** What the organisation gets at the hotel; for companies with the rates agreed for the stay's nights. */
const offerAt = async (org, terms, hotelId, input = {}) => {
  const rate = await prisma.hotelBusinessRate.findUnique({ where: { hotelId: String(hotelId) } });
  let offer = businessOffer(rate, org, terms);
  if (org.kind === 'CORPORATE' && input.checkIn && input.checkOut && !Number.isNaN(+new Date(input.checkIn)) && !Number.isNaN(+new Date(input.checkOut))) {
    const agreedRates = await ratesForStay(org.id, hotelId, input.checkIn, input.checkOut);
    if (agreedRates.length) offer = { ...(offer || { kind: 'CORPORATE', discountPct: 0 }), agreedRates };
  }
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
  const offer = await offerAt(org, terms, input.hotelId, input);
  const traveller = await travellerFor(org, member, input.travellerMemberId);
  const { checkIn, checkOut, lines, rooms, hotel, pricing, businessPricing } = await priceStay({ org, terms, offer }, input);
  const summary = await accountSummary(org, { settings });
  const policy = policyCheck(org, traveller, hotel, pricing);
  const steps = org.kind === 'CORPORATE' && member.role !== 'ADMIN' ? await approvalSteps(org, policyOf(org), policy, traveller, user.id, pricing.finalAmount) : [];
  return {
    hotel: { id: hotel.id, name: hotel.name, city: hotel.city },
    checkIn, checkOut, nights: pricing.nights, rooms: describeRooms(pricing, rooms, lines),
    price: { roomCharges: pricing.subtotal, discount: pricing.businessDiscountAmount || 0, beforeTax: pricing.baseAmount, tax: pricing.taxAmount, taxBreakdown: pricing.taxBreakdown, total: pricing.finalAmount },
    business: businessPricing, offer: offerView(offer), traveller: travellerView(traveller),
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
  const offer = await offerAt(org, terms, input.hotelId, input);
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

// ─── Group stays (quoted by the hotel; services/business/groupBookings.js) ────
/** The rooms of an accepted group quote: each requested room with the quoted rate plan. */
const groupLines = (request, guestName) => {
  const plans = Object.fromEntries((request.quote?.lines || []).map((l) => [l.roomTypeId, l]));
  return request.lines.flatMap((l) => Array.from({ length: l.rooms }, () => ({ roomTypeId: l.roomTypeId, ratePlanId: plans[l.roomTypeId]?.ratePlanId, adults: l.adults, children: 0, extraBeds: 0, guestName })));
};

/**
 * The group's price: each room at the hotel's quoted rate per night (before GST), never above the
 * website's price for those dates (if it is, the website price).
 */
const groupPriceFor = ({ org, terms, request }) => (stayInput) => {
  const base = pricingDomain.calculateStay(stayInput);
  const rateOf = Object.fromEntries((request.quote?.lines || []).map((l) => [l.roomTypeId, Number(l.nightlyRate)]));
  let discount = 0; let quoted = 0;
  for (const room of base.roomsBreakdown) {
    const q = round((rateOf[room.roomTypeId] || 0) * base.nights);
    quoted += q;
    discount += Math.max(0, round(room.subtotal - q));
  }
  const pricing = pricingDomain.calculateStay({ ...stayInput, businessDiscountAmount: discount });
  return {
    pricing,
    businessPricing: {
      kind: org.kind, organisationId: org.id, organisationCode: org.code, organisationName: org.name, invoiceMode: terms.invoiceMode,
      model: 'GROUP', groupRequestId: request.id, quotedAmount: quoted, publicAmount: base.finalAmount, publicPreTax: base.baseAmount,
      discountPct: 0, discountAmount: pricing.businessDiscountAmount, payAmount: pricing.finalAmount,
    },
  };
};

const priceGroup = async ({ org, terms }, request) => {
  const lines = groupLines(request, 'Guest');
  const checkIn = new Date(request.checkIn); const checkOut = new Date(request.checkOut);
  const { rooms, hotel } = await loadStayRooms(lines, { hotelId: request.hotelId, checkInDate: checkIn, checkOutDate: checkOut });
  const { taxRules } = await pricingSettings();
  const stayInput = { rooms, hotel, taxRules, prepaidDiscountPercent: 0, checkInDate: checkIn, checkOutDate: checkOut, paymentType: 'PREPAID', dynamicContext: { safeMode: true, userSegment: 'STANDARD', device: 'WEB' } };
  return { lines, rooms, hotel, ...groupPriceFor({ org, terms, request })(stayInput) };
};

/** The exact price of an accepted quote now (GST included), and whether the account covers it. */
export const groupQuotePrice = async (orgId, user, request) => {
  const { org, member, settings, terms } = await bookingContext(orgId, user);
  const { pricing, businessPricing } = await priceGroup({ org, terms }, request);
  const summary = await accountSummary(org, { settings });
  return {
    nights: pricing.nights, rooms: pricing.rooms,
    price: { roomCharges: pricing.subtotal, discount: pricing.businessDiscountAmount || 0, beforeTax: pricing.baseAmount, tax: pricing.taxAmount, total: pricing.finalAmount },
    quotedAmount: businessPricing.quotedAmount, cappedAtPublic: businessPricing.quotedAmount > pricing.baseAmount,
    canPayNow: summary.available >= pricing.finalAmount, available: can(member, 'account.view') ? summary.available : null,
    holdUntil: holdDeadline(settings, org.kind, request.checkIn),
  };
};

/** Books an accepted group quote: paid from the account now, or held until the deadline. */
export const bookGroup = async (orgId, user, request, input = {}, ctx = {}) => {
  const { org, settings, terms } = await bookingContext(orgId, user);
  const leadName = String(input.leadName || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  const leadPhone = String(input.leadPhone || '').replace(/[^\d+]/g, '').slice(0, 15);
  if (leadName.length < 2) throw fail('Enter the group leader\'s name (the hotel\'s contact for the group).');
  if (leadPhone.replace(/\D/g, '').length < 10) throw fail('Enter the group leader\'s phone number.');
  const hold = input.hold === true;
  const holdUntil = hold ? holdDeadline(settings, org.kind, request.checkIn) : null;
  if (hold && !holdUntil) throw fail('This stay is too close to check-in to hold. Book and pay now instead.');
  const lines = groupLines(request, leadName);
  const dates = getDatesInRange(new Date(request.checkIn), new Date(request.checkOut));
  const price = groupPriceFor({ org, terms, request });
  const result = await bookingService.createBooking(user.id, request.hotelId, lines[0].roomTypeId, dates, { roomLines: lines }, {
    guestName: leadName, guestEmail: user.email, guestPhone: leadPhone, ratePlanId: lines[0].ratePlanId, paymentType: 'PREPAID', requestId: ctx.requestId,
    company: { name: org.legalName, gstin: org.gstin || null, address: `${org.address}, ${org.city}, ${org.state} ${org.pincode}` },
    business: {
      organisationId: org.id, channel: org.kind, holdUntil, maxRooms: 60,
      price: async (stayInput) => {
        const r = price(stayInput);
        r.businessPricing = { ...r.businessPricing, bookedBy: { id: user.id, name: user.name, email: user.email }, held: hold, group: { purpose: request.purpose, leadName, leadPhone } };
        return r;
      },
      afterCreate: async (tx, booking) => (hold ? booking : confirmFromAccount(tx, { org, terms, booking, user })),
      timeline: (b) => (b.status === 'CONFIRMED'
        ? { status: 'CONFIRMED', title: 'Group booking confirmed', message: `${lines.length} rooms at the hotel's group rate, paid from ${org.name}'s ZivoPlus account (${org.code}).` }
        : { status: 'PENDING_PAYMENT', title: 'Group held', message: `${lines.length} rooms held for ${org.name} until ${fmt(holdUntil)} IST. Pay from the account by then, or they are released.` }),
    },
  });
  await prisma.auditLog.create({ data: { action: hold ? 'ORG_GROUP_HELD' : 'ORG_GROUP_BOOKED', entityType: 'ORGANISATION', entityId: org.id, userId: user.id, details: { bookingId: result.booking.id, ref: result.booking.bookingRef, groupRequestId: request.id, rooms: lines.length, total: Number(result.booking.totalAmount) } } }).catch(() => {});
  return bookingView(await prisma.booking.findUnique({ where: { id: result.booking.id }, include: { hotel: { select: { id: true, name: true, city: true } } } }));
};

/** The rooms of a booking and who is in each (the rooming list). Changes until the day before check-in. */
const roomingOpen = (b) => ['PENDING', 'CONFIRMED'].includes(b.status) && new Date(b.checkIn).getTime() - Date.now() > -5.5 * 3600000;
export const roomingList = async (orgId, user, bookingId) => {
  const { booking } = await loadOwnBooking(orgId, user, bookingId);
  const rooms = await prisma.bookingRoom.findMany({ where: { bookingId: booking.id }, orderBy: { roomNumber: 'asc' }, include: { roomType: { select: { name: true } } } });
  return { bookingId: booking.id, bookingRef: booking.bookingRef, editable: roomingOpen(booking), rooms: rooms.map((r) => ({ roomNumber: r.roomNumber, roomType: r.roomType?.name, adults: r.adults, children: r.children, guestName: r.guestName, cancelled: Boolean(r.cancelledAt) })) };
};

export const saveRoomingList = async (orgId, user, bookingId, { rooms = [] } = {}) => {
  const { org, member, booking } = await loadOwnBooking(orgId, user, bookingId);
  if (!can(member, 'bookings.create')) throw fail('You can\'t change this booking.', 403);
  if (!roomingOpen(booking)) throw fail('The rooming list can\'t be changed any more (the stay has started, or the booking is cancelled).', 409);
  const existing = await prisma.bookingRoom.findMany({ where: { bookingId: booking.id }, select: { id: true, roomNumber: true, guestName: true } });
  const byNumber = new Map(existing.map((r) => [r.roomNumber, r]));
  const changes = [];
  for (const r of Array.isArray(rooms) ? rooms.slice(0, 60) : []) {
    const row = byNumber.get(Number(r.roomNumber));
    const name = String(r.guestName || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    if (!row) throw fail(`There is no room ${r.roomNumber} in this booking.`);
    if (name.length < 2) throw fail(`Enter a name for room ${row.roomNumber}.`);
    if (name !== row.guestName) changes.push({ id: row.id, roomNumber: row.roomNumber, from: row.guestName, to: name });
  }
  if (changes.length) {
    await prisma.$transaction(changes.map((c) => prisma.bookingRoom.update({ where: { id: c.id }, data: { guestName: c.to } })));
    await prisma.bookingTimelineEvent.create({ data: { bookingId: booking.id, status: booking.status, title: 'Rooming list updated', message: `${changes.length} room${changes.length > 1 ? 's' : ''} updated by ${user.name} (${org.name}).` } }).catch(() => {});
    await prisma.auditLog.create({ data: { action: 'ORG_ROOMING_LIST_UPDATED', entityType: 'BOOKING', entityId: booking.id, userId: user.id, details: { organisationId: org.id, changes: changes.map(({ roomNumber, from, to }) => ({ roomNumber, from, to })) } } }).catch(() => {});
    await notifyHotel(booking.hotelId, { type: 'ROOMING_LIST_UPDATED', title: 'Rooming list updated', message: `${booking.bookingRef} (${org.name}): ${changes.length} guest name${changes.length > 1 ? 's' : ''} changed.`, metadata: { bookingId: booking.id } }).catch(() => {});
  }
  return { ...(await roomingList(orgId, user, bookingId)), changed: changes.length };
};

const bookingView = (b) => ({
  id: b.id, bookingRef: b.bookingRef, status: b.status, paymentStatus: b.paymentStatus, hotel: b.hotel ? { id: b.hotel.id, name: b.hotel.name, city: b.hotel.city } : { id: b.hotelId },
  checkIn: b.checkIn, checkOut: b.checkOut, rooms: b.rooms, adults: b.adults, children: b.children, guestName: b.guestName, guestPhone: b.guestPhone,
  total: Number(b.totalAmount), tax: Number(b.taxAmount || 0), paid: Number(b.paidAmount || 0), refund: Number(b.refundAmount || 0),
  heldUntil: b.status === 'PENDING' ? b.expiresAt : null, createdAt: b.createdAt, cancelledAt: b.cancelledAt, userId: b.userId,
  business: b.businessPricing || null,
  // The property's GST invoice (B2B: the property issues it; ZivoPlus is the facilitator)
  hotelInvoice: b.hotelGstInvoice ? { invoiceNumber: b.hotelGstInvoice.invoiceNumber, invoiceDate: b.hotelGstInvoice.invoiceDate, uploadedAt: b.hotelGstInvoice.uploadedAt } : null,
  gstin: b.guestCompanyGstin || null,
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
    prisma.booking.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (Math.max(Number(page) || 1, 1) - 1) * take, take, include: { hotel: { select: { id: true, name: true, city: true } }, hotelGstInvoice: { select: { invoiceNumber: true, invoiceDate: true, uploadedAt: true } } } }),
    prisma.booking.count({ where }),
  ]);
  return { bookings: rows.map(bookingView), total, page: Math.max(Number(page) || 1, 1), pageSize: take };
};

const loadOwnBooking = async (orgId, user, bookingId) => {
  const { org, member } = await membershipFor(orgId, user);
  const b = await prisma.booking.findFirst({ where: { id: String(bookingId), organisationId: org.id }, include: { hotel: { select: { id: true, name: true, city: true } }, hotelGstInvoice: { select: { invoiceNumber: true, invoiceDate: true, uploadedAt: true } } } });
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
export const commissionStatement = async (orgId, user, q = {}) => commissionStatementFor((await membershipFor(orgId, user, 'account.view')).org, q);
/** The statement for an organisation (members via commissionStatement; ZivoPlus staff directly). */
export const commissionStatementFor = async (org, { from, to } = {}) => {
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
export const spendReport = async (orgId, user, q = {}) => spendReportFor((await membershipFor(orgId, user, 'account.view')).org, q);
export const spendReportFor = async (org, q = {}) => {
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
export const spendCsv = async (orgId, user, q = {}) => spendCsvFor((await membershipFor(orgId, user, 'account.view')).org, q);
export const spendCsvFor = async (org, q = {}) => {
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
export default { ratesFor, quote, book, listBookings, getBooking, payHeld, cancelBooking, creditCommission, commissionStatement, commissionStatementFor, listApprovals, decideApproval, spendReport, spendReportFor, spendCsv, spendCsvFor, groupQuotePrice, bookGroup, roomingList, saveRoomingList };
