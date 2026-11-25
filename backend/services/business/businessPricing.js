/**
 * Business prices. A hotel sets its business rates in the extranet (HotelBusinessRate):
 *  - a discount for companies (ZivoPlus for Business)
 *  - a trade discount for travel agents (Partner Hub), used two ways:
 *      NET         the agent pays the public price less the trade discount (their net rate) and
 *                  sells at net + their own markup, collected from their customer
 *      COMMISSION  the agent pays the public price and earns the trade discount (plus any extra
 *                  commission ZivoPlus gives that agency) as commission, paid on the monthly
 *                  statement less TDS
 * Business rates are never shown on the public website or sent to Google.
 */
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** What an organisation can get at a hotel; null when the hotel doesn't offer it. */
export const businessOffer = (rate, org, terms) => {
  if (!rate || !org || org.status !== 'ACTIVE') return null;
  if (org.kind === 'CORPORATE') {
    if (!rate.corporateEnabled) return null;
    return { kind: 'CORPORATE', discountPct: Number(rate.corporateDiscountPct) || 0 };
  }
  if (!rate.agentEnabled) return null;
  const models = terms.pricingModel === 'BOTH' ? ['NET', 'COMMISSION'] : [terms.pricingModel];
  return {
    kind: 'AGENCY', models, tradeDiscountPct: Number(rate.agentDiscountPct) || 0,
    extraCommissionPct: Number(terms.extraCommissionPct) || 0,
    defaultMarkupPct: Number(terms.defaultMarkupPct) || 0, maxMarkupPct: Number(terms.maxMarkupPct) || 0,
  };
};

/**
 * Prices a stay for an organisation from its public room amount (before tax).
 * Returns { model, publicAmount, payAmount (what the organisation pays ZivoPlus, before tax),
 * discountAmount, commissionAmount, markupPct, markupAmount, sellAmount (agent's price to their
 * customer) }.
 */
export const priceForOrg = (publicAmount, offer, { model, markupPct } = {}) => {
  const pub = round2(publicAmount);
  if (!offer) return null;
  if (offer.kind === 'CORPORATE') {
    const discountAmount = round2(pub * offer.discountPct / 100);
    return { model: 'CORPORATE', publicAmount: pub, discountPct: offer.discountPct, discountAmount, payAmount: round2(pub - discountAmount), commissionAmount: 0, markupPct: 0, markupAmount: 0, sellAmount: null };
  }
  const m = model || offer.models[0];
  if (!offer.models.includes(m)) throw Object.assign(new Error('This pricing isn\'t available for your account.'), { statusCode: 400 });
  if (m === 'NET') {
    const mk = markupPct == null ? offer.defaultMarkupPct : Number(markupPct);
    if (!Number.isFinite(mk) || mk < 0 || mk > offer.maxMarkupPct) throw Object.assign(new Error(`Markup must be between 0 and ${offer.maxMarkupPct}%.`), { statusCode: 400 });
    const discountAmount = round2(pub * offer.tradeDiscountPct / 100);
    const payAmount = round2(pub - discountAmount);
    const markupAmount = round2(payAmount * mk / 100);
    return { model: 'NET', publicAmount: pub, discountPct: offer.tradeDiscountPct, discountAmount, payAmount, commissionAmount: 0, markupPct: mk, markupAmount, sellAmount: round2(payAmount + markupAmount) };
  }
  const pct = offer.tradeDiscountPct + offer.extraCommissionPct;
  return { model: 'COMMISSION', publicAmount: pub, discountPct: 0, discountAmount: 0, payAmount: pub, commissionPct: pct, commissionAmount: round2(pub * pct / 100), markupPct: 0, markupAmount: 0, sellAmount: pub };
};

/** TDS on an agent's commission (section 194H) and what is paid out. */
export const commissionPayout = (commission, tdsPct) => {
  const tds = round2(commission * (Number(tdsPct) || 0) / 100);
  return { commission: round2(commission), tds, net: round2(commission - tds) };
};

export default { businessOffer, priceForOrg, commissionPayout };
