#!/usr/bin/env node

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Supabase PostgreSQL bağlantısı
const client = new Client({
  host: 'ezmamahyyvqppjlzqazb.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: SERVICE_ROLE_KEY,
  ssl: { rejectUnauthorized: false }
});

console.log('PostgreSQL Migration Script');
console.log('===========================\n');

async function runMigrations() {
  try {
    console.log('Veritabanina baglaniliyor...');
    await client.connect();
    console.log('✓ Baglantilar kuruldu\n');

    // 001_deus_schema.sql
    console.log('Dosya calistiriliyor: 001_deus_schema.sql');
    const schema = fs.readFileSync(path.join(__dirname, '001_deus_schema.sql'), 'utf8');
    
    try {
      await client.query(schema);
      console.log('  ✓ Tamamlandi\n');
    } catch (e) {
      console.log(`  ✗ Hata: ${e.message.substring(0, 100)}\n`);
    }

    // 002_deus_learning.sql
    console.log('Dosya calistiriliyor: 002_deus_learning.sql');
    const learning = fs.readFileSync(path.join(__dirname, '002_deus_learning.sql'), 'utf8');
    
    try {
      await client.query(learning);
      console.log('  ✓ Tamamlandi\n');
    } catch (e) {
      console.log(`  ✗ Hata: ${e.message.substring(0, 100)}\n`);
    }

    // Tablolari listele
    console.log('Olusturulan tablolar:');
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    
    if (result.rows.length > 0) {
      result.rows.forEach(r => console.log(`  - ${r.table_name}`));
      console.log(`\n✓ Toplam ${result.rows.length} tablo olusturuldu!`);
    } else {
      console.log('  (Tablo yok)');
    }

    process.exit(0);
  } catch (error) {
    console.error('\nKritik hata:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();
