// ============================================================
// DEUS — Admin Öğretme Arayüzü
// src/modules/support/teach.ts
//
// Döngü:
//   1. Bot bilmediği soruyu admin'e iletir
//   2. Admin Telegram'dan cevap verir
//   3. Bot cevabı KB'ye yazar → artık biliyor
//   4. Bir sonraki aynı soruda otomatik yanıtlar
//
// Admin komutları:
//   /ogret [konu] [cevap]   → Direkt KB'ye yaz
//   /duzelt [id] [cevap]    → Var olan KB kaydını düzelt
//   /onay [conv_id]         → Taslak cevabı onayla
//   /red [conv_id] [cevap]  → Taslağı reddet ve doğru cevabı ver
//   /bilgi                  → Bot'un ne bildiğini listele
// ============================================================

import { supabase, redis, log } from "../../index.js";
import { callClaude, parseJsonResponse } from "../../ai/router.js";
import { recordFeedback } from "../memory/engine.js";

// ── TİPLER ───────────────────────────────────────────────────

export interface TeachResult {
  success: boolean;
  message: string;
  kbEntryId?: string;
}

export interface EscalationDetails {
  id: string;
  memberId: string;
  memberName: string | null;
  originalQuestion: string;
  category: string;
  intent: string;
  createdAt: string;
  siteId: string;
}

// ── ADMIN'E ESKALASYON BİLDİRİMİ ─────────────────────────────

export function buildEscalationMessage(opts: {
  escalationId: string;
  memberName: string | null;
  question: string;
  category: string;
  confidence: number;
  siteId: string;
}): string {
  return (
    `🆘 *DEUS — Bilgi Eksikliği*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `👤 Üye: ${opts.memberName ?? "Anonim"}\n` +
    `❓ Soru: _${opts.question}_\n` +
    `📂 Kategori: ${opts.category}\n` +
    `🎯 Güven: %${Math.round(opts.confidence * 100)}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `Bot bu soruya cevap veremedi.\n\n` +
    `Cevaplamak için:\n` +
    `/ogret ${opts.escalationId} [cevabınız]\n\n` +
    `Bu cevap knowledge base'e eklenecek ve bot bir daha bu soruyla karşılaştığında kendi yanıtlayacak.`
  );
}

// ── /ogret KOMUTU ────────────────────────────────────────────

export async function teachFromEscalation(opts: {
  escalationId: string;
  adminAnswer: string;
  adminId: number;
  adminName: string;
}): Promise<TeachResult> {

  const { data: conv } = await supabase
    .from("conversation_logs")
    .select("id, member_id, messages, category, site_id, ai_confidence")
    .eq("id", opts.escalationId)
    .single();

  if (!conv) {
    return { success: false, message: "Eskalasyon kaydı bulunamadı. ID'yi kontrol et." };
  }

  const messages = conv["messages"] as Array<{ role: string; content: string }>;
  const originalQuestion = messages.find((m) => m.role === "user")?.content ?? "";
  const category = conv["category"] as string ?? "general";

  const normalizeResponse = await callClaude({
    task: "support_reply",
    userMessage: `Şu soruyu genel bir soru kalıbına dönüştür. Özel isimler, tutarlar olmadan.
Sadece normalize edilmiş soruyu döndür, başka hiçbir şey yazma.

Soru: "${originalQuestion}"`,
  });

  const normalizedQuestion = normalizeResponse.content.trim() || originalQuestion;

  const { data: kbEntry, error } = await supabase
    .from("knowledge_base")
    .insert({
      category,
      question_pattern: normalizedQuestion,
      answer_template: opts.adminAnswer,
      source: "learned",
      variables: {},
    })
    .select("id")
    .single();

  if (error) {
    log.error({ error }, "KB kaydı oluşturulamadı");
    return { success: false, message: `Hata: ${error.message}` };
  }

  await supabase
    .from("conversation_logs")
    .update({
      resolution: "resolved",
      learning_notes: `Admin ${opts.adminName} tarafından öğretildi. KB ID: ${kbEntry?.["id"]}`,
    })
    .eq("id", opts.escalationId);

  await supabase.from("audit_log").insert({
    actor: String(opts.adminId),
    action: "teach_bot",
    entity_type: "knowledge_base",
    entity_id: kbEntry?.["id"] as string | undefined,
    after_state: {
      question: normalizedQuestion,
      answer: opts.adminAnswer,
      source: "admin_teach",
      admin: opts.adminName,
    },
    ai_reasoning: `Admin doğrudan öğretti. Orijinal soru: "${originalQuestion.slice(0, 200)}"`,
  });

  log.info(
    { kbId: kbEntry?.["id"], question: normalizedQuestion.slice(0, 80) },
    "Bot yeni bilgi öğrendi"
  );

  return {
    success: true,
    message: `✅ Öğrendim!\n\n📚 KB'ye eklendi:\n_${normalizedQuestion}_\n\nBir daha bu soruyla karşılaştığımda otomatik yanıtlayacağım.`,
    kbEntryId: kbEntry?.["id"] as string | undefined,
  };
}

// ── /duzelt KOMUTU ───────────────────────────────────────────

