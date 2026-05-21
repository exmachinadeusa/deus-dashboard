export type ResponseStrategy = "auto" | "draft_approval" | "escalate";
export interface SupportResult {
    strategy: ResponseStrategy;
    confidence: number;
    reply?: string;
    kbEntryId?: string;
    escalationId?: string;
    intent?: string;
    category?: string;
}
export declare function handleSupportMessage(opts: {
    memberId: string;
    memberName: string | null;
    siteId: string;
    message: string;
    conversationHistory?: Array<{
        role: "user" | "assistant";
        content: string;
    }>;
}): Promise<SupportResult>;
//# sourceMappingURL=handler.d.ts.map