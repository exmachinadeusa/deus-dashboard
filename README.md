# 🚀 DEUS - Operasyon Sistemi

**Merkezi Hesap Yönetim ve Karar Destek Mimarı**  
**Türkiye Bahis Piyasası Fintech Altyapısı**

---

## 📌 DURUM RAPORU (2026-05-19 00:47 GMT-3)

| Bileşen | Status | Notlar |
|---------|--------|--------|
| **Telegram Bot** | ✅ Aktif | @DEUS_BotHandle, webhook server çalışıyor |
| **Supabase Backend** | 📋 Hazır | SQL deployment şemaları tamamlandı |
| **Database Schema** | ✅ Tamamlandı | 14 tablo, 7 function, 11 view |
| **RLS Politikaları** | ✅ Hazır | Tüm güvenlik kuralları tanımlandı |
| **Test Verileri** | ✅ Hazır | 4 operatör, 3 müşteri, geçmiş işlemler |
| **Webhook (Production)** | ⏳ Hazırlanıyor | SSL + domain gerekli |

---

## 🎯 DEPLOYMENT DURUMU

### Tamamlanan ✅

- [x] Node.js + TypeScript backend kurulu
- [x] Telegram Bot API entegre edildi
- [x] Supabase PostgreSQL konfigürasyonu
- [x] 4 SQL migration dosyası hazır (004-007)
- [x] Business logic functions (7 adet)
- [x] Raporlama views (11 adet)
- [x] RLS güvenlik politikaları
- [x] Test operatörleri ve müşteriler hazırlandı
- [x] Setup dokumentasyonu tamamlandı

### Devam Ediyor ⏳

- [ ] SQL dosyalarını Supabase SQL Editor'da çalıştır
- [ ] Test işlemlerini doğrula
- [ ] Production webhook yapılandır
- [ ] Admin operatörü doğrula
- [ ] Ilk işlemi testle

---

## 📂 DOSYA REHBERI

### 📖 Dokumentasyon

| Dosya | Amaç |
|-------|------|
| `README.md` | Bu dosya - durum özeti |
| `SETUP.md` | Kurulum ve deployment adımları |
| `FINTECH_DEPLOYMENT.md` | Detaylı SQL deployment rehberi |

### 💾 Database Şemaları

| Dosya | Tablo Sayısı | Amaç |
|-------|-------------|------|
| `004_fintech_advanced_schema.sql` | 14 | Ana fintech tablolar |
| `005_fintech_rls.sql` | - | Row Level Security politikaları |
| `006_fintech_views.sql` | 11 views | Raporlama ve dashboard |
| `007_fintech_functions.sql` | 7 functions | Business logic (işlem, risk, onay) |
| `setup-initial-data.sql` | - | Test operatörleri ve müşteriler |

### 🤖 Bot Kodu

| Dosya | Amaç |
|-------|------|
| `src/webhook-bot.ts` | Telegram webhook handler |
| `.env` | Credentials (TOKEN, SUPABASE_URL, vb.) |
| `package.json` | Dependencies |
| `tsconfig.json` | TypeScript config |

### 🔧 Araçlar

| Dosya | Amaç |
|-------|------|
| `setup-telegram-webhook.mjs` | Webhook setup talimatları |
| `deploy-fintech.mjs` | (Test) SQL deploy script |
| `deploy-rest.mjs` | (Yedek) REST API deploy |

---

## 🚀 HIZLI START

### 1. SQL Deploy (Manuel)

```bash
# Supabase Dashboard aç
# https://supabase.com → Project → SQL Editor

# Her dosyayı sırayla çalıştır:
1. 004_fintech_advanced_schema.sql
2. 005_fintech_rls.sql
3. 006_fintech_views.sql
4. 007_fintech_functions.sql
5. setup-initial-data.sql
```

### 2. Bot Başlat (Local)

```bash
cd ~/deus
npm install
npm run dev

# Sonuç: Listening on localhost:3000 ✓
```

### 3. Telegram'da Test

```
@DEUS_BotHandle'e mesaj gönder:
/start     → Bot başlatıldı
/help      → Komut listesi
/status    → Hesap durumu
```

### 4. Webhook Production'a Taşı

```bash
# SSL sertifikası
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes

# Telegram'a kaydet
curl -F "url=https://yourdomain.com/webhook" \
     -F "certificate=@cert.pem" \
     https://api.telegram.org/bot${TOKEN}/setWebhook
```

---

## 🔑 SISTEM ÖZELLİKLERİ

### İşlem İşleme

- ✅ **Otomatik Risk Hesaplaması:** 5-faktörlü scoring (velocity, KYC, tutar, metod, blacklist)
- ✅ **Dinamik Onay Workflow:** Tutar + risk bazlı (otomatik → operator → admin)
- ✅ **Hızlı Anomali Tespiti:** Real-time behavioral analytics
- ✅ **Mutabakat Otomasyonu:** Günlük reconciliation

### Güvenlik

- ✅ **Row Level Security:** Müşteri/operatör/admin erişim kontrolü
- ✅ **Audit Trail:** Tüm operatör aktiviteleri loglanır
- ✅ **Kara Liste Sistemi:** Dolandırıcı ve şüpheli kimlik tespiti
- ✅ **KYC Yönetimi:** Doküman doğrulama workflow

### Raporlama

- ✅ **Real-time Dashboards:** Risk, işlem, operatör performance
- ✅ **Compliance Reports:** KYC, anomali, risk durum
- ✅ **Finansal Raporlar:** Gelir/gider, GL entries, mutabakat
- ✅ **Operatör Analytics:** Performans metrikleri

---

## 📊 VERI YAPISI ÖZET

### 14 Ana Tablo

