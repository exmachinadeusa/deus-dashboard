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

// ── TİPLER ───────────────────────────────────────────────────

export interface EventPayload {
  type: string;
  actorType: "bot" | "operator" | "member" | "scheduler";
  actorId?: string;
  siteId?: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface DecisionInput {
  eventId: string;
  situation: string;
  actionTaken: string;
  reasoning: string;
  siteId?: string;
  decisionLevel?: string;
  confidence?: number;
}

export interface SimilarDecision {
  id: string;
  situation: string;
  actionTaken: string;
  reasoning: string;
  outcome: string | null;
  feedbackScore: number | null;
  similarity: number;
}

// ── EVENT KAYDET ─────────────────────────────────────────────
export async function recordEvent(input: EventPayload): Promise<string | null> {
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

    return data.id as string;
  } catch (err) {
    log.error({ err }, "Event kayıt hatası");
    return null;
  }
}

// ── EVENT SONUCUNU GÜNCELLE ───────────────────────────────────
export async function updateEventOutcome(
  eventId: string,
  outcome: "success" | "failure" | "partial",
  outcomeData?: Record<string, unknown>
): Promise<void> {
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
async function generateEmbedding(_text: string): Promise<number[] | null> {
  log.debug("Embedding üretimi Faz 2'de aktif olacak");
  return null;
}

// ── KARAR KAYDET ─────────────────────────────────────────────
export async function rememberDecision(input: DecisionInput): Promise<void> {
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

    if (error) log.warn({ error }, "Karar hafızaya yazılamadı");
  } catch (err) {
    log.error({ err }, "rememberDecision hatası");
  }
}

// ── BENZERİ DURUMU BUL ───────────────────────────────────────
export async function findSimilarDecisions(
  situation: string,
  limit = 3
): Promise<SimilarDecision[]> {
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

      return (data ?? []).map((row: Record<string, unknown>) => ({
        id: row["id"] as string,
        situation: row["situation"] as string,
        actionTaken: row["action_taken"] as string,
        reasoning: row["reasoning"] as string,
        outcome: row["outcome"] as string | null,
        feedbackScore: row["feedback_score"] as number | null,
        similarity: row["similarity"] as number,
      }));
    } else {
      const { data } = await supabase
        .from("decision_memory")
        .select("id, situation, action_taken, reasoning, outcome, feedback_score")
        .eq("outcome", "correct")
        .order("created_at", { ascending: false })
        .limit(limit);

      return (data ?? []).map((row) => ({
        id: row["id"] as string,
        situation: row["situation"] as string,
        actionTaken: row["action_taken"] as string,
        reasoning: row["reasoning"] as string,
        outcome: row["outcome"] as string | null,
        feedbackScore: row["feedback_score"] as number | null,
        similarity: 0,
      }));
    }
  } catch (err) {
    log.error({ err }, "findSimilarDecisions hatası");
    return [];
  }
}

// ── PROMPT ŞABLONU AL ────────────────────────────────────────
export async function getPrompt(
  key: string,
  variables: Record<string, string> = {}
): Promise<{ content: string; model: string; maxTokens: number } | null> {
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

    let content = data["content"] as string;
    for (const [varName, value] of Object.entries(variables)) {
      content = content.replaceAll(`{{${varName}}}`, value);
    }

    return {
      content,
      model: data["model"] as string,
      maxTokens: data["max_tokens"] as number,
    };
  } catch (err) {
    log.error({ err, key }, "getPrompt hatası");
    return null;
  }
}

// ── ÖĞRENME KUYRUĞUNA EKLE ───────────────────────────────────
export async function queueForLearning(
  batchType: string,
  ids: {
    eventIds?: string[];
    convIds?: string[];
    decisionIds?: string[];
  }
): Promise<void> {
  const { error } = await supabase.from("learning_queue").insert({
    batch_type: batchType,
    event_ids: ids.eventIds ?? [],
    conv_ids: ids.convIds ?? [],
    decision_ids: ids.decisionIds ?? [],
  });

  if (error) log.warn({ error }, "Öğrenme kuyruğuna eklenemedi");
}

// ── KARAR GERİ BİLDİRİMİ ────────────────────────────────────
export async function recordFeedback(
  decisionId: string,
  outcome: "correct" | "incorrect",
  score?: number,
  note?: string,
  wasOverridden = false
): Promise<void> {
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
