import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { eventBus, EVENTS } from './eventBus.js';

const prisma = new PrismaClient();

/**
 * Service to manage immutable double-entry bookkeeping.
 */
class LedgerService {
  /**
   * Posts a new entry to the ledger with immutable hashing.
   */
  async postEntry({ referenceId, referenceType, traceId, account, type, amount, description, periodId }) {
    const ledgerEntry = await prisma.$transaction(async (tx) => {
      // 1. Fetch the last hash for the account (or global) to maintain chain
      const lastEntry = await tx.ledgerEntry.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { hash: true }
      });

      const previousHash = lastEntry?.hash || 'GENESIS_BLOCK';

      // 2. Create the data string for hashing
      const dataToHash = `${previousHash}|${referenceId}|${account}|${type}|${amount}|${description}|${periodId || ''}`;
      const hash = crypto.createHash('sha256').update(dataToHash).digest('hex');

      // 3. Create the entry
      return tx.ledgerEntry.create({
        data: {
          referenceId,
          referenceType,
          traceId,
          account,
          type, // DEBIT, CREDIT
          amount,
          description,
          hash,
          periodId
        }
      });
    });

    // 4. Trigger Graduated Integrity Autocheck after transaction commits (fire-and-forget)
    this.autocheckIntegrity(referenceId, traceId);

    return ledgerEntry;
  }

  async autocheckIntegrity(referenceId, traceId) {
    const result = await this.verifyIntegrity();
    if (!result.isValid) {
      console.error(`[Self-Healing] Ledger Integrity Failure detected at ${referenceId}`);
      
      // Emit Autonomous Incident
      eventBus.emitEvent(EVENTS.INCIDENT_REPORTED, {
        message: 'LEDGER_INTEGRITY_FAILURE: Hash mismatch detected in real-time.',
        failedAt: result.failedAt,
        referenceId
      }, { severity: 'CRITICAL', traceId, source: 'LEDGER_SELF_HEALING' });
    }
  }

  /**
   * Posts a balanced double-entry transaction.
   * Ensures that total Debit = total Credit.
   */
  async postTransaction({ referenceId, referenceType, traceId, entries, description, periodId }) {
    const totalDebit = entries
      .filter(e => e.type === 'DEBIT')
      .reduce((sum, e) => sum + Number(e.amount), 0);
    
    const totalCredit = entries
      .filter(e => e.type === 'CREDIT')
      .reduce((sum, e) => sum + Number(e.amount), 0);

    if (totalDebit.toFixed(2) !== totalCredit.toFixed(2)) {
      throw new Error(`Unbalanced transaction: Debit (${totalDebit}) != Credit (${totalCredit})`);
    }

    const results = [];
    for (const entry of entries) {
      const res = await this.postEntry({
        referenceId,
        referenceType,
        traceId,
        account: entry.account,
        type: entry.type,
        amount: entry.amount,
        description: entry.description || description,
        periodId
      });
      results.push(res);
    }
    return results;
  }

  /**
   * Verifies the integrity of the ledger chain.
   */
  async verifyIntegrity() {
    const entries = await prisma.ledgerEntry.findMany({
      orderBy: { createdAt: 'asc' }
    });

    let previousHash = 'GENESIS_BLOCK';
    for (const entry of entries) {
      const dataToHash = `${previousHash}|${entry.referenceId}|${entry.account}|${entry.type}|${entry.amount}|${entry.description}|${entry.periodId || ''}`;
      const expectedHash = crypto.createHash('sha256').update(dataToHash).digest('hex');

      if (entry.hash !== expectedHash) {
        return { 
          isValid: false, 
          failedAt: entry.id, 
          message: `Hash mismatch at entry ${entry.id}` 
        };
      }
      previousHash = entry.hash;
    }

    return { isValid: true };
  }
}

export default new LedgerService();
