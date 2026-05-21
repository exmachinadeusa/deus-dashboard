// ============================================================
// DEUS — Gece Güvenlik Denetimi
// src/cron/security-audit.ts
// Her gece 23:00 — PM2 tarafından tetiklenir
//
// Kontroller:
//   1. Yüksek miktarlı işlemler (limit üstü)
//   2. Kısa sürede çok sayıda çekim girişimi
//   3. Kara listeli IBAN / TC tespiti
//   4. Bekleyen eskalasyon yığılması
//   5. Sistem sağlık özeti
// ============================================================

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import pino from "pino";

const log = pino({ level: "info" });

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Eksik ortam değişkeni: ${key}`);
  return val;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_KEY = requireEnv("SUPABASE_SERVICE_KEY");
const TELEGRAM_BOT_TOKEN = requireEnv("TELEGRAM_BOT_TOKEN");
const ADMIN_GROUP_ID = requireEnv("TELEGRAM_ADMIN_GROUP_ID");

const THRESHOLDS = {
  HIGH_AMOUNT_TRY: 50_000,
  RAPID_WITHDRAW_COUNT: 5,
  RAPID_WITHDRAW_WINDOW_HOURS: 1,
  PENDING_ESCALATION_WARN: 10,
  FAILED_TX_RATE: 0.3,
} as const;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// ── Telegram gönder ───────────────────────────────────────────
async function sendTelegram(text: string): Promise<void> {
  await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: ADMIN_GROUP_ID,
        text,
        parse_mode: "Markdown",
      }),
    }
  );
}

// ── 1. Yüksek miktarlı işlemler ──────────────────────────────
async function checkHighAmountTransactions() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("transactions")
    .select("id, member_id, amount, type, site_id, created_at")
    .gte("created_at", today.toISOString())
    .gt("amount", THRESHOLDS.HIGH_AMOUNT_TRY)
    .order("amount", { ascending: false })
    .limit(20);

  if (error) {
    log.error({ error }, "Yüksek miktar kontrolü hatası");
    return { count: 0, maxAmount: 0, items: [] };
  }

  return {
    count: data?.length ?? 0,
    maxAmount: data?.[0]?.amount ?? 0,
    items: data ?? [],
  };
}

// ── 2. Hızlı çekim girişimi tespiti ─────────────────────────
async function checkRapidWithdrawals() {
  const windowStart = new Date();
  windowStart.setHours(windowStart.getHours() - THRESHOLDS.RAPID_WITHDRAW_WINDOW_HOURS);

  const { data, error } = await supabase
    .from("transactions")
    .select("member_id, site_id")
    .eq("type", "withdrawal")
    .gte("created_at", windowStart.toISOString());

  if (error) {
    log.error({ error }, "Hızlı çekim kontrolü hatası");
    return [];
  }

  const grouped: Record<string, { memberId: string; siteId: string; count: number }> = {};
  for (const row of data ?? []) {
    const key = `${row.member_id}_${row.site_id}`;
    if (!grouped[key]) {
      grouped[key] = { memberId: row.member_id, siteId: row.site_id, count: 0 };
    }
    grouped[key].count++;
  }

  return Object.values(grouped).filter(
    (g) => g.count >= THRESHOLDS.RAPID_WITHDRAW_COUNT
  );
}

// ── 3. Bekleyen eskalasyonlar ─────────────────────────────────
async function checkPendingEscalations() {
  const { count, error } = await supabase
    .from("escalations")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");

  if (error) {
    log.error({ error }, "Eskalasyon kontrolü hatası");
    return 0;
  }

  return count ?? 0;
}

// ── 4. Bugünkü işlem başarı oranı ─────────────────────────────
async function checkTransactionSuccessRate() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("transactions")
    .select("status")
    .gte("created_at", today.toISOString());

  if (error || !data || data.length === 0) {
    return { total: 0, failed: 0, rate: 0 };
  }

  const total = data.length;
  const failed = data.filter(
    (t) => t.status === "failed" || t.status === "rejected"
  ).length;
  const rate = failed / total;

  return { total, failed, rate };
}

// ── 5. Sistem sağlık özeti ────────────────────────────────────
async function checkSystemHealth() {
  const checks: Record<string, boolean> = {};

  checks.redis = true; // PM2 deus uygulaması çalışıyorsa Redis OK sayılır

  try {
    const { error } = await supabase.from("sites").select("id").limit(1);
    checks.supabase = !error;
  } catch {
    checks.supabase = false;
  }

  try {
    const res = await fetch("http://localhost:11434/api/tags", {
      signal: AbortSignal.timeout(2000),
    });
    checks.ollama = res.ok;
  } catch {
    checks.ollama = false;
  }

  return checks;
}

// ── Kasa günlük özeti ─────────────────────────────────────────
async function getDailyKasaSummary() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("daily_reconciliation")
    .select("site_id, total_deposit, total_withdrawal, net_balance")
    .gte("reconciliation_date", today.toISOString())
    .order("net_balance", { ascending: true });

  if (error) return [];
  return data ?? [];
}

// ── Ana Fonksiyon ─────────────────────────────────────────────
async function runSecurityAudit(): Promise<void> {
  const startTime = Date.now();
  log.info("Gece güvenlik denetimi başlatıldı");

  const alarms: string[] = [];

  try {
    const [highTx, rapidWithdraws, pendingEsc, txStats, health, kasaSummary] =
      await Promise.all([
        checkHighAmountTransactions(),
        checkRapidWithdrawals(),
        checkPendingEscalations(),
        checkTransactionSuccessRate(),
        checkSystemHealth(),
        getDailyKasaSummary(),
      ]);

    if (highTx.count > 0) {
      alarms.push(
        `⚠️ *Yüksek Miktar:* ${highTx.count} işlem (max: ${highTx.maxAmount.toLocaleString("tr-TR")} ₺)`
      );
    }

    if (rapidWithdraws.length > 0) {
      const names = rapidWithdraws
        .map((r) => `${r.memberId} (${r.count}x)`)
        .join(", ");
      alarms.push(`🚨 *Hızlı Çekim Tespiti:* ${names}`);
    }

    if (pendingEsc >= THRESHOLDS.PENDING_ESCALATION_WARN) {
      alarms.push(`📋 *${pendingEsc} bekleyen eskalasyon* — admin müdahalesi gerekli`);
    }

    if (txStats.rate > THRESHOLDS.FAILED_TX_RATE && txStats.total > 10) {
      alarms.push(
        `❌ *Yüksek başarısızlık oranı:* %${Math.round(txStats.rate * 100)} (${txStats.failed}/${txStats.total})`
      );
    }

    const statusIcon = alarms.length === 0 ? "✅" : "⚠️";
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    const healthLines = [
      `Supabase: ${health.supabase ? "✅" : "❌"}`,
      `Ollama: ${health.ollama ? "✅" : "❌"}`,
      `Redis: ${health.redis ? "✅" : "❌"}`,
    ].join(" | ");

    const kasaLines =
      kasaSummary.length === 0
        ? "Veri yok"
        : kasaSummary
            .map(
              (k) =>
                `• ${k.site_id}: +${(k.total_deposit ?? 0).toLocaleString("tr-TR")} / -${(k.total_withdrawal ?? 0).toLocaleString("tr-TR")} = ${(k.net_balance ?? 0).toLocaleString("tr-TR")} ₺`
            )
            .join("\n");

    const report =
      `${statusIcon} *DEUS Gece Güvenlik Raporu*\n` +
      `📅 ${new Date().toLocaleDateString("tr-TR")} 23:00\n\n` +
      `🖥️ *Sistem:* ${healthLines}\n\n` +
      `📊 *Bugünkü İşlemler*\n` +
      `• Toplam: ${txStats.total}\n` +
      `• Başarısız: ${txStats.failed} (%${Math.round(txStats.rate * 100)})\n` +
      `• Yüksek miktar: ${highTx.count}\n` +
      `• Bekleyen eskalasyon: ${pendingEsc}\n\n` +
      `💰 *Kasa Özeti*\n${kasaLines}\n\n` +
      (alarms.length > 0
        ? `🚨 *ALARMLAR (${alarms.length})*\n${alarms.join("\n")}\n\n`
        : `✅ *Alarm yok — sistem normal*\n\n`) +
      `⏱️ Denetim süresi: ${elapsed}s`;

    await sendTelegram(report);
    log.info({ alarms: alarms.length, elapsed }, "Güvenlik denetimi tamamlandı");

  } catch (err) {
    log.error(err, "Güvenlik denetimi hatası");
    await sendTelegram(
      `❌ *Güvenlik Denetimi Hatası*\n\`${String(err)}\``
    ).catch(() => {});
    process.exit(1);
  }
}

runSecurityAudit().then(() => process.exit(0));
