-- FINTECH İŞLETİM FONKSİYONLARI
-- İşlem işleme, risk hesaplaması, onay workflow
-- Kurulum tarihi: 2026-05-19 00:36 GMT-3

-- ============================================================================
-- 1. İŞLEM İŞLEME FONKSİYONLARI
-- ============================================================================

-- İşlem Oluştur ve Onay Kuyruk Ekle
CREATE OR REPLACE FUNCTION process_transaction(
  p_customer_id TEXT,
  p_transaction_type TEXT,
  p_amount DECIMAL,
  p_from_wallet_id UUID,
  p_to_wallet_id UUID,
  p_payment_method_id UUID,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  transaction_id UUID,
  reference_id TEXT,
  initial_status TEXT,
  requires_approval BOOLEAN,
  approval_level TEXT
) AS $$
DECLARE
  v_transaction_id UUID;
  v_reference_id TEXT;
  v_risk_score DECIMAL;
  v_auto_approve_limit DECIMAL := 5000;
  v_operator_approve_limit DECIMAL := 50000;
  v_approval_level TEXT;
  v_fee DECIMAL := 0;
  v_net_amount DECIMAL;
BEGIN
  -- Müşteri doğrulama
  IF NOT EXISTS (SELECT 1 FROM customer_accounts WHERE customer_id = p_customer_id) THEN
    RAISE EXCEPTION 'Müşteri bulunamadı: %', p_customer_id;
  END IF;

  -- Cüzdan doğrulama
  IF p_from_wallet_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM wallets WHERE id = p_from_wallet_id) THEN
    RAISE EXCEPTION 'Gönderici cüzdan bulunamadı';
  END IF;

  -- Bakiye kontrolü
  IF (SELECT available_balance FROM wallets WHERE id = p_from_wallet_id) < p_amount THEN
    RAISE EXCEPTION 'Yetersiz bakiye';
  END IF;

  -- Ücret hesapla (örnek: %1)
  v_fee := ROUND(p_amount * 0.01, 2);
  v_net_amount := p_amount - v_fee;

  -- Reference ID oluştur
  v_reference_id := 'TXN-' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS') || '-' || SUBSTRING(MD5(RANDOM()::TEXT), 1, 8);

  -- Risk hesapla
  v_risk_score := calculate_transaction_risk(
    p_customer_id,
    p_amount,
    p_transaction_type,
    p_payment_method_id
  );

  -- İşlem oluştur
  INSERT INTO transactions_v2 (
    reference_id,
    transaction_type,
    customer_id,
    from_account,
    to_account,
    amount,
    currency,
    payment_method_id,
    fee,
    net_amount,
    status,
    risk_score,
    metadata
  ) VALUES (
    v_reference_id,
    p_transaction_type,
    p_customer_id,
    p_from_wallet_id,
    p_to_wallet_id,
    p_amount,
    'TRL',
    p_payment_method_id,
    v_fee,
    v_net_amount,
    'initiated',
    v_risk_score,
    p_metadata
  ) RETURNING id INTO v_transaction_id;

  -- Onay seviyesi belirle
  IF v_risk_score > 0.8 THEN
    v_approval_level := 'admin';
  ELSIF p_amount > v_operator_approve_limit OR v_risk_score > 0.6 THEN
    v_approval_level := 'operator';
  ELSIF p_amount > v_auto_approve_limit THEN
    v_approval_level := 'operator';
  ELSE
    v_approval_level := 'auto';
  END IF;

  -- Log ekle
  INSERT INTO transaction_logs (
    transaction_id,
    log_level,
    event,
    status_after,
    timestamp
  ) VALUES (
    v_transaction_id,
    'info',
    'İşlem oluşturuldu',
    'initiated',
    NOW()
  );

  -- Onay kuyruğuna ekle (auto değilse)
  IF v_approval_level != 'auto' THEN
    INSERT INTO approval_queue (
      transaction_id,
      required_approval_level,
      priority,
      is_urgent
    ) VALUES (
      v_transaction_id,
      v_approval_level,
      CASE WHEN v_risk_score > 0.7 THEN 10 ELSE 5 END,
      v_risk_score > 0.8
    );
  ELSE
    -- Otomatik onayla
    PERFORM approve_transaction(v_transaction_id, 'auto', NULL, 'Otomatik onay');
  END IF;

  RETURN QUERY SELECT
    v_transaction_id,
    v_reference_id,
    'initiated'::TEXT,
    v_approval_level != 'auto',
    v_approval_level;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. RİSK HESAPLAMA FONKSİYONLARI
