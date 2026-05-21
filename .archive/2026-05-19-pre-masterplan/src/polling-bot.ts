/**
 * DEUS - Polling Bot (Local Development)
 * 
 * Webhook yerine long-polling kullanır. SSL/domain gerektirmez.
 * @machinaofdeusbot - DEUS-ONLY MODE
 */
import { Bot } from 'grammy';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import pino from 'pino';
import { randomUUID } from 'crypto';

dotenv.config();

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'HH:MM:ss' },
  },
});

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TELEGRAM_BOT_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Eksik env: TELEGRAM_BOT_TOKEN / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const bot = new Bot(TELEGRAM_BOT_TOKEN);

// ──────────────────────────────────────────────────────────────
// Yetki kontrolü
// ──────────────────────────────────────────────────────────────
async function isAuthorizedOperator(telegramId: number): Promise<{ ok: boolean; role?: string; name?: string }> {
  try {
    const { data, error } = await supabase
      .from('operators')
      .select('id, name, role, is_active')
      .eq('telegram_id', telegramId)
      .eq('is_active', true)
      .limit(1);

    if (error) {
      logger.error({ msg: 'Auth check error', err: error });
      return { ok: false };
    }
    if (data && data.length > 0) {
      return { ok: true, role: data[0].role, name: data[0].name };
    }
    return { ok: false };
  } catch (error) {
    logger.error({ msg: 'Auth exception', err: error });
    return { ok: false };
  }
}

// ──────────────────────────────────────────────────────────────
// Middleware: yetki gate
// ──────────────────────────────────────────────────────────────
async function requireAuth(ctx: any, next: () => Promise<void>) {
  const tgId = ctx.from?.id;
  if (!tgId) {
    await ctx.reply('❌ Telegram ID alınamadı');
    return;
  }
  const auth = await isAuthorizedOperator(tgId);
  if (!auth.ok) {
    logger.warn({ msg: 'Unauthorized access', telegram_id: tgId, text: ctx.message?.text });
    await ctx.reply(
      '🔐 Yetkisiz erişim.\n\n' +
      `Telegram ID: \`${tgId}\`\n` +
      '⚠️ DEUS sistemi sadece kayıtlı operatörlere açıktır.',
      { parse_mode: 'Markdown' }
    );
    return;
  }
  (ctx as any).operator = { id: tgId, role: auth.role, name: auth.name };
  await next();
}

