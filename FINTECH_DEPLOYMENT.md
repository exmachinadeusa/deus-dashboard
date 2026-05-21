# DEUS FINTECH - SUPABASE DEPLOYMENT GUIDE

**Kurulum Tarihi:** 2026-05-19 00:36 GMT-3  
**Sistem:** Merkezi Operasyon - Türkiye Bahis Piyasası  
**Supabase URL:** https://ezmamahyyvqppjlzqazb.supabase.co

---

## 📋 DEPLOYMENT ADIMLARI

### Adım 1: Supabase Dashboard'a Erişim

1. **Supabase Dashboard'u aç:** https://supabase.com
2. **Projen'e giriş yap:** `ezmamahyyvqppjlzqazb`
3. **Sol menüden "SQL Editor"'e tık**

---

### Adım 2: SQL Şemalarını Çalıştır

**Sırayla aşağıdaki SQL dosyalarını SQL Editor'da çalıştır:**

#### 1️⃣ Advanced Fintech Schema (004_fintech_advanced_schema.sql)

Bu dosya şunları oluşturur:
- ✅ 14 ana tablo (customer_accounts, transactions_v2, wallets, vb.)
- ✅ Ödeme metodları ve işlem işleme sistemi
- ✅ Anomali tespiti ve risk yönetimi tabloları
- ✅ Mutabakat ve finansal raporlama
- ✅ KYC ve compliance sistemi
- ✅ pgvector embedding tabloları (ML)
- ✅ Tüm gerekli indeksler ve tetikleyiciler

**Adımlar:**
```
1. Supabase SQL Editor'ı aç
2. "New Query" → "Create" tıkla
3. 004_fintech_advanced_schema.sql dosyasının tüm içeriğini kopyala
4. SQL Editor'a yapıştır
5. "Run" veya Cmd+Enter ile çalıştır
6. Sonuç: 14 tablo oluşturulur (success logs görürsün)
```

#### 2️⃣ RLS Politikaları (005_fintech_rls.sql)

Bu dosya güvenlik politikalarını kurar:
- ✅ Müşteri erişim kontrolleri (sadece kendi veriler)
- ✅ Operatör rol-tabanlı erişim (admin, supervisor, operator)
- ✅ Hassas tablo korumalar (payment_methods, blacklist, kyc_documents)
- ✅ 14 ayrı RLS politikası seti

**Adımlar:**
```
1. New Query → Create
2. 005_fintech_rls.sql içeriğini yapıştır
3. Run (Alt: bazı politikalar zaten var olabilir - uyarıları yoksay)
```

#### 3️⃣ Views ve Materialized Views (006_fintech_views.sql)

Bu dosya raporlama ve analitik sağlar:
- ✅ 9 gerçek zamanlı view (transaction_summary, risk_dashboard, vb.)
- ✅ 2 materialized view (performans için günlük özet)
- ✅ Operatör dashboard'ları
- ✅ Mutabakat raporları
- ✅ Compliance ve KYC durum raporları

**Adımlar:**
```
1. New Query → Create
2. 006_fintech_views.sql içeriğini yapıştır
3. Run
4. Sonuç: 11 view + 2 materialized view
```

#### 4️⃣ Business Logic Functions (007_fintech_functions.sql)

Bu dosya tüm iş mantığını otomatikleştirir:
- ✅ `process_transaction()` - İşlem oluştur & risk hesapla
- ✅ `calculate_transaction_risk()` - Dinamik risk scoring
- ✅ `approve_transaction()` - Operatör onay workflow
- ✅ `detect_and_create_anomaly()` - Anomali tespit
- ✅ `perform_daily_reconciliation()` - Mutabakat
- ✅ `complete_kyc_verification()` - KYC tamamla
- ✅ `log_operator_activity()` - Audit trail

**Adımlar:**
```
1. New Query → Create
2. 007_fintech_functions.sql içeriğini yapıştır
3. Run
4. Sonuç: 7 fonksiyon + sistem tetikleyicileri
```

---

## ✅ DEPLOYMENT KONTROL LİSTESİ

Sonra, tüm deployment'ın başarılı olduğunu doğrula:

### Tablo Kontrolü

SQL Editor'da çalıştır:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

**Beklenen Sonuç (Minimum 14 tablo):**
```
customer_accounts
wallets
payment_methods
transactions_v2
transaction_logs
approval_queue
workflow_states
anomalies_v2
risk_rules
blacklist
department_cash_v2
daily_reconciliation_v2
settlement_records
operator_activities
operator_permissions
compliance_events
kyc_documents
gl_entries
chart_of_accounts
customer_embeddings
transaction_pattern_vectors
notifications
```

### View Kontrolü

```sql
SELECT table_name 
FROM information_schema.views 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

**Beklenen:** `v_transaction_summary`, `v_customer_activity_summary`, `v_risk_dashboard`, vb.

### Fonksiyon Kontrolü

```sql
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_type = 'FUNCTION'
ORDER BY routine_name;
```

**Beklenen:** `process_transaction()`, `calculate_transaction_risk()`, `approve_transaction()`, vb.

---

## 🔐 GÜVENLİK AYARLARI

### 1. Supabase Auth Yapılandır

```
1. Authentication → Policies
2. Email/Password authentication'ı etkinleştir
3. Email templates'ı Türkçeye çevir
```

### 2. PostgreSQL Roles Oluştur

SQL Editor'da çalıştır:
```sql
-- Admin role
CREATE ROLE admin_user WITH LOGIN PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO admin_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO admin_user;