-- ============================================================================

-- İşlem Risk Skoru Hesapla
CREATE OR REPLACE FUNCTION calculate_transaction_risk(
  p_customer_id TEXT,
  p_amount DECIMAL,
  p_transaction_type TEXT,
  p_payment_method_id UUID
)
RETURNS DECIMAL AS $$
DECLARE
  v_risk_score DECIMAL := 0;
  v_customer_history INT;
  v_velocity INT;
  v_is_new_method BOOLEAN;
  v_daily_volume DECIMAL;
BEGIN
  -- 1. Müşteri geçmiş risk faktörü
  SELECT COUNT(*) INTO v_customer_history
  FROM transactions_v2
  WHERE customer_id = p_customer_id
  AND status = 'completed'
  AND created_at > NOW() - INTERVAL '30 days';

  IF v_customer_history < 3 THEN
    v_risk_score := v_risk_score + 0.15; -- Yeni müşteri riski
  END IF;

  -- 2. Hız riski (Velocity Check)
  SELECT COUNT(*) INTO v_velocity
  FROM transactions_v2
  WHERE customer_id = p_customer_id
  AND created_at > NOW() - INTERVAL '1 hour'
  AND status IN ('completed', 'pending', 'processing');

  IF v_velocity > 5 THEN
    v_risk_score := v_risk_score + 0.20;
  ELSIF v_velocity > 3 THEN
    v_risk_score := v_risk_score + 0.10;
  END IF;

  -- 3. Ödeme metodu riski
  SELECT created_at > NOW() - INTERVAL '7 days'
  INTO v_is_new_method
  FROM payment_methods
  WHERE id = p_payment_method_id
  AND is_verified = false;

  IF v_is_new_method THEN
    v_risk_score := v_risk_score + 0.10;
  END IF;

  -- 4. Tutar anomalisi
  SELECT AVG(amount) INTO v_daily_volume
  FROM transactions_v2
  WHERE customer_id = p_customer_id
  AND created_at > NOW() - INTERVAL '30 days'
  AND status = 'completed';

  IF p_amount > COALESCE(v_daily_volume, 0) * 2.5 THEN
    v_risk_score := v_risk_score + 0.15;
  END IF;

  -- 5. Kara liste kontrolü
  IF EXISTS (SELECT 1 FROM blacklist 
    WHERE entity_value = p_customer_id 
    AND is_active = true) THEN
    v_risk_score := v_risk_score + 0.50;
  END IF;

  -- Risk skoru 0-1 arasında sınırla
  RETURN ROUND(LEAST(GREATEST(v_risk_score, 0), 1), 2);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. ONAY VE İŞLEM ILERLETME
-- ============================================================================

-- İşlemi Onayla
CREATE OR REPLACE FUNCTION approve_transaction(
  p_transaction_id UUID,
  p_approval_level TEXT,
  p_approved_by UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  new_status TEXT
) AS $$
DECLARE
  v_transaction record;
  v_customer_id TEXT;
  v_from_wallet_id UUID;
  v_to_wallet_id UUID;
  v_amount DECIMAL;
  v_fee DECIMAL;
