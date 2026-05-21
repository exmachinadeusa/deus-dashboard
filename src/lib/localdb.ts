// ============================================================
// DEUS — Lokal Database (SQLite via better-sqlite3)
// src/lib/localdb.ts
//
// DEUS-ONLY isolation: Başka projeye erişim YOK
// Production: PostgreSQL migration ready (schema compatible)
// ============================================================

import Database from "better-sqlite3";
import path from "path";
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport: process.env.NODE_ENV !== "production"
    ? { target: "pino-pretty", options: { colorize: true } }
    : undefined,
});

const DB_PATH = path.join(process.env.HOME || "/Users/exmachina", "deus", "data", "deus.db");

let db: Database.Database | null = null;

// ── INIT ──────────────────────────────────────────────────

export function initLocalDB(): Database.Database {
  if (db) return db;

  try {
    db = new Database(DB_PATH, {
      readonly: false,
      fileMustExist: false,
      timeout: 5000,
    });

    // WAL mode for concurrency
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    db.pragma("cache_size = -64000"); // 64MB
    db.pragma("foreign_keys = ON");

    logger.info({ path: DB_PATH }, "✅ Lokal DB başlatıldı");

    initSchema();
    return db;
  } catch (err) {
    logger.error({ err, path: DB_PATH }, "❌ DB init hatası");
    throw err;
  }
}

export function getDB(): Database.Database {
  if (!db) {
    throw new Error("DB not initialized. Call initLocalDB() first.");
  }
  return db;
}

// ── SCHEMA ────────────────────────────────────────────────

