// ============================================================
// DEUS — Memory Engine
// src/modules/memory/engine.ts
//
// Her kararı kaydeder, geçmişten öğrenir, vektör arar.
// Bu modül bota "hafıza" kazandırır.
// ============================================================
import Anthropic from "@anthropic-ai/sdk";
import { supabase, log } from "../../index.js";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
// ── EVENT KAYDET ─────────────────────────────────────────────
export async function recordEvent(input) {
    try {
        const { data, error } = await supabase
            .from("events")
            .insert({
            type: input.type,
            actor_type: input.actorType,
            actor_id: input.actorId,
            site_id: input.siteId,
            payload: input.payload,
            metadata: input.metadata ?? {},
        })
            .select("id")
            .single();
        if (error) {
            log.warn({ error }, "Event kaydedilemedi");
            return null;
        }
        return data.id;
    }
    catch (err) {
        log.error({ err }, "Event kayıt hatası");
        return null;
    }
}
// ── EVENT SONUCUNU GÜNCELLE ───────────────────────────────────
export async function updateEventOutcome(eventId, outcome, outcomeData) {
    await supabase
        .from("events")
        .update({
        outcome,
        outcome_data: outcomeData,
        is_processed: true,
        processed_at: new Date().toISOString(),
    })
        .eq("id", eventId);
}
// ── EMBEDDING ÜRET ───────────────────────────────────────────
// TODO: Faz 2 — voyage-3 veya text-embedding-3-small ile gerçek embedding
async function generateEmbedding(_text) {
    log.debug("Embedding üretimi Faz 2'de aktif olacak");
    return null;
}
// ── KARAR KAYDET ─────────────────────────────────────────────
export async function rememberDecision(input) {
    try {
        const situationText = `${input.situation}\nAksiyon: ${input.actionTaken}\nGerekçe: ${input.reasoning}`;
        const embedding = await generateEmbedding(situationText);
        const { error } = await supabase.from("decision_memory").insert({
            event_id: input.eventId,
            situation: input.situation,
            action_taken: input.actionTaken,
            reasoning: input.reasoning,
            embedding,
            site_id: input.siteId,
            decision_level: input.decisionLevel,
            confidence: input.confidence,
        });
        if (error)
            log.warn({ error }, "Karar hafızaya yazılamadı");
    }
    catch (err) {
        log.error({ err }, "rememberDecision hatası");
    }
}
// ── BENZERİ DURUMU BUL ───────────────────────────────────────
export async function findSimilarDecisions(situation, limit = 3) {
    try {
        const embedding = await generateEmbedding(situation);
        if (embedding) {
            const { data, error } = await supabase.rpc("match_decisions", {
                query_embedding: embedding,
                match_threshold: 0.75,
                match_count: limit,
            });
            if (error) {
                log.warn({ error }, "Vektör arama hatası");
                return [];
            }
            return (data ?? []).map((row) => ({
                id: row["id"],
                situation: row["situation"],
                actionTaken: row["action_taken"],
                reasoning: row["reasoning"],
                outcome: row["outcome"],
                feedbackScore: row["feedback_score"],
                similarity: row["similarity"],
            }));
        }
        else {
            const { data } = await supabase
                .from("decision_memory")
                .select("id, situation, action_taken, reasoning, outcome, feedback_score")
                .eq("outcome", "correct")
                .order("created_at", { ascending: false })
                .limit(limit);
            return (data ?? []).map((row) => ({
                id: row["id"],
                situation: row["situation"],
                actionTaken: row["action_taken"],
                reasoning: row["reasoning"],
                outcome: row["outcome"],
                feedbackScore: row["feedback_score"],
                similarity: 0,
            }));
        }
    }
    catch (err) {
        log.error({ err }, "findSimilarDecisions hatası");
        return [];
    }
}
// ── PROMPT ŞABLONU AL ────────────────────────────────────────
export async function getPrompt(key, variables = {}) {
    try {
        const { data, error } = await supabase
            .from("prompt_templates")
            .select("content, model, max_tokens")
            .eq("key", key)
            .eq("is_active", true)
            .single();
        if (error || !data) {
            log.warn({ key, error }, "Prompt şablonu bulunamadı");
            return null;
        }
        let content = data["content"];
        for (const [varName, value] of Object.entries(variables)) {
            content = content.replaceAll(`{{${varName}}}`, value);
        }
        return {
            content,
            model: data["model"],
            maxTokens: data["max_tokens"],
        };
    }
    catch (err) {
        log.error({ err, key }, "getPrompt hatası");
        return null;
    }
}
// ── ÖĞRENME KUYRUĞUNA EKLE ───────────────────────────────────
export async function queueForLearning(batchType, ids) {
    const { error } = await supabase.from("learning_queue").insert({
        batch_type: batchType,
        event_ids: ids.eventIds ?? [],
        conv_ids: ids.convIds ?? [],
        decision_ids: ids.decisionIds ?? [],
    });
    if (error)
        log.warn({ error }, "Öğrenme kuyruğuna eklenemedi");
}
// ── KARAR GERİ BİLDİRİMİ ────────────────────────────────────
export async function recordFeedback(decisionId, outcome, score, note, wasOverridden = false) {
    await supabase
        .from("decision_memory")
        .update({
        outcome,
        feedback_score: score,
        outcome_note: note,
        was_overridden: wasOverridden,
        reviewed_at: new Date().toISOString(),
    })
        .eq("id", decisionId);
    log.debug({ decisionId, outcome, wasOverridden }, "Karar geri bildirimi kaydedildi");
}
