import { Prisma } from '@prisma/client';
import prisma from '../../config/db.js';

export const agentService = {
  /**
   * Validates if an agent has enough credit for a booking
   */
  authorizeBooking: async (agentId, amount) => {
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) throw new Error('Agent not found');

    const bookingAmount = new Prisma.Decimal(amount);
    const availableCredit = agent.creditLimit.minus(agent.usedCredit);

    if (availableCredit.lessThan(bookingAmount)) {
      throw new Error(`Insufficient credit. Available: ${availableCredit.toString()}`);
    }

    return true;
  },

  /**
   * Updates agent used credit
   */
  utilizeCredit: async (agentId, amount, tx = prisma) => {
    return await tx.agent.update({
      where: { id: agentId },
      data: { usedCredit: { increment: new Prisma.Decimal(amount) } }
    });
  }
};

export default agentService;
