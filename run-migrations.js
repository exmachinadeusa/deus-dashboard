#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('❌ SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function runMigrations() {
  try {
    // 001_deus_schema.sql
    console.log('🔧 001_deus_schema.sql çalıştırılıyor...');
    const schema = fs.readFileSync(path.join(__dirname, '001_deus_schema.sql'), 'utf8');
    const schemaStatements = schema.split(';').filter(s => s.trim());
    
    for (const stmt of schemaStatements) {
      if (stmt.trim()) {
        const { error } = await supabase.rpc('exec_sql', { sql: stmt + ';' }).catch(e => ({ error: e }));
        if (error) {
          console.warn('⚠️  İfade hatası (devam ediliyor):', error.message);
        }
      }
    }
    console.log('✅ Schema başarıyla oluşturuldu');

    // 002_deus_learning.sql
    console.log('🧠 002_deus_learning.sql çalıştırılıyor...');
    const learning = fs.readFileSync(path.join(__dirname, '002_deus_learning.sql'), 'utf8');
    const learningStatements = learning.split(';').filter(s => s.trim());
    
    for (const stmt of learningStatements) {
      if (stmt.trim()) {
        const { error } = await supabase.rpc('exec_sql', { sql: stmt + ';' }).catch(e => ({ error: e }));
        if (error) {
          console.warn('⚠️  İfade hatası (devam ediliyor):', error.message);
        }
      }
    }
    console.log('✅ Learning tablolar başarıyla oluşturuldu');

    console.log('\n✅ Tüm migrasyonlar tamamlandı!');
  } catch (error) {
    console.error('❌ Migrasyon hatası:', error);
    process.exit(1);
  }
}

runMigrations();
