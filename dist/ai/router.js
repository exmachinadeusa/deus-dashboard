// ============================================================
// DEUS — Akıllı Model Yönlendirici
// src/ai/router.ts
//
// MALİYET HİYERARŞİSİ (kesinlikle bu sırayla):
//   1. Kural motoru       → $0    (hızlı, deterministik)
//   2. Ollama/qwen2.5:7b  → $0    (yerel, sınırsız)
//   3. Claude Haiku       → ucuz  (Vision, karmaşık)
//   4. Claude Sonnet      → pahalı (sadece haftalık öğrenme)
//
// ASLA Opus kullanma — model kilidi burada.
// ============================================================
import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});
// ── MODEL KİLİDİ — Opus yasak ────────────────────────────────
const MODELS = {
    HAIKU: "claude-haiku-4-5-20251001", // Dekont OCR, karmaşık destek
    SONNET: "claude-sonnet-4-5-20251022", // Haftalık öğrenme analizi
    // OPUS: YASAK — maliyet patlar
};
// Görev → model eşleşmesi
const TASK_MODEL_MAP = {
    receipt_parse: "HAIKU", // Claude Vision gerekli
    support_reply: "HAIKU", // Karmaşık destek cevabı
    normalize_question: "HAIKU", // Soru normalizasyonu
    weekly_learning: "SONNET", // Haftalık analiz (nadir)
    intent_detect: "HAIKU", // Ollama başarısız olursa fallback
};
// ── PROMPT CACHE SİSTEMİ ─────────────────────────────────────
// Anthropic'in prompt caching özelliği — %90 maliyet azaltma
// Aynı system prompt tekrar kullanılırsa cache'den gelir
const SYSTEM_PROMPTS = {
    receipt_parse: `Sen DEUS'un dekont analiz motorusun. Türk bankası dekontlarını analiz edip JSON çıktısı üretirsin.
Emin olmadığın alanlara null yaz. Sadece JSON döndür, açıklama ekleme.`,
    support_reply: `Sen DEUS'un müşteri destek asistanısın. Bahis platformu üyelerine Türkçe, kısa ve net yanıtlar verirsin.
Bilmediğin şeyi söylemezsin — "yetkililere iletiyorum" dersin.
Para birimini her zaman ₺ ile gösterirsin.`,
    intent_detect: `Türkçe mesajları sınıflandır. Sadece JSON döndür.`,
    weekly_learning: `Sen DEUS'un öğrenme analistisisin. Geçen haftanın konuşmalarını inceleyip knowledge base güncellemeleri önerirsin.
Önerilerin pratik ve uygulanabilir olmalı.`,
};
export async function callClaude(opts) {
    const modelKey = TASK_MODEL_MAP[opts.task] ?? "HAIKU";
    const model = MODELS[modelKey];
    const maxTokens = opts.maxTokens ?? (opts.imageBase64 ? 1024 : 512);
    const baseSystem = SYSTEM_PROMPTS[opts.task] ?? "Sen DEUS operasyon sistemisin.";
    const systemText = opts.systemExtra
        ? `${baseSystem}\n\n${opts.systemExtra}`
        : baseSystem;
    // Mesaj içeriği — Vision veya text
    const userContent = opts.imageBase64
        ? [
            {
                type: "image",
                source: {
                    type: "base64",
                    media_type: opts.imageMediaType ?? "image/jpeg",
                    data: opts.imageBase64,
                },
            },
            { type: "text", text: opts.userMessage },
        ]
        : opts.userMessage;
    // Prompt caching yalnızca Sonnet'te desteklenir (Haiku'da not supported)
    const requestConfig = {
        model,
        max_tokens: maxTokens,
        system: [
            {
                type: "text",
                text: systemText,
                // Haiku'da cache_control desteklenmez
            },
        ],
        messages: [{ role: "user", content: userContent }],
    };
    // Sonnet için prompt cache — GA olduğundan beta flag gerekmez
    if (modelKey === "SONNET") {
        requestConfig.system[0].cache_control = { type: "ephemeral" };
    }
    const response = await anthropic.messages.create(requestConfig);
    const textBlock = response.content.find((b) => b.type === "text");
    const content = textBlock?.type === "text" ? textBlock.text : "";
    const usage = response.usage;
    return {
        content,
        model,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cached: (usage.cache_read_input_tokens ?? 0) > 0,
    };
}
// ── JSON PARSE HELPER ────────────────────────────────────────
export function parseJsonResponse(raw) {
    try {
        // Önce direkt parse dene
        return JSON.parse(raw);
    }
    catch {
        // JSON bloğunu çıkar
        const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ??
            raw.match(/(\{[\s\S]*\})/);
        if (!match)
            return null;
        try {
            return JSON.parse(match[1] ?? match[0]);
        }
        catch {
            return null;
        }
    }
}
// ── MALİYET TAKIBI ───────────────────────────────────────────
// Günlük token kullanımını logla
export async function getDailyCostSummary() {
    // Basit placeholder — ileride Supabase'den çekilebilir
    return `💰 Maliyet takibi: console.anthropic.com/usage adresinden kontrol et.
Haiku: ~$0.25/MTok input, ~$1.25/MTok output
Sonnet: ~$3/MTok input, ~$15/MTok output
Ollama: $0 (yerel)`;
}
// Export exports for dispatcher
export const MODEL_HAIKU = MODELS.HAIKU;
export const MODEL_SONNET = MODELS.SONNET;
// Export Vision caller for dispatcher
export async function callClaudeVision(base64, userText) {
    return callClaude({
        task: "receipt_parse",
        userMessage: userText,
        imageBase64: base64,
        maxTokens: 1024,
    });
}
