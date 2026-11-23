import { expect } from 'chai';
import { financialYear, documentNumber, periodRange, validPeriod } from '../../services/finance/financeDocuments.js';
import { amountInWords } from '../../services/finance/financeDocumentHtml.js';
import { DEFAULTS } from '../../services/finance/financeSettings.js';

describe('Commission invoices', () => {
  it('numbers by Indian financial year (April to March, India time)', () => {
    expect(financialYear('2026-04-01T00:00:00+05:30')).to.equal('2026-27');
    expect(financialYear('2026-03-31T23:59:00+05:30')).to.equal('2025-26');
    expect(financialYear('2027-01-15T10:00:00Z')).to.equal('2026-27');
    expect(financialYear('2099-12-01T00:00:00Z')).to.equal('2099-00');
  });
  it('makes invoice and credit-note numbers, TEST until invoicing is live', () => {
    const d = '2026-12-01T06:00:00+05:30';
    expect(documentNumber('ZPC', true, d, 1)).to.equal('ZPC/2026-27/000001');
    expect(documentNumber('ZPCN', true, d, 41)).to.equal('ZPCN/2026-27/000041');
    expect(documentNumber('ZPC', false, d, 538)).to.equal('TEST-ZPC/2026-27/000538');
  });
  it('covers a whole month in India time', () => {
    const r = periodRange('2026-10');
    expect(r.gte.toISOString()).to.equal('2026-09-30T18:30:00.000Z');
    expect(r.lt.toISOString()).to.equal('2026-10-31T18:30:00.000Z');
    expect(validPeriod('2026-13')).to.equal(false);
    expect(validPeriod('2026-12')).to.equal(true);
  });
  it('writes amounts in words the Indian way', () => {
    expect(amountInWords(7345.5)).to.equal('Rupees Seven Thousand Three Hundred Forty Five and Fifty Paise Only');
    expect(amountInWords(143095.76)).to.equal('Rupees One Lakh Forty Three Thousand Ninety Five and Seventy Six Paise Only');
    expect(amountInWords(12500000)).to.equal('Rupees One Crore Twenty Five Lakh Only');
    expect(amountInWords(0)).to.equal('Rupees Zero Only');
  });
  it('defaults: ZivoPlus series, SAC 998552, TAN, test mode, monthly automation on', () => {
    const d = DEFAULTS();
    expect(d.invoice).to.include({ prefix: 'ZPC', creditPrefix: 'ZPCN', sac: '998552', live: false });
    expect(d.company.tan).to.equal('JBPZ00294A');
    expect(d.automation).to.deep.equal({ issueMonthly: true, emailOwners: true });
  });
});
