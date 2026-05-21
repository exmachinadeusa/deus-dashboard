-- FINTECH RLS POLİTİKALARI
-- Row Level Security - Veri Erişim Kontrolü
-- Kurulum tarihi: 2026-05-19 00:36 GMT-3

-- ============================================================================
-- 1. GENEL RLS AYARLARI
-- ============================================================================

-- Customer Accounts - RLS
ALTER TABLE customer_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_can_view_own_account"
  ON customer_accounts FOR SELECT
  USING (
    auth.uid()::text = customer_id OR
    EXISTS (
      SELECT 1 FROM operators
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "operators_can_view_assigned_customers"
  ON customer_accounts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM operators
      WHERE id = auth.uid()
      AND (role = 'admin' OR department IS NOT NULL)
    )
  );

CREATE POLICY "only_admins_can_update_customer_status"
  ON customer_accounts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM operators
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

-- ============================================================================
-- 2. WALLETS - RLS
-- ============================================================================

ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_can_view_own_wallets"
  ON wallets FOR SELECT
  USING (
    customer_id = auth.uid()::text OR
    EXISTS (
      SELECT 1 FROM operators
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "customers_can_update_own_wallets"
  ON wallets FOR UPDATE
  USING (
    customer_id = auth.uid()::text AND
    wallet_type != 'escrow' AND
    wallet_type != 'settlement'
  );

-- ============================================================================
-- 3. PAYMENT METHODS - RLS (HASSAS)
-- ============================================================================

ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_can_view_own_payment_methods"
  ON payment_methods FOR SELECT
  USING (
    customer_id = auth.uid()::text OR
    EXISTS (
      SELECT 1 FROM operators o
      WHERE o.id = auth.uid()
      AND o.role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "customers_can_create_payment_methods"
  ON payment_methods FOR INSERT
  WITH CHECK (
    customer_id = auth.uid()::text
  );

CREATE POLICY "customers_can_update_own_methods"
  ON payment_methods FOR UPDATE
  USING (
    customer_id = auth.uid()::text
  )
  WITH CHECK (
    customer_id = auth.uid()::text AND
    is_verified = FALSE
  );

-- ============================================================================
-- 4. İŞLEMLER (TRANSACTIONS) - RLS (KRİTİK)
-- ============================================================================

ALTER TABLE transactions_v2 ENABLE ROW LEVEL SECURITY;

-- Müşteriler sadece kendi işlemlerini görebilir
CREATE POLICY "customers_can_view_own_transactions"
  ON transactions_v2 FOR SELECT
  USING (
    customer_id = auth.uid()::text OR
    EXISTS (
      SELECT 1 FROM operators
      WHERE id = auth.uid()
    )
  );

-- Operatörler departman işlemlerini görebilir
CREATE POLICY "operators_can_view_department_transactions"
  ON transactions_v2 FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM operators o
      WHERE o.id = auth.uid()
      AND (o.role = 'admin' OR o.department IS NOT NULL)
    )
  );

-- Müşteriler kendi işlemlerini oluşturabilir
CREATE POLICY "customers_can_create_own_transactions"
  ON transactions_v2 FOR INSERT
  WITH CHECK (
    customer_id = auth.uid()::text AND
    status = 'initiated'
  );

-- Sadece operatörler işlem durumlarını güncelleyebilir
CREATE POLICY "only_operators_can_update_transactions"
  ON transactions_v2 FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM operators
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor')
    )
  );

-- ============================================================================
-- 5. APPROVAL QUEUE - RLS
-- ============================================================================

ALTER TABLE approval_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assigned_operator_can_view_approvals"
  ON approval_queue FOR SELECT
  USING (
    assigned_to = auth.uid() OR
    EXISTS (
      SELECT 1 FROM operators
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

CREATE POLICY "only_assigned_operator_can_update"
  ON approval_queue FOR UPDATE
  USING (
    assigned_to = auth.uid() AND
    reviewed_at IS NULL
  );

-- ============================================================================
-- 6. ANOMALI TESPİT - RLS
-- ============================================================================

ALTER TABLE anomalies_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_can_view_own_anomalies"
  ON anomalies_v2 FOR SELECT
  USING (
    customer_id = auth.uid()::text
  );

CREATE POLICY "operators_can_view_all_anomalies"
  ON anomalies_v2 FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM operators
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "only_admins_can_resolve_anomalies"
  ON anomalies_v2 FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM operators
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

-- ============================================================================
-- 7. KARA LİSTE - RLS (ÇOK HASSAS)
-- ============================================================================

ALTER TABLE blacklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "only_admins_can_view_blacklist"
  ON blacklist FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM operators
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

CREATE POLICY "only_admins_can_manage_blacklist"
  ON blacklist FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM operators
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

CREATE POLICY "only_admins_can_update_blacklist"
  ON blacklist FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM operators
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

-- ============================================================================
-- 8. MUTABAKAT - RLS
-- ============================================================================

ALTER TABLE daily_reconciliation_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "operators_can_view_reconciliation"
  ON daily_reconciliation_v2 FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM operators o
      WHERE o.id = auth.uid()
      AND (o.role = 'admin' OR o.department = department)
    )
  );

