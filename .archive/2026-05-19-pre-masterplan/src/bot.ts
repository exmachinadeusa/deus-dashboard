import { Bot, Context } from 'grammy';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import pino from 'pino';

dotenv.config();

const logger = pino();

// Environment variables
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TELEGRAM_ADMIN_GROUP_ID = Number(process.env.TELEGRAM_ADMIN_GROUP_ID);

// Supabase client
const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

// Telegram bot
const bot = new Bot(TELEGRAM_BOT_TOKEN!);

interface DEUSContext extends Context {
  state: {
    userId?: number;
    operatorId?: string;
  };
}

// Logger middleware
bot.use(async (ctx, next) => {
  logger.info({
    update_id: ctx.update.update_id,
    message: ctx.message?.text,
    chat_id: ctx.chat?.id,
    user_id: ctx.from?.id,
  });
  await next();
});

// Start command
bot.command('start', async (ctx) => {
  await ctx.reply('🤖 DEUS Operasyon Sistemi başlatıldı.\n\n' +
    'Komutlar:\n' +
    '/deposit - Yatırım işlemi\n' +
    '/withdraw - Çekim işlemi\n' +
    '/status - Sistem durumu\n' +
    '/help - Yardım');
});

// Help command
bot.command('help', async (ctx) => {
  await ctx.reply('📖 DEUS Operasyon Sistemi\n\n' +
    'Merkezi hesap sağlayıcı ve karar destek sistemi.\n' +
    'Brezilya bahis pazarında faaliyet göstermektedir.\n\n' +
    'Kullanılabilir komutlar:\n' +
    '/start - Başlat\n' +
    '/deposit - Yatırım talep et\n' +
    '/withdraw - Çekim talep et\n' +
    '/status - Sistem durumu\n' +
    '/help - Bu mesaj');
});

// Status command
bot.command('status', async (ctx) => {
  const { count, error } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true });

  if (error) {
    await ctx.reply('❌ Veritabanı hatası');
    return;
  }

  await ctx.reply(`📊 DEUS Durumu\n\n` +
    `Toplam işlem: ${count}\n` +
    `Sistem: ✅ Aktif\n` +
    `Veritabanı: ✅ Bağlı`);
});

// Deposit command
bot.command('deposit', async (ctx) => {
  await ctx.reply('💳 Yatırım Talep Formu\n\n' +
    'Tutar girin (₺):');
});

// Withdraw command
bot.command('withdraw', async (ctx) => {
  await ctx.reply('💸 Çekim Talep Formu\n\n' +
    'Tutar girin (₺):');
});

// Error handler
bot.catch((err) => {
  logger.error(err);
});

export { bot, supabase, logger };
