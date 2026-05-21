import { Bot } from "grammy";
import type { ReceiptProcessResult } from "./receipt/parser.js";
export declare function initNotify(bot: Bot): void;
export declare function notifyMember(memberTgId: string | number, result: ReceiptProcessResult): Promise<void>;
export declare function notifyDepartment(opts: {
    transactionId: string;
    departmentChatId: bigint | number;
    memberName: string | null;
    memberId: string;
    result: ReceiptProcessResult;
}): Promise<void>;
export declare function notifyAdmin(opts: {
    title: string;
    message: string;
    severity?: "info" | "warning" | "critical";
}): Promise<void>;
export declare function handleApprovalCallback(callbackData: string, operatorTgId: number, operatorName: string): Promise<{
    text: string;
    memberId?: string;
    verdict: "approved" | "rejected";
}>;
export declare function formatKasaMessage(opts: {
    siteName: string;
    deposits: number;
    withdrawals: number;
    supplement: number;
    depositCommission: number;
    openingBalance: number;
}): string;
//# sourceMappingURL=notify.d.ts.map