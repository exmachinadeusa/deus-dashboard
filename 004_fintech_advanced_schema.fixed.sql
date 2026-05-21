-- DEUS ADVANCED FINTECH SYSTEM
-- Türkiye Bahis Piyasası - Merkezi Operasyon Sistemi
-- Kurulum tarihi: 2026-05-19 00:36 GMT-3

-- ============================================================================
-- 1. CORE TABLOLAR
-- ============================================================================

-- Müşteri Hesapları (Fintech Core)
CREATE TABLE IF NOT EXISTS customer_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  customer_email TEXT UNIQUE,
  customer_phone TEXT,
  kyc_status TEXT NOT NULL DEFAULT 'pending' CHECK (kyc_status IN ('pending', 'verified', 'rejected', 'suspended')),
  kyc_documents JSONB DEFAULT '{}'::jsonb,
  kyc_verified_at TIMESTAMP,
  kyc_verified_by UUID REFERENCES operators(id),
  account_type TEXT NOT NULL DEFAULT 'standard' CHECK (account_type IN ('standard', 'vip', 'institutional')),
  account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'closed', 'dormant')),
  balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
  available_balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
  pending_balance DECIMAL(15, 2) DEFAULT 0,
  credit_limit DECIMAL(15, 2) DEFAULT 0,
  daily_withdrawal_limit DECIMAL(15, 2) DEFAULT 10000,
  daily_deposit_limit DECIMAL(15, 2) DEFAULT 100000,
  consecutive_failed_logins INT DEFAULT 0,
  last_login TIMESTAMP,
  account_created_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Cüzdan (Elektronik Para Taşıyıcısı)
CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id TEXT NOT NULL REFERENCES customer_accounts(customer_id),
  wallet_type TEXT NOT NULL CHECK (wallet_type IN ('main', 'bonus', 'escrow', 'settlement')),
  currency TEXT NOT NULL DEFAULT 'TRL',
  balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
  available_balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
  locked_balance DECIMAL(15, 2) DEFAULT 0,
  reserved_balance DECIMAL(15, 2) DEFAULT 0,
  wallet_status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(customer_id, wallet_type, currency)
);

-- ============================================================================
-- 2. İŞLEM VE ÖDEMENT SİSTEMİ
-- ============================================================================

-- Ödeme Metodları
CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id TEXT NOT NULL REFERENCES customer_accounts(customer_id),
  method_type TEXT NOT NULL CHECK (method_type IN ('bank_transfer', 'credit_card', 'debit_card', 'crypto', 'wallet')),
  provider TEXT,
  account_holder_name TEXT,
  account_number TEXT,
  routing_number TEXT,
  card_last_four TEXT,
  card_brand TEXT,
  bank_code TEXT,
  bank_name TEXT,
  is_verified BOOLEAN DEFAULT false,
  verification_token TEXT,
  verified_at TIMESTAMP,
  is_primary BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  daily_limit DECIMAL(15, 2),
  monthly_limit DECIMAL(15, 2),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- İşlemler (Genişletilmiş)
