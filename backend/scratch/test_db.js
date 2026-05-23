import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;
const client = new Client({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
});

async function test() {
  try {
    console.log('Connecting to DB...');
    await client.connect();
    console.log('Connected!');
    const res = await client.query('SELECT NOW()');
    console.log('Result:', res.rows[0]);
    await client.end();
  } catch (err) {
    console.error('Connection error:', err.stack);
  }
}

test();