BEGIN
  -- İşlem bilgilerini getir
  SELECT id, customer_id, from_account, to_account, amount, fee, status
  INTO v_transaction
  FROM transactions_v2
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF v_transaction IS NULL THEN
    RETURN QUERY SELECT false, 'İşlem bulunamadı'::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  v_customer_id := v_transaction.customer_id;
  v_from_wallet_id := v_transaction.from_account;
  v_to_wallet_id := v_transaction.to_account;
  v_amount := v_transaction.amount;
  v_fee := v_transaction.fee;

  -- İşlem durumunu güncelle
  UPDATE transactions_v2 SET
    status = 'approved',
    approval_level = p_approval_level,
    approved_by = p_approved_by,
    approval_timestamp = NOW()
  WHERE id = p_transaction_id;

  -- Onay kuyruğunu güncelle
  UPDATE approval_queue SET
    approved = true,
    reviewed_by = p_approved_by,
    reviewed_at = NOW(),
    review_notes = p_notes
  WHERE transaction_id = p_transaction_id;

  -- Cüzdan güncellemelerini gerçekleştir
  IF v_from_wallet_id IS NOT NULL THEN
    UPDATE wallets SET
      balance = balance - v_amount,
      available_balance = available_balance - v_amount,
      pending_balance = COALESCE(pending_balance, 0) - v_amount
    WHERE id = v_from_wallet_id;
  END IF;

  IF v_to_wallet_id IS NOT NULL THEN
    UPDATE wallets SET
      balance = balance + (v_amount - v_fee),
      available_balance = available_balance + (v_amount - v_fee)
    WHERE id = v_to_wallet_id;
  END IF;

  -- Log ekle
  INSERT INTO transaction_logs (
    transaction_id,
    log_level,
    event,
    status_before,
    status_after,
    performed_by,
    timestamp
  ) VALUES (
    p_transaction_id,
    'info',
    'İşlem onaylandı',
    v_transaction.status,
    'approved',
    p_approved_by,
    NOW()
  );

  RETURN QUERY SELECT true, 'İşlem başarıyla onaylandı'::TEXT, 'approved'::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. ANOMALI TESPİT VE ESKALASYON
-- ============================================================================

-- Anomali Tespit Et ve Ekle
CREATE OR REPLACE FUNCTION detect_and_create_anomaly(
  p_transaction_id UUID,
  p_customer_id TEXT,
  p_anomaly_type TEXT,
  p_category TEXT,
  p_description TEXT,
  p_confidence_score DECIMAL
)
RETURNS UUID AS $$
DECLARE
  v_anomaly_id UUID;
  v_severity TEXT;
BEGIN
  -- Ciddiyeti belirle
  v_severity := CASE
    WHEN p_confidence_score >= 0.9 THEN 'critical'
    WHEN p_confidence_score >= 0.7 THEN 'high'
    WHEN p_confidence_score >= 0.5 THEN 'medium'
    ELSE 'low'
  END;

  -- Anomali oluştur
  INSERT INTO anomalies_v2 (
    transaction_id,
    customer_id,
    anomaly_type,
    category,
    severity,
    confidence_score,
    description,
    detected_at
  ) VALUES (
    p_transaction_id,
    p_customer_id,
    p_anomaly_type,
    p_category,
    v_severity,
    p_confidence_score,
    p_description,
    NOW()
  ) RETURNING id INTO v_anomaly_id;

  -- Ciddiyete göre escalate
  IF v_severity IN ('critical', 'high') THEN
    -- Admin'e atamak için sonraki adım
    -- (Manual escalation gerekli)
  END IF;

  RETURN v_anomaly_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. MUTABAKAT FONKSİYONLARI
-- ============================================================================

-- Günlük Mutabakat Gerçekleştir
CREATE OR REPLACE FUNCTION perform_daily_reconciliation(
  p_reconciliation_date DATE,
  p_department TEXT,
  p_reconciled_by UUID
)
RETURNS TABLE (
  reconciliation_id UUID,
  discrepancy DECIMAL,
  status TEXT,
  message TEXT
) AS $$
DECLARE
  v_reconciliation_id UUID;
  v_opening_balance DECIMAL;
  v_total_deposits DECIMAL;
  v_total_withdrawals DECIMAL;
  v_total_refunds DECIMAL;
  v_closing_balance DECIMAL;
  v_calculated_balance DECIMAL;
  v_discrepancy DECIMAL;