CREATE TABLE IF NOT EXISTS transactions_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_id TEXT NOT NULL UNIQUE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('deposit', 'withdrawal', 'transfer', 'refund', 'commission', 'bonus', 'reversal', 'settlement')),
  customer_id TEXT REFERENCES customer_accounts(customer_id),
  from_account UUID REFERENCES wallets(id),
  to_account UUID REFERENCES wallets(id),
  amount DECIMAL(15, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TRL',
  payment_method_id UUID REFERENCES payment_methods(id),
  fee DECIMAL(15, 2) DEFAULT 0,
  net_amount DECIMAL(15, 2),
  status TEXT NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated', 'pending', 'processing', 'approved', 'rejected', 'completed', 'failed', 'reversed', 'cancelled')),
  approval_level TEXT CHECK (approval_level IN ('auto', 'operator', 'admin')),
  approved_by UUID REFERENCES operators(id),
  approval_timestamp TIMESTAMP,
  reason_for_rejection TEXT,
  error_code TEXT,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  risk_score DECIMAL(3, 2) DEFAULT 0,
  risk_flags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  initiated_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP,
  completed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- İşlem Logs (Detaylı Audit Trail)
CREATE TABLE IF NOT EXISTS transaction_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions_v2(id),
  log_level TEXT CHECK (log_level IN ('info', 'warning', 'error', 'critical')),
  event TEXT NOT NULL,
  status_before TEXT,
  status_after TEXT,
  change_details JSONB,
  performed_by UUID REFERENCES operators(id),
  ip_address INET,
  user_agent TEXT,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- 3. ÖDEME PROSESİ VE ONAY
-- ============================================================================

-- Approval Queue (Operatör onay sistemi)
CREATE TABLE IF NOT EXISTS approval_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions_v2(id),
  required_approval_level TEXT NOT NULL CHECK (required_approval_level IN ('operator', 'supervisor', 'admin')),
  assigned_to UUID REFERENCES operators(id),
  requested_at TIMESTAMP DEFAULT NOW(),
  reviewed_at TIMESTAMP,
  approved BOOLEAN,
  reviewed_by UUID REFERENCES operators(id),
  review_notes TEXT,
  priority INT DEFAULT 0,
  is_urgent BOOLEAN DEFAULT false
);

-- Workflow States (İşlem durumları)
CREATE TABLE IF NOT EXISTS workflow_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions_v2(id),
  current_state TEXT NOT NULL,
  previous_state TEXT,
  transitioned_at TIMESTAMP DEFAULT NOW(),
  transition_reason TEXT
);

-- ============================================================================
-- 4. ANOMALI TESPİT VE RISK MANAGEMENT
-- ============================================================================

-- Anomali Tespiti (ML-uyumlu)
CREATE TABLE IF NOT EXISTS anomalies_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID REFERENCES transactions_v2(id),
  customer_id TEXT REFERENCES customer_accounts(customer_id),
  anomaly_type TEXT NOT NULL,
  category TEXT CHECK (category IN ('behavioral', 'transactional', 'fraud', 'compliance', 'operational')),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  confidence_score DECIMAL(3, 2),
  description TEXT NOT NULL,
  evidence JSONB DEFAULT '{}'::jsonb,
  detected_at TIMESTAMP DEFAULT NOW(),
  resolved BOOLEAN DEFAULT false,
  resolution_notes TEXT,
  escalated_to UUID REFERENCES operators(id),
  escalation_reason TEXT,
  escalated_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);

-- Risk Kuralları (Business Rules Engine)
CREATE TABLE IF NOT EXISTS risk_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name TEXT NOT NULL UNIQUE,
  rule_description TEXT,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('velocity', 'pattern', 'threshold', 'behavioral', 'compliance')),
  condition_logic JSONB NOT NULL,
  risk_score_impact DECIMAL(3, 2) NOT NULL,
  actions JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  priority INT DEFAULT 0,
  created_by UUID REFERENCES operators(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Kara Liste (Fraud Prevention)
CREATE TABLE IF NOT EXISTS blacklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('customer', 'email', 'phone', 'bank_account', 'ip_address')),
  entity_value TEXT NOT NULL,
  reason TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  listed_by UUID REFERENCES operators(id),
  listed_at TIMESTAMP DEFAULT NOW(),
  expiry_date TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  UNIQUE(entity_type, entity_value)
);

-- ============================================================================
-- 5. MUTABAKAT VE RAPORLAMA
-- ============================================================================

