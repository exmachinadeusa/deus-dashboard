export type RuleVerdict = "pass" | "reject" | "auto_approve" | "needs_ai";
export interface RuleResult {
    verdict: RuleVerdict;
    reason: string;
    data?: Record<string, unknown>;
}
export interface ReceiptData {
    senderName: string | null;
    senderIban: string | null;
    receiverIban: string | null;
    amount: number | null;
    currency: string;
    receiptNumber: string | null;
    receiptDate: string | null;
    bankName: string | null;
}
export declare function validateIban(iban: string | null): RuleResult;
export declare function checkDuplication(receiptNumber: string | null): Promise<RuleResult>;
export declare function validateAmount(amount: number | null, opts?: {
    minAmount?: number;
    maxAmount?: number;
    expectedAmount?: number;
    tolerancePct?: number;
}): RuleResult;
export declare function checkBlacklist(values: {
    iban?: string | null;
    name?: string | null;
    tc?: string | null;
    phone?: string | null;
}): Promise<RuleResult>;
export declare function findDepartmentByIban(receiverIban: string | null): Promise<RuleResult>;
export declare function matchName(senderName: string | null, memberName: string | null): RuleResult;
export declare function checkDepartmentLimit(amount: number, currentBalance: number, dailyLimit: number): RuleResult;
export interface CommandMatch {
    matched: boolean;
    command: string;
    response: string;
    intent: string;
}
export declare function checkCommandRules(text: string): CommandMatch | null;
export interface RuleChainResult {
    finalVerdict: RuleVerdict;
    rules: Array<{
        name: string;
        result: RuleResult;
    }>;
    department?: Record<string, unknown>;
    aiRequired: boolean;
}
export declare function runReceiptRuleChain(receipt: ReceiptData, memberName: string | null, expectedAmount?: number): Promise<RuleChainResult>;
//# sourceMappingURL=rules.d.ts.map