-- Operator role
CREATE ROLE operator_user WITH LOGIN PASSWORD 'secure_password';
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO operator_user;

-- Customer role
CREATE ROLE customer_user WITH LOGIN PASSWORD 'secure_password';
GRANT SELECT ON v_customer_activity_summary TO customer_user;
```

### 3. API Keys Döndür

```
1. Settings → API
2. "Rotate service role key"
3. Yeni key'i .env'ye kopyala
```

---

## 📊 İLK TEST İŞLEMLERİ

### Test 1: Müşteri Hesabı Oluştur

```sql
INSERT INTO customer_accounts (
  customer_id,
  customer_name,
  customer_email,
  kyc_status,
  account_type,
  balance,
  available_balance
) VALUES (
  'TEST_CUSTOMER_001',
  'Test Müşteri',
  'test@example.com',
  'verified',
  'standard',
  5000,
  5000
);
```

### Test 2: Cüzdan Oluştur

```sql
INSERT INTO wallets (
  customer_id,
  wallet_type,
  currency,
  balance,
  available_balance
) VALUES (
  'TEST_CUSTOMER_001',
  'main',
  'TRL',
  5000,
  5000
);
```

### Test 3: Operatör Ekle

```sql
INSERT INTO operators (
  name,
  telegram_id,
  department,
  role,
  is_active
) VALUES (
  'Admin Operatör',
  1234567890,
  'admin',
  'admin',
  true
);
```

### Test 4: İşlem Yap

```sql
SELECT process_transaction(
  'TEST_CUSTOMER_001',
  'deposit',
  1000.00,
  NULL,
  (SELECT id FROM wallets WHERE customer_id = 'TEST_CUSTOMER_001' LIMIT 1),
  NULL,
  '{"source": "test"}'::jsonb
);
```

**Beklenen Sonuç:**
```
transaction_id | reference_id | initial_status | requires_approval | approval_level
[UUID]         | TXN-...      | initiated      | true              | auto/operator/admin
```

---

## 🚀 TELEGRAM BOT AKTIVASYONU

### Webhook Konfigürasyonu (Production)

```bash
# 1. SSL sertifikası oluştur
openssl req -x509 -newkey rsa:2048 \
  -keyout key.pem -out cert.pem \
  -days 365 -nodes

# 2. Webhook'u kaydet
curl -F "url=https://yourdomain.com/webhook" \
  -F "certificate=@cert.pem" \
  https://api.telegram.org/bot8816795596:AAH1eAL3ugKTN_nddOiP1pGItsHvgcdKsp0/setWebhook

# 3. Doğrula
curl https://api.telegram.org/bot8816795596:AAH1eAL3ugKTN_nddOiP1pGItsHvgcdKsp0/getWebhookInfo
```

### Bot Komutları

| Komut | Açıklama |
|-------|----------|
| `/start` | Bot'u başlat ve yardım al |
| `/help` | Komut listesini göster |
| `/deposit` | Yatırım yap |
| `/withdraw` | Çekim yap |
| `/status` | Hesap durumunu kontrol et |

---

## 📈 MONITORING ve REPORTING

### Dashboard Queries

#### Günlük Özet
```sql
SELECT * FROM mv_daily_summary ORDER BY transaction_date DESC LIMIT 30;
```

#### Risk Dashboard
```sql
SELECT * FROM v_risk_dashboard ORDER BY max_risk_score DESC LIMIT 20;
```

#### Onay Bekleyen İşlemler
```sql
SELECT * FROM v_pending_approvals WHERE reviewed_at IS NULL;
```

#### Operatör Performance
```sql
SELECT * FROM v_operator_performance ORDER BY total_approvals_handled DESC;
```

---

## 🔧 SORUN GIDERME

### Hata 1: "Permission Denied" RLS Politikaları İçin

**Çözüm:**
```sql
-- RLS'yi kontrol et
SELECT * FROM pg_policies WHERE schemaname = 'public';

-- Gerekirse policy'leri yeniden oluştur
-- 005_fintech_rls.sql'i tekrar çalıştır
```

### Hata 2: "Table Already Exists"

**Çözüm:**
```sql
-- Zaten var olan tabloları kontrol et
-- Yeni SQL'de IF NOT EXISTS zaten var - güvenle çalıştır
```

### Hata 3: Bağlantı Zaman Aşımı

**Çözüm:**
1. Supabase Dashboard → Connections
2. `Pool Size` artır (25 → 50)
3. `Idle Timeout` ayarla (10s → 5m)

---

## 📝 NOTLAR

- ✅ Tüm tablolar otomatik `updated_at` kolonu ile tetiklenmiştir
- ✅ RLS politikaları varsayılan olarak **devre dışı** (ALTER TABLE ... ENABLE ROW LEVEL SECURITY)
- ✅ Tüm hassas sorgular audit log'a yazılır
- ✅ İşlemler otomatik olarak risk skoru hesaplanır
- ✅ Anomaliler 0.5+ güven puanı ile tespit edilir

---

## 🎯 SONRAKI ADIMLAR

1. ✅ **Database Şeması:** Deployment tamamlandı
2. ⏳ **Telegram Bot:** Webhook yapılandır (production)
3. ⏳ **Admin Panel:** Node.js API oluştur
4. ⏳ **Test Senaryoları:** E2E testler yaz
5. ⏳ **Load Testing:** Yük testleri çalıştır

---

**Son Güncelleme:** 2026-05-19 00:36 GMT-3  
**Sorumlu:** DEUS - Operasyon Sistemi  
**Durum:** 🟢 Hazır
