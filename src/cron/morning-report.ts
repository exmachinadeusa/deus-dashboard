// ============================================================
// DEUS — Sabah Raporu (Her gün 08:00)
// src/cron/morning-report.ts
//
// Admin grubuna günlük özet gönderir:
//   - Dünün işlem özeti
//   - Bekleyen eskalasyonlar
//   - Anomali uyarıları
//   - KB öğrenme sayısı
// ============================================================

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function sendMorningReport(): Promise<void> {
  const adminChatId = process.env.TELEGRAM_ADMIN_GROUP_ID;
  if (!adminChatId) {
    console.log("TELEGRAM_ADMIN_GROUP_ID yok, rapor gönderilmedi");
    return;
  }

  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0]!;
  const today = new Date().toISOString().split("T")[0]!;

  // Dünün işlem özeti (transactions_v2 — transaction_type / status / amount)
  const { data: txStats, error: txErr } = await supabase
    .from("transactions_v2")
    .select("transaction_type, status, amount")
    .gte("created_at", `${yesterday}T00:00:00`)
    .lt("created_at", `${today}T00:00:00`);

  if (txErr) console.error("transactions_v2 fetch hatası:", txErr.message);

  const deposits = txStats?.filter((t) => t.transaction_type === "deposit" && t.status === "approved") ?? [];
  const withdrawals = txStats?.filter((t) => t.transaction_type === "withdrawal" && t.status === "approved") ?? [];
  const pending = txStats?.filter((t) => t.status === "pending") ?? [];

  const totalDeposit = deposits.reduce((s, t) => s + (t.amount ?? 0), 0);
  const totalWithdrawal = withdrawals.reduce((s, t) => s + (t.amount ?? 0), 0);

  // Bekleyen eskalasyonlar
  const { count: escalationCount } = await supabase
    .from("conversation_logs")
    .select("id", { count: "exact" })
    .eq("resolution", "escalated");

  // KB büyüme
  const { count: kbCount } = await supabase
    .from("knowledge_base_v2")
    .select("id", { count: "exact" })
    .gte("created_at", `${yesterday}T00:00:00`);

  const formatTry = (n: number) =>
    `₺${n.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}`;

  const report =
    `🌅 *DEUS — Günlük Rapor (${today})*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📅 Dün (${yesterday}) özeti:\n\n` +
    `📥 Yatırımlar: ${deposits.length} işlem | ${formatTry(totalDeposit)}\n` +
    `📤 Çekimler: ${withdrawals.length} işlem | ${formatTry(totalWithdrawal)}\n` +
    `⏳ Bekleyen: ${pending.length} işlem\n\n` +
    `🆘 Açık eskalasyon: ${escalationCount ?? 0}\n` +
    `📚 Yeni KB kaydı: ${kbCount ?? 0}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `${(escalationCount ?? 0) > 0 ? "⚠️ Bekleyen eskalasyonlar var — /bilgi ile listele" : "✅ Eskalasyon yok"}`;

  const botToken = process.env.TELEGRAM_BOT_TOKEN!;
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: adminChatId,
      text: report,
      parse_mode: "Markdown",
    }),
  });

  console.log("Sabah raporu gönderildi");
}

sendMorningReport().catch(console.error);
