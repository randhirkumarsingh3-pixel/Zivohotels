import { Prisma } from '@prisma/client';
import prisma from '../../config/db.js';

export const walletService = {
  /**
   * Adjusts wallet balance
   * Supports both standalone calls and usage within a parent transaction
   */
  adjustBalance: async (id, type, amount, reference, tx = prisma) => {
    const wallet = await tx.wallet.findUnique({ where: { id } });
    if (!wallet) throw new Error('Wallet not found');

    const decimalAmount = new Prisma.Decimal(amount);
    const newBalance = type === 'CREDIT' 
      ? wallet.balance.plus(decimalAmount) 
      : wallet.balance.minus(decimalAmount);

    // 1. Update Balance
    const updatedWallet = await tx.wallet.update({
      where: { id },
      data: { balance: newBalance }
    });

    // 2. Log Transaction
    await tx.walletTransaction.create({
      data: {
        walletId: id,
        type,
        amount: decimalAmount,
        reference
      }
    });

    return updatedWallet;
  },

  /**
   * Gets or creates a wallet for a user or hotel
   */
  getOrCreateWallet: async (ownerId, ownerType = 'USER') => {
    const where = ownerType === 'USER' ? { userId: ownerId } : { hotelId: ownerId };
    
    let wallet = await prisma.wallet.findUnique({ where });
    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: { ...where, balance: 0, creditLimit: 0 }
      });
    }
    return wallet;
  }
};

export default walletService;
