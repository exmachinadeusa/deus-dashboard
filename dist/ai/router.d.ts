import Anthropic from "@anthropic-ai/sdk";
export declare const anthropic: Anthropic;
export declare const MODEL_HAIKU: string;
export declare const MODEL_SONNET: string;
export interface CallOptions {
    model?: string;
    system?: string;
    maxTokens?: number;
    temperature?: number;
}
/**
 * Call Claude — TIER 4 FALLBACK
 * Only Haiku allowed. Sonnet for weekly jobs only (via cron).
 * NEVER use Opus.
 */
export declare function callClaude(prompt: string, opts?: CallOptions): Promise<string>;
/**
 * Parse JSON from Claude response
 */
export declare function parseJsonResponse<T = unknown>(text: string): T | null;
/**
 * TIER 3: Claude Vision — Dekont OCR only
 *
 * Master Plan requires:
 * - Extract: bank_name, sender_name, sender_iban, receiver_name, receiver_iban,
 *            amount, currency, reference_code, timestamp_iso
 * - Use Haiku (fast, cheap)
 * - Parse to structured data
 */
export declare function callClaudeVision(imageBase64: string, mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif", prompt: string, opts?: CallOptions): Promise<string>;
/**
 * Weekly Learning Job — Sonnet only (via cron)
 * NEVER called in regular flow.
 */
export declare function callClaudeSonnet(prompt: string, opts?: CallOptions): Promise<string>;
//# sourceMappingURL=router.d.ts.map