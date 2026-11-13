import { expect } from 'chai';
import { readFileSync } from 'fs';
import { Prisma } from '@prisma/client';
import { toMoney, roundMoney, moneyFieldsToNumbers } from '../../utils/money.js';
import { MONEY_FIELDS } from '../../constants/moneyFields.js';
import { calculateRefund } from '../../utils/refundCalculator.js';

const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');

const fieldType = (model, field) => {
  const block = schema.match(new RegExp(`^model ${model} \\{([\\s\\S]*?)^\\}`, 'm'));
  if (!block) return null;
  const line = block[1].split('\n').find((l) => l.trim().split(/\s+/)[0] === field);
  return line ? line.trim().split(/\s+/).slice(1).join(' ') : null;
};

describe('money', () => {
  it('toMoney converts Decimal, strings and numbers, keeping null/undefined', () => {
    expect(toMoney(new Prisma.Decimal('1234.50'))).to.equal(1234.5);
    expect(toMoney('99.99')).to.equal(99.99);
    expect(toMoney(5)).to.equal(5);
    expect(toMoney(null)).to.equal(null);
    expect(toMoney(undefined)).to.equal(undefined);
  });

  it('roundMoney rounds halves to the paisa correctly', () => {
    expect(roundMoney(1.005)).to.equal(1.01);
    expect(roundMoney(0.1 + 0.2)).to.equal(0.3);
    expect(roundMoney(2449.995)).to.equal(2450);
    expect(roundMoney(-1.005)).to.equal(-1.01);
    expect(roundMoney(new Prisma.Decimal('10.125'))).to.equal(10.13);
  });

  it('moneyFieldsToNumbers converts only the listed fields of a raw row', () => {
    const row = { id: 'b1', totalAmount: new Prisma.Decimal('4500.00'), paidAmount: null, guests: 2 };
    expect(moneyFieldsToNumbers('booking', row)).to.deep.equal({ id: 'b1', totalAmount: 4500, paidAmount: null, guests: 2 });
  });

  it('every listed money field is Decimal(12, 2) in schema.prisma', () => {
    for (const [model, fields] of Object.entries(MONEY_FIELDS)) {
      const name = model[0].toUpperCase() + model.slice(1);
      for (const field of fields) {
        const type = fieldType(name, field);
        expect(type, `${name}.${field}`).to.match(/^Decimal\??\s.*@db\.Decimal\(12, 2\)/);
      }
    }
  });

  it('calculateRefund works with Decimal paid amounts and rounds to the paisa', () => {
    const inTwoDays = new Date(Date.now() + 48 * 3600 * 1000);
    const inTwelveHours = new Date(Date.now() + 12 * 3600 * 1000);
    const policy = { freeCancellationHours: 24, partialRefundPercent: 33, noRefundHours: 6 };

    expect(calculateRefund({ checkIn: inTwoDays, paidAmount: new Prisma.Decimal('1500.50') }, policy).refundAmount).to.equal(1500.5);
    // 33% of 1000.15 = 330.0495 -> 330.05
    expect(calculateRefund({ checkIn: inTwelveHours, paidAmount: 1000.15 }, policy).refundAmount).to.equal(330.05);
  });
});