-- Departman Bakiyeleri (Genişletilmiş)
CREATE TABLE IF NOT EXISTS department_cash_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department TEXT NOT NULL,
  department_type TEXT CHECK (department_type IN ('settlement', 'operations', 'finance', 'compliance')),
  balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
  yesterday_balance DECIMAL(15, 2),
  total_in DECIMAL(15, 2) DEFAULT 0,
  total_out DECIMAL(15, 2) DEFAULT 0,
  pending_in DECIMAL(15, 2) DEFAULT 0,
  pending_out DECIMAL(15, 2) DEFAULT 0,
  reserved DECIMAL(15, 2) DEFAULT 0,
  last_reconciliation TIMESTAMP,
  last_reconciled_by UUID REFERENCES operators(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(department)
);

-- Günlük Mutabakat (Genişletilmiş)
CREATE TABLE IF NOT EXISTS daily_reconciliation_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_date DATE NOT NULL,
  department TEXT NOT NULL,
  opening_balance DECIMAL(15, 2),
  total_deposits DECIMAL(15, 2) DEFAULT 0,
  total_withdrawals DECIMAL(15, 2) DEFAULT 0,
  total_refunds DECIMAL(15, 2) DEFAULT 0,
  total_commissions DECIMAL(15, 2) DEFAULT 0,
  total_fees DECIMAL(15, 2) DEFAULT 0,
  closing_balance DECIMAL(15, 2),
  calculated_balance DECIMAL(15, 2),
  discrepancy DECIMAL(15, 2) DEFAULT 0,
  discrepancy_notes TEXT,
  reconciled_by UUID REFERENCES operators(id),
  reconciled_at TIMESTAMP,
  verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'disputed')),
  verified_by UUID REFERENCES operators(id),
  verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(reconciliation_date, department)
);

-- Settlement Records (Uzlaştırma)
CREATE TABLE IF NOT EXISTS settlement_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_date DATE NOT NULL,
  settlement_period TEXT,
  total_volume DECIMAL(15, 2),
  total_fees DECIMAL(15, 2),
  net_settlement DECIMAL(15, 2),
  settled_by UUID REFERENCES operators(id),
  settled_at TIMESTAMP,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'reversed')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- 6. OPERATÖR VE ERİŞİM YÖNETİMİ
-- ============================================================================

-- Operatör Aktiviteleri (Audit)
CREATE TABLE IF NOT EXISTS operator_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID REFERENCES operators(id),
  activity_type TEXT NOT NULL,
  action TEXT NOT NULL,
  affected_entity_type TEXT,
  affected_entity_id TEXT,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  session_id TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Operatör İzinleri (Fine-grained)
CREATE TABLE IF NOT EXISTS operator_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES operators(id),
  permission_code TEXT NOT NULL,
  permission_name TEXT NOT NULL,
  department TEXT,
  limits JSONB,
  valid_from TIMESTAMP,
  valid_until TIMESTAMP,
  granted_by UUID REFERENCES operators(id),
  granted_at TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  UNIQUE(operator_id, permission_code, department)
);

-- ============================================================================
-- 7. MUHASEBE VE FİNANSAL RAPORLAMA
-- ============================================================================

-- GL Entries (Genel Muhasebe Defteri)
CREATE TABLE IF NOT EXISTS gl_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID REFERENCES transactions_v2(id),
  journal_entry_id TEXT NOT NULL UNIQUE,
  debit_account TEXT NOT NULL,
  credit_account TEXT NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  entry_date DATE NOT NULL,
  description TEXT,
  created_by UUID REFERENCES operators(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Account Chart (Muhasebe Hesapları)
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code TEXT NOT NULL UNIQUE,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  account_status TEXT DEFAULT 'active',
  description TEXT,
  parent_account_code TEXT REFERENCES chart_of_accounts(account_code),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- 8. COMPLIANCE VE KYC
-- ============================================================================

-- Compliance Events
CREATE TABLE IF NOT EXISTS compliance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  customer_id TEXT REFERENCES customer_accounts(customer_id),
  transaction_id UUID REFERENCES transactions_v2(id),
  description TEXT NOT NULL,
  regulatory_requirement TEXT,
  action_required BOOLEAN DEFAULT false,
  action_taken TEXT,
  taken_by UUID REFERENCES operators(id),
  taken_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- KYC Documents
CREATE TABLE IF NOT EXISTS kyc_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id TEXT NOT NULL REFERENCES customer_accounts(customer_id),
  document_type TEXT NOT NULL,
  document_number TEXT,
  document_url TEXT,
  verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  verified_by UUID REFERENCES operators(id),
  verified_at TIMESTAMP,
  expiry_date DATE,
  uploaded_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(customer_id, document_type, document_number)
);