// ──────────────────────────────────────────────────────────────
// Komutlar
// ──────────────────────────────────────────────────────────────
bot.command('start', requireAuth, async (ctx) => {
  const op = (ctx as any).operator;
  await ctx.reply(
    `🤖 *DEUS Operasyon Sistemi*\n\n` +
    `Hoş geldin, *${op.name}* (${op.role})\n\n` +
    `📋 Komutlar:\n` +
    `/deposit – Yatırım talep\n` +
    `/withdraw – Çekim talep\n` +
    `/status – Sistem durumu\n` +
    `/queue – Onay kuyruğu\n` +
    `/help – Yardım`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('help', requireAuth, async (ctx) => {
  await ctx.reply(
    '📖 *DEUS – Merkezi Hesap Sağlayıcısı*\n\n' +
    'Brezilya bahis pazarı operasyon sistemi.\n\n' +
    '*Komutlar:*\n' +
    '• /start – Başla\n' +
    '• /status – Sistem & DB durumu\n' +
    '• /queue – Bekleyen onaylar\n' +
    '• /deposit – Yatırım talep\n' +
    '• /withdraw – Çekim talep\n' +
    '• /me – Operatör bilgim',
    { parse_mode: 'Markdown' }
  );
});

bot.command('me', requireAuth, async (ctx) => {
  const op = (ctx as any).operator;
  await ctx.reply(
    `👤 *Operatör Bilgi*\n\n` +
    `Telegram ID: \`${op.id}\`\n` +
    `İsim: ${op.name}\n` +
    `Rol: \`${op.role}\``,
    { parse_mode: 'Markdown' }
  );
});

bot.command('status', requireAuth, async (ctx) => {
  try {
    const [{ count: txCount }, { count: opCount }, { count: queueCount }] = await Promise.all([
      supabase.from('transactions_v2').select('*', { count: 'exact', head: true }),
      supabase.from('operators').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('approval_queue').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);

    await ctx.reply(
      `📊 *DEUS Sistem Durumu*\n\n` +
      `🟢 Sistem: Aktif\n` +
      `🟢 DB: Bağlı (Supabase)\n` +
      `💸 İşlemler: ${txCount ?? 0}\n` +
      `👮 Aktif Operatör: ${opCount ?? 0}\n` +
      `⏳ Bekleyen Onay: ${queueCount ?? 0}`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error({ msg: 'Status error', err: error });
    await ctx.reply('❌ Durum sorgulanırken hata oluştu');
  }
});

bot.command('queue', requireAuth, async (ctx) => {
  try {
    const { data, error } = await supabase
      .from('approval_queue')
      .select('id, transaction_id, required_approval_level, priority, status, requested_at')
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .limit(10);

    if (error) throw error;

    if (!data || data.length === 0) {
      await ctx.reply('✅ Onay kuyruğu boş.');
      return;
    }

    const lines = data.map((q, i) =>
      `${i + 1}. \`${q.transaction_id?.slice(0, 8)}\` – seviye: *${q.required_approval_level}*, öncelik: ${q.priority}`
    );
    await ctx.reply(
      `⏳ *Bekleyen Onaylar* (${data.length})\n\n${lines.join('\n')}`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error({ msg: 'Queue error', err: error });
    await ctx.reply('❌ Kuyruk sorgulanamadı');
  }
});

bot.command('deposit', requireAuth, async (ctx) => {
  const args = ctx.match?.split(/\s+/).filter(Boolean) || [];
  
  if (args.length < 2) {
    await ctx.reply(
      '💳 *Yatırım Talebi*\n\n' +
      'Format:\n' +
      '`/deposit <müşteri_id> <tutar>`\n\n' +
      'Örnek:\n' +
      '`/deposit CUST_TEST_001 5000`',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const customerId = args[0];
  const amount = Number(args[1]);
  const op = (ctx as any).operator;

  if (isNaN(amount) || amount <= 0) {
    await ctx.reply('❌ Tutar geçersiz (> 0 olmalı)');
    return;
  }

  try {
    const txId = randomUUID();
    const refId = `DEP-${Date.now()}`;
    
    // Direct insert into transactions_v2
    const { data: txData, error: txErr } = await supabase
      .from('transactions_v2')
      .insert({
        id: txId,
        reference_id: refId,
        transaction_type: 'deposit',
        customer_id: customerId,
        amount: amount,
        currency: 'BRL',
        status: amount <= 5000 ? 'processing' : 'initiated',
        approval_level: amount <= 5000 ? 'auto' : 'operator',
        metadata: { source: 'telegram_bot', operator_id: op.id },
      })
      .select('id, reference_id, status');

    if (txErr) {
      logger.error({ msg: 'deposit error', err: txErr, customer_id: customerId, amount });
      await ctx.reply(`❌ İşlem başlatılamadı: ${txErr.message}`);
      return;
    }

    const newTx = txData?.[0];
    await ctx.reply(
      `✅ *Yatırım Talebi Oluşturuldu*\n\n` +
      `📋 İşlem ID: \`${newTx?.id?.slice(0, 8)}\`\n` +
      `📄 Ref: ${newTx?.reference_id}\n` +
      `👤 Müşteri: ${customerId}\n` +
      `💰 Tutar: ${amount}₺\n` +
      `⏳ Status: ${newTx?.status}`,
      { parse_mode: 'Markdown' }
    );

    logger.info({ deus_deposit: { customer_id: customerId, amount, operator: op.name, txn_id: newTx?.id, status: newTx?.status } });
  } catch (error: any) {
    logger.error({ msg: 'deposit exception', err: error });
    await ctx.reply(`❌ Hata: ${error?.message || 'Bilinmeyen hata'}`);
  }
});

bot.command('withdraw', requireAuth, async (ctx) => {
  const args = ctx.match?.split(/\s+/).filter(Boolean) || [];
  
  if (args.length < 2) {
    await ctx.reply(
      '💸 *Çekim Talebi*\n\n' +
      'Format:\n' +
      '`/withdraw <müşteri_id> <tutar>`\n\n' +
      'Örnek:\n' +
      '`/withdraw CUST_TEST_001 1500`',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const customerId = args[0];
  const amount = Number(args[1]);
  const op = (ctx as any).operator;

  if (isNaN(amount) || amount <= 0) {
    await ctx.reply('❌ Tutar geçersiz (> 0 olmalı)');
    return;
  }

  try {
    const txId = randomUUID();
    const refId = `WTH-${Date.now()}`;
    
    // Direct insert into transactions_v2
    const { data: txData, error: txErr } = await supabase
      .from('transactions_v2')
      .insert({
        id: txId,
        reference_id: refId,
        transaction_type: 'withdrawal',
        customer_id: customerId,
        amount: amount,
        currency: 'BRL',
        status: amount <= 5000 ? 'processing' : 'initiated',
        approval_level: amount <= 5000 ? 'auto' : 'operator',
        metadata: { source: 'telegram_bot', operator_id: op.id },
      })
      .select('id, reference_id, status');

    if (txErr) {
      logger.error({ msg: 'withdraw error', err: txErr, customer_id: customerId, amount });
      await ctx.reply(`❌ İşlem başlatılamadı: ${txErr.message}`);
      return;
    }

    const newTx = txData?.[0];
    await ctx.reply(
      `✅ *Çekim Talebi Oluşturuldu*\n\n` +
      `📋 İşlem ID: \`${newTx?.id?.slice(0, 8)}\`\n` +
      `📄 Ref: ${newTx?.reference_id}\n` +
      `👤 Müşteri: ${customerId}\n` +
      `💰 Tutar: ${amount}₺\n` +
      `⏳ Status: ${newTx?.status}`,
      { parse_mode: 'Markdown' }
    );

    logger.info({ deus_withdraw: { customer_id: customerId, amount, operator: op.name, txn_id: newTx?.id, status: newTx?.status } });
  } catch (error: any) {
    logger.error({ msg: 'withdraw exception', err: error });
    await ctx.reply(`❌ Hata: ${error?.message || 'Bilinmeyen hata'}`);
  }
});

// Genel mesaj loglama
bot.on('message', async (ctx) => {
  logger.info({
    deus_user_id: ctx.from?.id,
    deus_message: ctx.message?.text?.substring(0, 100),
    deus_chat_id: ctx.chat?.id,
  });
});

// Hata yakalayıcı
bot.catch((err) => {
  logger.error({ msg: 'Bot error', err: err.error });
});

// ──────────────────────────────────────────────────────────────
// Başlat
// ──────────────────────────────────────────────────────────────
async function main() {
  logger.info('🤖 DEUS Polling Bot başlatılıyor (DEUS-ONLY MODE)...');
  logger.info({ msg: '🔒 Database', url: SUPABASE_URL });

  // Bot bilgilerini al
  const me = await bot.api.getMe();
  logger.info({ msg: '✅ Bot kimliği', username: me.username, id: me.id });

  // Webhook'u sil (varsa) - 409 önler
  await bot.api.deleteWebhook({ drop_pending_updates: true });
  logger.info('🗑️  Webhook temizlendi (eğer varsa)');

  logger.info('📡 Long-polling başlıyor... (Ctrl+C ile durdur)');

  await bot.start({
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true,
    onStart: (info) => {
      logger.info(`🟢 @${info.username} aktif | DEUS-ONLY | Polling MODE`);
    },
  });
}

process.on('SIGINT', async () => {
  logger.info('🛑 Kapatılıyor...');
  await bot.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await bot.stop();
  process.exit(0);
});

main().catch((err) => {
  logger.error({ msg: '❌ Fatal', err: err?.message || err });
  process.exit(1);
});
