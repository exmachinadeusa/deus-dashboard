-- DEUS RLS (Row Level Security) Policies
-- Operatör yetkilerine göre veri erişimi kontrol

-- RLS'i aktifleştir
ALTER TABLE operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomalies ENABLE ROW LEVEL SECURITY;
ALTER TABLE department_cash ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reconciliation ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE operator_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE blacklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_events ENABLE ROW LEVEL SECURITY;

-- Operators: Kendi bilgisini görebilir, admin tümünü
CREATE POLICY operators_self_view ON operators
  FOR SELECT
  USING (
    auth.uid()::text = id::text OR
    (SELECT role FROM operators WHERE id = auth.uid()::uuid) = 'admin'
  );

CREATE POLICY operators_self_update ON operators
  FOR UPDATE
  USING (auth.uid()::text = id::text)
  WITH CHECK (auth.uid()::text = id::text);

CREATE POLICY operators_admin_all ON operators
  FOR ALL
  USING ((SELECT role FROM operators WHERE id = auth.uid()::uuid) = 'admin');

-- Transactions: Kendi departmanının işlemlerini görebilir
CREATE POLICY transactions_department ON transactions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM operators 
      WHERE id = auth.uid()::uuid 
      AND operators.department = (
        SELECT department FROM operators WHERE id = auth.uid()::uuid LIMIT 1
      )
    )
  );

CREATE POLICY transactions_admin ON transactions
  FOR ALL
  USING ((SELECT role FROM operators WHERE id = auth.uid()::uuid) = 'admin');

-- Anomalies: Yöneticilere görünür
CREATE POLICY anomalies_admin ON anomalies
  FOR ALL
  USING ((SELECT role FROM operators WHERE id = auth.uid()::uuid) IN ('admin', 'supervisor'));

-- Knowledge Base: Herkese okunur
CREATE POLICY knowledge_base_read ON knowledge_base
  FOR SELECT
  USING (true);

-- Learning Logs: Admin ve supervisor
CREATE POLICY learning_logs_admin ON learning_logs
  FOR SELECT
  USING ((SELECT role FROM operators WHERE id = auth.uid()::uuid) IN ('admin', 'supervisor'));

-- Blacklist: Admin ve supervisor
CREATE POLICY blacklist_admin ON blacklist
  FOR SELECT
  USING ((SELECT role FROM operators WHERE id = auth.uid()::uuid) IN ('admin', 'supervisor'));

-- System Events: Admin
CREATE POLICY system_events_admin ON system_events
  FOR SELECT
  USING ((SELECT role FROM operators WHERE id = auth.uid()::uuid) = 'admin');