-- ============================================================================
-- 9. VEKTÖRİZASYON VE ML (pgvector)
-- ============================================================================

-- Customer Behavior Embeddings (ML)
CREATE TABLE IF NOT EXISTS customer_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id TEXT NOT NULL REFERENCES customer_accounts(customer_id),
  embedding_type TEXT NOT NULL,
  vector vector(384),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Transaction Pattern Vectors
CREATE TABLE IF NOT EXISTS transaction_pattern_vectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id TEXT NOT NULL REFERENCES customer_accounts(customer_id),
  pattern_vector vector(256),
  risk_profile JSONB,
  last_updated TIMESTAMP DEFAULT NOW(),
  UNIQUE(customer_id)
);

-- ============================================================================
-- 10. NOTIFICATION VE ALERTİNG
-- ============================================================================

-- Notification Queue
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('customer', 'operator', 'admin')),
  recipient_id TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  title TEXT,
  message TEXT,
  data JSONB,
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP,
  sent_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- 11. GEÇERLİLİK VE ERIŞIM KONTROL
-- ============================================================================

-- RLS (Row Level Security) Politikaları başlangıçta devre dışı
-- Ayrıntılı RLS politikaları için 005_fintech_rls.sql dosyasını çalıştırın

-- ============================================================================
-- 12. PERFORMANS İNDEKSLERİ
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_customer_accounts_kyc_status ON customer_accounts(kyc_status);
CREATE INDEX IF NOT EXISTS idx_customer_accounts_account_status ON customer_accounts(account_status);
CREATE INDEX IF NOT EXISTS idx_customer_accounts_created_at ON customer_accounts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallets_customer_id ON wallets(customer_id);
CREATE INDEX IF NOT EXISTS idx_wallets_wallet_type ON wallets(wallet_type);

