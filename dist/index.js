// ============================================================
// DEUS — Ana Giriş Noktası
// src/index.ts
// Routing zinciri: Kural → Ollama ($0) → Haiku (~$3/ay) → Sonnet (~$2/ay)
// ============================================================
import "dotenv/config";
import { Bot, session } from "grammy";
import { createClient } from "@supabase/supabase-js";
import Redis from "ioredis";
import pino from "pino";
import { detectIntent } from "./ai/ollama.js";
import { handleSupportMessage } from "./modules/support/handler.js";
import { buildEscalationMessage } from "./modules/support/teach.js";
// ── Logger ────────────────────────────────────────────────────
export const log = pino({
    level: process.env.LOG_LEVEL ?? "info",
    transport: process.env.NODE_ENV !== "production"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
});
// ── Ortam Değişkeni Doğrulama ─────────────────────────────────
function requireEnv(key) {
    const val = process.env[key];
    if (!val)
        throw new Error(`Eksik ortam değişkeni: ${key}`);
    return val;
}
const BOT_TOKEN = requireEnv("TELEGRAM_BOT_TOKEN");
const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_KEY = requireEnv("SUPABASE_SERVICE_KEY");
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
// ── Servis Bağlantıları ───────────────────────────────────────
export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
});
export const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
});
// ── Bot ───────────────────────────────────────────────────────
const bot = new Bot(BOT_TOKEN);
// Session middleware
bot.use(session({
    initial() {
        return {
            step: null,
            data: {},
            conversationHistory: [],
            siteId: process.env.DEFAULT_SITE_ID ?? "",
        };
    },
}));
// ── Logging Middleware ────────────────────────────────────────
bot.use(async (ctx, next) => {
    const start = Date.now();
    const user = ctx.from;
    log.debug({
        user_id: user?.id,
        username: user?.username,
    }, "Gelen güncelleme");
    await next();
    log.debug({ ms: Date.now() - start }, "İşlendi");
});
// ── Komutlar ─────────────────────────────────────────────────
bot.command("start", async (ctx) => {
    await ctx.reply(`👋 DEUS aktif.\n\nMevcut komutlar:\n/yardim — Komut listesi\n/durum — Sistem durumu\n/kasa — Anlık kasa`);
});
bot.command("yardim", async (ctx) => {
    await ctx.reply(`📋 *DEUS Komutları*\n\n` +
        `/kasa [site] — Anlık kasa durumu\n` +
        `/mutabakat [site] — Günlük mutabakat\n` +
        `/dp [departman] — DP bakiye & limit\n` +
        `/uye [id] — Üye profili\n` +
        `/risk — Günlük risk özeti\n` +
        `/blacklist [tc/iban] — Kara liste kontrolü\n` +
        `/vardiya — Aktif operatörler`, { parse_mode: "Markdown" });
});
bot.command("durum", async (ctx) => {
    let redisStatus = "❌ Bağlantı yok";
    try {
        const pong = await redis.ping();
        redisStatus = pong === "PONG" ? "✅ Aktif" : "⚠️ Hata";
    }
    catch {
        redisStatus = "❌ Kapalı";
    }
    let dbStatus = "❌ Bağlantı yok";
    try {
        const { error } = await supabase.from("sites").select("id").limit(1);
        dbStatus = error ? `⚠️ ${error.message}` : "✅ Aktif";
    }
    catch {
        dbStatus = "❌ Kapalı";
    }
    let ollamaStatus = "❌ Kapalı";
    try {
        const res = await fetch("http://localhost:11434/api/tags", {
            signal: AbortSignal.timeout(2000),
        });
        ollamaStatus = res.ok ? "✅ Aktif (qwen2.5:7b)" : "⚠️ Hata";
    }
    catch {
        ollamaStatus = "❌ Kapalı";
    }
    await ctx.reply(`🔍 *Sistem Durumu*\n\n` +
        `Database : ${dbStatus}\n` +
        `Redis    : ${redisStatus}\n` +
        `Ollama   : ${ollamaStatus}\n` +
        `Bot      : ✅ Çalışıyor\n` +
        `Versiyon : v0.2.0`, { parse_mode: "Markdown" });
});
// ── Admin Komutları ───────────────────────────────────────────
// /ogret komutu — eskalasyona cevap ver / KB'ye öğret
bot.command("ogret", async (ctx) => {
    const adminIds = (process.env.TELEGRAM_ADMIN_IDS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    if (!adminIds.includes(String(ctx.from?.id))) {
        await ctx.reply("⛔ Bu komut sadece adminler içindir.");
        return;
    }
    // Format: /ogret <escalation_id> <cevap>
    const args = ctx.message?.text?.split(" ").slice(1) ?? [];
    if (args.length < 2) {
        await ctx.reply("📚 *Kullanım:*\n`/ogret <eskalasyon_id> <cevap>`\n\nÖrnek:\n`/ogret esc_abc123 Yatırım 1-3 iş günü içinde işlenir.`", { parse_mode: "Markdown" });
        return;
    }
    const escalationId = args[0];
    const answer = args.slice(1).join(" ");
    try {
        const { data: esc, error } = await supabase
            .from("escalations")
            .select("*")
            .eq("id", escalationId)
            .single();
        if (error || !esc) {
            await ctx.reply(`❌ Eskalasyon bulunamadı: ${escalationId}`);
            return;
        }
        const { error: kbError } = await supabase.from("knowledge_base").upsert({
            question: esc.question,
            answer,
            site_id: esc.site_id,
            category: esc.category ?? "general",
            confidence: 0.9,
            source: "admin_teaching",
            created_by: String(ctx.from?.id),
        });
        if (kbError)
            throw kbError;
        await supabase
            .from("escalations")
            .update({ status: "resolved", resolved_at: new Date().toISOString() })
            .eq("id", escalationId);
        await ctx.reply(`✅ *Öğretildi!*\n\n` +
            `❓ Soru: _${esc.question.slice(0, 150)}_\n` +
            `💡 Cevap: _${answer.slice(0, 200)}_\n\n` +
            `DEUS bir sonraki soruda bunu hatırlayacak.`, { parse_mode: "Markdown" });
        log.info({ escalationId, answer: answer.slice(0, 50) }, "KB öğretme tamamlandı");
    }
    catch (err) {
        log.error({ err, escalationId }, "/ogret hatası");
        await ctx.reply("❌ Bir hata oluştu, lütfen tekrar dene.");
    }
});
// /onay komutu — taslak onayı
bot.command("onay", async (ctx) => {
    const adminIds = (process.env.TELEGRAM_ADMIN_IDS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    if (!adminIds.includes(String(ctx.from?.id))) {
        await ctx.reply("⛔ Bu komut sadece adminler içindir.");
        return;
    }
    const args = ctx.message?.text?.split(" ").slice(1) ?? [];
    if (!args[0]) {
        await ctx.reply("Kullanım: `/onay <eskalasyon_id>`", { parse_mode: "Markdown" });
        return;
    }
    const escalationId = args[0];
    try {
        const { data: esc } = await supabase
            .from("escalations")
            .select("*")
            .eq("id", escalationId)
            .single();
        if (!esc?.draft_reply) {
            await ctx.reply("❌ Taslak yanıt bulunamadı.");
            return;
        }
        await supabase.from("knowledge_base").upsert({
            question: esc.question,
            answer: esc.draft_reply,
            site_id: esc.site_id,
            category: esc.category ?? "general",
            confidence: 0.85,
            source: "approved_draft",
            created_by: String(ctx.from?.id),
        });
        await supabase
            .from("escalations")
            .update({ status: "resolved", resolved_at: new Date().toISOString() })
            .eq("id", escalationId);
        await ctx.reply(`✅ Taslak onaylandı ve KB'ye eklendi.`);
    }
    catch (err) {
        log.error({ err }, "/onay hatası");
        await ctx.reply("❌ Hata oluştu.");
    }
});
// ── Fotoğraf Handler — Dekont parse ──────────────────────────
bot.on("message:photo", async (ctx) => {
    await ctx.reply("📄 Dekont alındı. İşleniyor...\n_(Vision analizi başlatıldı)_", { parse_mode: "Markdown" });
    // TODO: Faz 2 — receipt parser entegrasyonu buraya gelecek
    // import { parseReceipt } from "./modules/receipt/parser.js"
});
// ── Ana Mesaj Handler — Tam Routing Zinciri ───────────────────
bot.on("message:text", async (ctx) => {
    const text = ctx.message.text.trim();
    const memberId = String(ctx.from?.id ?? "unknown");
    const memberName = ctx.from?.first_name ?? null;
    const siteId = ctx.session.siteId ?? process.env.DEFAULT_SITE_ID ?? "";
    if (text.startsWith("/")) {
        await ctx.reply("Komut tanınmadı. /yardim ile mevcut komutları gör.");
        return;
    }
    await ctx.replyWithChatAction("typing");
    try {
        const intent = await detectIntent(text);
        log.debug({ intent, memberId }, "Intent tespit edildi");
        const result = await handleSupportMessage({
            memberId,
            memberName,
            siteId,
            message: text,
            conversationHistory: ctx.session.conversationHistory ?? [],
        });
        if (!ctx.session.conversationHistory)
            ctx.session.conversationHistory = [];
        ctx.session.conversationHistory.push({ role: "user", content: text }, { role: "assistant", content: result.reply ?? "" });
        if (ctx.session.conversationHistory.length > 20) {
            ctx.session.conversationHistory = ctx.session.conversationHistory.slice(-20);
        }
        if (result.strategy === "auto" && result.reply) {
            await ctx.reply(result.reply);
        }
        else if (result.strategy === "draft_approval" && result.reply) {
            await ctx.reply(result.reply);
            const adminChatId = process.env.TELEGRAM_ADMIN_GROUP_ID;
            if (adminChatId && result.escalationId) {
                await ctx.api.sendMessage(adminChatId, `📋 *Taslak Onay Bekleniyor*\n` +
                    `👤 Üye: ${memberName ?? memberId}\n` +
                    `❓ Soru: _${text.slice(0, 200)}_\n\n` +
                    `/onay ${result.escalationId} — onaylamak için\n` +
                    `/red ${result.escalationId} — reddetmek için`, { parse_mode: "Markdown" });
            }
        }
        else if (result.strategy === "escalate") {
            await ctx.reply(result.reply ?? "Bu konuyu yetkililere iletiyorum, kısa sürede dönüş yapılacak.");
            const adminChatId = process.env.TELEGRAM_ADMIN_GROUP_ID;
            if (adminChatId && result.escalationId) {
                const escMsg = buildEscalationMessage({
                    escalationId: result.escalationId,
                    memberName,
                    question: text,
                    category: result.category ?? "general",
                    confidence: result.confidence,
                    siteId,
                });
                await ctx.api.sendMessage(adminChatId, escMsg, { parse_mode: "Markdown" });
            }
        }
    }
    catch (err) {
        log.error({ err, memberId }, "Mesaj işleme hatası");
        await ctx.reply("Bir hata oluştu. Lütfen tekrar deneyin.");
    }
});
// ── Error Handler ─────────────────────────────────────────────
bot.catch((err) => {
    const { ctx, error } = err;
    log.error({ error, update: ctx.update }, "Bot hatası");
    ctx.reply("Bir hata oluştu. Lütfen tekrar dene.").catch(() => { });
});
// ── Başlatma ─────────────────────────────────────────────────
async function main() {
    log.info("DEUS v0.2.0 başlatılıyor...");
    await redis.connect();
    log.info("Redis bağlantısı kuruldu");
    const { error } = await supabase.from("sites").select("id").limit(1);
    if (error) {
        log.warn({ error }, "Supabase uyarı — tablolar henüz oluşturulmamış olabilir");
    }
    else {
        log.info("Supabase bağlantısı kuruldu");
    }
    try {
        const res = await fetch("http://localhost:11434/api/tags", {
            signal: AbortSignal.timeout(2000),
        });
        if (res.ok) {
            log.info("Ollama aktif — qwen2.5:7b hazır ($0 routing)");
        }
        else {
            log.warn("Ollama yanıt vermedi — fallback Haiku'ya geçecek");
        }
    }
    catch {
        log.warn("Ollama kapalı — fallback Haiku'ya geçecek");
    }
    await bot.start({
        onStart: (info) => {
            log.info(`DEUS aktif → @${info.username}`);
        },
    });
}
process.on("SIGINT", async () => {
    log.info("DEUS kapatılıyor...");
    await bot.stop();
    await redis.quit();
    process.exit(0);
});
process.on("SIGTERM", async () => {
    await bot.stop();
    await redis.quit();
    process.exit(0);
});
main().catch((err) => {
    log.error(err, "Başlatma hatası");
    process.exit(1);
});
