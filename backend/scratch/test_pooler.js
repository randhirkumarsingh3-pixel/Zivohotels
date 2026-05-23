import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function testConnection() {
  console.log('Testing connection to Supabase Pooler...');
  try {
    const count = await prisma.hotel.count();
    console.log(`✅ Success! Connected to database. Total hotels: ${count}`);
  } catch (error) {
    console.error('❌ Connection failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();