CREATE INDEX IF NOT EXISTS idx_payment_methods_customer_id ON payment_methods(customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_is_active ON payment_methods(is_active);

CREATE INDEX IF NOT EXISTS idx_transactions_v2_status ON transactions_v2(status);
CREATE INDEX IF NOT EXISTS idx_transactions_v2_created_at ON transactions_v2(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_v2_customer_id ON transactions_v2(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_v2_transaction_type ON transactions_v2(transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_v2_risk_score ON transactions_v2(risk_score DESC);

CREATE INDEX IF NOT EXISTS idx_anomalies_v2_severity ON anomalies_v2(severity);
CREATE INDEX IF NOT EXISTS idx_anomalies_v2_resolved ON anomalies_v2(resolved);
CREATE INDEX IF NOT EXISTS idx_anomalies_v2_customer_id ON anomalies_v2(customer_id);

CREATE INDEX IF NOT EXISTS idx_blacklist_entity_value ON blacklist(entity_value);
CREATE INDEX IF NOT EXISTS idx_blacklist_is_active ON blacklist(is_active);

CREATE INDEX IF NOT EXISTS idx_operator_activities_operator_id ON operator_activities(operator_id);
CREATE INDEX IF NOT EXISTS idx_operator_activities_created_at ON operator_activities(created_at DESC);

-- ============================================================================
-- 13. SYSTEM FUNCTIONS (Tetikleyiciler ve Yardımcı Fonksiyonlar)
-- ============================================================================

-- Otomatik update_at tetikleyicisi
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_customer_accounts_update BEFORE UPDATE ON customer_accounts
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trigger_wallets_update BEFORE UPDATE ON wallets
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trigger_transactions_v2_update BEFORE UPDATE ON transactions_v2
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trigger_department_cash_v2_update BEFORE UPDATE ON department_cash_v2
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- İşlem Logging Fonksiyonu
CREATE OR REPLACE FUNCTION log_transaction_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO transaction_logs (
    transaction_id,
    log_level,
    event,
    status_before,
    status_after,
    timestamp
  ) VALUES (
    NEW.id,
    'info',
    'Status updated',
    OLD.status,
    NEW.status,
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_transaction_log AFTER UPDATE ON transactions_v2
FOR EACH ROW EXECUTE FUNCTION log_transaction_change();

-- ============================================================================
-- KURULUM TAMAMLANDI
-- ============================================================================
-- Bu şema fintech payment işleme, risk yönetimi, mutabakat ve compliance
-- için tam teşekküllü bir sistem sağlar.
-- 
-- Sonraki adımlar:
-- 1. 005_fintech_rls.sql - RLS politikaları
-- 2. 006_fintech_views.sql - Materialized Views
-- 3. 007_fintech_functions.sql - Business Logic Functions


-- ============================================
-- İNDEKSLER (auto-converted from inline INDEX)
-- ============================================
CREATE INDEX IF NOT EXISTS idx_customer_id ON payment_methods (customer_id);
CREATE INDEX IF NOT EXISTS idx_status ON transactions_v2 (status);
CREATE INDEX IF NOT EXISTS idx_customer_id ON transactions_v2 (customer_id);
CREATE INDEX IF NOT EXISTS idx_created_at ON transactions_v2 (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reference_id ON transactions_v2 (reference_id);
CREATE INDEX IF NOT EXISTS idx_transaction_id ON transaction_logs (transaction_id);
CREATE INDEX IF NOT EXISTS idx_timestamp ON transaction_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_assigned_to ON approval_queue (assigned_to);
CREATE INDEX IF NOT EXISTS idx_requested_at ON approval_queue (requested_at);
CREATE INDEX IF NOT EXISTS idx_transaction_id ON workflow_states (transaction_id);
CREATE INDEX IF NOT EXISTS idx_transitioned_at ON workflow_states (transitioned_at DESC);
CREATE INDEX IF NOT EXISTS idx_severity ON anomalies_v2 (severity);
CREATE INDEX IF NOT EXISTS idx_resolved ON anomalies_v2 (resolved);
CREATE INDEX IF NOT EXISTS idx_customer_id ON anomalies_v2 (customer_id);
CREATE INDEX IF NOT EXISTS idx_detected_at ON anomalies_v2 (detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_entity_value ON blacklist (entity_value);
CREATE INDEX IF NOT EXISTS idx_is_active ON blacklist (is_active);
CREATE INDEX IF NOT EXISTS idx_settlement_date ON settlement_records (settlement_date);
CREATE INDEX IF NOT EXISTS idx_operator_id ON operator_activities (operator_id);
CREATE INDEX IF NOT EXISTS idx_created_at ON operator_activities (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_type ON operator_activities (activity_type);
CREATE INDEX IF NOT EXISTS idx_entry_date ON gl_entries (entry_date);
CREATE INDEX IF NOT EXISTS idx_debit_account ON gl_entries (debit_account);
CREATE INDEX IF NOT EXISTS idx_credit_account ON gl_entries (credit_account);
CREATE INDEX IF NOT EXISTS idx_event_type ON compliance_events (event_type);
CREATE INDEX IF NOT EXISTS idx_customer_id ON compliance_events (customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_id ON customer_embeddings (customer_id);
CREATE INDEX IF NOT EXISTS idx_embedding_type ON customer_embeddings (embedding_type);
CREATE INDEX IF NOT EXISTS idx_recipient_id ON notifications (recipient_id);
CREATE INDEX IF NOT EXISTS idx_is_read ON notifications (is_read);
CREATE INDEX IF NOT EXISTS idx_created_at ON notifications (created_at DESC);
