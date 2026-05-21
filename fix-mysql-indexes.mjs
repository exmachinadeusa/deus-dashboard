#!/usr/bin/env node
/**
 * MySQL-style inline INDEX'leri PostgreSQL'e çevirir.
 * Yaklaşım: INDEX satırını "yok" gibi muamele edip yerine kalın 
 * sınır halinde göstermek yerine, satırı sil ve sonra sadece 
 * SON anlamlı satırdaki trailing virgülü kaldır.
 */
import * as fs from 'fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: fix-mysql-indexes.mjs <file.sql>');
  process.exit(1);
}

let sql = fs.readFileSync(file, 'utf8');
const indexes = [];

const tableRegex = /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+(\w+)\s*\(([\s\S]*?)\n\);/gm;

sql = sql.replace(tableRegex, (match, tableName, body) => {
  const lines = body.split('\n');
  const kept = [];

  for (const line of lines) {
    const m = line.match(/^\s*INDEX\s+(\w+)\s*\(([^)]+)\),?\s*$/i);
    if (m) {
      const [, idxName, cols] = m;
      indexes.push(`CREATE INDEX IF NOT EXISTS ${idxName} ON ${tableName} (${cols.trim()});`);
    } else {
      kept.push(line);
    }
  }

  // Sadece son ANLAMLI satırın (yorum olmayan, boş olmayan) sonundaki virgülü kaldır
  for (let i = kept.length - 1; i >= 0; i--) {
    const t = kept[i].trim();
    if (!t || t.startsWith('--')) continue;
    // Bu son anlamlı satır - sonundaki virgülü kaldır
    kept[i] = kept[i].replace(/,(\s*(?:--.*)?)$/, '$1');
    break;
  }

  return `CREATE TABLE IF NOT EXISTS ${tableName} (${kept.join('\n')}\n);`;
});

if (indexes.length > 0) {
  sql += '\n\n-- ============================================\n';
  sql += '-- İNDEKSLER (auto-converted from inline INDEX)\n';
  sql += '-- ============================================\n';
  sql += indexes.join('\n') + '\n';
}

const outFile = file.replace(/\.sql$/, '.fixed.sql');
fs.writeFileSync(outFile, sql);
console.log(`✅ ${indexes.length} index ayrıldı → ${outFile}`);
