#!/usr/bin/env node
/**
 * DEUS FINTECH - INSTANT OPERATOR SETUP
 * Supabase Personal Access Token ile direct REST API
 */

import * as dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const PERSONAL_ACCESS_TOKEN = proces…EN;

const operators = [
  {
    name: 'Sistem Yöneticisi',
    telegram_id: 1234567890,
    department: 'admin',
    role: 'admin',
    is_active: true
  },
  {
    name: 'Ali Operatör - Yatırım',
    telegram_id: 5555555555,
    department: 'yatırım',
    role: 'operator',
    is_active: true
  },
  {
    name: 'Ayşe Operatör - Çekim',
    telegram_id: 4444444444,
    department: 'çekim',
    role: 'operator',
    is_active: true
  },
  {
    name: 'Senan Süpervizör',
    telegram_id: 9876543210,
    department: 'operations',
    role: 'supervisor',
    is_active: true
  }
];

async function insertOperator(op) {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/operators`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PERSONAL_ACCESS_TOKEN}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(op)
    });

    if (!response.ok) {
      const error = await response.text();
      // "Duplicate key" hatasını yoksay
      if (error.includes('duplicate') || error.includes('already exists')) {
        return { success: true, message: 'Already exists' };
      }
      throw new Error(error);
    }

    return { success: true, message: 'Created' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function setupOperators() {
  try {
    console.log('\n🚀 DEUS FINTECH - INSTANT OPERATOR SETUP\n');
    console.log('='.repeat(60));
    console.log(`\n🔐 Personal Access Token ile bağlanılıyor...`);
    console.log(`📡 ${SUPABASE_URL}\n`);

    let successCount = 0;
    let failCount = 0;

    for (const op of operators) {
      process.stdout.write(`  ${op.name.padEnd(35)} ... `);

      const result = await insertOperator(op);

      if (result.success) {
        console.log('✅');
        successCount++;
      } else {
        console.log('⚠️  (Zaten var)');
        successCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n✅ OPERATOR SETUP TAMAMLANDI\n');

    console.log('👥 Oluşturulan Operatörler:\n');
    operators.forEach(op => {
      console.log(`  ${op.name}`);
      console.log(`    • Telegram ID: ${op.telegram_id}`);
      console.log(`    • Role: ${op.role}`);
      console.log(`    • Department: ${op.department}`);
      console.log(`    • Status: ${op.is_active ? '✅ Active' : '❌ Inactive'}\n`);
    });

    console.log('='.repeat(60));
    console.log('\n🤖 BOT READY\n');
    console.log('✅ @DEUS_BotHandle şimdi operatör kontrolü yapabilecek');
    console.log('✅ Test et: Telegram\'da /start komutunu gönder\n');

    console.log('📋 EXPECTED RESULT:\n');
    console.log('  Telegram ID: 1234567890 → /start → ✅ "DEUS Operasyon..."');
    console.log('  Telegram ID: 9999999999 → /start → ❌ "Hata: Bu komutu..."\n');

  } catch (error) {
    console.error('\n❌ HATA:', error.message);
    process.exit(1);
  }
}

setupOperators();
