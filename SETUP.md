# 🚀 DEUS FINTECH SETUP GUIDE

**Başlangıç:** 2026-05-19 00:13 GMT-3  
**Sistem:** Merkezi Operasyon - Türkiye Bahis Piyasası  
**Status:** ✅ Deployment Hazır

---

## 📋 SETUP CHECKLIST

### ✅ Phase 1: Backend (Tamamlandı)

- [x] Node.js + TypeScript projesi kurulu
- [x] Telegram Bot kurulu (@DEUS_BotHandle)
- [x] Supabase PostgreSQL bağlantısı yapılandırıldı
- [x] .env dosyası tüm credential'larla
- [x] Webhook server localhost:3000 aktif
- [x] 4 SQL migration dosyası oluşturuldu

### ✅ Phase 2: Database Schema (Tamamlandı)

- [x] 004_fintech_advanced_schema.sql (14 tablo, pgvector)
- [x] 005_fintech_rls.sql (Güvenlik politikaları)
- [x] 006_fintech_views.sql (11 view + reporting)
- [x] 007_fintech_functions.sql (7 business function)
- [x] setup-initial-data.sql (Test operatörleri & müşteriler)

### ⏳ Phase 3: Supabase Deployment (MANUEL)

1. [ ] SQL Editor'da 004_fintech_advanced_schema.sql çalıştır
2. [ ] SQL Editor'da 005_fintech_rls.sql çalıştır
3. [ ] SQL Editor'da 006_fintech_views.sql çalıştır
4. [ ] SQL Editor'da 007_fintech_functions.sql çalıştır
5. [ ] SQL Editor'da setup-initial-data.sql çalıştır
6. [ ] Tablo sayısını doğrula: `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'`

### ⏳ Phase 4: Telegram Webhook (Production için)

1. [ ] SSL sertifikası oluştur (openssl)
2. [ ] Domain ve hosting hazırla
3. [ ] Webhook URL'sini Telegram API'ye kaydet
4. [ ] Bot aktivitesini test et (/start, /help, vb.)

### ⏳ Phase 5: Testing & Monitoring

1. [ ] İlk işlemi test et (process_transaction())
2. [ ] Risk hesaplamasını kontrol et
3. [ ] Onay workflow'unu test et
4. [ ] Dashboard query'lerini çalıştır

---

## 🔧 KURULUM ADIMLARI

### Adım 1: Supabase SQL Deploy

**Konum:** https://supabase.com → Project → SQL Editor

```
1. "New Query" tıkla
2. 004_fintech_advanced_schema.sql içeriğini yapıştır
3. "Run" tıkla (Cmd+Enter)
4. ✅ Sonuç: 14 tablo oluşturulur
```

Aynı işlemi 005, 006, 007 ve setup-initial-data dosyaları için tekrarla.

---

## 📊 VERITABANI YAPISI

### Ana Tablolar (14)

| Tablo | Amaç |
|-------|------|
| `customer_accounts` | Müşteri hesapları |
| `wallets` | Cüzdanlar (main, bonus, escrow) |
| `transactions_v2` | İşlem geçmişi |
| `payment_methods` | Ödeme metodları |
| `approval_queue` | Onay bekleyen işlemler |
| `anomalies_v2` | Şüpheli aktiviteler |
| `risk_rules` | Risk kuralları motoru |
| `blacklist` | Kara liste |
| `daily_reconciliation_v2` | Günlük mutabakat |
| `kyc_documents` | KYC dokümanları |
| `compliance_events` | Uyum olayları |
| `operators` | Operatör hesapları |
| `operator_activities` | Operatör audit trail |
| `gl_entries` | Muhasebe kayıtları |

### Business Functions (7)

| Fonksiyon | Amaç |
|-----------|------|
| `process_transaction()` | İşlem oluştur & onay kuyruk |
| `calculate_transaction_risk()` | Risk skoru hesapla |
| `approve_transaction()` | İşlemi onayla |
| `detect_and_create_anomaly()` | Anomali tespit |
| `perform_daily_reconciliation()` | Günlük mutabakat |
| `complete_kyc_verification()` | KYC tamamla |
| `log_operator_activity()` | Audit log |

### Views (11)

| View | Amaç |
|------|------|
| `v_transaction_summary` | İşlem özeti |
| `v_risk_dashboard` | Risk dashboard |
| `v_customer_activity_summary` | Müşteri aktivitesi |
| `v_pending_approvals` | Onay bekleyenler |
| `v_operator_performance` | Operatör performansı |
| `v_kyc_status_report` | KYC durum raporu |
| `v_compliance_events_report` | Compliance raporları |
| `v_open_anomalies` | Açık anomaliler |
| `v_customer_velocity_metrics` | Hız metrikleri |
| `mv_daily_summary` | Günlük özet (materialized) |
| `mv_customer_risk_profile` | Risk profili (materialized) |

---

## 🤖 TELEGRAM BOT KOMUTLARI

| Komut | Açıklama |
|-------|----------|
| `/start` | Bot'u başlat |
| `/help` | Yardım ve komut listesi |
| `/deposit` | Yatırım yap |
| `/withdraw` | Çekim yap |
| `/status` | Hesap durumunu görüntüle |

**Bot Handle:** @DEUS_BotHandle  
**Mode:** Webhook (localhost:3000)

---

## 🔐 GÜVENLİK & YETKİLER

### Otomatik Onay Eşikleri

| Tutar | İşlem Tipi | Onay |
|-------|-----------|------|
| 0–2.500 TL | Tümü | Otomatik |
| 2.500–25.000 TL | Deposit | Otomatik; Withdrawal | Operator |
| 25.000–50.000 TL | Tümü | Operator |
| 50.000+ TL | Tümü | Admin |

