#!/usr/bin/env node
import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;

const client = new Client({
  host: 'ezmamahyyvqppjlzqazb.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: SERVICE_ROLE_KEY,
  ssl: true
});

const sqlFiles = [
  '004_fintech_advanced_schema.sql',
  '005_fintech_rls.sql',
  '006_fintech_views.sql',
  '007_fintech_functions.sql'
];

async function deployFintech() {
  try {
    console.log('🚀 DEUS FINTECH DEPLOYMENT\n');
    console.log('📡 Supabase PostgreSQL\'e bağlanılıyor...');
    await client.connect();
    console.log('✅ Bağlandı!\n');

    // Split ve execute fonksiyonu (multi-statement)
    async function executeSqlFile(filename) {
      console.log(`⚙️  ${filename} çalıştırılıyor...`);
      const sql = fs.readFileSync(filename, 'utf8');
      
      // SQL'i statement'lere böl (pragmatic approach)
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      let executed = 0;
      for (const statement of statements) {
        try {
          await client.query(statement);
          executed++;
        } catch (e) {
          // Eğer tablo zaten varsa veya başka bilinen hatalar, geç
          if (e.message.includes('already exists') ||
              e.message.includes('duplicate') ||
              e.message.includes('does not exist')) {
            // Beklenmiş hata
          } else if (e.message.length > 200) {
            console.log(`  ⚠️  ${e.message.substring(0, 120)}...`);
          } else {
            console.log(`  ⚠️  ${e.message}`);
          }
        }
      }
      console.log(`  ✅ ${executed} statement başarıyla çalıştırıldı\n`);
      return executed;
    }

    let totalExecuted = 0;
    for (const file of sqlFiles) {
      const count = await executeSqlFile(file);
      totalExecuted += count;
    }

    // Sonuç
    console.log('\n📊 DEPLOYMENT RAPORU\n');
    console.log('='.repeat(50));

    const { rows: tables } = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' ORDER BY table_name
    `);

    console.log(`\n✅ Oluşturulan Tablolar (${tables.length}):`);
    tables.forEach(r => console.log(`  • ${r.table_name}`));

    const { rows: views } = await client.query(`
      SELECT table_name FROM information_schema.views 
      WHERE table_schema = 'public' ORDER BY table_name
    `);

    console.log(`\n✅ Oluşturulan Views (${views.length}):`);
    views.forEach(r => console.log(`  • ${r.table_name}`));

    const { rows: functions } = await client.query(`
      SELECT routine_name FROM information_schema.routines 
      WHERE routine_schema = 'public' AND routine_type = 'FUNCTION'
      ORDER BY routine_name
    `);

    console.log(`\n✅ Oluşturulan Fonksiyonlar (${functions.length}):`);
    functions.slice(0, 15).forEach(r => console.log(`  • ${r.routine_name}()`));
    if (functions.length > 15) {
      console.log(`  ... ve ${functions.length - 15} daha`);
    }

    console.log('\n' + '='.repeat(50));
    console.log(`\n🎉 DEPLOYMENT TAMAMLANDI`);
    console.log(`   Toplam Statement: ${totalExecuted}`);
    console.log(`   Database URL: ${SUPABASE_URL}`);
    console.log(`\n📝 Sonraki Adımlar:`);
    console.log(`   1. Telegram webhook'u yapılandır`);
    console.log(`   2. Test işlemlerini çalıştır`);
    console.log(`   3. Admin operatör ekle`);
    console.log(`   4. Risk kurallarını tanımla\n`);

  } catch (error) {
    console.error('❌ Hata:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

deployFintech();
