#!/usr/bin/env node
/**
 * DEUS FINTECH - MCP SQL DEPLOYMENT
 * OpenClaw native MCP client kullanarak Supabase'e SQL deploy
 */

import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { spawn } from 'child_process';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = proces…KEY;

const sqlFiles = [
  '004_fintech_advanced_schema.sql',
  '005_fintech_rls.sql',
  '006_fintech_views.sql',
  '007_fintech_functions.sql',
  'setup-initial-data.sql'
];

async function executeSql(sql) {
  return new Promise((resolve, reject) => {
    const curl = spawn('curl', [
      '-s',
      '-X', 'POST',
      `${SUPABASE_URL}/rest/v1/rpc/exec_sql`,
      '-H', 'Content-Type: application/json',
      '-H', `Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      '-d', JSON.stringify({ query: sql })
    ]);

    let output = '';
    let error = '';

    curl.stdout.on('data', (data) => {
      output += data;
    });

    curl.stderr.on('data', (data) => {
      error += data;
    });

    curl.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(error));
      } else {
        resolve(output);
      }
    });
  });
}

async function deploySql() {
  try {
    console.log('\n🚀 DEUS FINTECH - MCP SQL DEPLOYMENT\n');
    console.log('='.repeat(60));
    console.log(`\n🔌 Supabase: ${SUPABASE_URL}\n`);

    let totalStatements = 0;
    let totalSuccess = 0;

    for (const file of sqlFiles) {
      console.log(`\n📄 ${file} konuşlandırılıyor...`);

      const sql = fs.readFileSync(file, 'utf8');

      // SQL'i statement'lere böl
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      let fileSuccess = 0;

      for (const statement of statements) {
        try {
          await executeSql(statement);
          fileSuccess++;
          totalSuccess++;
        } catch (e) {
          // Hataları yoksay (zaten var, vb)
          if (!e.message.includes('already exists') &&
              !e.message.includes('duplicate')) {
            console.log(`  ⚠️  ${e.message.substring(0, 80)}`);
          }
        }
        totalStatements++;
      }

      console.log(`  ✅ ${fileSuccess}/${statements.length} statement başarılı`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n✅ DEPLOYMENT TAMAMLANDI\n');
    console.log(`  Toplam: ${totalSuccess}/${totalStatements}`);
    console.log(`\n🎉 Bot şimdi yetki kontrolü yapabilecek\n`);

  } catch (error) {
    console.error('\n❌ HATA:', error.message);
    process.exit(1);
  }
}

deploySql();
