import { PrismaClient } from '@prisma/client';
import { MONEY_FIELDS } from '../constants/moneyFields.js';
import { toMoney } from '../utils/money.js';
import { encryptText, decryptText } from '../utils/dataCrypto.js';

/**
 * Money columns are stored as Decimal(12, 2); this extension hands them to the app as plain
 * numbers (see constants/moneyFields.js). It applies to nested includes too. Aggregates
 * (`_sum`) and $queryRaw still return Prisma.Decimal; convert those with utils/money.js.
 */
const moneyAsNumbers = Object.fromEntries(
  Object.entries(MONEY_FIELDS).map(([model, fields]) => [
    model,
    Object.fromEntries(fields.map((field) => [
      field,
      { needs: { [field]: true }, compute: (row) => toMoney(row[field]) },
    ])),
  ])
);

/**
 * Bank details are encrypted at rest (utils/dataCrypto.js): written encrypted by every create or
 * update, handed to the app decrypted. Old plain values still read as they are.
 */
const SECRET_FIELDS = { bankDetail: ['accountNumber', 'upiId'] };
const encryptData = (model, data) => {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map((d) => encryptData(model, d));
  const out = { ...data };
  for (const f of SECRET_FIELDS[model]) {
    if (typeof out[f] === 'string') out[f] = encryptText(out[f]);
    else if (out[f] && typeof out[f] === 'object' && typeof out[f].set === 'string') out[f] = { set: encryptText(out[f].set) };
  }
  return out;
};
const encryptedWrites = {
  bankDetail: Object.fromEntries(['create', 'createMany', 'update', 'updateMany', 'upsert'].map((op) => [op, ({ args, query }) => {
    const a = { ...args };
    if (op === 'upsert') { a.create = encryptData('bankDetail', a.create); a.update = encryptData('bankDetail', a.update); } else a.data = encryptData('bankDetail', a.data);
    return query(a);
  }])),
};
const decryptedReads = {
  bankDetail: Object.fromEntries(SECRET_FIELDS.bankDetail.map((f) => [f, { needs: { [f]: true }, compute: (row) => decryptText(row[f]) }])),
};

const prismaClientSingleton = () => {
  return new PrismaClient()
    .$extends({ name: 'moneyAsNumbers', result: moneyAsNumbers })
    .$extends({ name: 'encryptedBankDetails', query: encryptedWrites, result: decryptedReads });
};

const prisma = global.prisma || prismaClientSingleton();

export default prisma;

if (process.env.NODE_ENV !== 'production') global.prisma = prisma;
