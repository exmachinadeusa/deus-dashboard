// ============================================================
// DEUS — Haftalık Öğrenme Cron
// src/cron/weekly-learning.ts
// Pazar 03:00 — PM2 tarafından tetiklenir
//
// Akış:
//   1. Son 7 günün çözümsüz eskalasyonlarını çek
//   2. Pattern analizi (Ollama $0)
//   3. Yeni KB önerileri (Sonnet — haftalık bütçe)
//   4. Düşük başarılı KB girişlerini güncelle
//   5. Admin grubuna özet rapor gönder
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
const ANTHROPIC_API_KEY = requireEnv("ANTHROPIC_API_KEY");

// ⚠️ MODEL KİLİDİ — OPUS YASAK
const LEARNING_MODEL = "claude-sonnet-4-5-20251022"; // haftalık bütçe: ~$2/ay

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// ── Telegram mesaj gönder ─────────────────────────────────────
async function sendTelegramMessage(text: string): Promise<void> {
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

// ── Son 7 günün eskalasyon istatistikleri ─────────────────────
async function getWeeklyEscalations() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data, error } = await supabase
    .from("escalations")
    .select("id, question, category, confidence, status, site_id, created_at")
    .gte("created_at", sevenDaysAgo.toISOString())
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

// ── Düşük başarılı KB girişleri ───────────────────────────────
async function getLowPerformingKB() {
  const { data, error } = await supabase
    .from("knowledge_base")
    .select("id, question, answer, category, success_rate, usage_count")
    .lt("success_rate", 0.5)
    .gt("usage_count", 3)
    .order("success_rate", { ascending: true })
    .limit(20);

  if (error) throw error;
  return data ?? [];
}

// ── Ollama ile pattern analizi ($0) ──────────────────────────
async function analyzePatterns(
  escalations: Array<{ question: string; category: string }>
): Promise<string> {
  if (escalations.length === 0) return "Eskalasyon bulunamadı.";

  const questionSample = escalations
    .slice(0, 30)
    .map((e, i) => `${i + 1}. [${e.category}] ${e.question}`)
    .join("\n");

  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen2.5:7b",
        prompt: `Aşağıdaki müşteri sorularını analiz et ve tekrar eden 3-5 ana tema/pattern'i belirle. Türkçe yanıt ver, kısa ve öz ol.

Sorular:
${questionSample}

Yanıtı şu formatta ver:
PATTERN 1: <başlık> — <kısa açıklama>
PATTERN 2: <başlık> — <kısa açıklama>
...`,
        stream: false,
        options: { temperature: 0.3, num_predict: 300 },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) throw new Error("Ollama yanıt vermedi");
    const json = (await response.json()) as { response: string };
    return json.response.trim();
  } catch (err) {
    log.warn({ err }, "Ollama pattern analizi başarısız");
    return "Pattern analizi yapılamadı (Ollama kapalı).";
  }
}

