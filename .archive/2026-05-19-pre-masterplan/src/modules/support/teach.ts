/**
 * Teach - Admin tarafından KB'ye yeni yanıt eklenmesi
 * 
 * Admin bir destek talebine yanıt verince:
 * - knowledge_base'e yeni kayıt
 * - learning_logs status → 'resolved'
 * - Confidence başlangıçta 1.0 (admin onaylı)
 */
import { supabase } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';

// ────────────────────────────────────────────────────────────────
export async function teachKnowledge(opts: {
  question: string;
  answer: string;
  category?: string;
  taughtBy: string; // operator_id
  resolvesLearningLogId?: string;
}): Promise<{ ok: boolean; kbId?: string; error?: string }> {
  const { question, answer, category = 'general', taughtBy, resolvesLearningLogId } = opts;

  try {
    // 1. KB'ye ekle
    const { data: kb, error: kbErr } = await supabase
      .from('knowledge_base')
      .insert({
        question,
        answer,
        category,
        confidence_score: 1.0,
        usage_count: 0,
        taught_by: taughtBy,
        is_active: true,
      } as any)
      .select('id')
      .single();

    if (kbErr) {
      logger.error({ msg: 'teachKnowledge: KB insert fail', err: kbErr });
      return { ok: false, error: kbErr.message };
    }

    // 2. Learning log'u resolved işaretle
    if (resolvesLearningLogId) {
      await supabase
        .from('learning_logs')
        .update({
          status: 'resolved',
          resolved_kb_id: kb!.id,
          resolved_at: new Date().toISOString(),
        } as any)
        .eq('id', resolvesLearningLogId);
    }

    logger.info({ deus_teach: { kb_id: kb!.id, category, taught_by: taughtBy } });
    return { ok: true, kbId: kb!.id };
  } catch (err: any) {
    logger.error({ msg: 'teach exception', err: err?.message });
    return { ok: false, error: err?.message };
  }
}

// ────────────────────────────────────────────────────────────────
export async function updateKnowledge(kbId: string, opts: {
  question?: string;
  answer?: string;
  category?: string;
  isActive?: boolean;
}) {
  const patch: any = {};
  if (opts.question !== undefined) patch.question = opts.question;
  if (opts.answer !== undefined) patch.answer = opts.answer;
  if (opts.category !== undefined) patch.category = opts.category;
  if (opts.isActive !== undefined) patch.is_active = opts.isActive;

  const { error } = await supabase
    .from('knowledge_base')
    .update(patch)
    .eq('id', kbId);

  if (error) {
    logger.error({ msg: 'updateKnowledge fail', err: error });
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export default { teachKnowledge, updateKnowledge };
