import { expect } from 'chai';
import { routeOf, percentile } from '../../services/ops/metrics.js';
import { twoProportionP } from '../../services/ops/experimentAdmin.js';

describe('admin operations helpers', () => {
  it('groups request URLs into routes (ids, slugs, numbers, refs)', () => {
    expect(routeOf('/api/v1/hotels/3f2a1c4e-1111-2222-3333-444455556666?checkin=2026-12-01')).to.equal('/api/v1/hotels/:id');
    expect(routeOf('/api/v1/hotels/z-stays-marathahalli-bengaluru-b9e3ba20')).to.equal('/api/v1/hotels/:slug');
    expect(routeOf('/api/v1/admin/reports/12/rows')).to.equal('/api/v1/admin/reports/:n/rows');
    expect(routeOf('/api/v1/bookings/ZIV7K2M9QX4/voucher')).to.equal('/api/v1/bookings/:ref/voucher');
  });

  it('reads the response-time percentile from the bucket counts', () => {
    expect(percentile({ b0: 90, b1: 5, b2: 5, b3: 0, b4: 0 }, 0.5)).to.equal(100);
    expect(percentile({ b0: 90, b1: 5, b2: 5, b3: 0, b4: 0 }, 0.95)).to.equal(300);
    expect(percentile({ b0: 0, b1: 0, b2: 0, b3: 0, b4: 10 }, 0.95)).to.equal(5000);
    expect(percentile({}, 0.95)).to.equal(null);
  });

  it('two-proportion test: clear difference is significant, small samples are not', () => {
    expect(twoProportionP(60, 1000, 30, 1000)).to.be.below(0.01);
    expect(twoProportionP(3, 50, 2, 50)).to.be.above(0.5);
    expect(twoProportionP(0, 0, 1, 10)).to.equal(null);
    const p = twoProportionP(50, 1000, 50, 1000);
    expect(p).to.be.closeTo(1, 0.001);
  });
});
