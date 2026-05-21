// ============================================================
// DEUS — Telegram Bildirim Servisi
// src/modules/notify.ts
//
// Departman grubuna bildirim gönder.
// Operatör onay/red butonları (inline keyboard).
// Üyeye sonuç ilet.
// ============================================================

import { Bot, InlineKeyboard } from "grammy";
import { supabase, log } from "../index.js";
import type { ReceiptProcessResult } from "./receipt/parser.js";

let _bot: Bot | null = null;

export function initNotify(bot: Bot): void {
  _bot = bot;
}

function bot(): Bot {
  if (!_bot) throw new Error("Bot henüz init edilmedi");
  return _bot;
}

// ── PARA FORMAT ───────────────────────────────────────────────

function formatTry(amount: number): string {
  return `₺${amount.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}`;
}

// ── ÜYEYİ BİLDİR ─────────────────────────────────────────────

export async function notifyMember(
  memberTgId: string | number,
  result: ReceiptProcessResult
): Promise<void> {
  let message = "";

  switch (result.verdict) {
    case "auto_approved":
      message =
        `✅ Yatırımınız onaylandı.\n\n` +
        `${result.parsed?.amount ? formatTry(result.parsed.amount) : ""} tutarındaki işleminiz sisteme işlendi.`;
      break;

    case "auto_rejected":
      message =
        `❌ İşleminiz reddedildi.\n\n` +
        `Sebep: ${result.reason}\n\n` +
        `Sorun varsa operatörümüze bildirin.`;
      break;

    case "duplicate":
      message =
        `⚠️ Bu dekont daha önce gönderilmiş.\n\n` +
        `Aynı dekont tekrar işleme alınamaz.`;
      break;

    case "pending_operator":
      message =
        `⏳ İşleminiz inceleniyor.\n\n` +
        `Dekontunuz operatörümüze iletildi, kısa süre içinde onaylanacak.`;
      break;

    case "error":
      message =
        `⚠️ Dekont okunamadı.\n\n` +
        `Lütfen dekontu net ve tam görünecek şekilde tekrar gönderin.`;
      break;
  }

  try {
    await bot().api.sendMessage(memberTgId, message);
  } catch (err) {
    log.warn({ err, memberTgId }, "Üye bildirimi gönderilemedi");
  }
}

// ── DEPARTMAN GRUBUNA BİLDİR ──────────────────────────────────

export async function notifyDepartment(opts: {
  transactionId: string;
  departmentChatId: bigint | number;
  memberName: string | null;
  memberId: string;
  result: ReceiptProcessResult;
}): Promise<void> {
  const { transactionId, departmentChatId, memberName, result } = opts;

  if (!result.parsed) return;

  const p = result.parsed;

  const keyboard = new InlineKeyboard()
    .text("✅ Onayla", `approve:${transactionId}`)
    .text("❌ Reddet", `reject:${transactionId}`);

  const msg =
    `📥 *Yeni Yatırım Talebi*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `👤 Üye: ${memberName ?? opts.memberId}\n` +
    `💰 Tutar: ${p.amount ? formatTry(p.amount) : "?"}\n` +
    `🏦 Banka: ${p.bankName ?? "?"}\n` +
    `📤 Gönderen: ${p.senderName ?? "?"}\n` +
    `🔢 Dekont No: ${p.receiptNumber ?? "?"}\n` +
    `📅 Tarih: ${p.receiptDate ? new Date(p.receiptDate).toLocaleString("tr-TR") : "?"}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `⚠️ Sebep: ${result.reason}\n` +
    `🤖 AI Güveni: %${Math.round((p.confidence ?? 0) * 100)}`;

  try {
    await bot().api.sendMessage(Number(departmentChatId), msg, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
    log.info({ transactionId, departmentChatId }, "Departman bildirimi gönderildi");
  } catch (err) {
    log.error({ err, departmentChatId }, "Departman bildirimi gönderilemedi");
  }
}

// ── ADMİN GRUBUNA ALERT ──────────────────────────────────────

export async function notifyAdmin(opts: {
  title: string;
  message: string;
  severity?: "info" | "warning" | "critical";
}): Promise<void> {
  const adminChatId = process.env.TELEGRAM_ADMIN_GROUP_ID;
  if (!adminChatId) return;

  const prefix = {
    info: "ℹ️",
    warning: "⚠️",
    critical: "🚨",
  }[opts.severity ?? "info"];

  try {
    await bot().api.sendMessage(
      adminChatId,
      `${prefix} *${opts.title}*\n\n${opts.message}`,
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    log.warn({ err }, "Admin bildirimi gönderilemedi");
  }
}

// ── CALLBACK QUERY HANDLER (Onay/Red butonları) ───────────────

export async function handleApprovalCallback(
  callbackData: string,
  operatorTgId: number,
  operatorName: string
): Promise<{ text: string; memberId?: string; verdict: "approved" | "rejected" }> {

  const [action, transactionId] = callbackData.split(":") as [string, string];

  if (!transactionId || (action !== "approve" && action !== "reject")) {
    return { text: "Geçersiz işlem", verdict: "rejected" };
  }

  const isApprove = action === "approve";
  const newStatus = isApprove ? "approved" : "rejected";

  const { data: tx, error } = await supabase
    .from("transactions")
    .update({
      status: newStatus,
      approved_by: String(operatorTgId),
      approved_at: isApprove ? new Date().toISOString() : null,
    })
    .eq("id", transactionId)
    .eq("status", "pending")
    .select("member_id, amount, site_id, department_id")
    .single();

  if (error || !tx) {
    return { text: "İşlem bulunamadı veya zaten işlendi", verdict: "rejected" };
  }

  if (isApprove && tx["department_id"] && tx["amount"]) {
    await supabase.rpc("increment_department_balance", {
      dept_id: tx["department_id"],
      amount: tx["amount"],
    });
  }

  await supabase.from("audit_log").insert({
    actor: String(operatorTgId),
    action: isApprove ? "approve_transaction" : "reject_transaction",
    entity_type: "transaction",
    entity_id: transactionId,
    after_state: { status: newStatus, operator: operatorName },
    decision_level: "2_routing",
  });

  const resultText = isApprove
    ? `✅ Onaylandı — ${operatorName}`
    : `❌ Reddedildi — ${operatorName}`;

  return {
    text: resultText,
    memberId: tx["member_id"] as string,
    verdict: isApprove ? "approved" : "rejected",
  };
}

// ── KASA DURUM MESAJI ─────────────────────────────────────────

export function formatKasaMessage(opts: {
  siteName: string;
  deposits: number;
  withdrawals: number;
  supplement: number;
  depositCommission: number;
  openingBalance: number;
}): string {
  const closing =
    opts.openingBalance +
    opts.deposits -
    opts.withdrawals -
    opts.depositCommission +
    opts.supplement;

  return (
    `━━━━━━━━━━━━━━━━━━\n` +
    `📛 Site: ${opts.siteName}\n` +
    `💼 Devir: ${formatTry(opts.openingBalance)}\n` +
    `📥 Yatırımlar: ${formatTry(opts.deposits)}\n` +
    `📤 Çekimler: ${formatTry(opts.withdrawals)}\n` +
    `💵 Takviye: ${formatTry(opts.supplement)}\n` +
    `💸 Yatırım Kom.: ${formatTry(opts.depositCommission)}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `💰 Toplam Bakiye: ${formatTry(closing)}\n` +
    `━━━━━━━━━━━━━━━━━━`
  );
}
