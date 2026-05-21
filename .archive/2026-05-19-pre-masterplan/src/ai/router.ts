/**
 * AI Router - Model Yönlendirme
 * 
 * Strateji:
 * 1. Önce kural motoru (rules.ts) → kesin karar varsa kullan
 * 2. Düşük risk + basit soru → Ollama (yerel, ücretsiz)
 * 3. Yüksek risk veya karmaşık → Anthropic Claude
 * 4. Fallback: manuel onay
 */
import Anthropic from '@anthropic-ai/sdk';
import { ollamaChat, ollamaAvailable } from './ollama.js';
import { evaluateRules, RuleContext } from './rules.js';
import { logger } from '../lib/logger.js';

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-3-5-haiku-20241022';

// ────────────────────────────────────────────────────────────────
export type RouteDecision =
  | { route: 'rule'; action: string; reasoning: string }
  | { route: 'ollama'; content: string }
  | { route: 'claude'; content: string }
  | { route: 'manual'; reasoning: string };

// ────────────────────────────────────────────────────────────────
export async function routeTransactionDecision(ctx: RuleContext): Promise<RouteDecision> {
  // 1. Kural motoru
  const rule = await evaluateRules(ctx);
  if (rule.action === 'auto_approve' || rule.action === 'reject') {
    return { route: 'rule', action: rule.action, reasoning: rule.reasoning };
  }

  // 2. Düşük risk + orta tutar → Ollama
  if (ctx.risk_score < 0.4 && ctx.amount < 10000 && await ollamaAvailable()) {
    const r = await ollamaChat({
      messages: [
        {
          role: 'system',
          content:
            'DEUS Brezilya bahis operasyonu için karar verici asistansın. ' +
            'Sadece JSON döndür: {"decision":"approve"|"review","confidence":0..1,"reasoning":"kısa"}',
        },
        {
          role: 'user',
          content: `İşlem: ${ctx.type}, tutar=${ctx.amount} TRL, risk=${ctx.risk_score}, müşteri=${ctx.customer_id}`,
        },
      ],
    });
    if (r.ok && r.content) {
      return { route: 'ollama', content: r.content };
    }
  }

  // 3. Yüksek risk veya karmaşık → Claude
  if (anthropic && (ctx.risk_score >= 0.4 || ctx.amount >= 10000)) {
    try {
      const r = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content:
              'DEUS Brezilya bahis operasyon kararı. JSON: {"decision":"approve"|"reject"|"review","confidence":0..1,"reasoning":""}.\n\n' +
              `İşlem: tip=${ctx.type}, tutar=${ctx.amount} TRL, risk=${ctx.risk_score}, müşteri=${ctx.customer_id}, kyc=${ctx.customer_kyc || '?'}, velocity=${ctx.velocity_24h ?? '?'}`,
          },
        ],
      });
      const txt = r.content.map(b => (b.type === 'text' ? b.text : '')).join('');
      return { route: 'claude', content: txt };
    } catch (err: any) {
      logger.error({ msg: 'claude fail', err: err?.message });
    }
  }

  // 4. Fallback
  return { route: 'manual', reasoning: rule.reasoning };
}

// ────────────────────────────────────────────────────────────────
export async function routeSupportQuery(query: string, context?: string): Promise<{
  route: 'ollama' | 'claude' | 'fail';
  content?: string;
}> {
  // Basit/kısa soru → Ollama; uzun/karmaşık → Claude
  const isComplex = query.length > 200 || /yasal|legal|prosedür|admin|escal/i.test(query);

  if (!isComplex && await ollamaAvailable()) {
    const r = await ollamaChat({
      messages: [
        { role: 'system', content: 'DEUS destek asistanı. Kısa, net, Türkçe yanıt ver.' },
        { role: 'user', content: query + (context ? `\n\nBağlam: ${context}` : '') },
      ],
    });
    if (r.ok) return { route: 'ollama', content: r.content };
  }

  if (anthropic) {
    try {
      const r = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 800,
        messages: [
          {
            role: 'user',
            content:
              'Sen DEUS destek asistanısın (Brezilya bahis ops). Kısa, net Türkçe yanıt ver.\n\n' +
              `Soru: ${query}` + (context ? `\nBağlam: ${context}` : ''),
          },
        ],
      });
      const txt = r.content.map(b => (b.type === 'text' ? b.text : '')).join('');
      return { route: 'claude', content: txt };
    } catch (err: any) {
      logger.error({ msg: 'support route claude fail', err: err?.message });
    }
  }

  return { route: 'fail' };
}

export default { routeTransactionDecision, routeSupportQuery };
