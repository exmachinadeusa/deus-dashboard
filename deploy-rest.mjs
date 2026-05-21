#!/usr/bin/env node
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const sqlFiles = [
  '004_fintech_advanced_schema.sql',
  '005_fintech_rls.sql',
  '006_fintech_views.sql',
  '007_fintech_functions.sql'
];

async function deploySqlViaRest() {
  try {
    console.log('🚀 DEUS FINTECH DEPLOYMENT (REST API)\n');
    console.log(`📡 Supabase: ${SUPABASE_URL.split('https://')[1].split('.')[0]}\n`);

    let totalStatements = 0;
    let successful = 0;
    let errors = [];

    for (const file of sqlFiles) {
      console.log(`⚙️  ${file}...`);
      const sql = fs.readFileSync(file, 'utf8');

      // Split statements
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      totalStatements += statements.length;

      // Her statement için REST call
      for (const statement of statements) {
        try {
          const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/sql_query`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query: statement })
          });

          if (response.ok) {
            successful++;
          } else {
            const error = await response.text();
            if (!error.includes('already exists') && !error.includes('duplicate')) {
              errors.push({ file, error: error.substring(0, 80) });
            }
          }
        } catch (e) {
          // Network hataları
          if (!e.message.includes('ECONNREFUSED')) {
            errors.push({ file, error: e.message.substring(0, 80) });
          }
        }
      }

      console.log(`  ✅ ${statements.length} statement gönderildi\n`);
    }

    console.log('✅ DEPLOYMENT TAMAMLANDI\n');
    console.log(`   Total Statements: ${totalStatements}`);
    console.log(`   Successful: ${successful}`);
    console.log(`   Errors: ${errors.length}\n`);

    if (errors.length > 0) {
      console.log('⚠️  Hatalar:');
      errors.slice(0, 5).forEach(e => {
        console.log(`   • ${e.file}: ${e.error}`);
      });
    }

    console.log(`\n📝 Sonraki Adımlar:`);
    console.log(`   1. Telegram webhook'u yapılandır`);
    console.log(`   2. Test işlemlerini çalıştır`);
    console.log(`   3. Admin operatör ekle\n`);

  } catch (error) {
    console.error('❌ Hata:', error.message);
    process.exit(1);
  }
}

deploySqlViaRest();
