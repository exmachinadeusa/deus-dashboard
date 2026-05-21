#!/usr/bin/env node

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('=== DEUS PostgreSQL Migration ===\n');

const client = new Client({
  host: 'ezmamahyyvqppjlzqazb.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: SERVICE_ROLE_KEY,
  ssl: true
});

async function runSQL() {
  try {
    console.log('Supabase PostgreSQL\'e baglaniliyor...');
    await client.connect();
    console.log('✓ Baglandi!\n');

    // Schema
    console.log('001_deus_schema.sql calistiriliyor...');
    const schema = fs.readFileSync('001_deus_schema.sql', 'utf8');
    try {
      await client.query(schema);
      console.log('✓ Schema olusturuldu\n');
    } catch (e) {
      console.log(`✗ Hata: ${e.message.substring(0, 80)}\n`);
    }

    // Learning
    console.log('002_deus_learning.sql calistiriliyor...');
    const learning = fs.readFileSync('002_deus_learning.sql', 'utf8');
    try {
      await client.query(learning);
      console.log('✓ Learning tabloları olusturuldu\n');
    } catch (e) {
      console.log(`✗ Hata: ${e.message.substring(0, 80)}\n`);
    }

    // Tablolari listele
    console.log('Olusturulan tablolar:');
    const { rows } = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' ORDER BY table_name
    `);
    rows.forEach(r => console.log(`  • ${r.table_name}`));
    console.log(`\n✓ Toplam ${rows.length} tablo\n`);

  } catch (error) {
    console.error('Hata:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runSQL();
