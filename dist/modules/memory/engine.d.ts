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
/**
 * Sistemde olan her şeyi logla.
 * Hızlı ve non-blocking çalışır — hata olursa sadece log'lar.
 */
export declare function recordEvent(input: EventPayload): Promise<string | null>;
export declare function updateEventOutcome(eventId: string, outcome: "success" | "failure" | "partial", outcomeData?: Record<string, unknown>): Promise<void>;
/**
 * Bot bir karar verdiğinde çağrılır.
 * Durum + karar + gerekçeyi hafızaya yazar.
 */
export declare function rememberDecision(input: DecisionInput): Promise<void>;
/**
 * Geçmişte benzer bir durumla karşılaşıldı mı?
 * Vektör embedding aktifse semantik arama, yoksa keyword arama.
 */
export declare function findSimilarDecisions(situation: string, limit?: number): Promise<SimilarDecision[]>;
/**
 * DB'den prompt şablonunu çek ve değişkenleri doldur.
 * Cache: Redis'te 5 dakika tutulur.
 */
export declare function getPrompt(key: string, variables?: Record<string, string>): Promise<{
    content: string;
    model: string;
    maxTokens: number;
} | null>;
/**
 * Analiz edilmesi gereken batch'i kuyruğa ekler.
 * Scheduler her Pazartesi bu kuyruğu işler.
 */
export declare function queueForLearning(batchType: string, ids: {
    eventIds?: string[];
    convIds?: string[];
    decisionIds?: string[];
}): Promise<void>;
/**
 * Her Pazartesi çalışır.
 * Başarısız kararları ve düşük memnuniyetli konuşmaları analiz eder.
 * Knowledge base'i ve prompt'ları günceller.
 */
export declare function runWeeklyLearningCycle(): Promise<void>;
/**
 * Operatör bir kararı onayladığında veya düzelttiğinde çağrılır.
 * Geri bildirim loop'unun kalbi budur.
 */
export declare function recordFeedback(decisionId: string, outcome: "correct" | "incorrect", score?: number, note?: string, wasOverridden?: boolean): Promise<void>;
//# sourceMappingURL=engine.d.ts.map