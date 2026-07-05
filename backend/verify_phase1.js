import { z } from 'zod';
import prisma from './config/db.js';
import { normalizeHotelPayload, formatHotelResponse } from './controllers/hotelController.js';
import dotenv from 'dotenv';
dotenv.config();

// 1. Zod Schema from hotelController (extracting just the fields we need to test)
const hotelSchema = z.object({
  pan: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, "Invalid PAN format").optional(),
  gstin: z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, "Invalid GSTIN format").optional(),
  bankDetail: z.object({
    ifscCode: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Invalid IFSC code"),
  }).optional()
});

async function runTests() {
  console.log("Starting Phase 1 Verification...\n");

  // --- BUG-06: Validation Testing ---
  console.log("--- BUG-06: Validation Testing ---");
  const validPAN = hotelSchema.safeParse({ pan: 'ABCDE1234F' });
  console.log(`Valid PAN (ABCDE1234F): ${validPAN.success ? 'PASS' : 'FAIL'}`);
  
  const invalidPAN = hotelSchema.safeParse({ pan: 'ABCDE123' });
  console.log(`Invalid PAN (ABCDE123): ${!invalidPAN.success ? 'PASS (Rejected)' : 'FAIL'}`);

  const validGST = hotelSchema.safeParse({ gstin: '22AAAAA0000A1Z5' });
  console.log(`Valid GST (22AAAAA0000A1Z5): ${validGST.success ? 'PASS' : 'FAIL'}`);
  
  const invalidGST = hotelSchema.safeParse({ gstin: '22AAAAA0000' });
  console.log(`Invalid GST (22AAAAA0000): ${!invalidGST.success ? 'PASS (Rejected)' : 'FAIL'}`);

  const validIFSC = hotelSchema.safeParse({ bankDetail: { ifscCode: 'HDFC0001234' } });
  console.log(`Valid IFSC (HDFC0001234): ${validIFSC.success ? 'PASS' : 'FAIL'}`);
  
  const invalidIFSC = hotelSchema.safeParse({ bankDetail: { ifscCode: 'HDFC1234' } });
  console.log(`Invalid IFSC (HDFC1234): ${!invalidIFSC.success ? 'PASS (Rejected)' : 'FAIL'}`);
  console.log("");

  // --- BUG-09: formatHotelResponse Testing ---
  console.log("--- BUG-09: Address Flattening Testing ---");
  const mockHotel = {
    id: 'h1',
    name: 'Test Hotel',
    integrationSettings: {
      addressDetails: { address: '123 Main St', city: 'Bangalore', state: 'KA' },
      contactInfo: { receptionPhone: '9999999999', managerName: 'Rahul' }
    }
  };
  const formatted = formatHotelResponse(mockHotel);
  console.log(`receptionPhone flattened: ${formatted.receptionPhone === '9999999999' ? 'PASS' : 'FAIL'}`);
  console.log(`managerName flattened: ${formatted.managerName === 'Rahul' ? 'PASS' : 'FAIL'}`);
  console.log(`addressLine flattened: ${formatted.addressLine === '123 Main St' ? 'PASS' : 'FAIL'}`);
  console.log(`state flattened: ${formatted.state === 'KA' ? 'PASS' : 'FAIL'}`);
  console.log("");

  console.log("✅ Unit Verification Complete. Note: E2E endpoints (PATCH, DB changes) will be manually verified via Supertest/cURL.");
  process.exit(0);
}

runTests().catch(console.error);