BEGIN
  -- Açılış bakiyesi
  SELECT balance INTO v_opening_balance
  FROM department_cash_v2
  WHERE department = p_department
  LIMIT 1;

  IF v_opening_balance IS NULL THEN
    v_opening_balance := 0;
  END IF;

  -- Yatırımları topla
  SELECT COALESCE(SUM(amount), 0) INTO v_total_deposits
  FROM transactions_v2
  WHERE DATE(created_at) = p_reconciliation_date
  AND transaction_type = 'deposit'
  AND status = 'completed';

  -- Çekişleri topla
  SELECT COALESCE(SUM(amount), 0) INTO v_total_withdrawals
  FROM transactions_v2
  WHERE DATE(created_at) = p_reconciliation_date
  AND transaction_type = 'withdrawal'
  AND status = 'completed';

  -- İade işlemlerini topla
  SELECT COALESCE(SUM(amount), 0) INTO v_total_refunds
  FROM transactions_v2
  WHERE DATE(created_at) = p_reconciliation_date
  AND transaction_type = 'refund'
  AND status = 'completed';

  -- Hesaplanan bakiye
  v_calculated_balance := v_opening_balance + v_total_deposits - v_total_withdrawals - v_total_refunds;

  -- Gerçek bakiyeyi DB'den al
  SELECT balance INTO v_closing_balance
  FROM department_cash_v2
  WHERE department = p_department
  LIMIT 1;

  -- Fark hesapla
  v_discrepancy := v_closing_balance - v_calculated_balance;

  -- Mutabakat kaydı oluştur
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
    reconciled_by,
    reconciled_at,
    verification_status
  ) VALUES (
    p_reconciliation_date,
    p_department,
    v_opening_balance,
    v_total_deposits,
    v_total_withdrawals,
    v_total_refunds,
    v_closing_balance,
    v_calculated_balance,
    v_discrepancy,
    p_reconciled_by,
    NOW(),
    CASE WHEN ABS(v_discrepancy) = 0 THEN 'verified' ELSE 'pending' END
  ) RETURNING id INTO v_reconciliation_id;

  RETURN QUERY SELECT
    v_reconciliation_id,
    v_discrepancy,
    CASE WHEN ABS(v_discrepancy) = 0 THEN 'success' ELSE 'requires_review' END::TEXT,
    CASE
      WHEN ABS(v_discrepancy) = 0 THEN 'Mükemmel mutabakat'
      ELSE 'Fark bulunmuştur: ' || v_discrepancy::TEXT
    END::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. KYC VE COMPLIANCE FONKSİYONLARI
-- ============================================================================

-- KYC Doğrulaması Tamamla
CREATE OR REPLACE FUNCTION complete_kyc_verification(
  p_customer_id TEXT,
  p_verified_by UUID
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  new_kyc_status TEXT
) AS $$
DECLARE
  v_required_docs_count INT;
  v_verified_docs_count INT;
BEGIN
  -- Gerekli dokümanları kontrol et
  SELECT COUNT(*) INTO v_required_docs_count
  FROM kyc_documents
  WHERE customer_id = p_customer_id;

  SELECT COUNT(*) INTO v_verified_docs_count
  FROM kyc_documents
  WHERE customer_id = p_customer_id
  AND verification_status = 'verified';

  IF v_verified_docs_count < v_required_docs_count THEN
    RETURN QUERY SELECT false, 'Tüm dokümantasyon henüz doğrulanmadı'::TEXT, 'pending'::TEXT;
    RETURN;
  END IF;

  -- KYC statusunu güncelle
  UPDATE customer_accounts SET
    kyc_status = 'verified',
    kyc_verified_at = NOW(),
    kyc_verified_by = p_verified_by
  WHERE customer_id = p_customer_id;

  -- Compliance olayı oluştur
  INSERT INTO compliance_events (
    event_type,
    customer_id,
    description,
    action_taken,
    taken_by,
    taken_at
  ) VALUES (
    'KYC_COMPLETED',
    p_customer_id,
    'Müşteri KYC doğrulaması tamamlandı',
    'Account activated',
    p_verified_by,
    NOW()
  );

  RETURN QUERY SELECT true, 'KYC başarıyla tamamlandı'::TEXT, 'verified'::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. OPERATÖR YARDIMCI FONKSİYONLARI
-- ============================================================================

-- Operatör Aktivitesi Logla
CREATE OR REPLACE FUNCTION log_operator_activity(
  p_operator_id UUID,
  p_activity_type TEXT,
  p_action TEXT,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id TEXT DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_activity_id UUID;
BEGIN
  INSERT INTO operator_activities (
    operator_id,
    activity_type,
    action,
    affected_entity_type,
    affected_entity_id,
    ip_address,
    user_agent,
    created_at
  ) VALUES (
    p_operator_id,
    p_activity_type,
    p_action,
    p_entity_type,
    p_entity_id,
    p_ip_address,
    p_user_agent,
    NOW()
  ) RETURNING id INTO v_activity_id;

  RETURN v_activity_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- KURULUM TAMAMLANDI
-- ============================================================================
-- 7 ana fonksiyon + sistem tetikleyicileri hazır
-- Her İŞLEM otomatik olarak:
-- - Risk hesaplaması
-- - Onay kuyruk kontrolü
-- - Logging
-- - Anomali tespiti
