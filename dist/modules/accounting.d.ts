interface KasaState {
    siteId: string;
    siteName: string;
    openingBalance: number;
    deposits: number;
    withdrawals: number;
    supplement: number;
    depositCommission: number;
    withdrawalCommission: number;
    date: string;
}
export declare function getKasa(siteId: string): Promise<KasaState | null>;
export declare function recordTransaction(opts: {
    siteId: string;
    type: "deposit" | "withdrawal" | "supplement";
    amount: number;
    commissionRate?: number;
}): Promise<{
    newBalance: number;
    commission: number;
}>;
export declare function calculateCommission(opts: {
    siteId: string;
    type: "deposit" | "withdrawal";
    amount: number;
}): Promise<{
    rate: number;
    fixedFee: number;
    total: number;
}>;
export declare function getKasaMessage(siteId: string): Promise<string>;
export declare function finalizeDaily(): Promise<void>;
export declare function getDailyReconciliationMessage(siteId: string, date?: string): Promise<string>;
export {};
//# sourceMappingURL=accounting.d.ts.map