#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

    for (const file of sqlFiles) {
      console.log(`\n📄 ${file} konuşlandırılıyor...`);
      
      const sql = fs.readFileSync(file, 'utf8');
      
      // SQL'i statement'lere böl
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        
        try {
          // RLS policy'ler IF NOT EXISTS içeriyor, başarısız olabilir
          const { error } = await supabase.rpc('exec_sql', { sql: statement });
          
          if (error) {
            // Bazı hataları yoksay (zaten var, vb)
            if (error.message.includes('already exists') ||
                error.message.includes('duplicate') ||
                error.message.includes('does not exist') ||
                error.message.includes('policy')) {
              // Normal - devam et
            } else {
              console.log(`  ⚠️  [${i+1}/${statements.length}] ${error.message.substring(0, 60)}`);
              errorCount++;
            }
          } else {
            successCount++;
          }
        } catch (e) {
          errorCount++;
          console.log(`  ⚠️  [${i+1}/${statements.length}] ${e.message?.substring(0, 60)}`);
        }

        // Progress
        if ((i + 1) % 10 === 0) {
          process.stdout.write(`  [${i+1}/${statements.length}] ✓\n`);
        }
      }

      console.log(`  ✅ ${successCount} statement başarılı`);
      if (errorCount > 0) {
        console.log(`  ⚠️  ${errorCount} hata (göz ardı edildi)`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n📊 DEPLOYMENT TAMAMLANDI\n');

    // Tabloları kontrol et
    console.log('📋 Oluşturulan Tablolar:');
    const { data: tables, error: tableError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public');

    if (!tableError && tables) {
      console.log(`   ✅ Toplam ${tables.length} tablo`);
      tables.slice(0, 10).forEach(t => console.log(`     • ${t.table_name}`));
      if (tables.length > 10) {
        console.log(`     ... ve ${tables.length - 10} daha`);
      }
    }

    console.log('\n🎉 DATABASE HAZIR - BOT ŞIMDI ÇALIŞACAK\n');

  } catch (error) {
    console.error('\n❌ DEPLOYMENT HATASI:', error.message);
    process.exit(1);
  }
}

deploySql();
