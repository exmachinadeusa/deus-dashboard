#!/usr/bin/env node
/**
 * DEUS - Migration Deploy Script (Direct Postgres)
 * 001 + 002 schema dosyalarını Supabase'e direkt postgres bağlantısı ile yükler.
 */
import postgres from 'postgres';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
                    process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ SUPABASE_URL veya SERVICE_KEY eksik');
  process.exit(1);
}

const projectRef = SUPABASE_URL.replace('https://', '').split('.')[0];

// Supabase pooler bağlantısı (transaction mode, port 6543) - daha güvenilir
// Şifre olarak SERVICE_ROLE_KEY KULLANILMAZ - DB password gerekli
// Bunun yerine direct connection (port 5432) host: db.<ref>.supabase.co
//
// NOT: Postgres password yoksa pooler kullanılamaz.
// Alternatif: REST API ile pg_query RPC (eğer tanımlıysa)

// Pooler endpoint'i (Supabase'in cloud postgres'i)
const candidates = [
  // Direct
  { name: 'direct',  host: `db.${projectRef}.supabase.co`, port: 5432, mode: 'session' },
  // Pooler (transaction)
  { name: 'pooler',  host: `aws-0-us-east-1.pooler.supabase.com`, port: 6543, mode: 'transaction', user: `postgres.${projectRef}` },
];

// DB password env'de yok - service role key DB password değil.
// Bu yüzden REST API yoluyla yapacağız (exec_sql RPC veya postgres-meta)

const MIGRATION_FILES = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : ['001_deus_schema.sql', '002_deus_learning.sql'];

console.log('🚀 DEUS Migration Deploy');
console.log('━'.repeat(60));
console.log(`📡 Project: ${projectRef}`);
console.log(`📄 Files: ${MIGRATION_FILES.join(', ')}`);
console.log('━'.repeat(60));

// Postgres DB şifresi gerekiyor - .env'de DB_PASSWORD ara
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD || process.env.DB_PASSWORD;

if (!DB_PASSWORD) {
  console.error(`
❌ SUPABASE_DB_PASSWORD bulunamadı.

Postgres'e doğrudan bağlanmak için DB şifresi gerekli (service_role_key DEĞİL).

👉 Şifreyi şuradan al:
   https://supabase.com/dashboard/project/${projectRef}/settings/database

Sonra .env'e ekle:
   SUPABASE_DB_PASSWORD=<şifre>

Veya REST API yöntemine geçeceğiz (aşağıda).
`);
  // REST API fallback'e geç
  await deployViaRest();
  process.exit(0);
}

// === POSTGRES DIRECT ===
const connString = `postgresql://postgres.${projectRef}:${encodeURIComponent(DB_PASSWORD)}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;
console.log(`🔗 Pooler bağlantısı kuruluyor...`);

const sql = postgres(connString, {
  ssl: 'require',
  max: 1,
  idle_timeout: 10,
  connect_timeout: 30,
});

try {
  // Bağlantıyı test et
  const ping = await sql`SELECT version() as v`;
  console.log(`✅ Bağlandı: ${ping[0].v.split(',')[0]}`);

  for (const file of MIGRATION_FILES) {
    const fullPath = path.resolve(file);
    if (!fs.existsSync(fullPath)) {
      console.log(`⚠️  ${file} bulunamadı, atlanıyor`);
      continue;
    }

    console.log(`\n📄 ${file} çalıştırılıyor...`);
    const content = fs.readFileSync(fullPath, 'utf8');

    try {
      await sql.unsafe(content);
      console.log(`   ✅ Başarılı (${content.length} byte)`);
    } catch (e) {
      const msg = (e.message || '').substring(0, 200);
      if (/already exists|duplicate/i.test(msg)) {
        console.log(`   ⚠️  Zaten var: ${msg}`);
      } else {
        console.log(`   ❌ HATA: ${msg}`);
      }
    }
  }

  // Tablo sayısını kontrol et
  console.log('\n📊 Veritabanı Durumu:');
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name
  `;
  console.log(`   Tablolar (${tables.length}):`);
  tables.forEach(t => console.log(`     • ${t.table_name}`));

  await sql.end();
  console.log('\n🎉 Migration tamamlandı\n');

} catch (e) {
  console.error('❌ Bağlantı hatası:', e.message);
  await sql.end({ timeout: 1 }).catch(() => {});

  console.log('\n↩️  REST API fallback deneniyor...\n');
  await deployViaRest();
}

// === REST API FALLBACK ===
async function deployViaRest() {
  console.log('🌐 REST API ile SQL deploy');
  console.log('━'.repeat(60));

  for (const file of MIGRATION_FILES) {
    const fullPath = path.resolve(file);
    if (!fs.existsSync(fullPath)) continue;

    const content = fs.readFileSync(fullPath, 'utf8');
    console.log(`\n📄 ${file} (${content.length} byte)`);

    // Supabase Management API'sini dene (sbp_ token ile)
    const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
    if (!accessToken) {
      console.log('   ❌ SUPABASE_ACCESS_TOKEN yok, REST API kullanılamaz');
      continue;
    }

    try {
      const res = await fetch(
        `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: content }),
        }
      );

      const text = await res.text();
      if (res.ok) {
        console.log(`   ✅ Başarılı`);
      } else {
        console.log(`   ❌ ${res.status}: ${text.substring(0, 300)}`);
      }
    } catch (e) {
      console.log(`   ❌ Fetch hatası: ${e.message}`);
    }
  }
}
