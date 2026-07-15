import prisma from '../config/db.js';
import ledgerService from './ledgerService.js';
import { eventBus, EVENTS } from './eventBus.js';



const VALID_TRANSITIONS = {
  PENDING: ['REVIEW', 'QUEUED', 'ON_HOLD'],
  REVIEW: ['QUEUED', 'ON_HOLD', 'FAILED'],
  QUEUED: ['PROCESSING', 'FAILED'],
  PROCESSING: ['PAID', 'FAILED'],
  ON_HOLD: ['PENDING', 'REVIEW', 'CANCELLED'],
  PAID: ['REVERSED'], // For corrections
};

class PayoutStateMachine {
  /**
   * Transition a payout to a new state.
   */
  async transition(payoutId, nextState, { reason, userId, traceId } = {}) {
    return await prisma.$transaction(async (tx) => {
      const payout = await tx.payout.findUnique({ where: { id: payoutId } });
      if (!payout) throw new Error('Payout not found');

      const currentState = payout.status;
      if (!VALID_TRANSITIONS[currentState]?.includes(nextState)) {
        throw new Error(`Invalid payout transition: ${currentState} -> ${nextState}`);
      }

      // 1. Safety Checks
      const appState = await tx.appState.findUnique({ where: { id: 'singleton' } });
      if (appState?.systemMode === 'SAFE_MODE' && !['FAILED', 'ON_HOLD'].includes(nextState)) {
        throw new Error('Payout operations are locked in SAFE_MODE');
      }

      // 2. Perform State Specific Actions
      if (nextState === 'PAID') {
        // Post final Ledger entry moving from Liability to Cash/Bank
        await ledgerService.postTransaction({
          referenceId: payout.id,
          referenceType: 'PAYOUT',
          traceId,
          description: `Payout finalized for ${payout.id}`,
          entries: [
            { account: `HOTEL_PAYOUT_${payout.hotelId}`, type: 'DEBIT', amount: payout.totalAmount },
            { account: 'ZIVO_BANK_OPERATIONAL', type: 'CREDIT', amount: payout.totalAmount }
          ]
        });
      }

      // 3. Update Payout
      const updated = await tx.payout.update({
        where: { id: payoutId },
        data: { 
          status: nextState,
          // reference: ... if external ID provided
        }
      });

      // 4. Log Audit Trail
      await tx.auditLog.create({
        data: {
          action: 'PAYOUT_STATUS_CHANGE',
          entityType: 'PAYOUT',
          entityId: payoutId,
          userId: userId || 'SYSTEM',
          details: { from: currentState, to: nextState, reason },
          traceId
        }
      });

      // 5. Broadcast Real-time Event
      const eventName = nextState === 'PAID' ? EVENTS.PAYOUT_PAID : 
                        nextState === 'FAILED' ? EVENTS.PAYOUT_FAILED : 
                        EVENTS.PAYOUT_PROCESSING;
      
      eventBus.emitEvent(eventName, {
        payoutId,
        hotelId: payout.hotelId,
        fromStatus: currentState,
        toStatus: nextState,
        amount: Number(payout.totalAmount)
      }, { traceId, entityId: payoutId });

      return updated;
    });
  }
}

export default new PayoutStateMachine();
