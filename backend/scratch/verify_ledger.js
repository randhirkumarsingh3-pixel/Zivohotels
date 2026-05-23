import ledgerService from '../services/ledgerService.js';

async function testLedger() {
  console.log('--- Testing Ledger Integrity ---');
  
  try {
    const result = await ledgerService.verifyIntegrity();
    console.log('Result:', result);
    
    if (result.isValid) {
      console.log('✅ Ledger integrity verified.');
    } else {
      console.log('❌ Ledger integrity compromised!');
    }
  } catch (error) {
    console.error('Error during test:', error);
  }
}

testLedger();
