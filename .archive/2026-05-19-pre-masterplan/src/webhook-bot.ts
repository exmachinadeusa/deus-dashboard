import { Bot } from 'grammy';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import pino from 'pino';
import http from 'http';
import { URL } from 'url';

dotenv.config();

const logger = pino();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BOT_PORT = 3000;
const BOT_HOSTNAME = 'localhost';

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
const bot = new Bot(TELEGRAM_BOT_TOKEN!);

// DEUS-ONLY: Operatör yetki kontrolü
async function isAuthorizedOperator(telegramId: number): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('operators')
      .select('id, is_active')
      .eq('telegram_id', telegramId)
      .eq('is_active', true)
      .limit(1);
    
    if (error) {
      logger.error({ msg: 'Auth check error', err: error });
      return false;
    }
    
    return data && data.length > 0;
  } catch (error) {
    logger.error({ msg: 'Authorization check exception', err: error });
    return false;
  }
}

// Handlers
bot.command('start', async (ctx) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    await ctx.reply('❌ Telegram ID alınamadı');
    return;
  }
  
  const isAuth = await isAuthorizedOperator(telegramId);
  if (!isAuth) {
    logger.warn(`Unauthorized access attempt: ${telegramId}`);
    await ctx.reply('🔐 Hata: Bu komutu kullanma yetkiniz yok.\n\n' +
      '⚠️ DEUS sistemi sadece yetkilendirilmiş operatörlere açıktır.');
    return;
  }
  
  await ctx.reply('🤖 DEUS Operasyon Sistemi açıldı.\n\n' +
    'Komutlar:\n' +
    '/deposit - Yatırım\n' +
    '/withdraw - Çekim\n' +
    '/status - Durum\n' +
    '/help - Yardım');
});

bot.command('help', async (ctx) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    await ctx.reply('❌ Telegram ID alınamadı');
    return;
  }
  
  const isAuth = await isAuthorizedOperator(telegramId);
  if (!isAuth) {
    logger.warn(`Unauthorized access attempt: ${telegramId}`);
    await ctx.reply('🔐 Hata: Bu komutu kullanma yetkiniz yok.');
    return;
  }
  
  await ctx.reply('📖 DEUS - Merkezi Hesap Sağlayıcısı\n\n' +
    'Brezilya bahis pazarı operasyon sistemi.\n\n' +
    'Komutlar:\n' +
    '/start\n' +
    '/deposit\n' +
    '/withdraw\n' +
    '/status\n' +
    '/help');
});

bot.command('status', async (ctx) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    await ctx.reply('❌ Telegram ID alınamadı');
    return;
  }
  
  const isAuth = await isAuthorizedOperator(telegramId);
  if (!isAuth) {
    logger.warn(`Unauthorized access attempt: ${telegramId}`);
    await ctx.reply('🔐 Hata: Bu komutu kullanma yetkiniz yok.');
    return;
  }
  
  try {
    // DEUS-ONLY: Sadece DEUS Supabase'e erişim
    const { count } = await supabase
      .from('transactions_v2')
      .select('*', { count: 'exact', head: true });

    await ctx.reply(`📊 DEUS Durum\n\n` +
      `İşlemler: ${count || 0}\n` +
      `Sistem: ✅ Çalışıyor`);
  } catch (error) {
    logger.error({ msg: 'Status error', err: error });
    await ctx.reply('❌ Durum sorgulanırken hata: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
});

bot.on('message', async (ctx) => {
  // DEUS-ONLY: Sadece DEUS işlemleri
  logger.info({
    deus_user_id: ctx.from?.id,
    deus_message: ctx.message?.text,
    deus_chat_id: ctx.chat?.id,
    system: 'DEUS'
  });
});

// Webhook server
const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/webhook') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const update = JSON.parse(body);
        logger.info({ msg: 'Update alındı', update_id: update.update_id });
        await bot.handleUpdate(update);
      } catch (e) {
        logger.error({ msg: 'Update hatası', err: e });
      }
      res.writeHead(200);
      res.end();
    });
  } else if (req.url === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('DEUS - Operasyon Sistemi Aktif');
  } else {
    res.writeHead(404);
    res.end();
  }
});

async function main() {
  try {
    // ⚠️ DEUS-ONLY MODE ⚠️
    // Bu bot SADECE DEUS projesine ve Supabase örneğine erişim sağlar
    // Başka projeye erişim yapılmaz
    
    logger.info('🤖 DEUS Webhook Bot başlatılıyor (DEUS-ONLY MODE)...');
    logger.info('⚠️  DEUS dışında başka projeye erişim YASAKLANDI');
    
    // Webhook'u kuruyoruz (ancak local development için kullanmıyoruz)
    logger.info({ msg: '📡 Webhook server dinleniyor', host: BOT_HOSTNAME, port: BOT_PORT });
    logger.info({ msg: '🔒 Database', url: SUPABASE_URL });
    
    server.listen(BOT_PORT, () => {
      logger.info(`✅ Server başladı: http://${BOT_HOSTNAME}:${BOT_PORT}`);
      logger.info(`✅ Bot aktif: @DEUS_BotHandle`);
      logger.info(`🔐 Mode: DEUS-ONLY (başka projeye erişim yok)`);
    });

    // Polling mode'u denemiyoruz (409 hatası yüzünden)
    // Bunun yerine local testing için webhook kullan
    
  } catch (error) {
    if (error instanceof Error) {
      logger.error({ msg: '❌ Hata', error: error.message });
    } else {
      logger.error({ msg: '❌ Hata', error: error });
    }
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  logger.info('🛑 Kapatılıyor...');
  server.close();
  process.exit(0);
});

main();

export { bot, server };