```
Customer Management:
├── customer_accounts      (Müşteri hesapları)
├── wallets               (Cüzdanlar)
├── kyc_documents         (KYC dokümanları)
└── payment_methods       (Ödeme metodları)

Transaction Processing:
├── transactions_v2       (İşlemler)
├── transaction_logs      (Audit trail)
├── approval_queue        (Onay kuyruğu)
└── workflow_states       (İş akışı durumları)

Risk & Compliance:
├── anomalies_v2          (Şüpheli aktiviteler)
├── risk_rules            (Risk kuralları)
├── blacklist             (Kara liste)
└── compliance_events     (Uyum olayları)

Operations:
├── operators             (Operatör hesapları)
├── operator_activities   (Audit log)
├── operator_permissions  (Yetki yönetimi)
└── operator_activities   (Aktivite log)

Financial:
├── gl_entries            (Muhasebe kayıtları)
├── chart_of_accounts     (Hesap planı)
├── department_cash_v2    (Departman kasaları)
└── daily_reconciliation_v2 (Günlük mutabakat)

Analytics (ML):
├── customer_embeddings   (pgvector müşteri profili)
└── transaction_pattern_vectors (İşlem pattern analizi)
```

### 7 Business Functions

```
process_transaction()              → İşlem oluştur + risk hesapla
calculate_transaction_risk()       → 5-faktörlü risk scoring
approve_transaction()              → Onay ve cüzdan güncelleme
detect_and_create_anomaly()        → Anomali tespit
perform_daily_reconciliation()     → Günlük mutabakat
complete_kyc_verification()        → KYC tamamlama
log_operator_activity()            → Audit trail logging
```

### 11 Raporlama Views

```
Gerçek Zamanlı:
├── v_transaction_summary          (İşlem özeti)
├── v_customer_activity_summary    (Müşteri aktivitesi)
├── v_risk_dashboard              (Risk profili)
├── v_pending_approvals            (Onay bekleyenler)
├── v_operator_performance         (Operatör performansı)
├── v_kyc_status_report            (KYC durum)
├── v_compliance_events_report     (Compliance olayları)
├── v_open_anomalies              (Açık anomaliler)
└── v_customer_velocity_metrics    (Hız metrikleri)

Materialized (Performans):
├── mv_daily_summary              (Günlük özet)
└── mv_customer_risk_profile      (Risk profili)
```

---

## 🔐 YETKI MODELİ

### Otomatik Onay Eşikleri

```
Tutar                  | İşlem Tipi   | Onay Seviyesi
0–2.500 TL             | Tümü         | Otomatik ✅
2.500–25.000 TL        | Deposit      | Otomatik ✅
                       | Withdrawal   | Operator 👤
25.000–50.000 TL       | Tümü         | Operator 👤
50.000+ TL             | Tümü         | Admin 🔐

Risk Skoru > 0.6 → Otomatik bir seviye yükselt
```

### RLS Politikaları

```
Müşteri:   Sadece kendi veriler (SELECT)
Operatör:  Departman + rol bazlı (SELECT, UPDATE)
Admin:     Tam erişim (SELECT, INSERT, UPDATE, DELETE)
Hassas:    payment_methods, kyc_documents, blacklist → Admin only
```

---

## 🧪 TEST OPERATÖRLERI

| İsim | Telegram ID | Departman | Rol | Yetki |
|------|-------------|----------|-----|-------|
| Sistem Yöneticisi | 1234567890 | admin | admin | ∞ |
| Senan Süpervizör | 9876543210 | operations | supervisor | 50.000 TL |
| Ali Operatör | 5555555555 | yatırım | operator | 25.000 TL |
| Ayşe Operatör | 4444444444 | çekim | operator | 25.000 TL |

### Test Müşterileri

| ID | İsim | Status | Balance | KYC |
|----|------|--------|---------|-----|
| CUST_TEST_001 | Ayşe Yılmaz | Active | 10.000 TL | ✅ Verified |
| CUST_TEST_002 | Mehmet Şahin | Active | 2.500 TL | ⏳ Pending |
| CUST_TEST_003 | Kemal Ürün | Active | 100.000 TL | ✅ Verified (VIP) |

---

## 🎯 SONRAKI ADIMLAR

### Immediate (Bugün)

1. **SQL Deploy:** FINTECH_DEPLOYMENT.md'yi takip et
2. **Test Queries:** setup-initial-data.sql doğrula
3. **Bot Test:** Telegram komutlarını test et

### Short Term (Bu hafta)

1. **Production Webhook:** SSL + domain setupi
2. **Admin Panel:** Dashboard UI oluştur
3. **Operatör Training:** System walkthrough

### Medium Term (Bu ay)

1. **Load Testing:** Yük testleri (1000 TPS+)
2. **Security Audit:** Penetration testing
3. **Compliance Review:** Regulatory requirements

---

## 📞 İLETİŞİM

- **System:** DEUS - Operasyon Sistemi
- **Telegram:** @DEUS_BotHandle
- **Credentials:** ~/.env (encrypted)
- **Database:** https://supabase.com/project/ezmamahyyvqppjlzqazb

---

## 📝 NOTLAR

- ✅ Tüm SQL dosyaları idempotent (tekrar çalıştırılabilir)
- ✅ RLS politikaları varsayılan olarak ACTIVE
- ✅ Supabase pgvector desteği için ML ready
- ✅ Telegram webhook server localhost'ta çalışıyor
- ✅ Production'a taşımak için domain + SSL sertifika gerekli

---

**Sistem Statüsü:** 🟢 DEPLOYMENT HAZIR  
**Son Güncelleme:** 2026-05-19 00:47 GMT-3  
**Sorumlu:** DEUS - Operasyon Sistemi
