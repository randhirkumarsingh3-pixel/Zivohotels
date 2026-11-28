/**
 * The Razorpay SDK (2.x) takes refund(paymentId, params, callback): a third argument is used as a
 * callback, so passing request options there makes a refund that Razorpay carried out look failed
 * ("cb is not a function"). Every refund call must pass two arguments only.
 */
import { expect } from 'chai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const files = ['services', 'controllers'].flatMap((d) => fs.readdirSync(path.join(root, d), { recursive: true }).filter((f) => f.endsWith('.js')).map((f) => path.join(root, d, f)));

/** The argument list of each payments.refund( call, by matching brackets. */
const refundCalls = (src) => {
  const out = [];
  let i = src.indexOf('payments.refund(');
  while (i !== -1) {
    let depth = 0; let j = i + 'payments.refund'.length; let args = 1; let quote = null;
    for (; j < src.length; j += 1) {
      const ch = src[j];
      if (quote) { if (ch === quote && src[j - 1] !== '\\') quote = null; continue; }
      if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
      if ('([{'.includes(ch)) depth += 1;
      else if (')]}'.includes(ch)) { depth -= 1; if (depth === 0) break; }
      else if (ch === ',' && depth === 1) args += 1;
    }
    out.push({ at: i, args });
    i = src.indexOf('payments.refund(', j);
  }
  return out;
};

describe('Razorpay refund calls', () => {
  it('never pass a third argument (the SDK would treat it as a callback)', () => {
    const bad = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      for (const c of refundCalls(src)) if (c.args > 2) bad.push(`${path.relative(root, f)}:${src.slice(0, c.at).split('\n').length}`);
    }
    expect(bad, `refund calls with 3+ arguments: ${bad.join(', ')}`).to.deep.equal([]);
  });
});
