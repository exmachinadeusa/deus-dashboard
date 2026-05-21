/**
 * Memory Engine - Öğrenme Motoru
 * 
 * Her işlemden öğrenir:
 * - Onaylanmış işlemler → pattern olarak kaydedilir
 * - Reddedilen işlemler → anomali olarak işaretlenir
 * - Knowledge base sürekli büyür
 */
import { supabase } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';

export interface MemoryEntry {
  type: 'transaction_pattern' | 'anomaly' | 'rule' | 'kb';
  payload: Record<string, any>;
  outcome: 'approved' | 'rejected' | 'flagged';
  confidence?: number;
}

// ────────────────────────────────────────────────────────────────
export async function recordOutcome(opts: {
  transactionId: string;
  outcome: 'approved' | 'rejected' | 'flagged';
  decisionBy: string;
  reasoning?: string;
}) {
  const { transactionId, outcome, decisionBy, reasoning } = opts;

  // 1. transactions_v2'den detayları al
  const { data: tx, error } = await supabase
    .from('transactions_v2')
    .select('*')
    .eq('id', transactionId)
    .single();

  if (error || !tx) {
    logger.error({ msg: 'recordOutcome: tx bulunamadı', id: transactionId });
    return { ok: false, error: 'transaction not found' };
  }

  // 2. Pattern olarak kaydet
  const { error: patternErr } = await supabase
    .from('transaction_pattern_vectors')
    .insert({
      transaction_id: transactionId,
      customer_id: tx.customer_id,
      pattern_type: outcome,
      amount: tx.amount,
      risk_score: tx.risk_score,
      decision_by: decisionBy,
      reasoning: reasoning || null,
      created_at: new Date().toISOString(),
    } as any);

  if (patternErr) {
    logger.warn({ msg: 'pattern insert fail (tablo yoksa normal)', err: patternErr.message });
  }

  // 3. Anomali ise anomalies tablosuna da yaz
  if (outcome === 'rejected' || outcome === 'flagged') {
    await supabase.from('anomalies').insert({
      entity_type: 'transaction',
      entity_id: transactionId,
      anomaly_type: outcome,
      severity: tx.risk_score > 0.7 ? 'high' : 'medium',
      description: reasoning || `Otomatik kayıt: ${outcome}`,
      detected_at: new Date().toISOString(),
    } as any);
  }

  logger.info({ deus_memory: { tx: transactionId, outcome, by: decisionBy } });
  return { ok: true };
}

// ────────────────────────────────────────────────────────────────
export async function getCustomerPatterns(customerId: string, limit = 20) {
  const { data, error } = await supabase
    .from('transaction_pattern_vectors')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.warn({ msg: 'getCustomerPatterns fail', err: error.message });
    return [];
  }
  return data || [];
}

// ────────────────────────────────────────────────────────────────
export async function similarPastDecisions(opts: {
  customerId: string;
  amount: number;
  type: string;
  tolerance?: number;
}) {
  const { customerId, amount, type, tolerance = 0.2 } = opts;
  const min = amount * (1 - tolerance);
  const max = amount * (1 + tolerance);

  const { data, error } = await supabase
    .from('transactions_v2')
    .select('id, amount, status, risk_score, approval_level, approved_by, created_at')
    .eq('customer_id', customerId)
    .eq('transaction_type', type)
    .gte('amount', min)
    .lte('amount', max)
    .in('status', ['approved', 'completed', 'rejected'])
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) return [];
  return data || [];
}

// ────────────────────────────────────────────────────────────────
export async function suggestDecision(opts: {
  customerId: string;
  amount: number;
  type: string;
}): Promise<{
  suggestion: 'approve' | 'reject' | 'manual';
  confidence: number;
  reasoning: string;
  basedOn: number;
}> {
  const similar = await similarPastDecisions(opts);

  if (similar.length === 0) {
    return {
      suggestion: 'manual',
      confidence: 0,
      reasoning: 'Benzer geçmiş karar yok',
      basedOn: 0,
    };
  }

  const approved = similar.filter(s => s.status === 'approved' || s.status === 'completed').length;
  const rejected = similar.filter(s => s.status === 'rejected').length;
  const ratio = approved / similar.length;

  if (ratio >= 0.8) {
    return {
      suggestion: 'approve',
      confidence: ratio,
      reasoning: `Son ${similar.length} benzer işlemin ${approved}'i onaylanmış`,
      basedOn: similar.length,
    };
  }
  if (ratio <= 0.2) {
    return {
      suggestion: 'reject',
      confidence: 1 - ratio,
      reasoning: `Son ${similar.length} benzer işlemin ${rejected}'i reddedilmiş`,
      basedOn: similar.length,
    };
  }
  return {
    suggestion: 'manual',
    confidence: 0.5,
    reasoning: `Karışık geçmiş (${approved}/${rejected})`,
    basedOn: similar.length,
  };
}

export default { recordOutcome, getCustomerPatterns, similarPastDecisions, suggestDecision };
