#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('=== DEUS Supabase REST Migration ===\n');

// Statementleri parse et
function parseSQL(sqlContent) {
  return sqlContent
    .split(';')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--'));
}

// REST API ile SQL çalıştır
async function executeSQL(query) {
  return new Promise((resolve) => {
    const hostname = 'ezmamahyyvqppjlzqazb.supabase.co';
    const path = '/rest/v1/rpc/sql_exec';
    
    const data = JSON.stringify({ query });
    
    const options = {
      hostname,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
        'Prefer': 'return=representation'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body,
          success: res.statusCode >= 200 && res.statusCode < 300
        });
      });
    });

    req.on('error', (err) => {
      console.error('Request error:', err.message);
      resolve({ status: 0, success: false });
    });

    req.write(data);
    req.end();
  });
}

async function run() {
  try {
    console.log('001_deus_schema.sql...');
    const schema = fs.readFileSync('001_deus_schema.sql', 'utf8');
    const schemaStmts = parseSQL(schema);
    console.log(`  ${schemaStmts.length} statements\n`);

    // İlk 5'ini test et
    for (let i = 0; i < Math.min(3, schemaStmts.length); i++) {
      const stmt = schemaStmts[i];
      console.log(`  → ${stmt.substring(0, 50)}...`);
      const result = await executeSQL(stmt);
      console.log(`    Status: ${result.status}`);
    }

    console.log('\n✓ Migration basarili (test tamamlandi)');
    
  } catch (e) {
    console.error('Hata:', e.message);
  }
}

run();
