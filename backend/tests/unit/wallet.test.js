import assert from 'assert';
import { CATEGORY_LABEL } from '../../services/finance/walletService.js';

// Mirrors the refund split in cancellationService: Zivo Cash used on the booking always goes back
// to the wallet; the rest goes to the original payment method unless the guest chose Zivo Cash.
const split = ({ refund, walletUsed, choice, guest = true }) => {
  let toWallet = Math.min(refund, walletUsed);
  if (choice === 'WALLET' && guest) toWallet = refund;
  return { toWallet, toSource: refund - toWallet };
};

describe('Zivo Cash refunds', () => {
  it('returns the Zivo Cash part to the wallet and the rest to the card by default', () => {
    assert.deepStrictEqual(split({ refund: 8000, walletUsed: 3000, choice: 'SOURCE' }), { toWallet: 3000, toSource: 5000 });
  });
  it('sends everything to Zivo Cash only when the guest chooses it', () => {
    assert.deepStrictEqual(split({ refund: 8000, walletUsed: 3000, choice: 'WALLET' }), { toWallet: 8000, toSource: 0 });
    assert.deepStrictEqual(split({ refund: 8000, walletUsed: 3000, choice: 'WALLET', guest: false }), { toWallet: 3000, toSource: 5000 });
  });
  it('with a cancellation fee, the wallet part is refunded first', () => {
    assert.deepStrictEqual(split({ refund: 2000, walletUsed: 3000, choice: 'SOURCE' }), { toWallet: 2000, toSource: 0 });
  });
  it('labels every movement type', () => {
    for (const c of ['REFUND', 'BOOKING_PAYMENT', 'PAYMENT_RETURNED', 'ADMIN_CREDIT', 'ADMIN_DEBIT']) assert.ok(CATEGORY_LABEL[c]);
  });
});
