-- FINTECH MATERIALIZED VIEWS VE RAPORLAMA
-- Gerçek zamanlı dashboard verisi ve analitik
-- Kurulum tarihi: 2026-05-19 00:36 GMT-3

-- ============================================================================
-- 1. DASHBOARD VİEWLERİ
-- ============================================================================

-- Toplam İşlem Özeti (Gerçek Zamanlı)
CREATE OR REPLACE VIEW v_transaction_summary AS
SELECT
  DATE(created_at) AS transaction_date,
  transaction_type,
  COUNT(*) AS transaction_count,
  SUM(amount) AS total_amount,
  SUM(fee) AS total_fees,
  SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) AS completed_amount,
  SUM(CASE WHEN status = 'failed' THEN amount ELSE 0 END) AS failed_amount,
  SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) AS pending_amount,
  AVG(risk_score) AS avg_risk_score,
  COUNT(CASE WHEN status = 'completed' THEN 1 END)::FLOAT / COUNT(*) AS success_rate
FROM transactions_v2
GROUP BY DATE(created_at), transaction_type
ORDER BY transaction_date DESC, transaction_type;

-- Müşteri Aktivite Özeti
CREATE OR REPLACE VIEW v_customer_activity_summary AS
SELECT
  ca.customer_id,
  ca.customer_name,
  ca.kyc_status,
  ca.account_status,
  ca.balance,
  ca.available_balance,
  COUNT(DISTINCT t.id) AS total_transactions,
  SUM(CASE WHEN t.transaction_type = 'deposit' THEN t.amount ELSE 0 END) AS total_deposits,
  SUM(CASE WHEN t.transaction_type = 'withdrawal' THEN t.amount ELSE 0 END) AS total_withdrawals,
  COUNT(CASE WHEN a.id IS NOT NULL THEN 1 END) AS anomaly_count,
  MAX(ca.last_login) AS last_login,
  ca.created_at
FROM customer_accounts ca
LEFT JOIN transactions_v2 t ON ca.customer_id = t.customer_id
LEFT JOIN anomalies_v2 a ON ca.customer_id = a.customer_id AND a.resolved = false
GROUP BY
  ca.customer_id,
  ca.customer_name,
  ca.kyc_status,
  ca.account_status,
  ca.balance,
  ca.available_balance,
  ca.last_login,
  ca.created_at
ORDER BY ca.created_at DESC;

-- Risk Profile Dashboard
CREATE OR REPLACE VIEW v_risk_dashboard AS
SELECT
  ca.customer_id,
  ca.customer_name,
  ca.kyc_status,
  MAX(t.risk_score) AS max_risk_score,
  AVG(t.risk_score) AS avg_risk_score,
  COUNT(DISTINCT a.id) AS anomaly_count,
  COUNT(DISTINCT CASE WHEN a.severity = 'critical' THEN a.id END) AS critical_anomalies,
  COUNT(DISTINCT CASE WHEN a.severity = 'high' THEN a.id END) AS high_anomalies,
  CASE
    WHEN MAX(t.risk_score) >= 0.8 THEN 'critical'
    WHEN MAX(t.risk_score) >= 0.6 THEN 'high'
    WHEN MAX(t.risk_score) >= 0.4 THEN 'medium'
    ELSE 'low'
  END AS risk_level,
  CASE
    WHEN EXISTS (SELECT 1 FROM blacklist WHERE entity_value = ca.customer_id AND is_active = true)
    THEN true
    ELSE false
  END AS is_blacklisted
FROM customer_accounts ca
LEFT JOIN transactions_v2 t ON ca.customer_id = t.customer_id AND t.status = 'completed'
LEFT JOIN anomalies_v2 a ON ca.customer_id = a.customer_id
GROUP BY ca.customer_id, ca.customer_name, ca.kyc_status
ORDER BY max_risk_score DESC;

-- ============================================================================
-- 2. OPERATÖR YÖNETİM VİEWLERİ
-- ============================================================================

