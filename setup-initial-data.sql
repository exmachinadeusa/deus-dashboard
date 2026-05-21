-- DEUS FINTECH - İLK VERİ SETUP
-- Test operatörü, müşteri ve işlem oluştur
-- Çalıştırma: Supabase SQL Editor'da yapıştır ve Run'ı tıkla

-- ============================================================================
-- 1. ADMIN OPERATÖRLERİ
-- ============================================================================

INSERT INTO operators (
  name,
  telegram_id,
  department,
  role,
  approval_authority,
  is_active
) VALUES
-- Admin
(
  'Sistem Yöneticisi',
  1234567890,
  'admin',
  'admin',
  jsonb_build_object(
    'auto_approve_limit', 5000,
    'operator_approve_limit', 50000,
    'requires_admin_escalation', true
  ),
  true
),
-- Supervisor
(
  'Senan Süpervizör',
  9876543210,
  'operations',
  'supervisor',
  jsonb_build_object(
    'auto_approve_limit', 5000,
    'operator_approve_limit', 50000,
    'requires_admin_escalation', true
  ),
  true
),
-- Operator
(
  'Ali Operatör - Yatırım',
  5555555555,
  'yatirım',
  'operator',
  jsonb_build_object(
    'auto_approve_limit', 2500,
    'operator_approve_limit', 25000,
    'requires_admin_escalation', true
  ),
  true
),
(
  'Ayşe Operatör - Çekim',
  4444444444,
  'cekim',
  'operator',
  jsonb_build_object(
    'auto_approve_limit', 2500,
    'operator_approve_limit', 25000,
    'requires_admin_escalation', true
  ),
  true
);

-- ============================================================================
-- 2. TEST MÜŞTERİLERİ
-- ============================================================================

INSERT INTO customer_accounts (
  customer_id,
  customer_name,
  customer_email,
  customer_phone,
  kyc_status,
  account_type,
  account_status,
  balance,
  available_balance,
  credit_limit,
  daily_withdrawal_limit,
  daily_deposit_limit
) VALUES
-- Test Müşteri 1 - Doğrulanmış
(
  'CUST_TEST_001',
  'Ayşe Yılmaz',
  'ayse@test.com',
  '+90 555 1234567',
  'verified',
  'standard',
  'active',
  10000.00,
  10000.00,
  5000.00,
  5000.00,
  50000.00
),
-- Test Müşteri 2 - Yeni (KYC pending)
(
  'CUST_TEST_002',
  'Mehmet Şahin',
  'mehmet@test.com',
  '+90 555 7654321',
  'pending',
  'standard',
  'active',
  2500.00,
  2000.00,
  0.00,
  2000.00,
  25000.00
),
-- Test Müşteri 3 - VIP
(
  'CUST_TEST_003',
  'Kemal Ürün',
  'kemal@test.com',
  '+90 555 9999999',
  'verified',
  'vip',
  'active',
  100000.00,
  100000.00,
  50000.00,
  25000.00,
  200000.00
);

-- ============================================================================
-- 3. CÜZDANLAR
-- ============================================================================

INSERT INTO wallets (
  customer_id,
  wallet_type,
  currency,
  balance,
  available_balance,
  locked_balance
) VALUES
-- Müşteri 1 - Ana Cüzdan
(
  'CUST_TEST_001',
  'main',
  'TRL',
  10000.00,
  10000.00,
  0
),
(
  'CUST_TEST_001',
  'bonus',
  'TRL',
  500.00,
  500.00,
  0
),
-- Müşteri 2 - Ana Cüzdan
(
  'CUST_TEST_002',
  'main',
  'TRL',
  2500.00,
  2000.00,
  500.00
),
-- Müşteri 3 - VIP Cüzdan
(
  'CUST_TEST_003',
  'main',
  'TRL',
  100000.00,
  100000.00,
  0
),
(
  'CUST_TEST_003',
  'bonus',
  'TRL',
  5000.00,
  5000.00,
  0
);

-- ============================================================================
-- 4. ÖDEME METODLARI
-- ============================================================================