**+** Yüksek risk skoru (>0.6) → Otomatik bir seviye yükselt

### RLS Politikaları

- **Müşteri:** Sadece kendi veriler
- **Operatör:** Departman + rol bazlı
- **Admin:** Tam erişim
- **Hassas Tablolar:** kyc_documents, blacklist, payment_methods (admin only)

---

## 🧪 TEST SENARYOLARI

### Test 1: Basit Yatırım

```sql
SELECT process_transaction(
  'CUST_TEST_001',
  'deposit',
  1000.00,
  NULL,
  (SELECT id FROM wallets WHERE customer_id='CUST_TEST_001' LIMIT 1),
  NULL,
  '{}'::jsonb
);
```

**Beklenen:** `initial_status='initiated'`, `requires_approval=false`, `approval_level='auto'`

### Test 2: Büyük Çekim

```sql
SELECT process_transaction(
  'CUST_TEST_003',
  'withdrawal',
  25000.00,
  (SELECT id FROM wallets WHERE customer_id='CUST_TEST_003' LIMIT 1),
  NULL,
  NULL,
  '{}'::jsonb
);
```

**Beklenen:** `requires_approval=true`, `approval_level='operator'`

### Test 3: Risk Skoru Hesapla

```sql
SELECT calculate_transaction_risk(
  'CUST_TEST_001',
  5000.00,
  'withdrawal',
  (SELECT id FROM payment_methods WHERE customer_id='CUST_TEST_001' LIMIT 1)
);
```

**Beklenen:** 0.0–1.0 arası decimal

### Test 4: Onay Dashboard

```sql
SELECT * FROM v_pending_approvals WHERE reviewed_at IS NULL;
```

**Beklenen:** Onay bekleyen işlemler listesi

---

## 📈 MONITORING QUERIES

### Günlük Özet

```sql
SELECT * FROM mv_daily_summary ORDER BY transaction_date DESC LIMIT 7;
```

### Risk Dashboard

```sql
SELECT * FROM v_risk_dashboard 
WHERE max_risk_score > 0.5
ORDER BY max_risk_score DESC;
```

### Operatör Performance

```sql
SELECT * FROM v_operator_performance 
ORDER BY total_approvals_handled DESC;
```

### Mutabakat Status

```sql
SELECT * FROM daily_reconciliation_v2 
WHERE verification_status != 'verified'
ORDER BY reconciliation_date DESC;
```

---

## 🚀 PRODUCTION DEPLOYMENT

### 1. SSL Sertifikası

```bash
openssl req -x509 -newkey rsa:2048 \
  -keyout key.pem -out cert.pem \
  -days 365 -nodes -subj "/CN=deus-api.example.com"
```

### 2. Telegram Webhook Kayıt

```bash
curl -F "url=https://deus-api.example.com/webhook" \
  -F "certificate=@cert.pem" \
  https://api.telegram.org/bot${TOKEN}/setWebhook
```

### 3. Nginx Reverse Proxy

```nginx
server {
  listen 443 ssl;
  server_name deus-api.example.com;
  
  ssl_certificate /path/to/cert.pem;
  ssl_certificate_key /path/to/key.pem;
  
  location /webhook {
    proxy_pass http://localhost:3000/webhook;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

### 4. PM2 Process Manager

```bash
npm install -g pm2
pm2 start src/webhook-bot.ts --name deus
pm2 save
pm2 startup
```

---

## 🔍 SORUN GIDERME

### Problem: Webhook bağlantısı yapılmıyor

**Çözüm:**
```bash
# Webhook status kontrol et
curl https://api.telegram.org/bot${TOKEN}/getWebhookInfo

# Reset et (production)
curl https://api.telegram.org/bot${TOKEN}/deleteWebhook
```

### Problem: RLS hatası "Permission Denied"

**Çözüm:**
```sql
-- RLS'yi kontrol et
SELECT schemaname, tablename, policyname, permissive, roles 
FROM pg_policies 
WHERE schemaname = 'public';

-- Gerekirse tekrar çalıştır
-- 005_fintech_rls.sql
```

### Problem: Bağlantı zaman aşımı

**Çözüm:**
```
Supabase Dashboard → Settings → Database
- Pool size: 25 → 50
- Idle timeout: 10s → 5m
- Statement timeout: 30s → 60s
```

---

## 📝 DOSYA YAPISI

```
~/deus/
├── src/
│   ├── webhook-bot.ts          # Telegram bot handler
│   ├── supabase-client.ts       # Supabase bağlantısı
│   └── types.ts                 # TypeScript tipler
├── 001_deus_schema.sql          # İlk schema (legacy)
├── 002_deus_learning.sql        # Learning tabloları (legacy)
├── 004_fintech_advanced_schema.sql    # ⭐ Ana schema
├── 005_fintech_rls.sql          # ⭐ Güvenlik
├── 006_fintech_views.sql        # ⭐ Raporlama
├── 007_fintech_functions.sql    # ⭐ Business logic
├── setup-initial-data.sql       # Test verileri
├── FINTECH_DEPLOYMENT.md        # Deployment rehberi
├── SETUP.md                     # Bu dosya
├── .env                         # Credentials (gitignore)
├── package.json
└── tsconfig.json
```

---

## 🎯 SONRAKI ADIMLAR

1. **Phase 3 Bitir:** SQL dosyalarını Supabase'e deploy et
2. **Phase 4 Hazırla:** Production webhook kurulumuna başla
3. **Testing:** Senaryoları test et
4. **Monitoring:** Dashboard'ları kur
5. **Go Live:** Production webhook aktifleştir

---

**Sorumlu:** DEUS - Operasyon Sistemi  
**Son Güncelleme:** 2026-05-19 00:47 GMT-3  
**Status:** 🟢 Deployment Hazır
