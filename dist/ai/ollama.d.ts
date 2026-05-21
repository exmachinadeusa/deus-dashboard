export type IntentCategory = "deposit" | "withdrawal" | "account" | "receipt" | "support" | "complaint" | "general" | "unknown";
export interface IntentResult {
    category: IntentCategory;
    confidence: number;
    keywords: string[];
    explanation?: string;
}
export declare function ollamaAvailable(): Promise<boolean>;
export declare function detectIntent(message: string): Promise<IntentResult>;
export declare function searchKnowledgeBase(query: string, _topK?: number): Promise<Array<{
    text: string;
    confidence: number;
}>>;
export declare function adaptKbAnswer(_userMessage: string, template: string, variables?: Record<string, string>): Promise<string>;
//# sourceMappingURL=ollama.d.ts.map