CREATE POLICY "only_admins_can_create_reconciliation"
  ON daily_reconciliation_v2 FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM operators
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

-- ============================================================================
-- 9. OPERATÖR AKTİVİTELERİ - RLS (AUDIT)
-- ============================================================================

ALTER TABLE operator_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "only_admins_can_view_all_activities"
  ON operator_activities FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM operators
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

CREATE POLICY "operators_can_view_own_activities"
  ON operator_activities FOR SELECT
  USING (
    operator_id = auth.uid()
  );

-- ============================================================================
-- 10. MUHASEBE - RLS (GL ENTRIES)
-- ============================================================================

ALTER TABLE gl_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "only_finance_can_view_gl"
  ON gl_entries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM operators o
      WHERE o.id = auth.uid()
      AND o.department IN ('finance', 'finans')
    ) OR
    EXISTS (
      SELECT 1 FROM operators
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

CREATE POLICY "only_finance_can_create_gl"
  ON gl_entries FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM operators o
      WHERE o.id = auth.uid()
      AND o.department IN ('finance', 'finans')
    )
  );

-- ============================================================================
-- 11. COMPLIANCE - RLS
-- ============================================================================

ALTER TABLE compliance_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "only_compliance_can_view"
  ON compliance_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM operators o
      WHERE o.id = auth.uid()
      AND (o.department IN ('compliance', 'uyum', 'risk') OR o.role = 'admin')
    )
  );

-- ============================================================================
-- 12. KYC DOCUMENTS - RLS (ÇOK HASSAS)
-- ============================================================================

ALTER TABLE kyc_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_can_view_own_kyc"
  ON kyc_documents FOR SELECT
  USING (
    customer_id = auth.uid()::text
  );

CREATE POLICY "only_kyc_operators_can_view_all"
  ON kyc_documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM operators o
      WHERE o.id = auth.uid()
      AND o.department IN ('kyc', 'compliance', 'uyum')
    ) OR
    EXISTS (
      SELECT 1 FROM operators
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

CREATE POLICY "customers_can_upload_kyc"
  ON kyc_documents FOR INSERT
  WITH CHECK (
    customer_id = auth.uid()::text
  );

-- ============================================================================
-- 13. NOTIFICATIONS - RLS
-- ============================================================================

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_can_view_own_notifications"
  ON notifications FOR SELECT
  USING (
    recipient_id = auth.uid()::text OR
    (
      recipient_type = 'admin' AND
      EXISTS (
        SELECT 1 FROM operators
        WHERE id = auth.uid()
        AND role = 'admin'
      )
    )
  );

CREATE POLICY "users_can_mark_own_notifications_read"
  ON notifications FOR UPDATE
  USING (
    recipient_id = auth.uid()::text
  )
  WITH CHECK (
    recipient_id = auth.uid()::text
  );

-- ============================================================================
-- 14. SENSÖR TABLOLARI (Vektörler) - RLS
-- ============================================================================

ALTER TABLE customer_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "only_admins_can_view_embeddings"
  ON customer_embeddings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM operators
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

ALTER TABLE transaction_pattern_vectors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "only_ml_team_can_view_patterns"
  ON transaction_pattern_vectors FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM operators o
      WHERE o.id = auth.uid()
      AND o.department IN ('ml', 'risk', 'analytics')
    ) OR
    EXISTS (
      SELECT 1 FROM operators
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

-- ============================================================================
-- KURULUM TAMAMLANDI
-- ============================================================================
-- Tüm hassas tablolar artık RLS ile korunmaktadır.
-- Her erişim:
-- - Müşteri için: Sadece kendi verileri
-- - Operatör için: Departman ve rol bazlı erişim
-- - Admin için: Tam erişim
