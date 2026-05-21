// ============================================================
// DEUS — Morning Report (Daily Reconciliation)
// src/cron/morning-report.ts
//
// Runs daily at 08:00 AM (UTC-3 = 11:00 AM server time)
// Generates: Reconciliation report + Site balance + Risk summary
// ============================================================

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import pino from "pino";
import type { Bot } from "grammy";

const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});

// ── SERVICES ───────────────────────────────────────────────

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_KEY || "",
  { auth: { persistSession: false } }
);

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "missing";
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID ? parseInt(process.env.ADMIN_CHAT_ID) : 0;

// ── REPORT GENERATION ──────────────────────────────────────

interface DailyReconciliation {
  date: string;
  sites: Array<{
    site_name: string;
    opening_balance: number;
    deposits_total: number;
    withdrawals_total: number;
    deposit_commission: number;
    withdrawal_commission: number;
    closing_balance: number;
    daily_risk_score: number;
  }>;
  total_transactions: number;
  flagged_anomalies: number;
  alerts: string[];
}

async function generateDailyReconciliation(): Promise<DailyReconciliation> {
  const today = new Date().toISOString().split("T")[0];

  // Fetch today's transactions grouped by site
  const { data: transactions, error: txnErr } = await supabase
    .from("transactions_v2")
    .select(
      `
      id,
      site_id,
      transaction_type,
      amount,
      status,
      approval_level,
      created_at
    `
    )
    .gte("created_at", `${today}T00:00:00Z`)
    .lte("created_at", `${today}T23:59:59Z`);

  if (txnErr) {
    log.error({ err: txnErr }, "Failed to fetch transactions");
    return { date: today, sites: [], total_transactions: 0, flagged_anomalies: 0, alerts: [] };
  }

  // Group by site
  const bysite: Record<string, any[]> = {};
  (transactions || []).forEach((txn: any) => {
    const siteId = txn.site_id || "unknown";
    if (!bysite[siteId]) bysite[siteId] = [];
    bysite[siteId].push(txn);
  });

  const sites: DailyReconciliation["sites"] = [];
  const alerts: string[] = [];

  for (const siteId of Object.keys(bysite)) {
    const siteTxns = bysite[siteId];

    // Fetch site name
    const { data: siteData } = await supabase
      .from("sites")
      .select("name")
      .eq("id", siteId)
      .single();

    const siteName = siteData?.name || siteId;

    // Calculate totals
    const deposits = siteTxns.filter(
      (t) => t.transaction_type === "deposit" && t.status === "completed"
    );
    const withdrawals = siteTxns.filter(
      (t) => t.transaction_type === "withdrawal" && t.status === "completed"
    );

    const depositsTotal = deposits.reduce((sum, t) => sum + (t.amount || 0), 0);
    const withdrawalsTotal = withdrawals.reduce((sum, t) => sum + (t.amount || 0), 0);

    // Commission (hardcoded for demo; fetch from commission_rules in production)
    const depositComm = depositsTotal * 0.025; // 2.5%
    const withdrawalComm = withdrawalsTotal * 0.05; // 5%

    // Get current balance
    const { data: walletData } = await supabase
      .from("wallets")
      .select("balance")
      .eq("site_id", siteId)
      .single();

    const closingBalance = walletData?.balance || 0;
    const openingBalance = closingBalance - depositsTotal + withdrawalsTotal + depositComm + withdrawalComm;

    // Risk score (simple: check for anomalies)
    const riskScore = calculateRiskScore(siteTxns);
    if (riskScore > 0.7) {
      alerts.push(`⚠️ ${siteName}: Yüksek risk puanı (${riskScore.toFixed(2)})`);
    }

    sites.push({
      site_name: siteName,
      opening_balance: openingBalance,
      deposits_total: depositsTotal,
      withdrawals_total: withdrawalsTotal,
      deposit_commission: depositComm,
      withdrawal_commission: withdrawalComm,
      closing_balance: closingBalance,
      daily_risk_score: riskScore,
    });
  }

  // Check for anomalies
  const { data: anomalies } = await supabase
    .from("anomalies_v2")
    .select("id, customer_id, anomaly_type")
    .gte("created_at", `${today}T00:00:00Z`)
    .lte("created_at", `${today}T23:59:59Z`)
    .eq("status", "flagged");

  const flaggedAnomalies = anomalies?.length || 0;
  if (flaggedAnomalies > 0) {
    alerts.push(`🚨 ${flaggedAnomalies} anomali tespit edildi`);
  }

  return {
    date: today,
    sites,
    total_transactions: (transactions || []).length,
    flagged_anomalies: flaggedAnomalies,
    alerts,
  };
}

function calculateRiskScore(transactions: any[]): number {
  let score = 0;

  // High transaction count
  if (transactions.length > 50) score += 0.3;

  // Large amounts
  const largeAmount = transactions.some((t) => (t.amount || 0) > 100000);
  if (largeAmount) score += 0.2;

  // Many failed transactions
  const failedCount = transactions.filter((t) => t.status === "rejected").length;
  if (failedCount > 5) score += 0.2;

  // Pending transactions
  const pendingCount = transactions.filter((t) => t.status === "pending").length;
  if (pendingCount > 10) score += 0.2;

  return Math.min(score, 1.0);
}

// ── FORMAT & SEND ──────────────────────────────────────────

function formatReport(recon: DailyReconciliation): string {
  let text = `📊 *DEUS Günlük Rapor — ${recon.date}*\n\n`;

  text += `📈 *Özet*\n`;
  text += `  İşlem: ${recon.total_transactions}\n`;
  text += `  Anomali: ${recon.flagged_anomalies}\n\n`;

  text += `💰 *Siteler*\n`;
  for (const site of recon.sites) {
    text += `${site.site_name}\n`;
    text += `  Açılış: ₺${site.opening_balance.toLocaleString("tr-TR")}\n`;
    text += `  (+) Yatırım: ₺${site.deposits_total.toLocaleString("tr-TR")}\n`;
    text += `  (-) Çekim: ₺${site.withdrawals_total.toLocaleString("tr-TR")}\n`;
    text += `  (-) Komisyon: ₺${(site.deposit_commission + site.withdrawal_commission).toLocaleString("tr-TR")}\n`;
    text += `  Kapanış: ₺${site.closing_balance.toLocaleString("tr-TR")}\n`;
    text += `  Risk: ${(site.daily_risk_score * 100).toFixed(0)}%\n\n`;
  }

  if (recon.alerts.length > 0) {
    text += `🚨 *Uyarılar*\n`;
    for (const alert of recon.alerts) {
      text += `  ${alert}\n`;
    }
  }

  return text;
}

async function sendReport(text: string): Promise<void> {
  if (!ADMIN_CHAT_ID) {
    log.warn("ADMIN_CHAT_ID not set, skipping report");
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: ADMIN_CHAT_ID,
        text,
        parse_mode: "Markdown",
      }),
    });

    if (!res.ok) {
      log.error({ status: res.status }, "Failed to send report");
    } else {
      log.info("✅ Report sent");
    }
  } catch (err) {
    log.error({ err }, "Telegram send failed");
  }
}

// ── MAIN ───────────────────────────────────────────────────

async function main() {
  try {
    log.info("🌅 Morning report generating...");
    const recon = await generateDailyReconciliation();
    const text = formatReport(recon);
    await sendReport(text);
    log.info("✅ Morning report complete");
  } catch (err) {
    log.error({ err }, "Morning report failed");
    process.exit(1);
  }
}

main();
