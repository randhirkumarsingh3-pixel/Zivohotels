import { expect } from 'chai';
import { evaluateReadiness, requiredKycTypes } from '../../services/propertyReadiness.js';

const bank = { accountName: 'Asha Rao', bankName: 'HDFC', accountNumber: '50100012345678', ifscCode: 'HDFC0001234' };
const doc = (documentType, documentStatus = 'PENDING') => ({ documentType, documentStatus });

describe('propertyReadiness', () => {
  it('requires GST only when the hotel has a GSTIN', () => {
    expect(requiredKycTypes({ gstin: null })).to.deep.equal(['PAN', 'BANK_PROOF']);
    expect(requiredKycTypes({ gstin: '  ' })).to.deep.equal(['PAN', 'BANK_PROOF']);
    expect(requiredKycTypes({ gstin: '29ABCDE1234F1Z5' })).to.include('GST');
  });

  it('blocks submission without bank details or documents', () => {
    const problems = evaluateReadiness({ hotel: {}, bankDetail: null, kycRecords: [] }, 'submit');
    expect(problems).to.have.length(3);
    expect(problems[0]).to.match(/Bank details are missing/);
  });

  it('names missing bank fields', () => {
    const problems = evaluateReadiness(
      { hotel: {}, bankDetail: { ...bank, ifscCode: '' }, kycRecords: [doc('PAN'), doc('BANK_PROOF')] },
      'submit'
    );
    expect(problems).to.deep.equal(['Bank details are incomplete (missing IFSC code)']);
  });

  it('allows submission with bank details and pending required documents', () => {
    const problems = evaluateReadiness(
      { hotel: { gstin: '29ABCDE1234F1Z5' }, bankDetail: bank, kycRecords: [doc('PAN'), doc('BANK_PROOF'), doc('GST')] },
      'submit'
    );
    expect(problems).to.deep.equal([]);
  });

  it('blocks submission when a required document was rejected', () => {
    const problems = evaluateReadiness(
      { hotel: {}, bankDetail: bank, kycRecords: [doc('PAN', 'REJECTED'), doc('BANK_PROOF')] },
      'submit'
    );
    expect(problems).to.deep.equal(['PAN card was rejected; upload a corrected file']);
  });

  it('requires every required document to be verified for approval', () => {
    const kycRecords = [doc('PAN', 'VERIFIED'), doc('BANK_PROOF', 'PENDING'), doc('TRADE_LICENSE', 'PENDING')];
    const problems = evaluateReadiness({ hotel: {}, bankDetail: bank, kycRecords }, 'approve');
    expect(problems).to.deep.equal(['Cancelled cheque / bank proof has not been verified yet']);

    kycRecords[1].documentStatus = 'VERIFIED';
    expect(evaluateReadiness({ hotel: {}, bankDetail: bank, kycRecords }, 'approve')).to.deep.equal([]);
  });
});
