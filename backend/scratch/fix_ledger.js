import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function fixLedger() {
  console.log('--- Fixing Ledger Hashes ---');
  
  const entries = await prisma.ledgerEntry.findMany({
    orderBy: { createdAt: 'asc' }
  });

  let previousHash = 'GENESIS_BLOCK';
  for (const entry of entries) {
    const dataToHash = `${previousHash}|${entry.referenceId}|${entry.account}|${entry.type}|${entry.amount}|${entry.description}|${entry.periodId || ''}`;
    const hash = crypto.createHash('sha256').update(dataToHash).digest('hex');

    await prisma.ledgerEntry.update({
      where: { id: entry.id },
      data: { hash }
    });
    
    console.log(`Updated entry ${entry.id} with hash ${hash.slice(0, 8)}...`);
    previousHash = hash;
  }
  
  console.log('✅ All entries re-hashed.');
}

fixLedger();