export async function correctKbEntry(opts: {
  kbId: string;
  newAnswer: string;
  adminId: number;
  adminName: string;
}): Promise<TeachResult> {

  const { data: existing } = await supabase
    .from("knowledge_base")
    .select("id, question_pattern, answer_template")
    .eq("id", opts.kbId)
    .single();

  if (!existing) {
    return { success: false, message: `KB kaydı bulunamadı: ${opts.kbId}` };
  }

  await supabase
    .from("knowledge_base")
    .update({
      answer_template: opts.newAnswer,
      updated_at: new Date().toISOString(),
    })
    .eq("id", opts.kbId);

  await supabase.from("audit_log").insert({
    actor: String(opts.adminId),
    action: "correct_kb_entry",
    entity_type: "knowledge_base",
    entity_id: opts.kbId,
    before_state: { answer: existing["answer_template"] },
    after_state: { answer: opts.newAnswer, corrected_by: opts.adminName },
  });

  await redis.keys(`kb:*`).then((keys) => {
    if (keys.length) return redis.del(...keys);
  });

  return {
    success: true,
    message: `✅ KB kaydı güncellendi.\n\n📝 Soru: _${existing["question_pattern"] as string}_\n\n🔄 Eski → Yeni cevap değiştirildi.`,
    kbEntryId: opts.kbId,
  };
}

// ── /onay KOMUTU — Taslak onayla ─────────────────────────────

export async function approveDraft(opts: {
  convId: string;
  adminId: number;
  adminName: string;
}): Promise<{ success: boolean; message: string; memberId?: string; reply?: string }> {

  const cached = await redis.get(`draft:${opts.convId}`);
  if (!cached) {
    return { success: false, message: "Taslak süresi dolmuş veya bulunamadı." };
  }

  const draft = JSON.parse(cached) as {
    draft: string;
    memberId: string;
    siteId: string;
    kbEntryId?: string;
  };

  await supabase
    .from("conversation_logs")
    .update({ resolution: "resolved" })
    .eq("id", opts.convId);

  if (draft.kbEntryId) {
    await supabase.rpc("increment_kb_usage", {
      kb_id: draft.kbEntryId,
      is_success: true,
    });
  }

  await redis.del(`draft:${opts.convId}`);

  return {
    success: true,
    message: `✅ Taslak onaylandı ve üyeye gönderildi.`,
    memberId: draft.memberId,
    reply: draft.draft,
  };
}

// ── /red KOMUTU — Taslağı reddet, doğru cevabı ver ───────────

export async function rejectDraftAndTeach(opts: {
  convId: string;
  correctAnswer: string;
  adminId: number;
  adminName: string;
}): Promise<{ success: boolean; message: string; memberId?: string; kbEntryId?: string }> {

  const cached = await redis.get(`draft:${opts.convId}`);
  if (!cached) {
    return { success: false, message: "Taslak süresi dolmuş veya bulunamadı." };
  }

  const draft = JSON.parse(cached) as {
    draft: string;
    memberId: string;
    siteId: string;
    kbEntryId?: string;
  };

  if (draft.kbEntryId) {
    await supabase
      .from("knowledge_base")
      .update({ answer_template: opts.correctAnswer })
      .eq("id", draft.kbEntryId);

    await supabase.rpc("increment_kb_usage", {
      kb_id: draft.kbEntryId,
      is_success: false,
    });

    await recordFeedback(
      opts.convId,
      "incorrect",
      1,
      `Admin düzeltti: "${opts.correctAnswer.slice(0, 200)}"`,
      true
    );
  }

  await supabase
    .from("conversation_logs")
    .update({ resolution: "resolved", learning_notes: "Admin taslağı düzeltti" })
    .eq("id", opts.convId);

  await redis.del(`draft:${opts.convId}`);

  await redis.keys("kb:*").then((keys) => {
    if (keys.length) return redis.del(...keys);
  });

  return {
    success: true,
    message: `✅ Düzeltildi. KB güncellendi, doğru cevap üyeye gönderildi.`,
    memberId: draft.memberId,
    kbEntryId: draft.kbEntryId,
  };
}

// ── /bilgi KOMUTU — Bot'un bildiği şeyler ───────────────────

export async function getKbSummary(siteId?: string): Promise<string> {
  const { data, count } = await supabase
    .from("knowledge_base")
    .select("category", { count: "exact" })
    .eq("is_active", true);

  if (!data || !count) return "Knowledge base boş.";

  const byCategory: Record<string, number> = {};
  for (const row of data) {
    const cat = row["category"] as string;
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;
  }

  const { data: recent } = await supabase
    .from("knowledge_base")
    .select("question_pattern, source, created_at")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(5);

  let msg = `📚 *DEUS — Bilgi Tabanı*\n━━━━━━━━━━━━━━━━━━\n`;
  msg += `Toplam kayıt: ${count}\n\n`;
  msg += `📂 Kategoriler:\n`;

  for (const [cat, cnt] of Object.entries(byCategory)) {
    msg += `  • ${cat}: ${cnt} kayıt\n`;
  }

  msg += `\n🆕 Son öğrenilenler:\n`;
  for (const r of recent ?? []) {
    const src = r["source"] === "learned" ? "🤖" : "👤";
    msg += `  ${src} _${(r["question_pattern"] as string).slice(0, 60)}..._\n`;
  }

  return msg;
}
