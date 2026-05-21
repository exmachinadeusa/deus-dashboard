-- ============================================================
-- DEUS — Master Plan v3 Schema
-- 003_master_plan_schema.sql
-- Eksik tablolar: sites, departments, commission_rules,
--                 conversation_logs, user_profiles, kb pattern
-- ============================================================

-- ============================================================
-- SITES — Site bilgileri (her bahis sitesi)
-- ============================================================
CREATE TABLE IF NOT EXISTS sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','passive','maintenance')),
  currency TEXT NOT NULL DEFAULT 'TRL',
  contact_telegram TEXT,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sites_status ON sites(status);

-- ============================================================
-- DEPARTMENTS — Departman (IBAN sahibi, alıcı tarafı)
-- ============================================================
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  iban TEXT NOT NULL UNIQUE,
  iban_prefix TEXT,                       -- TR + ilk 8 hane (prefix match için)
  bank_name TEXT,
  account_holder TEXT,
  telegram_chat_id BIGINT,                -- Departman Telegram grubu
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','passive','blocked')),
  daily_limit DECIMAL(15,2) DEFAULT 100000,
  monthly_limit DECIMAL(15,2) DEFAULT 3000000,
  current_balance DECIMAL(15,2) DEFAULT 0,
  pending_balance DECIMAL(15,2) DEFAULT 0,
  total_today DECIMAL(15,2) DEFAULT 0,
  total_month DECIMAL(15,2) DEFAULT 0,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_departments_iban ON departments(iban);
CREATE INDEX IF NOT EXISTS idx_departments_iban_prefix ON departments(iban_prefix);
CREATE INDEX IF NOT EXISTS idx_departments_status ON departments(status);
CREATE INDEX IF NOT EXISTS idx_departments_site ON departments(site_id);

-- IBAN prefix auto-fill trigger
CREATE OR REPLACE FUNCTION set_iban_prefix() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.iban IS NOT NULL AND NEW.iban_prefix IS NULL THEN
    NEW.iban_prefix := SUBSTRING(NEW.iban, 1, 10);
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_departments_prefix ON departments;
CREATE TRIGGER trg_departments_prefix
  BEFORE INSERT OR UPDATE ON departments
  FOR EACH ROW EXECUTE FUNCTION set_iban_prefix();

-- ============================================================
-- COMMISSION_RULES — Komisyon kuralları
-- ============================================================
CREATE TABLE IF NOT EXISTS commission_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('deposit','withdrawal')),
  rate DECIMAL(5,4) NOT NULL DEFAULT 0,    -- Yüzde olarak (0.0250 = %2.5)
  fixed_fee DECIMAL(15,2) DEFAULT 0,
  min_amount DECIMAL(15,2) DEFAULT 0,
  max_amount DECIMAL(15,2),
  effective_from TIMESTAMP DEFAULT NOW(),
  effective_to TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commission_site_type ON commission_rules(site_id, type, is_active);

-- ============================================================
-- CONVERSATION_LOGS — Müşteri destek konuşmaları
-- ============================================================
CREATE TABLE IF NOT EXISTS conversation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  site_id UUID REFERENCES sites(id),
  category TEXT,                              -- deposit, withdrawal, account, bonus, general
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{role, content, timestamp}]
  resolution TEXT CHECK (resolution IN ('resolved','escalated','unresolved','abandoned')),
  satisfaction INT CHECK (satisfaction BETWEEN 1 AND 5),
  operator_id UUID REFERENCES operators(id),
  ai_confidence DECIMAL(3,2),
  duration_seconds INT,
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,
  meta JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_conv_user ON conversation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_category ON conversation_logs(category);
CREATE INDEX IF NOT EXISTS idx_conv_resolution ON conversation_logs(resolution);
CREATE INDEX IF NOT EXISTS idx_conv_started ON conversation_logs(started_at DESC);

-- ============================================================
-- USER_PROFILES — Üye davranış profili (zamanla zenginleşir)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY,
  site_id UUID REFERENCES sites(id),
  display_name TEXT,
  total_deposits DECIMAL(15,2) DEFAULT 0,
  total_withdrawals DECIMAL(15,2) DEFAULT 0,
  deposit_count INT DEFAULT 0,
  withdrawal_count INT DEFAULT 0,
  avg_transaction DECIMAL(15,2) DEFAULT 0,
  preferred_bank TEXT,
  preferred_method TEXT,
  risk_score DECIMAL(3,2) DEFAULT 0,
  complaint_count INT DEFAULT 0,
  vip_status BOOLEAN DEFAULT false,
  behavior_notes TEXT,
  last_activity TIMESTAMP,
  first_seen TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  meta JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_risk ON user_profiles(risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_user_profiles_vip ON user_profiles(vip_status) WHERE vip_status = true;

-- ============================================================
-- KNOWLEDGE_BASE (eğer yoksa - master plan formatında)
-- ============================================================
CREATE TABLE IF NOT EXISTS knowledge_base_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id),
  category TEXT NOT NULL,                  -- deposit, withdrawal, account, bonus, general
  question_pattern TEXT NOT NULL,
  answer_template TEXT NOT NULL,
  variables JSONB DEFAULT '{}'::jsonb,
  keywords TEXT[],
  embedding vector(1024),                  -- Voyage/OpenAI embedding (opsiyonel)
  usage_count INT DEFAULT 0,
  success_count INT DEFAULT 0,
  failure_count INT DEFAULT 0,
  confidence_threshold DECIMAL(3,2) DEFAULT 0.75,
  is_active BOOLEAN DEFAULT true,
  taught_by UUID REFERENCES operators(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_v2_category ON knowledge_base_v2(category, is_active);
CREATE INDEX IF NOT EXISTS idx_kb_v2_keywords ON knowledge_base_v2 USING gin(keywords);

-- pgvector extension yoksa
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- SEED DATA — Test için minimal kayıt
-- ============================================================

-- Test site
INSERT INTO sites (name, slug, status, contact_telegram)
VALUES ('SafeCüzdan Test Site', 'safe-test', 'active', '@machinaexdeusa')
ON CONFLICT (slug) DO NOTHING;

-- Test departman (gerçek IBAN değil!)
INSERT INTO departments (
  site_id, name, iban, bank_name, account_holder, status, daily_limit
)
SELECT
  (SELECT id FROM sites WHERE slug = 'safe-test'),
  'Yatırım Departmanı #1',
  'TR330006100519786457841326',
  'Garanti BBVA',
  'TEST AS',
  'active',
  500000
ON CONFLICT (iban) DO NOTHING;

-- Test komisyon kuralı
INSERT INTO commission_rules (site_id, type, rate, fixed_fee, is_active)
SELECT id, 'deposit', 0.0250, 0, true FROM sites WHERE slug = 'safe-test'
ON CONFLICT DO NOTHING;

INSERT INTO commission_rules (site_id, type, rate, fixed_fee, is_active)
SELECT id, 'withdrawal', 0.0500, 0, true FROM sites WHERE slug = 'safe-test'
ON CONFLICT DO NOTHING;

-- ============================================================
SELECT
  (SELECT COUNT(*) FROM sites) AS sites,
  (SELECT COUNT(*) FROM departments) AS departments,
  (SELECT COUNT(*) FROM commission_rules) AS commission_rules,
  (SELECT COUNT(*) FROM conversation_logs) AS conversations,
  (SELECT COUNT(*) FROM user_profiles) AS profiles,
  (SELECT COUNT(*) FROM knowledge_base_v2) AS kb_v2;
