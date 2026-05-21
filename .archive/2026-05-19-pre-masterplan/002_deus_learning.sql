-- DEUS Learning & Knowledge Base
-- Semantic search ve öğrenme sistemi

-- Knowledge Base tablosu (pgvector ile semantic search)
CREATE TABLE IF NOT EXISTS knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  subcategory TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  source TEXT,
  created_by UUID REFERENCES operators(id),
  confidence FLOAT DEFAULT 0.8,
  tags TEXT[] DEFAULT '{}',
  is_verified BOOLEAN DEFAULT false,
  usage_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Öğrenme logleri (her karar ve sonucu kaydeder)
CREATE TABLE IF NOT EXISTS learning_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID REFERENCES transactions(id),
  decision_type TEXT NOT NULL,
  input_data JSONB NOT NULL,
  decision TEXT NOT NULL,
  confidence_score FLOAT,
  outcome TEXT,
  outcome_confidence FLOAT,
  feedback TEXT,
  created_by UUID REFERENCES operators(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Karar kuralları (öğrenilen pattern'ler)
CREATE TABLE IF NOT EXISTS decision_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name TEXT NOT NULL UNIQUE,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('auto_approve', 'flag_anomaly', 'escalate', 'reject')),
  condition JSONB NOT NULL,
  action JSONB NOT NULL,
  priority INT DEFAULT 100,
  is_active BOOLEAN DEFAULT true,
  success_rate FLOAT DEFAULT 0.0,
  total_applications INT DEFAULT 0,
  created_by UUID REFERENCES operators(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Personel vardiya ve yetki takibi
CREATE TABLE IF NOT EXISTS operator_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES operators(id),
  shift_start TIMESTAMP NOT NULL,
  shift_end TIMESTAMP,
  department TEXT NOT NULL,
  transactions_processed INT DEFAULT 0,
  decisions_made INT DEFAULT 0,
  error_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Komisyon hesaplaması ve takibi
CREATE TABLE IF NOT EXISTS commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES operators(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  transactions_processed INT DEFAULT 0,
  commission_amount DECIMAL(15, 2),
  currency TEXT DEFAULT 'TRL',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid')),
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Kara liste (şüpheli hesaplar)
CREATE TABLE IF NOT EXISTS blacklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_identifier TEXT NOT NULL UNIQUE,
  account_type TEXT CHECK (account_type IN ('user', 'company', 'operator')),
  reason TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  added_by UUID REFERENCES operators(id),
  added_at TIMESTAMP DEFAULT NOW(),
  removed_at TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Sistem event logleri
CREATE TABLE IF NOT EXISTS system_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  event_description TEXT,
  affected_entity_type TEXT,
  affected_entity_id UUID,
  severity TEXT CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  created_by UUID REFERENCES operators(id),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);

-- İndeksler
CREATE INDEX IF NOT EXISTS idx_kb_category ON knowledge_base(category);
CREATE INDEX IF NOT EXISTS idx_kb_tags ON knowledge_base USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_kb_created_at ON knowledge_base(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_logs_decision ON learning_logs(decision_type);
CREATE INDEX IF NOT EXISTS idx_learning_logs_outcome ON learning_logs(outcome);
CREATE INDEX IF NOT EXISTS idx_decision_rules_active ON decision_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_decision_rules_type ON decision_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_operator_shifts_operator ON operator_shifts(operator_id);
CREATE INDEX IF NOT EXISTS idx_operator_shifts_date ON operator_shifts(shift_start DESC);
CREATE INDEX IF NOT EXISTS idx_blacklist_added_at ON blacklist(added_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_type ON system_events(event_type);
CREATE INDEX IF NOT EXISTS idx_system_events_created_at ON system_events(created_at DESC);

-- Başlangıç verisi: Admin operatör
INSERT INTO operators (name, telegram_id, department, role, approval_authority, is_active)
VALUES (
  'DEUS Admin',
  0,
  'system',
  'admin',
  '{
    "auto_approve_limit": 999999999,
    "operator_approve_limit": 999999999,
    "requires_admin_escalation": false
  }'::jsonb,
  true
) ON CONFLICT DO NOTHING;