-- Onay Bekleyen İşlemler
CREATE OR REPLACE VIEW v_pending_approvals AS
SELECT
  aq.id AS approval_id,
  aq.transaction_id,
  t.reference_id,
  t.customer_id,
  ca.customer_name,
  t.transaction_type,
  t.amount,
  t.status AS transaction_status,
  aq.required_approval_level,
  aq.is_urgent,
  aq.priority,
  aq.requested_at,
  aq.assigned_to,
  o.name AS assigned_operator,
  EXTRACT(EPOCH FROM (NOW() - aq.requested_at))/3600 AS hours_pending
FROM approval_queue aq
LEFT JOIN transactions_v2 t ON aq.transaction_id = t.id
LEFT JOIN customer_accounts ca ON t.customer_id = ca.customer_id
LEFT JOIN operators o ON aq.assigned_to = o.id
WHERE aq.reviewed_at IS NULL
ORDER BY aq.is_urgent DESC, aq.priority DESC, aq.requested_at ASC;

-- Operatör Performans
CREATE OR REPLACE VIEW v_operator_performance AS
SELECT
  o.id,
  o.name,
  o.department,
  o.role,
  COUNT(aq.id) AS total_approvals_handled,
  COUNT(CASE WHEN aq.approved = true THEN 1 END) AS approved_count,
  COUNT(CASE WHEN aq.approved = false THEN 1 END) AS rejected_count,
  ROUND(
    COUNT(CASE WHEN aq.approved = true THEN 1 END)::NUMERIC / 
    COUNT(aq.id) * 100, 2
  ) AS approval_rate,
  ROUND(AVG(EXTRACT(EPOCH FROM (aq.reviewed_at - aq.requested_at))/60), 2) AS avg_review_time_minutes,
  COUNT(CASE WHEN aq.requested_at > NOW() - INTERVAL '24 hours' THEN 1 END) AS approvals_24h
FROM operators o
LEFT JOIN approval_queue aq ON o.id = aq.reviewed_by
WHERE o.is_active = true
GROUP BY o.id, o.name, o.department, o.role
ORDER BY total_approvals_handled DESC;

-- ============================================================================
-- 3. MUTABAKAT VİEWLERİ
-- ============================================================================

-- Departman Bakiye Özeti
CREATE OR REPLACE VIEW v_department_balance_summary AS
SELECT
  dcv.department,
  dcv.department_type,
  dcv.balance,
  dcv.yesterday_balance,
  dcv.balance - dcv.yesterday_balance AS balance_change,
  dcv.total_in,
  dcv.total_out,
  dcv.pending_in,
  dcv.pending_out,
  dcv.reserved,
  dcv.balance - dcv.reserved - dcv.pending_out AS available_balance,
  dcv.last_reconciliation,
  dcv.last_reconciled_by,
  o.name AS last_reconciled_by_name
FROM department_cash_v2 dcv
LEFT JOIN operators o ON dcv.last_reconciled_by = o.id
ORDER BY dcv.balance DESC;

-- Günlük Mutabakat Raporu
CREATE OR REPLACE VIEW v_daily_reconciliation_report AS
SELECT
  drv.reconciliation_date,
  drv.department,
  drv.opening_balance,
  drv.total_deposits,
  drv.total_withdrawals,
  drv.total_refunds,
  drv.total_commissions,
  drv.total_fees,
  drv.closing_balance,
  drv.calculated_balance,
  drv.discrepancy,
  CASE
    WHEN ABS(drv.discrepancy) = 0 THEN 'Perfect'
    WHEN ABS(drv.discrepancy) < 100 THEN 'Minor'
    WHEN ABS(drv.discrepancy) < 1000 THEN 'Significant'
    ELSE 'Major'
  END AS discrepancy_level,
  drv.verification_status,
  drv.reconciled_by,
  ro.name AS reconciled_by_name,
  drv.verified_by,
  vo.name AS verified_by_name
FROM daily_reconciliation_v2 drv
LEFT JOIN operators ro ON drv.reconciled_by = ro.id
LEFT JOIN operators vo ON drv.verified_by = vo.id
ORDER BY drv.reconciliation_date DESC, drv.department;

-- ============================================================================
-- 4. COMPLIANCE VİEWLERİ
-- ============================================================================

