export interface ParsedReceipt {
    bank_name: string | null;
    amount: number | null;
    currency: string;
    sender_name: string | null;
    sender_iban: string | null;
    receiver_name: string | null;
    receiver_iban: string | null;
    reference_code: string | null;
    timestamp_iso: string | null;
    description: string | null;
    confidence: number;
}
export type Verdict = "auto_approved" | "auto_rejected" | "pending_operator" | "duplicate" | "error";
export interface ReceiptProcessResult {
    verdict: Verdict;
    reason: string;
    parsed: ParsedReceipt | null;
    departmentId?: string | null;
    transactionId?: string | null;
}
export declare function parseReceiptImage(imageBuffer: Buffer, mimeType?: string): Promise<ParsedReceipt | null>;
export interface ProcessOpts {
    expectedSenderName?: string;
    expectedAmount?: number;
    memberTgId?: string | number;
}
export declare function processReceipt(imageBuffer: Buffer, mimeType: string, opts?: ProcessOpts): Promise<ReceiptProcessResult>;
//# sourceMappingURL=parser.d.ts.map