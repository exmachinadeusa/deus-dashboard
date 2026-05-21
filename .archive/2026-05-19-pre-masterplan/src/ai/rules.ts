/**
 * Rules Engine - Kural Motoru
 * 
 * decision_rules tablosundan kuralları okur, transaction'a uygular.
 * Her kural: priority, condition (JSONB), action.
 */
import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';

export interface RuleCondition {
  field: string;       // 'amount', 'risk_score', 'customer_kyc', 'velocity_24h'
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=' | 'in' | 'not_in';
  value: any;
}

export interface Rule {
  id: string;
  name: string;
  priority: number;
  conditions: RuleCondition[];
  action: 'auto_approve' | 'require_operator' | 'require_admin' | 'reject' | 'flag';
  is_active: boolean;
}

export interface RuleContext {
  amount: number;
  risk_score: number;
  customer_kyc?: string;
  velocity_24h?: number;
  type: string;
  customer_id: string;
  [key: string]: any;
}

// ────────────────────────────────────────────────────────────────
let ruleCache: { rules: Rule[]; ts: number } | null = null;
const CACHE_TTL = 60_000; // 1 dk

async function loadRules(): Promise<Rule[]> {
  if (ruleCache && Date.now() - ruleCache.ts < CACHE_TTL) {
    return ruleCache.rules;
  }

  const { data, error } = await supabase
    .from('decision_rules')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: false });

  if (error) {
    logger.error({ msg: 'loadRules fail', err: error.message });
    return [];
  }

  const rules = (data || []).map(r => ({
    id: r.id,
    name: r.name,
    priority: r.priority,
    conditions: r.conditions || [],
    action: r.action,
    is_active: r.is_active,
  })) as Rule[];

  ruleCache = { rules, ts: Date.now() };
  return rules;
}

// ────────────────────────────────────────────────────────────────
function evalCondition(cond: RuleCondition, ctx: RuleContext): boolean {
  const v = ctx[cond.field];
  switch (cond.operator) {
    case '>': return Number(v) > Number(cond.value);
    case '<': return Number(v) < Number(cond.value);
    case '>=': return Number(v) >= Number(cond.value);
    case '<=': return Number(v) <= Number(cond.value);
    case '==': return v === cond.value;
    case '!=': return v !== cond.value;
    case 'in': return Array.isArray(cond.value) && cond.value.includes(v);
    case 'not_in': return Array.isArray(cond.value) && !cond.value.includes(v);
    default: return false;
  }
}

// ────────────────────────────────────────────────────────────────
export async function evaluateRules(ctx: RuleContext): Promise<{
  matched: Rule | null;
  action: Rule['action'];
  reasoning: string;
}> {
  const rules = await loadRules();

  for (const rule of rules) {
    const allMatch = rule.conditions.every(c => evalCondition(c, ctx));
    if (allMatch) {
      logger.info({ deus_rule_match: { id: rule.id, name: rule.name, action: rule.action } });
      return {
        matched: rule,
        action: rule.action,
        reasoning: `Kural eşleşti: ${rule.name}`,
      };
    }
  }

  // Hiç kural eşleşmedi → eşik bazlı varsayılan
  const amount = ctx.amount;
  const autoLimit = Number(process.env.AUTH_THRESHOLD_AUTO_APPROVE || 5000);
  const opLimit = Number(process.env.AUTH_THRESHOLD_OPERATOR_APPROVE || 50000);

  if (amount <= autoLimit) {
    return { matched: null, action: 'auto_approve', reasoning: `Tutar ≤ ${autoLimit} (auto)` };
  }
  if (amount <= opLimit) {
    return { matched: null, action: 'require_operator', reasoning: `Tutar ${autoLimit}-${opLimit} (operatör)` };
  }
  return { matched: null, action: 'require_admin', reasoning: `Tutar > ${opLimit} (admin)` };
}

export function invalidateCache() {
  ruleCache = null;
}

export default { evaluateRules, invalidateCache };