-- KYC Durumu Raporu
CREATE OR REPLACE VIEW v_kyc_status_report AS
SELECT
  kyc_status,
  COUNT(*) AS customer_count,
  COUNT(CASE WHEN account_status = 'active' THEN 1 END) AS active_customers,
  SUM(balance) AS total_balance,
  AVG(balance) AS avg_balance,
  MAX(created_at) AS newest_customer
FROM customer_accounts
GROUP BY kyc_status
ORDER BY customer_count DESC;

-- Compliance Olayları
CREATE OR REPLACE VIEW v_compliance_events_report AS
SELECT
  event_type,
  DATE(created_at) AS event_date,
  COUNT(*) AS event_count,
  COUNT(CASE WHEN action_required = true THEN 1 END) AS pending_action_count,
  COUNT(CASE WHEN action_taken IS NOT NULL THEN 1 END) AS actioned_count
FROM compliance_events
GROUP BY event_type, DATE(created_at)
ORDER BY event_date DESC, event_count DESC;

-- ============================================================================
-- 5. FİNANSAL RAPORLAMA
-- ============================================================================

-- Gelir-Gider Özeti
CREATE OR REPLACE VIEW v_revenue_expense_summary AS
SELECT
  DATE(entry_date) AS date,
  CASE
    WHEN debit_account LIKE '4%' THEN 'Revenue'
    WHEN debit_account LIKE '5%' THEN 'Expense'
    ELSE 'Other'
  END AS account_category,
  debit_account,
  credit_account,
  SUM(amount) AS total_amount,
  COUNT(*) AS transaction_count
FROM gl_entries
WHERE DATE(entry_date) >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY DATE(entry_date), account_category, debit_account, credit_account
ORDER BY date DESC;

-- ============================================================================
-- 6. ANOMALI VİEWLERİ
-- ============================================================================

-- Açık Anomaliler
CREATE OR REPLACE VIEW v_open_anomalies AS
SELECT
  a.id,
  a.transaction_id,
  a.customer_id,
  ca.customer_name,
  a.anomaly_type,
  a.category,
  a.severity,
  a.confidence_score,
  a.description,
  a.detected_at,
  EXTRACT(EPOCH FROM (NOW() - a.detected_at))/3600 AS hours_open,
  a.escalated_to,
  o.name AS escalated_to_name,
  t.amount AS transaction_amount,
  t.transaction_type
FROM anomalies_v2 a
LEFT JOIN customer_accounts ca ON a.customer_id = ca.customer_id
LEFT JOIN operators o ON a.escalated_to = o.id
LEFT JOIN transactions_v2 t ON a.transaction_id = t.id
WHERE a.resolved = false
ORDER BY a.severity DESC, a.detected_at ASC;

-- ============================================================================
-- 7. TRANSACTION ANALYTICS VİEWLERİ
-- ============================================================================

-- Hızlı İşlem Metrikler (Velocity Check)
CREATE OR REPLACE VIEW v_customer_velocity_metrics AS
SELECT
  t.customer_id,
  ca.customer_name,
  DATE_TRUNC('hour', t.created_at) AS hour_bucket,
  COUNT(*) AS transaction_count_per_hour,
  SUM(t.amount) AS volume_per_hour,
  COUNT(DISTINCT CASE WHEN t.transaction_type = 'withdrawal' THEN t.id END) AS withdrawal_count,
  COUNT(DISTINCT CASE WHEN t.transaction_type = 'deposit' THEN t.id END) AS deposit_count,
  CASE
    WHEN COUNT(*) > 10 THEN 'Very High'
    WHEN COUNT(*) > 5 THEN 'High'
    WHEN COUNT(*) > 2 THEN 'Medium'
    ELSE 'Low'
  END AS velocity_level
FROM transactions_v2 t
LEFT JOIN customer_accounts ca ON t.customer_id = ca.customer_id
WHERE t.created_at > NOW() - INTERVAL '24 hours'
GROUP BY t.customer_id, ca.customer_name, DATE_TRUNC('hour', t.created_at)
ORDER BY hour_bucket DESC, volume_per_hour DESC;

