/**
 * Customer Seed Script
 *
 * Seeds 1,000 synthetic customers from:
 *   data/skywings_1000_synthetic_customers.json
 *
 * Rules:
 *  - Strip the `data_type` field from every record before inserting.
 *  - Drop the existing `customers` collection first (idempotent re-runs).
 *  - Use bulk insertMany for speed.
 *
 * Usage:
 *   node seeds/customers.seed.js
 *   -- or --
 *   npm run seed:customers
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// ── Resolve __dirname in ESM ───────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Load environment ───────────────────────────────────────────────────────
dotenv.config({ path: join(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/airline_crm_simulator';

// ── Load JSON data ─────────────────────────────────────────────────────────
const dataFilePath = join(__dirname, '..', 'data', 'skywings_1000_synthetic_customers.json');
const rawData = JSON.parse(readFileSync(dataFilePath, 'utf-8'));
const rawCustomers = rawData.customers;

if (!Array.isArray(rawCustomers) || rawCustomers.length === 0) {
  console.error('❌ No customers array found in JSON file');
  process.exit(1);
}

// ── Strip data_type field ──────────────────────────────────────────────────
const sanitizedCustomers = rawCustomers.map((record) => {
  // eslint-disable-next-line no-unused-vars
  const { data_type, ...rest } = record;
  return rest;
});

// ── Seed ───────────────────────────────────────────────────────────────────
async function seed() {
  console.log(`\n🌱  Connecting to MongoDB: ${MONGO_URI}`);
  await mongoose.connect(MONGO_URI);

  const db = mongoose.connection.db;
  const collection = db.collection('customers');

  // Drop existing data for a clean re-seed
  const existing = await collection.countDocuments();
  if (existing > 0) {
    console.log(`⚠️  Dropping existing ${existing} customer records…`);
    await collection.drop();
    console.log('   Collection dropped.');
  }

  console.log(`📦  Inserting ${sanitizedCustomers.length} customer records…`);
  const result = await collection.insertMany(sanitizedCustomers, { ordered: false });
  console.log(`✅  Inserted: ${result.insertedCount} customers`);

  if (result.insertedCount !== sanitizedCustomers.length) {
    console.warn(
      `⚠️  Mismatch: expected ${sanitizedCustomers.length}, inserted ${result.insertedCount}`,
    );
  }

  // Create index on record_id for fast random lookup by _id/$sample
  await collection.createIndex({ record_id: 1 }, { unique: true });
  await collection.createIndex({ 'customer.customer_id': 1 });
  await collection.createIndex({ 'booking.pnr': 1 });
  console.log('🔑  Indexes created on record_id, customer.customer_id, booking.pnr');

  await mongoose.disconnect();
  console.log('🎉  Seeding complete!\n');
}

seed().catch((err) => {
  console.error('❌  Seeding failed:', err.message);
  mongoose.disconnect();
  process.exit(1);
});
