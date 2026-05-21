#!/usr/bin/env node
import * as dotenv from 'dotenv';

dotenv.config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://deus-api.example.com/webhook';

async function setupTelegramWebhook() {
  try {
    console.log('🤖 TELEGRAM WEBHOOK SETUP\n');
    console.log('='.repeat(50));

    // Mevcut webhook'u getir
    console.log('\n📡 Mevcut webhook kontrol ediliyor...');
    const getResponse = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`
    );
    const getdata = await getResponse.json();

    if (!getResponse.ok) {
      console.log('❌ Telegram API hatası:', getdata.description);
      return;
    }

    console.log('Mevcut durum:');
    console.log(`  • URL: ${getdata.result.url || '(Kurulu değil)'}`);
    console.log(`  • Pending updates: ${getdata.result.pending_update_count || 0}`);

    // İçin webhook kurulumunu devre dışı bırak (local development için)
    console.log('\n📝 Webhook URL\'si tanımlanmadı (Local Development)');
    console.log('Canlı ortamda (production) şunları yapın:\n');

    console.log('1️⃣  Domain ve SSL sertifikası hazırla:');
    console.log('   $ domain=deus-api.example.com');
    console.log('   $ openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes\n');

    console.log('2️⃣  Webhook\'u Telegram\'a kaydet:');
    console.log(`   $ curl -F "url=${WEBHOOK_URL}" \\`);
    console.log(`     -F "certificate=@cert.pem" \\`);
    console.log(`     https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook\n`);

    console.log('3️⃣  Doğrula:');
    console.log(`   $ curl https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo\n`);

    // LOCAL TESTING için Polling kullan
    console.log('='.repeat(50));
    console.log('\n🔧 LOCAL TESTING MODU\n');
    console.log('Polling mode\'u kullanarak canlı testler yapabilirsin:');
    console.log('  1. /start - Bot başlat');
    console.log('  2. /deposit - Yatırım yap');
    console.log('  3. /withdraw - Çekim yap');
    console.log('  4. /status - Durum kontrol et');
    console.log('  5. /help - Yardım al\n');

    console.log('Bot şu anda webhook server modunda (localhost:3000)');
    console.log('Test etmek için Telegram\'da bot\'u bul: @DEUS_BotHandle\n');

    console.log('='.repeat(50));
    console.log('\n✅ WEBHOOK SETUP BİTTİ\n');

  } catch (error) {
    console.error('❌ Hata:', error.message);
  }
}

setupTelegramWebhook();