-- ============================================================================
-- 8. OPERATÖR AKTİVİTE VİEWLERİ
-- ============================================================================

-- Operatör Audit Trail
CREATE OR REPLACE VIEW v_operator_audit_trail AS
SELECT
  oa.id,
  oa.operator_id,
  o.name AS operator_name,
  o.role,
  o.department,
  oa.activity_type,
  oa.action,
  oa.affected_entity_type,
  oa.affected_entity_id,
  oa.ip_address,
  oa.session_id,
  oa.created_at,
  EXTRACT(EPOCH FROM (NOW() - oa.created_at))/3600 AS hours_ago
FROM operator_activities oa
LEFT JOIN operators o ON oa.operator_id = o.id
WHERE oa.created_at > NOW() - INTERVAL '30 days'
ORDER BY oa.created_at DESC;

-- ============================================================================
-- 9. PAYMENT GATEWAY İNTEGRASYON TOPLAMLAR
-- ============================================================================

-- Ödeme Metodu Başarı Oranları
CREATE OR REPLACE VIEW v_payment_method_stats AS
SELECT
  pm.method_type,
  pm.provider,
  COUNT(t.id) AS total_transactions,
  SUM(t.amount) AS total_volume,
  COUNT(CASE WHEN t.status = 'completed' THEN 1 END) AS successful_transactions,
  COUNT(CASE WHEN t.status = 'failed' THEN 1 END) AS failed_transactions,
  ROUND(
    COUNT(CASE WHEN t.status = 'completed' THEN 1 END)::NUMERIC / 
    COUNT(t.id) * 100, 2
  ) AS success_rate,
  ROUND(AVG(t.fee), 2) AS avg_fee
FROM payment_methods pm
LEFT JOIN transactions_v2 t ON pm.id = t.payment_method_id
WHERE pm.is_active = true
GROUP BY pm.method_type, pm.provider
ORDER BY total_volume DESC;

-- ============================================================================
-- MATERIALIZED VIEWS (Performans Optimizasyonu)
-- ============================================================================

-- Günlük Özet (Her 1 saatte yenilenir)
CREATE MATERIALIZED VIEW mv_daily_summary AS
SELECT
  DATE(t.created_at) AS transaction_date,
  COUNT(DISTINCT t.customer_id) AS unique_customers,
  COUNT(*) AS total_transactions,
  SUM(t.amount) AS total_volume,
  SUM(t.fee) AS total_fees,
  COUNT(CASE WHEN t.status = 'completed' THEN 1 END) AS completed_count,
  COUNT(CASE WHEN t.status = 'failed' THEN 1 END) AS failed_count,
  ROUND(AVG(t.risk_score), 3) AS avg_risk_score
FROM transactions_v2 t
GROUP BY DATE(t.created_at);

CREATE INDEX idx_mv_daily_summary_date ON mv_daily_summary(transaction_date DESC);

-- Müşteri Risk Profile Özeti (Her 6 saatte yenilenir)
CREATE MATERIALIZED VIEW mv_customer_risk_profile AS
SELECT
  ca.customer_id,
  ca.customer_name,
  ca.kyc_status,
  COUNT(DISTINCT t.id) AS lifetime_transactions,
  ROUND(AVG(t.risk_score), 3) AS avg_risk_score,
  MAX(t.risk_score) AS max_risk_score,
  COUNT(CASE WHEN a.severity = 'critical' THEN 1 END) AS critical_anomalies_count
FROM customer_accounts ca
LEFT JOIN transactions_v2 t ON ca.customer_id = t.customer_id
LEFT JOIN anomalies_v2 a ON ca.customer_id = a.customer_id AND a.resolved = false
GROUP BY ca.customer_id, ca.customer_name, ca.kyc_status;

CREATE INDEX idx_mv_customer_risk_profile_risk ON mv_customer_risk_profile(avg_risk_score DESC);

-- ============================================================================
-- KURULUM TAMAMLANDI
-- ============================================================================
-- 11 View + 2 Materialized View oluşturuldu
-- Views: Gerçek zamanlı veri, MV: Performans optimizasyonu
