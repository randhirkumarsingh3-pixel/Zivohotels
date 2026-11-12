import { expect } from 'chai';
import { responseFormatter } from '../../middleware/responseFormatter.js';

const PRISMA_MESSAGE = '\nInvalid `prisma.booking.update()` invocation:\nInvalid value for argument `paymentStatus`. Expected PaymentStatus.';

// Runs a body through the formatter exactly as a controller's res.json(...) would.
const format = (statusCode, body) => {
  const res = { statusCode, headersSent: false, locals: {}, json: (b) => b };
  responseFormatter({ id: 'req-123' }, res, () => {});
  return res.json(body);
};

describe('responseFormatter', () => {
  const originalEnv = process.env.NODE_ENV;
  afterEach(() => { process.env.NODE_ENV = originalEnv; });

  describe('success responses', () => {
    it('keeps arrays as arrays (and [] as [])', () => {
      expect(format(200, [1, 2]).data).to.deep.equal([1, 2]);
      expect(format(200, []).data).to.deep.equal([]);
    });

    it('wraps objects in the standard shape', () => {
      const body = format(200, { success: true, data: { id: 1 } });
      expect(body).to.include({ success: true, code: 'SUCCESS' });
      expect(body.data).to.deep.equal({ id: 1 });
    });
  });

  describe('errors in production', () => {
    beforeEach(() => { process.env.NODE_ENV = 'production'; });

    it('replaces 5xx details with a generic message, keeping the requestId', () => {
      const body = format(500, { success: false, message: PRISMA_MESSAGE, code: 'P1001', requestId: 'req-9' });
      expect(body.message).to.match(/^An internal server error occurred/);
      expect(body).to.include({ code: 'INTERNAL_ERROR', data: null, requestId: 'req-9' });
      expect(JSON.stringify(body)).to.not.match(/prisma/i);
    });

    it('drops extra error fields on 5xx and falls back to req.id', () => {
      const body = format(500, { success: false, error: 'connect ECONNREFUSED 10.0.0.5:5432' });
      expect(body.data).to.equal(null);
      expect(body.requestId).to.equal('req-123');
      expect(JSON.stringify(body)).to.not.include('ECONNREFUSED');
    });

    it('hides Prisma/database internals even on 4xx', () => {
      expect(format(400, { success: false, message: PRISMA_MESSAGE }).message).to.equal('The request could not be completed.');
      expect(JSON.stringify(format(400, { success: false, message: "Can't reach database server at `10.1.2.3:5432`" }))).to.not.include('10.1.2.3');
    });

    it('keeps ordinary 4xx messages and validation details', () => {
      expect(format(400, { success: false, message: 'Only PENDING bookings can be marked as failed.' }).message)
        .to.equal('Only PENDING bookings can be marked as failed.');
      const body = format(422, { success: false, message: 'Validation failed', errors: { email: { _errors: ['Invalid email'] } } });
      expect(body.data.errors.email._errors[0]).to.equal('Invalid email');
    });
  });

  it('keeps full error messages outside production for debugging', () => {
    process.env.NODE_ENV = 'development';
    expect(format(500, { success: false, message: PRISMA_MESSAGE }).message).to.include('prisma.booking.update');
  });
});
