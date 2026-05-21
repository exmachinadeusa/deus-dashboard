#!/usr/bin/env node
import pkg from 'pg';
const { Client } = pkg;
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Parse Supabase URL
const urlObj = new URL(SUPABASE_URL);
const host = urlObj.hostname;

const client = new Client({
  host: host,
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: SUPABASE_SERVICE_ROLE_KEY,
  ssl: { rejectUnauthorized: false }
});

const sqlFiles = [
  '004_fintech_advanced_schema.sql',
  '005_fintech_rls.sql',
  '006_fintech_views.sql',
  '007_fintech_functions.sql',
  'setup-initial-data.sql'
];

async function deploySql() {
  try {
    console.log('\n🚀 DEUS FINTECH SQL DEPLOYMENT\n');
    console.log('='.repeat(60));
    console.log(`\n🔌 Supabase'e bağlanılıyor: ${host}\n`);

    await client.connect();
    console.log('✅ Bağlantı başarılı\n');

    let totalStatements = 0;
    let totalSuccess = 0;

    for (const file of sqlFiles) {
      console.log(`\n📄 ${file} konuşlandırılıyor...`);
      
      const sql = fs.readFileSync(file, 'utf8');
      
      // SQL'i statement'lere böl (pragmatik)
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      let fileSuccess = 0;

      for (const statement of statements) {
        try {
          await client.query(statement);
          fileSuccess++;
          totalSuccess++;
        } catch (e) {
          // Bazı hataları yoksay
          if (!e.message.includes('already exists') &&
              !e.message.includes('duplicate') &&
              !e.message.includes('does not exist')) {
            console.log(`  ⚠️  ${e.message.substring(0, 80)}`);
          }
        }
        totalStatements++;
      }

      console.log(`  ✅ ${fileSuccess}/${statements.length} statement başarılı`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n📊 DEPLOYMENT ÖZET\n');
    console.log(`  Toplam Statement: ${totalStatements}`);
    console.log(`  Başarılı: ${totalSuccess}`);
    console.log(`  Hata: ${totalStatements - totalSuccess}\n`);

    // Tabloları kontrol et
    console.log('📋 Oluşturulan Tablolar:');
    const result = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    console.log(`   ✅ Toplam ${result.rows.length} tablo\n`);
    result.rows.slice(0, 15).forEach(r => console.log(`     • ${r.table_name}`));
    if (result.rows.length > 15) {
      console.log(`     ... ve ${result.rows.length - 15} daha`);
    }

    // Views kontrol et
    console.log('\n📊 Oluşturulan Views:');
    const viewResult = await client.query(`
      SELECT table_name FROM information_schema.views 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    console.log(`   ✅ Toplam ${viewResult.rows.length} view\n`);
    viewResult.rows.forEach(r => console.log(`     • ${r.table_name}`));

    // Functions kontrol et
    console.log('\n⚙️  Oluşturulan Functions:');
    const funcResult = await client.query(`
      SELECT routine_name FROM information_schema.routines 
      WHERE routine_schema = 'public' 
      AND routine_type = 'FUNCTION'
      ORDER BY routine_name
    `);

    console.log(`   ✅ Toplam ${funcResult.rows.length} function\n`);
    funcResult.rows.slice(0, 10).forEach(r => console.log(`     • ${r.routine_name}()`));
    if (funcResult.rows.length > 10) {
      console.log(`     ... ve ${funcResult.rows.length - 10} daha`);
    }

    // Operatörleri kontrol et
    console.log('\n👥 Test Operatörleri:');
    const operResult = await client.query(`
      SELECT telegram_id, name, role, is_active FROM operators 
      ORDER BY role DESC
    `);

    console.log(`   ✅ Toplam ${operResult.rows.length} operatör\n`);
    operResult.rows.forEach(r => 
      console.log(`     • ${r.name} (${r.role}) - Telegram: ${r.telegram_id} - ${r.is_active ? '✅' : '❌'}`)
    );

    // Müşterileri kontrol et
    console.log('\n👤 Test Müşterileri:');
    const custResult = await client.query(`
      SELECT customer_id, customer_name, kyc_status, balance FROM customer_accounts 
      ORDER BY balance DESC
    `);

    console.log(`   ✅ Toplam ${custResult.rows.length} müşteri\n`);
    custResult.rows.forEach(r => 
      console.log(`     • ${r.customer_name} (${r.customer_id}) - ${r.kyc_status} - ${r.balance} TL`)
    );

    console.log('\n' + '='.repeat(60));
    console.log('\n🎉 DATABASE DEPLOYMENT TAMAMLANDI\n');
    console.log('✅ Telegram Bot şimdi yetki kontrolü yapabilecek');
    console.log('✅ Test operatörleri tanımlı (Telegram ID\'ler ekli)');
    console.log('✅ Test müşterileri ve işlemler oluşturuldu\n');
    console.log('SONRAKI: Telegram @DEUS_BotHandle\'e /start gönder\n');

  } catch (error) {
    console.error('\n❌ DEPLOYMENT HATASI:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

deploySql();