function initSchema() {
  if (!db) return;

  const tables = [
    // Operatörler
    `CREATE TABLE IF NOT EXISTS operators (
      id TEXT PRIMARY KEY,
      telegram_id INTEGER UNIQUE NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      department_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,

    // Müşteriler
    `CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      telegram_id INTEGER UNIQUE,
      name TEXT NOT NULL,
      phone TEXT,
      kyc_status TEXT DEFAULT 'pending',
      risk_score REAL DEFAULT 0.0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,

    // Cüzdanlar
    `CREATE TABLE IF NOT EXISTS wallets (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      balance REAL DEFAULT 0.0,
      currency TEXT DEFAULT 'TRY',
      last_transaction_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(customer_id) REFERENCES customers(id)
    )`,

    // İşlemler
    `CREATE TABLE IF NOT EXISTS transactions_v2 (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      reference_id TEXT UNIQUE NOT NULL,
      transaction_type TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'TRY',
      status TEXT DEFAULT 'processing',
      approval_level TEXT,
      approved_by TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(customer_id) REFERENCES customers(id)
    )`,

    // Site'ler
    `CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      commission_deposit REAL DEFAULT 0.025,
      commission_withdrawal REAL DEFAULT 0.05,
      active BOOLEAN DEFAULT TRUE,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,

    // Departmanlar
    `CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      iban TEXT UNIQUE,
      bank_name TEXT,
      daily_limit REAL,
      current_balance REAL DEFAULT 0.0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,

    // Dekontlar
    `CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      image_hash TEXT,
      parsed_data TEXT,
      confidence REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(transaction_id) REFERENCES transactions_v2(id)
    )`,

    // Bilgi Tabanı
    `CREATE TABLE IF NOT EXISTS knowledge_base_v2 (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      source TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,

    // Anomaliler
    `CREATE TABLE IF NOT EXISTS anomalies_v2 (
      id TEXT PRIMARY KEY,
      customer_id TEXT,
      transaction_id TEXT,
      anomaly_type TEXT NOT NULL,
      risk_score REAL,
      status TEXT DEFAULT 'flagged',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(customer_id) REFERENCES customers(id),
      FOREIGN KEY(transaction_id) REFERENCES transactions_v2(id)
    )`,

    // Kurallar
    `CREATE TABLE IF NOT EXISTS decision_rules (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      rule_text TEXT NOT NULL,
      pattern TEXT,
      action TEXT,
      enabled BOOLEAN DEFAULT TRUE,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,

    // Konuşma Logları
    `CREATE TABLE IF NOT EXISTS conversation_logs (
      id TEXT PRIMARY KEY,
      customer_id TEXT,
      operator_id TEXT,
      message_text TEXT,
      response TEXT,
      resolution TEXT,
      satisfaction INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(customer_id) REFERENCES customers(id),
      FOREIGN KEY(operator_id) REFERENCES operators(id)
    )`,

    // Indices
    `CREATE INDEX IF NOT EXISTS idx_transactions_customer ON transactions_v2(customer_id)`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions_v2(status)`,
    `CREATE INDEX IF NOT EXISTS idx_customers_telegram ON customers(telegram_id)`,
    `CREATE INDEX IF NOT EXISTS idx_wallets_customer ON wallets(customer_id)`,
    `CREATE INDEX IF NOT EXISTS idx_anomalies_customer ON anomalies_v2(customer_id)`,
    `CREATE INDEX IF NOT EXISTS idx_kb_category ON knowledge_base_v2(category)`,
  ];

  for (const sql of tables) {
    try {
      db.exec(sql);
    } catch (err) {
      logger.warn({ err, sql: sql.slice(0, 50) }, "Schema init hatası");
    }
  }

  logger.info({ tables: tables.length }, "✅ Schema ready");
}

// ── QUERIES ───────────────────────────────────────────────

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

export function insertTransaction(txn: Omit<Transaction, "created_at" | "updated_at">): boolean {
  const db = getDB();
  const stmt = db.prepare(`
    INSERT INTO transactions_v2
    (id, customer_id, reference_id, transaction_type, amount, currency, status, approval_level, approved_by, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    stmt.run(
      txn.id,
      txn.customer_id,
      txn.reference_id,
      txn.transaction_type,
      txn.amount,
      txn.currency,
      txn.status,
      txn.approval_level,
      txn.approved_by,
      txn.metadata
    );
    return true;
  } catch (err) {
    logger.error({ err }, "Transaction insert hatası");
    return false;
  }
}

export function getTransaction(id: string): Transaction | null {
  const db = getDB();
  const stmt = db.prepare("SELECT * FROM transactions_v2 WHERE id = ?");
  return (stmt.get(id) as Transaction) || null;
}

export function listTransactionsByCustomer(customerId: string): Transaction[] {
  const db = getDB();
  const stmt = db.prepare("SELECT * FROM transactions_v2 WHERE customer_id = ? ORDER BY created_at DESC LIMIT 100");
  return (stmt.all(customerId) as Transaction[]) || [];
}

export function updateTransactionStatus(id: string, status: string): boolean {
  const db = getDB();
  const stmt = db.prepare("UPDATE transactions_v2 SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
  try {
    stmt.run(status, id);
    return true;
  } catch (err) {
    logger.error({ err }, "Transaction update hatası");
    return false;
  }
}

export interface Wallet {
  id: string;
  customer_id: string;
  balance: number;
  currency: string;
}

export function getWallet(customerId: string): Wallet | null {
  const db = getDB();
  const stmt = db.prepare("SELECT * FROM wallets WHERE customer_id = ?");
  return (stmt.get(customerId) as Wallet) || null;
}

export function updateWalletBalance(customerId: string, amount: number): boolean {
  const db = getDB();
  const stmt = db.prepare("UPDATE wallets SET balance = balance + ?, last_transaction_at = CURRENT_TIMESTAMP WHERE customer_id = ?");
  try {
    stmt.run(amount, customerId);
    return true;
  } catch (err) {
    logger.error({ err }, "Wallet update hatası");
    return false;
  }
}

export function closeDB() {
  if (db) {
    db.close();
    db = null;
    logger.info("DB closed");
  }
}