INSERT INTO payment_methods (
  customer_id,
  method_type,
  provider,
  account_holder_name,
  card_last_four,
  card_brand,
  bank_code,
  bank_name,
  is_verified,
  is_primary,
  is_active
) VALUES
-- Müşteri 1 - Banka Transferi
(
  'CUST_TEST_001',
  'bank_transfer',
  'DenizBank',
  'Ayşe Yılmaz',
  NULL,
  NULL,
  'DENIZ',
  'Deniz Bank A.Ş.',
  true,
  true,
  true
),
-- Müşteri 1 - Kredi Kartı
(
  'CUST_TEST_001',
  'credit_card',
  'Visa',
  'Ayşe Yılmaz',
  '1234',
  'Visa',
  NULL,
  NULL,
  true,
  false,
  true
),
-- Müşteri 2 - Banka Transferi (Doğrulanmamış)
(
  'CUST_TEST_002',
  'bank_transfer',
  'İşBankası',
  'Mehmet Şahin',
  NULL,
  NULL,
  'ISBANK',
  'İş Bankası A.Ş.',
  false,
  true,
  true
),
-- Müşteri 3 - Banka + Kredi Kartı
(
  'CUST_TEST_003',
  'bank_transfer',
  'Garanti',
  'Kemal Ürün',
  NULL,
  NULL,
  'GARAN',
  'Garanti Bankası A.Ş.',
  true,
  true,
  true
);

-- ============================================================================
-- 5. DEPARTMAN KASALARI
-- ============================================================================

INSERT INTO department_cash_v2 (
  department,
  department_type,
  balance,
  total_in,
  total_out
) VALUES
(
  'yatirım',
  'operations',
  250000.00,
  500000.00,
  250000.00
),
(
  'cekim',
  'operations',
  180000.00,
  400000.00,
  220000.00
),
(
  'risk',
  'finance',
  50000.00,
  100000.00,
  50000.00
),
(
  'finans',
  'finance',
  100000.00,
  500000.00,
  400000.00
);

-- ============================================================================
-- 6. RİSK KURALARI
-- ============================================================================

INSERT INTO risk_rules (
  rule_name,
  rule_description,
  rule_type,
  condition_logic,
  risk_score_impact,
  actions,
  is_active,
  priority
) VALUES
-- Yüksek Hızlı İşlem
(
  'HIGH_VELOCITY_RULE',
  'Saatte 5+ işlem yapan müşteri',
  'velocity',
  jsonb_build_object(
    'threshold', 5,
    'period', '1 hour'
  ),
  0.25,
  jsonb_build_array(
    jsonb_build_object('type', 'escalate', 'level', 'operator')
  ),
  true,
  10
),
-- Yeni Ödeme Metodu
(
  'NEW_PAYMENT_METHOD',
  'Doğrulanmamış yeni ödeme metodu',
  'behavioral',
  jsonb_build_object(
    'condition', 'unverified_payment_method'
  ),
  0.15,
  jsonb_build_array(
    jsonb_build_object('type', 'flag', 'severity', 'medium')
  ),
  true,
  7
),
-- Anlık Tutar Yükselişi
(
  'AMOUNT_SPIKE',
  'Ortalamadan 2.5x fazla tutar',
  'threshold',
  jsonb_build_object(
    'factor', 2.5,
    'lookback_days', 30
  ),
  0.20,
  jsonb_build_array(
    jsonb_build_object('type', 'escalate', 'level', 'supervisor')
  ),
  true,
  8
),
-- Büyük Çekim
(
  'LARGE_WITHDRAWAL',
  '10,000 TL üstü çekim',
  'threshold',
  jsonb_build_object(
    'amount', 10000,
    'operation', 'withdrawal'
  ),
  0.15,
  jsonb_build_array(
    jsonb_build_object('type', 'require_approval', 'level', 'operator')
  ),
  true,
  6
);

-- ============================================================================
-- 7. GEÇMIŞ İŞLEMLER (Test Amaçlı)
-- ============================================================================

