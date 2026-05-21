#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Supabase Migration Script');
console.log('========================\n');

async function executeSQL(sqlContent, filename) {
  return new Promise((resolve) => {
    const data = JSON.stringify({ query: sqlContent });
    
    const options = {
      hostname: 'ezmamahyyvqppjlzqazb.supabase.co',
      path: '/rest/v1/sql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'apikey': SUPABASE_KEY
      }
    };

    console.log(`Dosya çalıştırılıyor: ${filename}`);
    
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const success = res.statusCode >= 200 && res.statusCode < 300;
        console.log(`  Status: ${res.statusCode} ${success ? '✓' : '✗'}`);
        resolve(success);
      });
    });

    req.on('error', (error) => {
      console.error(`  Hata: ${error.message}`);
      resolve(false);
    });

    req.write(data);
    req.end();
  });
}

async function main() {
  try {
    console.log('Supabase URL:', SUPABASE_URL);
    console.log('Service Role Key:', SUPABASE_KEY ? SUPABASE_KEY.substring(0, 10) + '...' : 'UNDEFINED');
    console.log();

    // 001_deus_schema.sql
    const schema = fs.readFileSync(path.join(__dirname, '001_deus_schema.sql'), 'utf8');
    const schemaOk = await executeSQL(schema, '001_deus_schema.sql');
    
    console.log();

    // 002_deus_learning.sql
    const learning = fs.readFileSync(path.join(__dirname, '002_deus_learning.sql'), 'utf8');
    const learningOk = await executeSQL(learning, '002_deus_learning.sql');
    
    console.log();
    
    if (schemaOk && learningOk) {
      console.log('✓ Tum migrasyonlar tamamlandi!');
      process.exit(0);
    } else {
      console.log('✗ Bazi migrasyonlar basarisiz oldu');
      console.log('\nManuel olarak Supabase Dashboard\'dan calistirmayı dene:');
      console.log('1. https://app.supabase.com');
      console.log('2. Projenizi secin');
      console.log('3. SQL Editor > New Query');
      console.log('4. SQL dosyalarini yapistir ve calistir');
      process.exit(1);
    }
  } catch (error) {
    console.error('Kritik hata:', error.message);
    process.exit(1);
  }
}

main();
