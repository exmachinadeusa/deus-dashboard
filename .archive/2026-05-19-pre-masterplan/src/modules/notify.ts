/**
 * Notify - Telegram Bildirim Modülü
 * 
 * DEUS sistemi içinden operatöre/admin'e/gruba mesaj gönderir.
 * - notifyOperator(telegramId, message)
 * - notifyAdminGroup(message)
 * - notifyApprovalRequest(transaction)
 */
import { Bot } from 'grammy';
import { logger } from '../lib/logger.js';
import { supabase } from '../lib/supabase.js';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_GROUP_ID = process.env.TELEGRAM_ADMIN_GROUP_ID
  ? Number(process.env.TELEGRAM_ADMIN_GROUP_ID)
  : null;

if (!TOKEN) {
  throw new Error('❌ TELEGRAM_BOT_TOKEN yok');
}

// Bağımsız bot instance — sadece notify için (polling-bot ile aynı token, sorun değil
// çünkü sadece sendMessage çağırıyor, getUpdates değil)
const notifyBot = new Bot(TOKEN);

// ────────────────────────────────────────────────────────────────
export async function notifyOperator(telegramId: number, message: string, opts: { parseMode?: 'Markdown' | 'HTML' } = {}) {
  try {
    await notifyBot.api.sendMessage(telegramId, message, {
      parse_mode: opts.parseMode || 'Markdown',
    });
    logger.info({ deus_notify: 'operator', telegram_id: telegramId });
    return { ok: true };
  } catch (err: any) {
    logger.error({ msg: 'notifyOperator fail', telegram_id: telegramId, err: err?.message });
    return { ok: false, error: err?.message };
  }
}

// ────────────────────────────────────────────────────────────────
export async function notifyAdminGroup(message: string, opts: { parseMode?: 'Markdown' | 'HTML' } = {}) {
  if (!ADMIN_GROUP_ID) {
    logger.warn('TELEGRAM_ADMIN_GROUP_ID yok, admin group bildirimi atlandı');
    return { ok: false, error: 'admin group not configured' };
  }
  try {
    await notifyBot.api.sendMessage(ADMIN_GROUP_ID, message, {
      parse_mode: opts.parseMode || 'Markdown',
    });
    logger.info({ deus_notify: 'admin_group', group_id: ADMIN_GROUP_ID });
    return { ok: true };
  } catch (err: any) {
    logger.error({ msg: 'notifyAdminGroup fail', err: err?.message });
    return { ok: false, error: err?.message };
  }
}

// ────────────────────────────────────────────────────────────────
export async function notifyAllAdmins(message: string) {
  const { data: admins } = await supabase
    .from('operators')
    .select('telegram_id, name')
    .eq('role', 'admin')
    .eq('is_active', true);

  if (!admins || admins.length === 0) {
    logger.warn('Aktif admin yok');
    return { ok: false, sent: 0 };
  }

  let sent = 0;
  for (const a of admins) {
    if (a.telegram_id && a.telegram_id > 0) {
      const r = await notifyOperator(a.telegram_id, message);
      if (r.ok) sent++;
    }
  }
  return { ok: true, sent, total: admins.length };
}

// ────────────────────────────────────────────────────────────────
export async function notifyApprovalRequest(opts: {
  transactionId: string;
  customerId: string;
  amount: number;
  type: 'deposit' | 'withdrawal' | string;
  riskScore: number;
  requiredLevel: 'auto' | 'operator' | 'admin';
}) {
  const emoji = opts.type === 'deposit' ? '💳' : '💸';
  const msg =
    `🚨 *YENİ ONAY GEREKLİ*\n\n` +
    `${emoji} Tip: *${opts.type}*\n` +
    `👤 Müşteri: \`${opts.customerId}\`\n` +
    `💰 Tutar: *${opts.amount.toLocaleString('tr-TR')}* TRL\n` +
    `⚠️ Risk: \`${(opts.riskScore * 100).toFixed(1)}%\`\n` +
    `🔐 Seviye: *${opts.requiredLevel}*\n` +
    `🆔 \`${opts.transactionId.slice(0, 12)}\`\n\n` +
    `✅ /approve_${opts.transactionId.slice(0, 8)}\n` +
    `❌ /reject_${opts.transactionId.slice(0, 8)}`;

  if (opts.requiredLevel === 'admin') {
    return notifyAllAdmins(msg);
  } else {
    return notifyAdminGroup(msg);
  }
}

export default { notifyOperator, notifyAdminGroup, notifyAllAdmins, notifyApprovalRequest };
