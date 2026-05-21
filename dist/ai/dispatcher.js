// ============================================================
// DEUS — Smart Dispatcher
// src/ai/dispatcher.ts
//
// 4-tier routing: Rules → Ollama → Vision → Claude
// Her katmanın maliyeti ve hızı farklı.
// ============================================================
import { log, redis } from "../index.js";
import { checkCommandRules } from "./rules.js";
import { detectIntent } from "./ollama.js";
import { callClaude } from "./router.js";
/**
 * Smart dispatcher: 4-tier routing
 * 1. Rules ($0, ~0ms) — %40 işlem
 * 2. Ollama ($0, ~100ms) — %40 işlem
 * 3. Vision ($, ~500ms) — %10 işlem (dekont OCR)
 * 4. Claude ($, ~1s) — %10 işlem (fallback)
 */
export async function smartDispatch(text, ctx) {
    const startTime = Date.now();
    try {
        // 🔺 TIER 1: KURAL MOTORU ($0)
        log.debug({ text }, "Tier 1: Kural motoru kontrol ediliyor");
        const commandMatch = checkCommandRules(text);
        if (commandMatch?.matched) {
            const latency = Date.now() - startTime;
            log.info({ command: commandMatch.command, latencyMs: latency }, "✅ Tier 1: Kural eşleşti");
            return {
                tier: "rules",
                intent: commandMatch.intent,
                response: commandMatch.response,
                latencyMs: latency,
            };
        }
        // 🔺 TIER 2: OLLAMA ($0)
        log.debug({ text: text.slice(0, 80) }, "Tier 2: Ollama intent detection");
        const ollamaResult = await detectIntent(text);
        if (ollamaResult && ollamaResult.intent && ollamaResult.intent !== 'unknown' && ollamaResult.confidence > 0.6) {
            const latency = Date.now() - startTime;
            log.info({ intent: ollamaResult.intent, confidence: ollamaResult.confidence, latencyMs: latency }, "✅ Tier 2: Ollama confident");
            return {
                tier: "ollama",
                intent: ollamaResult.intent,
                response: `✅ Intent: ${ollamaResult.intent} (${Math.round(ollamaResult.confidence * 100)}% güven)${ollamaResult.keywords ? `\nAnahtarlar: ${ollamaResult.keywords.join(', ')}` : ''}`,
                latencyMs: latency,
            };
        }
        // 🔺 TIER 3: CLAUDE VISION (dekont varsa)
        if (ctx.message?.photo && ctx.message.photo.length > 0) {
            log.debug({ photoCount: ctx.message.photo.length }, "Tier 3: Dekont OCR");
            try {
                const photo = ctx.message.photo[ctx.message.photo.length - 1];
                const file = await ctx.getFile();
                const token = process.env.TELEGRAM_BOT_TOKEN || 'missing';
                const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
                // Base64 fetch
                const response = await fetch(url);
                if (!response.ok)
                    throw new Error(`Photo fetch failed: ${response.status}`);
                const buffer = await response.arrayBuffer();
                const base64 = Buffer.from(buffer).toString("base64");
                const mediaType = "image/jpeg"; // Telegram photos are JPEG
                const visionPrompt = `
Decode this banking receipt/dekont and extract:
- Bank name
- Sender name & IBAN
- Receiver name & IBAN
- Amount & currency
- Reference code
- Timestamp

Return JSON: {
  "bank_name": "...",
  "sender_name": "...",
  "sender_iban": "TR...",
  "receiver_name": "...",
  "receiver_iban": "TR...",
  "amount": 1000.50,
  "currency": "TRL",
  "reference_code": "...",
  "timestamp_iso": "2026-05-20T12:30:00Z"
}
`;
                const visionResponse = await callClaude({
                    task: "receipt_parse",
                    userMessage: visionPrompt,
                    imageBase64: base64,
                    maxTokens: 1024,
                });
                const latency = Date.now() - startTime;
                log.info({ latencyMs: latency }, "✅ Tier 3: Claude Vision dekont parse");
                return {
                    tier: "vision",
                    intent: "receipt_parsed",
                    response: visionResponse.content,
                    latencyMs: latency,
                };
            }
            catch (err) {
                log.warn({ err }, "Tier 3 Vision failed, fallback to Claude");
                // Fall through to tier 4
            }
        }
        // 🔺 TIER 4: CLAUDE HAIKU (fallback)
        log.debug({ text: text.slice(0, 80) }, "Tier 4: Claude Haiku fallback");
        const claudeResponse = await callClaude({
            task: "support_reply",
            userMessage: text,
            systemExtra: "Keep responses concise and in Turkish.",
            maxTokens: 512,
        });
        const latency = Date.now() - startTime;
        log.info({ latencyMs: latency }, "⚠️ Tier 4: Claude Haiku fallback");
        return {
            tier: "claude",
            intent: "general",
            response: claudeResponse.content,
            latencyMs: latency,
        };
    }
    catch (err) {
        log.error({ err, text: text.slice(0, 80) }, "Dispatch error");
        const latency = Date.now() - startTime;
        return {
            tier: "claude",
            intent: "error",
            response: "❌ Bir hata oluştu. Lütfen daha sonra tekrar dene.",
            latencyMs: latency,
        };
    }
}
/**
 * Session'a logging ve analytics
 */
export async function logDispatchMetrics(userId, result) {
    try {
        const key = `metrics:dispatch:${userId}`;
        const currentStats = await redis.get(key);
        const stats = currentStats
            ? JSON.parse(currentStats)
            : { rules: 0, ollama: 0, vision: 0, claude: 0, totalLatency: 0 };
        stats[result.tier] = (stats[result.tier] ?? 0) + 1;
        stats.totalLatency = (stats.totalLatency ?? 0) + result.latencyMs;
        // 24 saat TTL
        await redis.setex(key, 86400, JSON.stringify(stats));
    }
    catch (err) {
        log.warn({ err }, "Metrics logging failed");
    }
}
