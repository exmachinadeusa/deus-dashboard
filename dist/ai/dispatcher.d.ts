import type { DeusContext } from "../index.js";
export interface DispatchResult {
    tier: "rules" | "ollama" | "vision" | "claude";
    intent: string;
    response: string;
    latencyMs: number;
}
/**
 * Smart dispatcher: 4-tier routing
 * 1. Rules ($0, ~0ms) — %40 işlem
 * 2. Ollama ($0, ~100ms) — %40 işlem
 * 3. Vision ($, ~500ms) — %10 işlem (dekont OCR)
 * 4. Claude ($, ~1s) — %10 işlem (fallback)
 */
export declare function smartDispatch(text: string, ctx: DeusContext): Promise<DispatchResult>;
/**
 * Session'a logging ve analytics
 */
export declare function logDispatchMetrics(userId: number, result: DispatchResult): Promise<void>;
//# sourceMappingURL=dispatcher.d.ts.map