// ── Sonnet ile KB iyileştirme önerileri ──────────────────────
async function generateKBImprovements(
  lowPerforming: Array<{ question: string; answer: string; category: string; success_rate: number }>
): Promise<Array<{ question: string; improvedAnswer: string; reason: string }>> {
  if (lowPerforming.length === 0) return [];

  const entries = lowPerforming
    .slice(0, 10)
    .map(
      (e, i) =>
        `${i + 1}. SORU: ${e.question}\n   MEVCUT CEVAP: ${e.answer}\n   BAŞARI ORANI: ${Math.round(e.success_rate * 100)}%`
    )
    .join("\n\n");

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: LEARNING_MODEL,
        max_tokens: 2000,
        system: `Sen DEUS'un öğrenme motorusun. Türk bahis sektöründe müşteri hizmetleri için bilgi tabanı girişlerini iyileştiriyorsun.

Başarısı düşük KB girişlerini analiz et ve daha iyi yanıtlar üret.

KURALLAR:
- Yanıtlar Türkçe olmalı
- Net, anlaşılır, müşteri odaklı dil
- Teknik jargondan kaçın
- Somut bilgi ver (süre, miktar, süreç)
- Her yanıt max 3 cümle`,
        messages: [
          {
            role: "user",
            content: `Aşağıdaki düşük başarılı KB girişlerini iyileştir. Her biri için iyileştirilmiş yanıt ve kısa gerekçe yaz.

${entries}

JSON formatında yanıt ver:
[
  {
    "index": 1,
    "improvedAnswer": "...",
    "reason": "..."
  },
  ...
]`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API hatası: ${err}`);
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
      usage: { input_tokens: number; output_tokens: number };
    };

    log.info(
      { input: data.usage.input_tokens, output: data.usage.output_tokens },
      "Sonnet haftalık öğrenme token kullanımı"
    );

    const text = data.content[0]?.text ?? "[]";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const improvements = JSON.parse(jsonMatch[0]) as Array<{
      index: number;
      improvedAnswer: string;
      reason: string;
    }>;

    return improvements.map((imp) => ({
      question: lowPerforming[imp.index - 1]?.question ?? "",
      improvedAnswer: imp.improvedAnswer,
      reason: imp.reason,
    }));
  } catch (err) {
    log.error({ err }, "Sonnet KB iyileştirme hatası");
    return [];
  }
}

// ── KB girişlerini güncelle ───────────────────────────────────
async function applyKBImprovements(
  lowPerforming: Array<{ id: string; question: string; success_rate: number }>,
  improvements: Array<{ question: string; improvedAnswer: string }>
): Promise<number> {
  let updatedCount = 0;

  for (const improvement of improvements) {
    const original = lowPerforming.find(
      (e) => e.question === improvement.question
    );
    if (!original) continue;

    const { error } = await supabase
      .from("knowledge_base")
      .update({
        answer: improvement.improvedAnswer,
        confidence: 0.8,
        source: "weekly_learning",
        updated_at: new Date().toISOString(),
      })
      .eq("id", original.id);

    if (!error) updatedCount++;
  }

  return updatedCount;
}

// ── Ana Fonksiyon ─────────────────────────────────────────────
async function runWeeklyLearning(): Promise<void> {
  const startTime = Date.now();
  log.info("Haftalık öğrenme başlatıldı");

  try {
    const [escalations, lowPerforming] = await Promise.all([
      getWeeklyEscalations(),
      getLowPerformingKB(),
    ]);

    const unresolvedCount = escalations.filter((e) => e.status !== "resolved").length;
    const resolvedCount = escalations.filter((e) => e.status === "resolved").length;

    log.info(
      { total: escalations.length, unresolved: unresolvedCount, lowKB: lowPerforming.length },
      "Haftalık veri toplandı"
    );

    const patterns = await analyzePatterns(
      escalations.map((e) => ({ question: e.question, category: e.category ?? "general" }))
    );

    const improvements = await generateKBImprovements(lowPerforming);
    const updatedCount = await applyKBImprovements(lowPerforming, improvements);

    const { count: kbTotal } = await supabase
      .from("knowledge_base")
      .select("*", { count: "exact", head: true });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    const report =
      `🧠 *DEUS Haftalık Öğrenme Raporu*\n` +
      `📅 ${new Date().toLocaleDateString("tr-TR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}\n\n` +
      `📊 *Bu Haftanın İstatistikleri*\n` +
      `• Toplam eskalasyon: ${escalations.length}\n` +
      `• Çözülen: ${resolvedCount} ✅\n` +
      `• Bekleyen: ${unresolvedCount} ⏳\n` +
      `• KB toplam giriş: ${kbTotal ?? "?"}\n` +
      `• Güncellenen KB: ${updatedCount}\n\n` +
      `🔍 *Tespit Edilen Patternler*\n` +
      `${patterns.slice(0, 400)}\n\n` +
      `⏱️ İşlem süresi: ${elapsed}s\n` +
      `💰 Maliyet: ~Sonnet haftalık (${improvements.length} iyileştirme)`;

    await sendTelegramMessage(report);
    log.info({ elapsed, updated: updatedCount }, "Haftalık öğrenme tamamlandı");

  } catch (err) {
    log.error(err, "Haftalık öğrenme hatası");
    await sendTelegramMessage(
      `❌ *Haftalık Öğrenme Hatası*\n\`${String(err)}\``
    ).catch(() => {});
    process.exit(1);
  }
}

runWeeklyLearning().then(() => process.exit(0));
