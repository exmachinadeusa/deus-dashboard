-- ============================================================
-- DEUS — Supabase Veritabanı Şeması
-- Migration: 001_deus_schema
-- Supabase SQL Editor'a yapıştır ve çalıştır
-- ============================================================

-- UUID extension (Supabase'de zaten aktif, güvenli)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── ENUM TIPLERI ─────────────────────────────────────────────

CREATE TYPE department_status AS ENUM ('active', 'passive', 'suspended');
CREATE TYPE transaction_type AS ENUM ('deposit', 'withdrawal', 'supplement', 'commission');
CREATE TYPE transaction_status AS ENUM ('pending', 'approved', 'rejected', 'auto_rejected', 'duplicate');
CREATE TYPE blacklist_type AS ENUM ('tc', 'iban', 'phone', 'name', 'ip');
CREATE TYPE alert_severity AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE decision_level AS ENUM ('1_informative', '2_routing', '3_resolver', '4_strategist');

-- ── SITES (Anlaşmalı siteler) ─────────────────────────────────

CREATE TABLE sites (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        text NOT NULL UNIQUE,          -- "BetSite1", "CasinoX"
  code        text NOT NULL UNIQUE,          -- kısa kod: "BS1", "CX"
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── DEPARTMENTS (DP — Distribution Partners) ──────────────────

CREATE TABLE departments (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id           uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name              text NOT NULL,
  iban              text NOT NULL UNIQUE,        -- tam IBAN
  iban_prefix       text GENERATED ALWAYS AS (substring(iban, 1, 10)) STORED,
  telegram_chat_id  bigint,                      -- Grup ID
  status            department_status NOT NULL DEFAULT 'active',
  daily_limit       numeric(18, 2) NOT NULL DEFAULT 0,
  current_balance   numeric(18, 2) NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ── COMMISSION RULES ──────────────────────────────────────────

CREATE TABLE commission_rules (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id     uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  type        transaction_type NOT NULL,
  rate        numeric(5, 4) NOT NULL DEFAULT 0,   -- 0.0250 = %2.5
  fixed_fee   numeric(18, 2) NOT NULL DEFAULT 0,
  min_amount  numeric(18, 2) NOT NULL DEFAULT 0,
  max_amount  numeric(18, 2),                      -- NULL = sınırsız
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── TRANSACTIONS ──────────────────────────────────────────────

CREATE TABLE transactions (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id             uuid NOT NULL REFERENCES sites(id),
  department_id       uuid REFERENCES departments(id),

  -- Üye bilgisi
  member_id           text,                        -- Platform üye ID
  member_name         text,

  -- İşlem detayı
  type                transaction_type NOT NULL,
  amount              numeric(18, 2) NOT NULL,
  currency            text NOT NULL DEFAULT 'TRY',
  commission_amount   numeric(18, 2) NOT NULL DEFAULT 0,

  -- Banka/Dekont bilgisi
  sender_name         text,
  sender_iban         text,
  receiver_name       text,
  receiver_iban       text,
  bank_name           text,
  receipt_number      text UNIQUE,                 -- Duplikasyon kontrolü
  receipt_date        timestamptz,
  description         text,
  receipt_image_url   text,                        -- Storage URL

  -- AI analiz
  ai_confidence       numeric(4, 3),               -- 0.000–1.000
  ai_parse_raw        jsonb,                       -- Claude'un ham çıktısı
  name_match          boolean,                     -- İsim eşleşmesi
  auto_processed      boolean NOT NULL DEFAULT false,

  -- Durum
  status              transaction_status NOT NULL DEFAULT 'pending',
  rejected_reason     text,
  approved_by         text,                        -- Operator ID veya 'auto'
  approved_at         timestamptz,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ── DAILY RECONCILIATION ──────────────────────────────────────

CREATE TABLE daily_reconciliation (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id             uuid NOT NULL REFERENCES sites(id),
  date                date NOT NULL,

  opening_balance     numeric(18, 2) NOT NULL DEFAULT 0,   -- Devir
  total_deposits      numeric(18, 2) NOT NULL DEFAULT 0,
  total_withdrawals   numeric(18, 2) NOT NULL DEFAULT 0,
  deposit_commission  numeric(18, 2) NOT NULL DEFAULT 0,
  withdrawal_commission numeric(18, 2) NOT NULL DEFAULT 0,
  supplement_amount   numeric(18, 2) NOT NULL DEFAULT 0,   -- Takviye
  closing_balance     numeric(18, 2) GENERATED ALWAYS AS (
    opening_balance + total_deposits - total_withdrawals
    - deposit_commission - withdrawal_commission + supplement_amount
  ) STORED,

  is_finalized        boolean NOT NULL DEFAULT false,
  finalized_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),

  UNIQUE(site_id, date)
);

-- ── BLACKLIST ──────────────────────────────────────────────────

CREATE TABLE blacklist (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  type        blacklist_type NOT NULL,
  value       text NOT NULL,                -- TC no, IBAN, telefon, isim
  reason      text,
  added_by    text,                         -- Operator ID
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE(type, value)
);

-- ── OPERATORS ─────────────────────────────────────────────────

CREATE TABLE operators (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_user_id    bigint NOT NULL UNIQUE,
  username            text,
  full_name           text NOT NULL,
  role                text NOT NULL DEFAULT 'operator',  -- operator | admin | super_admin
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ── OPERATOR SHIFTS ───────────────────────────────────────────

CREATE TABLE operator_shifts (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  operator_id     uuid NOT NULL REFERENCES operators(id),
  shift_start     timestamptz NOT NULL DEFAULT now(),
  shift_end       timestamptz,
  transaction_count int NOT NULL DEFAULT 0,
  avg_response_ms   int,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── ALERTS ────────────────────────────────────────────────────

CREATE TABLE alerts (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id       uuid REFERENCES sites(id),
  department_id uuid REFERENCES departments(id),
  severity      alert_severity NOT NULL DEFAULT 'medium',
  category      text NOT NULL,              -- 'anomaly', 'limit', 'balance', 'fraud'
  title         text NOT NULL,
  details       jsonb,
  is_resolved   boolean NOT NULL DEFAULT false,
  resolved_by   text,
  resolved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── AUDIT LOG ─────────────────────────────────────────────────

CREATE TABLE audit_log (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor           text NOT NULL,            -- 'system', 'ai', operator_id
  action          text NOT NULL,            -- 'approve_transaction', 'add_blacklist', vb.
  entity_type     text NOT NULL,            -- 'transaction', 'department', vb.
  entity_id       uuid,
  before_state    jsonb,
  after_state     jsonb,
  decision_level  decision_level,
  ai_reasoning    text,                     -- Karar gerekçesi (AI ise)
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── INDEX'LER ─────────────────────────────────────────────────

-- Transactions
CREATE INDEX idx_transactions_site_id ON transactions(site_id);
CREATE INDEX idx_transactions_department_id ON transactions(department_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_receipt_number ON transactions(receipt_number);
CREATE INDEX idx_transactions_sender_iban ON transactions(sender_iban);
CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);

-- Blacklist — hızlı arama için
CREATE INDEX idx_blacklist_value ON blacklist(value);
CREATE INDEX idx_blacklist_type_value ON blacklist(type, value);

-- Departments IBAN arama
CREATE INDEX idx_departments_iban ON departments(iban);

-- Alerts
CREATE INDEX idx_alerts_unresolved ON alerts(is_resolved) WHERE is_resolved = false;

-- Audit log
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);

-- ── UPDATED_AT TRIGGER ────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sites_updated_at
  BEFORE UPDATE ON sites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_departments_updated_at
  BEFORE UPDATE ON departments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── ROW LEVEL SECURITY ────────────────────────────────────────
-- Service key tüm satırlara erişir, anon key kısıtlı

ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE blacklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Service role bypass (bot bu key ile çalışır)
CREATE POLICY "service_role_all" ON sites FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON departments FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON transactions FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON blacklist FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON audit_log FOR ALL TO service_role USING (true);

-- ── SEED: İlk admin operatör (Telegram user ID'ni gir) ────────
-- INSERT INTO operators (telegram_user_id, full_name, role)
-- VALUES (123456789, 'Admin', 'super_admin');
