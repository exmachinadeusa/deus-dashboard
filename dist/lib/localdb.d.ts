import Database from "better-sqlite3";
export declare function initLocalDB(): Database.Database;
export declare function getDB(): Database.Database;
export interface Transaction {
    id: string;
    customer_id: string;
    reference_id: string;
    transaction_type: string;
    amount: number;
    currency: string;
    status: string;
    approval_level?: string;
    approved_by?: string;
    metadata?: string;
    created_at: string;
    updated_at: string;
}
export declare function insertTransaction(txn: Omit<Transaction, "created_at" | "updated_at">): boolean;
export declare function getTransaction(id: string): Transaction | null;
export declare function listTransactionsByCustomer(customerId: string): Transaction[];
export declare function updateTransactionStatus(id: string, status: string): boolean;
export interface Wallet {
    id: string;
    customer_id: string;
    balance: number;
    currency: string;
}
export declare function getWallet(customerId: string): Wallet | null;
export declare function updateWalletBalance(customerId: string, amount: number): boolean;
export declare function closeDB(): void;
//# sourceMappingURL=localdb.d.ts.map