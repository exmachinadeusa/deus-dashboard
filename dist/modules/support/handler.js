// ============================================================
// DEUS — Müşteri Destek Handler
// src/modules/support/handler.ts
//
// Confidence bazlı üç katmanlı yanıt sistemi:
//   > 0.85 → Otomatik cevap ver
//   0.50–0.85 → Taslak hazırla, operatöre onayla
//   < 0.50 → "Bilmiyorum" + admin eskalasyon + öğren
//
// Her cevap KB'ye yazılır → Sistem büyür.
// ============================================================
import { supabase, redis, log } from "../../index.js";
import { callClaude } from "../../ai/router.js";
import { detectIntent, adaptKbAnswer } from "../../ai/ollama.js";
import { recordEvent } from "../memory/engine.js";
const THRESHOLDS = {
    AUTO: 0.85,
    DRAFT: 0.50,
};
// ── ANA HANDLER ──────────────────────────────────────────────
export async function handleSupportMessage(opts) {
    const eventId = await recordEvent({
        type: "support_message",
        actorType: "member",
        actorId: opts.memberId,
        siteId: opts.siteId,
        payload: { message: opts.message.slice(0, 500) },
    });
    const intent = await detectIntent(opts.message);
    const detectedIntent = intent?.intent ?? "general_info";
    const category = intentToCategory(detectedIntent);
    log.debug({ intent: detectedIntent, category, confidence: intent?.confidence }, "Intent tespit edildi");
    const kbMatch = await searchKnowledgeBase(opts.message, category, opts.siteId);
    const confidence = calculateConfidence({
        kbScore: kbMatch?.score ?? 0,
        intentConfidence: intent?.confidence ?? 0,
        hasKbEntry: !!kbMatch,
    });
    log.info({ confidence, strategy: strategyFromConfidence(confidence), kbMatch: !!kbMatch }, "Destek yanıt stratejisi");
    const strategy = strategyFromConfidence(confidence);
    // ── OTOMATİK YANITLA ───────────────────────────────────────
    if (strategy === "auto" && kbMatch) {
        const reply = await buildAutoReply({
            memberName: opts.memberName,
            message: opts.message,
            kbEntry: kbMatch,
            siteId: opts.siteId,
        });
        incrementKbUsage(kbMatch.id, true).catch(() => { });
        await logConversation({
            memberId: opts.memberId,
            siteId: opts.siteId,
            message: opts.message,
            reply,
            resolution: "resolved",
            aiConfidence: confidence,
            autoResolved: true,
            eventId,
        });
        await recordEvent({
            type: "support_auto_replied",
            actorType: "bot",
            actorId: "deus",
            siteId: opts.siteId,
            payload: { kbEntryId: kbMatch.id, confidence },
        });
        return {
            strategy: "auto",
            confidence,
            reply,
            kbEntryId: kbMatch.id,
            intent: detectedIntent,
            category,
        };
    }
    // ── TASLAK + OPERATÖR ONAYI ────────────────────────────────
    if (strategy === "draft_approval" && kbMatch) {
        const draft = await buildAutoReply({
            memberName: opts.memberName,
            message: opts.message,
            kbEntry: kbMatch,
            siteId: opts.siteId,
        });
        const convId = await logConversation({
            memberId: opts.memberId,
            siteId: opts.siteId,
            message: opts.message,
            reply: draft,
            resolution: "escalated",
            aiConfidence: confidence,
            autoResolved: false,
            eventId,
        });
        if (convId) {
            await redis.setex(`draft:${convId}`, 3600, JSON.stringify({
                draft,
                memberId: opts.memberId,
                siteId: opts.siteId,
                kbEntryId: kbMatch.id,
            }));
        }
        return {
            strategy: "draft_approval",
            confidence,
            reply: draft,
            kbEntryId: kbMatch.id,
            escalationId: convId ?? undefined,
            intent: detectedIntent,
            category,
        };
    }
    // ── ESKALASYON — BİLMİYORUM ────────────────────────────────
    const escalationId = await createEscalation({
        memberId: opts.memberId,
        memberName: opts.memberName,
        siteId: opts.siteId,
        message: opts.message,
        intent: detectedIntent,
        category,
        confidence,
        eventId: eventId ?? undefined,
    });
    await recordEvent({
        type: "support_escalated",
        actorType: "bot",
        actorId: "deus",
        siteId: opts.siteId,
        payload: { reason: "low_confidence", confidence, intent: detectedIntent, escalationId },
    });
    return {
        strategy: "escalate",
        confidence,
        reply: buildUnknownReply(opts.memberName),
        escalationId: escalationId ?? undefined,
        intent: detectedIntent,
        category,
    };
}
async function searchKnowledgeBase(message, category, siteId) {
    const cacheKey = `kb:${Buffer.from(message.slice(0, 100)).toString("base64")}:${category}`;
    const cached = await redis.get(cacheKey);
    if (cached)
        return JSON.parse(cached);
    const { data: exact } = await supabase
        .from("knowledge_base")
        .select("id, question_pattern, answer_template, category, variables")
        .eq("is_active", true)
        .eq("category", category)
        .textSearch("question_pattern", message.split(" ").slice(0, 5).join(" & "), {
        type: "websearch",
    })
        .order("usage_count", { ascending: false })
        .limit(1)
        .single();
    if (exact) {
        const siteVars = await getSiteVariables(siteId);
        const match = {
            id: exact["id"],
            questionPattern: exact["question_pattern"],
            answerTemplate: exact["answer_template"],
            category: exact["category"],
            score: 0.90,
            variables: siteVars,
        };
        await redis.setex(cacheKey, 300, JSON.stringify(match));
        return match;
    }
    const { data: general } = await supabase
        .from("knowledge_base")
        .select("id, question_pattern, answer_template, category, variables")
        .eq("is_active", true)
        .textSearch("question_pattern", message.split(" ").slice(0, 3).join(" | "), {
        type: "websearch",
    })
        .order("success_rate", { ascending: false })
        .limit(1)
        .single();
    if (general) {
        const siteVars = await getSiteVariables(siteId);
        const match = {
            id: general["id"],
            questionPattern: general["question_pattern"],
            answerTemplate: general["answer_template"],
            category: general["category"],
            score: 0.65,
            variables: siteVars,
        };
        await redis.setex(cacheKey, 300, JSON.stringify(match));
        return match;
    }
    return null;
}
// ── CEVAP ÜRET ───────────────────────────────────────────────
async function buildAutoReply(opts) {
    const adapted = await adaptKbAnswer({
        memberName: opts.memberName ?? "Üyemiz",
        question: opts.message,
        answerTemplate: opts.kbEntry.answerTemplate,
        siteVariables: opts.kbEntry.variables,
    });
    if (adapted)
        return adapted;
    const response = await callClaude({
        task: "support_reply",
        userMessage: opts.message,
        systemExtra: `
Bilgi tabanı cevabı: "${opts.kbEntry.answerTemplate}"
Üye adı: ${opts.memberName ?? "Üyemiz"}
Bu bilgiyi kullanarak samimi, kısa bir Türkçe yanıt yaz.`,
    });
    return response.content || opts.kbEntry.answerTemplate;
}
function buildUnknownReply(memberName) {
    const name = memberName ? `${memberName}, ` : "";
    return `${name}bu konuda size en doğru bilgiyi verebilmek için konuyu yetkililerimize iletiyorum. En kısa sürede dönüş yapılacaktır.`;
}
// ── ESKALASYON KAYDI ─────────────────────────────────────────
async function createEscalation(opts) {
    const { data } = await supabase
        .from("conversation_logs")
        .insert({
        site_id: opts.siteId,
        member_id: opts.memberId,
        messages: [{ role: "user", content: opts.message, ts: new Date().toISOString() }],
        category: opts.category,
        resolution: "escalated",
        ai_confidence: opts.confidence,
        auto_resolved: false,
        escalation_reason: `Düşük güven skoru: ${(opts.confidence * 100).toFixed(0)}% — intent: ${opts.intent}`,
    })
        .select("id")
        .single();
    return data?.["id"] ?? null;
}
// ── YARDIMCI FONKSİYONLAR ────────────────────────────────────
function strategyFromConfidence(confidence) {
    if (confidence >= THRESHOLDS.AUTO)
        return "auto";
    if (confidence >= THRESHOLDS.DRAFT)
        return "draft_approval";
    return "escalate";
}
function calculateConfidence(opts) {
    if (!opts.hasKbEntry)
        return 0.2;
    return Math.min(0.99, opts.kbScore * 0.7 + opts.intentConfidence * 0.3);
}
function intentToCategory(intent) {
    const map = {
        deposit_issue: "deposit",
        withdrawal_issue: "withdrawal",
        account_issue: "account",
        bonus_query: "bonus",
        general_info: "general",
        complaint: "general",
        urgent: "general",
    };
    return map[intent] ?? "general";
}
async function getSiteVariables(siteId) {
    const cacheKey = `site:vars:${siteId}`;
    const cached = await redis.get(cacheKey);
    if (cached)
        return JSON.parse(cached);
    const { data } = await supabase
        .from("sites")
        .select("name, code")
        .eq("id", siteId)
        .single();
    const vars = { site_name: data?.["name"] ?? "", site_code: data?.["code"] ?? "" };
    await redis.setex(cacheKey, 3600, JSON.stringify(vars));
    return vars;
}
async function incrementKbUsage(kbId, success) {
    await supabase.rpc("increment_kb_usage", { kb_id: kbId, is_success: success });
}
async function logConversation(opts) {
    const { data } = await supabase
        .from("conversation_logs")
        .insert({
        site_id: opts.siteId,
        member_id: opts.memberId,
        messages: [
            { role: "user", content: opts.message, ts: new Date().toISOString() },
            { role: "assistant", content: opts.reply, ts: new Date().toISOString() },
        ],
        resolution: opts.resolution,
        ai_confidence: opts.aiConfidence,
        auto_resolved: opts.autoResolved,
    })
        .select("id")
        .single();
    return data?.["id"] ?? null;
}
