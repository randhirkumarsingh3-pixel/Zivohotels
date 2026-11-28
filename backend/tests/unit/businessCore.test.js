/** Business core: prices for companies and agents, account settling, terms. */
import { expect } from 'chai';
import { businessOffer, priceForOrg, commissionPayout } from '../../services/business/businessPricing.js';
import { outstanding } from '../../services/business/orgLedger.js';
import { termsFor, DEFAULTS } from '../../services/business/businessSettings.js';

const settings = { corporate: { ...DEFAULTS.corporate }, agency: { ...DEFAULTS.agency }, credit: { ...DEFAULTS.credit }, topup: { ...DEFAULTS.topup } };
const rate = { corporateEnabled: true, corporateDiscountPct: 8, agentEnabled: true, agentDiscountPct: 12 };

describe('Business prices', () => {
  it('companies get the hotel\'s corporate discount; nothing if the hotel hasn\'t opted in', () => {
    const org = { kind: 'CORPORATE', status: 'ACTIVE' };
    const p = priceForOrg(10000, businessOffer(rate, org, termsFor(org, settings)));
    expect(p).to.include({ model: 'CORPORATE', discountAmount: 800, payAmount: 9200 });
    expect(businessOffer({ ...rate, corporateEnabled: false }, org, termsFor(org, settings))).to.equal(null);
    expect(businessOffer(rate, { ...org, status: 'IN_REVIEW' }, termsFor(org, settings))).to.equal(null);
  });

  it('agents on net rates pay the public price less the trade discount and add their markup', () => {
    const org = { kind: 'AGENCY', status: 'ACTIVE', pricingModel: 'NET', defaultMarkupPct: 10 };
    const offer = businessOffer(rate, org, termsFor(org, settings));
    expect(offer.models).to.deep.equal(['NET']);
    const p = priceForOrg(10000, offer);
    expect(p).to.include({ model: 'NET', payAmount: 8800, markupPct: 10, markupAmount: 880, sellAmount: 9680 });
    expect(() => priceForOrg(10000, offer, { markupPct: 80 })).to.throw(/between 0 and 50/);
    expect(() => priceForOrg(10000, offer, { model: 'COMMISSION' })).to.throw(/isn't available/);
  });

  it('agents on commission pay the public price and earn the trade discount plus any extra, less TDS', () => {
    const org = { kind: 'AGENCY', status: 'ACTIVE', pricingModel: 'BOTH', extraCommissionPct: 2 };
    const offer = businessOffer(rate, org, termsFor(org, settings));
    expect(offer.models).to.deep.equal(['NET', 'COMMISSION']);
    const p = priceForOrg(10000, offer, { model: 'COMMISSION' });
    expect(p).to.include({ model: 'COMMISSION', payAmount: 10000, commissionPct: 14, commissionAmount: 1400 });
    expect(commissionPayout(1400, 2)).to.deep.equal({ commission: 1400, tds: 28, net: 1372 });
  });
});

describe('Organisation terms', () => {
  it('uses the defaults unless ZivoPlus set the organisation\'s own', () => {
    const t = termsFor({ kind: 'CORPORATE', creditLimit: 50000 }, settings);
    expect(t).to.include({ paymentMode: 'PREPAID', creditAllowed: false, creditLimit: 0, invoiceMode: 'HOTEL_ISSUES', paymentModeIsDefault: true });
    const c = termsFor({ kind: 'CORPORATE', paymentMode: 'CREDIT', creditLimit: 50000, creditDays: 7, invoiceMode: 'ZIVO_SUPPLIER' }, settings);
    expect(c).to.include({ creditAllowed: true, creditLimit: 50000, creditDays: 7, invoiceMode: 'ZIVO_SUPPLIER' });
  });
});

describe('Account: what is still owed', () => {
  const d = (days) => new Date(Date.now() + days * 86400000);
  it('payments settle the oldest bookings first; past-due ones are overdue', () => {
    const entries = [
      { id: 'a', amount: -3000, createdAt: d(-30), dueAt: d(-15) },
      { id: 'b', amount: -2000, createdAt: d(-10), dueAt: d(-1) },
      { id: 'p', amount: 3500, createdAt: d(-5) },
      { id: 'c', amount: -1000, createdAt: d(-2), dueAt: d(10) },
    ];
    const o = outstanding(entries);
    expect(o.open.map((x) => [x.id, x.left])).to.deep.equal([['b', 1500], ['c', 1000]]);
    expect(o.overdueAmount).to.equal(1500);
    expect(+new Date(o.nextDueAt)).to.equal(+entries[3].dueAt);
  });
  it('a prepaid balance owes nothing', () => {
    expect(outstanding([{ id: 't', amount: 5000, createdAt: d(-3) }, { id: 'b', amount: -2000, createdAt: d(-1) }]).open).to.deep.equal([]);
  });
});
