/**
 * Ollama - Yerel LLM
 * 
 * Maliyetsiz, hızlı kararlar için yerel model.
 * Hassas veriler dışarı çıkmaz.
 */
import { logger } from '../lib/logger.js';

const BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:3b';

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ────────────────────────────────────────────────────────────────
export async function ollamaChat(opts: {
  messages: OllamaMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<{ ok: boolean; content?: string; error?: string }> {
  const { messages, model = DEFAULT_MODEL, temperature = 0.3, maxTokens = 500 } = opts;

  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: { temperature, num_predict: maxTokens },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      logger.warn({ msg: 'ollama non-200', status: res.status, body: text.substring(0, 200) });
      return { ok: false, error: `${res.status}: ${text}` };
    }

    const data = await res.json() as any;
    return { ok: true, content: data.message?.content || '' };
  } catch (err: any) {
    logger.warn({ msg: 'ollama unreachable', err: err?.message });
    return { ok: false, error: err?.message };
  }
}

// ────────────────────────────────────────────────────────────────
export async function ollamaAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

export default { ollamaChat, ollamaAvailable };
