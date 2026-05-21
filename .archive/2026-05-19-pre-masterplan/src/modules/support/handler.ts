/**
 * Support Handler - Müşteri/Operatör destek mesajlarını işler
 * 
 * Akış:
 * 1. Mesaj gelir
 * 2. knowledge_base'de semantic search (pgvector)
 * 3. Skor > 0.85 → otomatik cevap
 * 4. Skor < 0.85 → admin'e eskalasyon (notify) + öğrenme için kaydet
 */
import { supabase } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';
import { notifyAdminGroup } from '../notify.js';

const CONFIDENCE_THRESHOLD = 0.85;

export interface SupportResult {
  answer: string | null;
  confidence: number;
  source: 'kb' | 'fallback' | 'escalated';
  kbId?: string;
}

// ────────────────────────────────────────────────────────────────
export async function handleSupportMessage(opts: {
  userId: number;
  text: string;
  context?: Record<string, any>;
}): Promise<SupportResult> {
  const { userId, text } = opts;

  logger.info({ deus_support: { user: userId, text: text.substring(0, 80) } });

  // 1. KB'de ara (basit ILIKE; pgvector için embed üretmek gerek)
  const { data: matches, error } = await supabase
    .from('knowledge_base')
    .select('id, question, answer, confidence_score, category')
    .ilike('question', `%${text.substring(0, 50)}%`)
    .order('confidence_score', { ascending: false })
    .limit(3);

  if (error) {
    logger.error({ msg: 'KB search fail', err: error });
  }

  // 2. En iyi eşleşme yeterince güvenli mi?
  const best = matches?.[0];
  if (best && (best.confidence_score ?? 0) >= CONFIDENCE_THRESHOLD) {
    // Kullanım sayacını artır
    await supabase
      .from('knowledge_base')
      .update({ usage_count: (best as any).usage_count + 1 } as any)
      .eq('id', best.id);

    return {
      answer: best.answer,
      confidence: best.confidence_score,
      source: 'kb',
      kbId: best.id,
    };
  }

  // 3. Düşük güven → admin eskalasyon + öğrenme kaydı
  await supabase.from('learning_logs').insert({
    user_id: userId,
    input_text: text,
    matched_kb_id: best?.id ?? null,
    confidence: best?.confidence_score ?? 0,
    status: 'pending_review',
  } as any);

  await notifyAdminGroup(
    `❓ *Yeni destek talebi (düşük güven)*\n\n` +
    `Kullanıcı: \`${userId}\`\n` +
    `Mesaj: _${text.substring(0, 200)}_\n` +
    `En iyi eşleşme güveni: ${((best?.confidence_score ?? 0) * 100).toFixed(1)}%\n\n` +
    `Admin yanıtlamak için: /teach <yanıt>`
  );

  return {
    answer: null,
    confidence: best?.confidence_score ?? 0,
    source: 'escalated',
  };
}

// ────────────────────────────────────────────────────────────────
export async function listPendingReviews(limit = 10) {
  const { data, error } = await supabase
    .from('learning_logs')
    .select('id, user_id, input_text, confidence, created_at')
    .eq('status', 'pending_review')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export default { handleSupportMessage, listPendingReviews };
