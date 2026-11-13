import { MONEY_FIELDS } from '../constants/moneyFields.js';

/**
 * Turns a Prisma.Decimal, string or number into a JavaScript number (null/undefined pass through).
 * Decimal(12, 2) values are at most 10 digits before the point, well inside a double's exact range.
 */
export const toMoney = (value) => {
  if (value === null || value === undefined) return value;
  const n = typeof value === 'number' ? value : Number(value.toString());
  return Number.isFinite(n) ? n : 0;
};

/** Rounds to the paisa, correctly for halves such as 1.005 (plain Math.round(x * 100) gives 1.00). */
export const roundMoney = (value) => {
  const n = toMoney(value) || 0;
  return Math.sign(n) * Math.round(Number(`${Math.abs(n)}e2`)) / 100;
};

/**
 * Converts the money fields of a row read with $queryRaw (which returns Prisma.Decimal for
 * numeric columns) to numbers, like the Prisma client extension does for normal queries.
 */
export const moneyFieldsToNumbers = (model, row) => {
  if (!row) return row;
  const out = { ...row };
  for (const field of MONEY_FIELDS[model] || []) {
    if (field in out) out[field] = toMoney(out[field]);
  }
  return out;
};