-- Müşteri 1 için başarılı işlemler
INSERT INTO transactions_v2 (
  reference_id,
  transaction_type,
  customer_id,
  from_account,
  to_account,
  amount,
  currency,
  fee,
  net_amount,
  status,
  approval_level,
  risk_score,
  created_at,
  completed_at
) VALUES
(
  'TXN-20260519-001',
  'deposit',
  'CUST_TEST_001',
  NULL,
  (SELECT id FROM wallets WHERE customer_id = 'CUST_TEST_001' AND wallet_type = 'main' LIMIT 1),
  5000.00,
  'TRL',
  50.00,
  4950.00,
  'completed',
  'auto',
  0.05,
  NOW() - INTERVAL '2 days',
  NOW() - INTERVAL '2 days'
),
(
  'TXN-20260519-002',
  'withdrawal',
  'CUST_TEST_001',
  (SELECT id FROM wallets WHERE customer_id = 'CUST_TEST_001' AND wallet_type = 'main' LIMIT 1),
  NULL,
  2000.00,
  'TRL',
  20.00,
  1980.00,
  'completed',
  'auto',
  0.12,
  NOW() - INTERVAL '1 day',
  NOW() - INTERVAL '1 day'
),
(
  'TXN-20260519-003',
  'deposit',
  'CUST_TEST_001',
  NULL,
  (SELECT id FROM wallets WHERE customer_id = 'CUST_TEST_001' AND wallet_type = 'bonus' LIMIT 1),
  500.00,
  'TRL',
  5.00,
  495.00,
  'completed',
  'auto',
  0.03,
  NOW() - INTERVAL '1 hour',
  NOW() - INTERVAL '1 hour'
);

-- ============================================================================
-- 8. ONAY QUEUE (Test)
-- ============================================================================

-- Pending işlem oluştur (manuel test için) - PostgreSQL CTE syntax
WITH new_txn AS (
  INSERT INTO transactions_v2 (
    reference_id,
    transaction_type,
    customer_id,
    from_account,
    to_account,
    amount,
    currency,
    fee,
    net_amount,
    status,
    risk_score,
    metadata
  )
  SELECT
    'TXN-20260519-PENDING-' || SUBSTRING(md5(random()::text), 1, 8),
    'withdrawal',
    'CUST_TEST_003',
    (SELECT id FROM wallets WHERE customer_id = 'CUST_TEST_003' AND wallet_type = 'main' LIMIT 1),
    NULL,
    25000.00,
    'TRL',
    250.00,
    24750.00,
    'initiated',
    0.35,
    jsonb_build_object('reason', 'test_pending_approval')
  RETURNING id
)
INSERT INTO approval_queue (
  transaction_id,
  required_approval_level,
  priority,
  is_urgent
)
SELECT id, 'operator', 8, false FROM new_txn;

-- ============================================================================
-- 9. GELECEK TARİHLER İÇİN MUTABAKAT
-- ============================================================================

INSERT INTO daily_reconciliation_v2 (
  reconciliation_date,
  department,
  opening_balance,
  total_deposits,
  total_withdrawals,
  total_refunds,
  closing_balance,
  calculated_balance,
  discrepancy,
  verification_status
)
SELECT
  CURRENT_DATE - INTERVAL '1 day',
  'yatirım',
  245000.00,
  50000.00,
  20000.00,
  0,
  250000.00,
  275000.00,
  0,
  'verified';

-- ============================================================================
-- 10. COMPLIANCE OLAYLARI
-- ============================================================================

INSERT INTO compliance_events (
  event_type,
  customer_id,
  description,
  regulatory_requirement
) VALUES
(
  'KYC_INITIATED',
  'CUST_TEST_002',
  'KYC doğrulama başlatıldı',
  'TR_KYC_REQUIREMENT'
),
(
  'KYC_COMPLETED',
  'CUST_TEST_001',
  'KYC başarıyla tamamlandı',
  'TR_KYC_REQUIREMENT'
);

-- ============================================================================
-- SETUP TAMAMLANDI
-- ============================================================================

-- Sonuç Kontrolü
SELECT 
  'Operatörler:' as Type, 
  COUNT(*) as Count 
FROM operators
UNION ALL
SELECT 'Müşteriler', COUNT(*) FROM customer_accounts
UNION ALL
SELECT 'Cüzdanlar', COUNT(*) FROM wallets
UNION ALL
SELECT 'İşlemler', COUNT(*) FROM transactions_v2
UNION ALL
SELECT 'Ödeme Metodları', COUNT(*) FROM payment_methods
UNION ALL
SELECT 'Departman Kasaları', COUNT(*) FROM department_cash_v2
ORDER BY Type;
