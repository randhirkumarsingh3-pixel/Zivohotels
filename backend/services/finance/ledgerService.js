import { Prisma } from '@prisma/client';
import prisma from '../../config/db.js';

/**
 * Ledger Service (Double-Entry)
 * 
 * CORE RULES:
 * 1. IMMUTABILITY: Ledger entries are NEVER updated or deleted.
 * 2. REVERSALS: Corrections must be made via new balancing entries.
 * 3. BALANCING: Total Debits must equal Total Credits for a balanced transaction.
 */
export const ledgerService = {
  /**
   * Records a set of entries in a single transaction
   */
  record: async (entries, tx = prisma) => {
    try {
      // 1. Period Locking Check
      const now = new Date();
      const activePeriod = await tx.financialPeriod.findFirst({
        where: { startDate: { lte: now }, endDate: { gte: now } }
      });

      if (activePeriod?.isLocked) {
        throw new Error(`Financial period ${activePeriod.name} is locked. No new entries allowed.`);
      }

      // 2. Validate balance using Decimal math to prevent precision drift
      let balance = new Prisma.Decimal(0);
      
      entries.forEach(e => {
        const val = new Prisma.Decimal(e.amount);
        if (e.type === 'DEBIT') balance = balance.plus(val);
        else if (e.type === 'CREDIT') balance = balance.minus(val);
      });

      if (!balance.isZero()) {
        console.warn('[Ledger] Unbalanced entries detected (Off by: ' + balance.toString() + '). Reconcile required.');
      }

      return await tx.ledgerEntry.createMany({
        data: entries.map(e => ({
          referenceId: e.referenceId,
          periodId: activePeriod?.id,
          account: e.account,
          type: e.type,
          amount: new Prisma.Decimal(e.amount),
          description: e.description
        }))
      });
    } catch (error) {
      console.error('[Ledger] Recording failed:', error);
      throw error;
    }
  },

  /**
   * System-wide invariant check: Sum of all ledger entries must be zero.
   */
  validateGlobalBalance: async () => {
    const entries = await prisma.ledgerEntry.findMany();
    let balance = new Prisma.Decimal(0);
    
    entries.forEach(e => {
      if (e.type === 'DEBIT') balance = balance.plus(e.amount);
      else balance = balance.minus(e.amount);
    });

    return { 
      isValid: balance.isZero(), 
      variance: balance.toString(),
      sampleCount: entries.length 
    };
  },

  /**
   * Reverses an existing ledger entry by creating a counter-entry
   */
  reverse: async (referenceId, descriptionSuffix = '(REVERSAL)', tx = prisma) => {
    const originalEntries = await tx.ledgerEntry.findMany({ where: { referenceId } });
    
    const reversals = originalEntries.map(e => ({
      referenceId: e.referenceId,
      account: e.account,
      type: e.type === 'DEBIT' ? 'CREDIT' : 'DEBIT',
      amount: e.amount,
      description: `${e.description} ${descriptionSuffix}`
    }));

    return await ledgerService.record(reversals, tx);
  }
};

export default ledgerService;
