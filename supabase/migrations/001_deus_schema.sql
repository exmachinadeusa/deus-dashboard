-- DEUS Schema - Operasyon Sistemi
-- Temel tablolar ve yapılar

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Operatörler tablosu
CREATE TABLE IF NOT EXISTS operators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  telegram_id BIGINT NOT NULL UNIQUE,
  department TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'operator', 'supervisor')),
  approval_authority JSONB NOT NULL DEFAULT '{
    "auto_approve_limit": 5000,
    "operator_approve_limit": 50000,
    "requires_admin_escalation": true
  }'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- İşlemler tablosu
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('deposit', 'withdrawal', 'transfer', 'commission')),
  amount DECIMAL(15, 2) NOT NULL,
  currency TEXT DEFAULT 'TRL',
  from_account TEXT NOT NULL,
  to_account TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'failed')),
  approval_level TEXT CHECK (approval_level IN ('auto', 'operator', 'admin')),
  approved_by UUID REFERENCES operators(id),
  reason_for_rejection TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Anomali tespiti tablosu
CREATE TABLE IF NOT EXISTS anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID REFERENCES transactions(id),
  anomaly_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description TEXT NOT NULL,
  detected_at TIMESTAMP DEFAULT NOW(),
  resolved BOOLEAN DEFAULT false,
  resolution_notes TEXT,
  escalated_to UUID REFERENCES operators(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Kasa (departman bakiyeleri)
CREATE TABLE IF NOT EXISTS department_cash (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department TEXT NOT NULL UNIQUE,
  balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
  last_reconciliation TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Günlük mutabakat
CREATE TABLE IF NOT EXISTS daily_reconciliation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_date DATE NOT NULL,
  department TEXT NOT NULL,
  opening_balance DECIMAL(15, 2),
  total_deposits DECIMAL(15, 2) DEFAULT 0,
  total_withdrawals DECIMAL(15, 2) DEFAULT 0,
  closing_balance DECIMAL(15, 2),
  discrepancy DECIMAL(15, 2) DEFAULT 0,
  reconciled_by UUID REFERENCES operators(id),
  reconciled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(reconciliation_date, department)
);

-- İndeksler
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_anomalies_severity ON anomalies(severity);
CREATE INDEX IF NOT EXISTS idx_anomalies_resolved ON anomalies(resolved);
CREATE INDEX IF NOT EXISTS idx_operators_department ON operators(department);
CREATE INDEX IF NOT EXISTS idx_operators_telegram_id ON operators(telegram_id);
