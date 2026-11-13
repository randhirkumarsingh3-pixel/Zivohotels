import { PrismaClient } from '@prisma/client';
import { MONEY_FIELDS } from '../constants/moneyFields.js';
import { toMoney } from '../utils/money.js';

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

const prismaClientSingleton = () => {
  return new PrismaClient().$extends({ name: 'moneyAsNumbers', result: moneyAsNumbers });
};

const prisma = global.prisma || prismaClientSingleton();

export default prisma;

if (process.env.NODE_ENV !== 'production') global.prisma = prisma;
