// ============================================================
// DEUS — Weekly Learning (KB Enrichment via Claude Sonnet)
// src/cron/weekly-learning.ts
//
// Runs: Every Sunday 22:00 (UTC-3)
// Task: Analyze week's transactions → extract patterns → update KB
// Cost: Sonnet ($3/M) only — approved for cron window
// ============================================================

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import pino from "pino";

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

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL_SONNET = "claude-sonnet-4-5-20251022";
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID ? parseInt(process.env.ADMIN_CHAT_ID) : 0;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "missing";

// ── TYPES ──────────────────────────────────────────────────

interface WeeklyInsight {
  category: string;
  pattern: string;
  frequency: number;
  recommendation: string;
  confidence: number;
}

interface TransactionSummary {
  total_count: number;
  total_volume: number;
  avg_amount: number;
  top_types: string[];
  anomaly_count: number;
  success_rate: number;
}

// ── ANALYSIS ───────────────────────────────────────────────

async function analyzeWeeklyPatterns(): Promise<WeeklyInsight[]> {
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  const weekStartStr = weekStart.toISOString().split("T")[0];
  const todayStr = new Date().toISOString().split("T")[0];

  log.info({ weekStart: weekStartStr, today: todayStr }, "Fetching weekly transactions");

  // Fetch transactions
  const { data: transactions, error: txnErr } = await supabase
    .from("transactions_v2")
    .select("id, transaction_type, amount, status, customer_id, created_at")
    .gte("created_at", `${weekStartStr}T00:00:00Z`)
    .lte("created_at", `${todayStr}T23:59:59Z`)
    .limit(1000);

  if (txnErr || !transactions) {
    log.error({ err: txnErr }, "Failed to fetch transactions");
    return [];
  }

  log.info({ count: transactions.length }, "Transactions loaded");

  // Build summary
  const summary: TransactionSummary = {
    total_count: transactions.length,
    total_volume: transactions.reduce((sum, t) => sum + (t.amount || 0), 0),
    avg_amount: 0,
    top_types: ["deposit", "withdrawal"],
    anomaly_count: 0,
    success_rate: 0,
  };

  if (summary.total_count > 0) {
    summary.avg_amount = summary.total_volume / summary.total_count;
    const succeeded = transactions.filter((t) => t.status === "completed").length;
    summary.success_rate = succeeded / summary.total_count;
  }

  // Fetch anomalies
  const { data: anomalies } = await supabase
    .from("anomalies_v2")
    .select("id")
    .gte("created_at", `${weekStartStr}T00:00:00Z`)
    .lte("created_at", `${todayStr}T23:59:59Z`);

  summary.anomaly_count = anomalies?.length || 0;

  // Call Claude Sonnet for pattern analysis
  const prompt = `
Analiz et: Haftalık fintech işlem verisi

${JSON.stringify(summary, null, 2)}

SADECE JSON döndür:
[
  {
    "category": "...",
    "pattern": "...",
    "frequency": 0-100,
    "recommendation": "...",
    "confidence": 0.0-1.0
  }
]

En önemli 5 pattern'i bul.
`;

  try {
    log.info("Calling Claude Sonnet for pattern analysis...");
    const res = await anthropic.messages.create({
      model: MODEL_SONNET,
      max_tokens: 2048,
      temperature: 0.6,
      system: "Sen DEUS'un haftalık öğrenme analisti. İşlem verilerinden paternleri çıkar, öneriler sun.",
      messages: [{ role: "user", content: prompt }],
    });

    const text = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    // Parse JSON
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) {
      log.warn({ raw: text.slice(0, 200) }, "JSON parse failed");
      return [];
    }

    const insights: WeeklyInsight[] = JSON.parse(match[0]);
    log.info({ count: insights.length }, "✅ Patterns analyzed");
    return insights;
  } catch (err) {
    log.error({ err }, "Claude Sonnet call failed");
    return [];
  }
}

// ── KB UPDATE ──────────────────────────────────────────────

async function updateKnowledgeBase(insights: WeeklyInsight[]): Promise<void> {
  if (insights.length === 0) {
    log.info("No insights to store");
    return;
  }

  const entries = insights.map((insight) => ({
    category: insight.category,
    question: `${insight.category}: ${insight.pattern}`,
    answer: insight.recommendation,
    source: "weekly_learning",
    metadata: {
      pattern: insight.pattern,
      frequency: insight.frequency,
      confidence: insight.confidence,
      learned_at: new Date().toISOString(),
    },
  }));

  for (const entry of entries) {
    const { error } = await supabase.from("knowledge_base_v2").insert({
      category: entry.category,
      question: entry.question,
      answer: entry.answer,
      source: entry.source,
      metadata: entry.metadata,
    });

    if (error) {
      log.warn({ err: error, entry }, "KB insert failed");
    } else {
      log.debug({ entry: entry.question }, "KB entry created");
    }
  }

  log.info({ count: entries.length }, "✅ KB updated");
}

// ── REPORT & NOTIFY ───────────────────────────────────────

async function sendReport(insights: WeeklyInsight[]): Promise<void> {
  if (!ADMIN_CHAT_ID) {
    log.warn("ADMIN_CHAT_ID not set");
    return;
  }

  let text = `📚 *DEUS Haftalık Öğrenme Raporu*\n\n`;
  text += `🧠 ${insights.length} patern keşfedildi:\n\n`;

  for (const insight of insights.slice(0, 5)) {
    text += `📍 *${insight.category}*\n`;
    text += `  Pattern: ${insight.pattern}\n`;
    text += `  Frekans: ${insight.frequency}%\n`;
    text += `  Güven: ${(insight.confidence * 100).toFixed(0)}%\n`;
    text += `  💡 ${insight.recommendation}\n\n`;
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

    if (res.ok) {
      log.info("✅ Report sent");
    } else {
      log.warn({ status: res.status }, "Report send failed");
    }
  } catch (err) {
    log.error({ err }, "Telegram send failed");
  }
}

// ── MAIN ───────────────────────────────────────────────────

async function main() {
  try {
    log.info("🌙 Weekly learning job started");

    // 1. Analyze patterns
    const insights = await analyzeWeeklyPatterns();
    if (insights.length === 0) {
      log.warn("No insights generated");
      process.exit(1);
    }

    // 2. Update KB
    await updateKnowledgeBase(insights);

    // 3. Send report
    await sendReport(insights);

    log.info("✅ Weekly learning job complete");
    process.exit(0);
  } catch (err) {
    log.error({ err }, "Weekly learning job failed");
    process.exit(1);
  }
}

main();
