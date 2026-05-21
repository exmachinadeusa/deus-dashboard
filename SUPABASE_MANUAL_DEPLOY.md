# 🚀 SUPABASE MANUEL SQL DEPLOYMENT

**Tarih:** 2026-05-19 00:54 GMT-3  
**Status:** Senin için adım adım hazırlandı

---

## 📋 ADIM ADIM TALIMATLAR

### ADIM 1: Supabase Dashboard'a Giriş

1. Browser'ı aç: **https://supabase.com**
2. **Project ezmamahyyvqppjlzqazb**'ye giriş yap
3. Sol menüden **SQL Editor** tıkla

---

### ADIM 2: İlk SQL Dosyasını Çalıştır (004)

#### 2.1 SQL Editor'da Yeni Query Oluştur
- **New Query** → **Create** tıkla
- Veya: **Ctrl+K** (Mac: **Cmd+K**)

#### 2.2 Dosya 1: 004_fintech_advanced_schema.sql

**Bu dosyayı kopyala:**

```sql
-- FINTECH ADVANCED SCHEMA
-- Kurulum tarihi: 2026-05-19 00:36 GMT-3

-- İlk 100 satırı buraya yapıştır (dosyayı oku):
```

**İŞLEM:**
1. Terminal'de aç:
```bash
cd ~/deus
cat 004_fintech_advanced_schema.sql | head -200
```

2. **Tüm çıktıyı** Supabase SQL Editor'a **yapıştır**
3. **Run** tıkla (Cmd+Enter)
4. Sonuç: ✅ **14 tablo oluşturulur**

---

### ADIM 3: 005_fintech_rls.sql Çalıştır

**New Query** → **Create**

1. Terminal'de:
```bash
cat 005_fintech_rls.sql
```

2. Tüm çıktıyı kopyala → Supabase'e yapıştır
3. **Run** tıkla
4. Sonuç: ✅ **RLS Politikaları oluşturulur** (uyarıları yoksay)

---

### ADIM 4: 006_fintech_views.sql Çalıştır

**New Query** → **Create**

```bash
cat 006_fintech_views.sql
```

Kopyala → Supabase'e yapıştır → **Run**

Sonuç: ✅ **11 view + 2 materialized view**

---

### ADIM 5: 007_fintech_functions.sql Çalıştır

**New Query** → **Create**

```bash
cat 007_fintech_functions.sql
```

Kopyala → Supabase'e yapıştır → **Run**

Sonuç: ✅ **7 business function**

---

### ADIM 6: setup-initial-data.sql Çalıştır (ÖNEMLİ!)

**New Query** → **Create**

```bash
cat setup-initial-data.sql
```

Kopyala → Supabase'e yapıştır → **Run**

Sonuç: ✅ **Test operatörleri & müşteriler oluşturulur**

---

## ✅ DEPLOYMENT KONTROL LİSTESİ

Tüm SQL dosyalarını çalıştırdıktan sonra, Supabase SQL Editor'da kontrol et:

### Kontrol 1: Tablo Sayısı

**New Query → Create:**

```sql
SELECT COUNT(*) as toplam_tablo
FROM information_schema.tables 
WHERE table_schema = 'public';
```

**Run** → **Beklenen:** `14` veya daha fazla

---

### Kontrol 2: Operatörleri Doğrula

```sql
SELECT telegram_id, name, role, is_active 
FROM operators 
ORDER BY role DESC;
```

**Beklenen Sonuç:**
```
telegram_id    | name              | role       | is_active
1234567890     | Sistem Yöneticisi | admin      | true
9876543210     | Senan Süpervizör  | supervisor | true
5555555555     | Ali Operatör      | operator   | true
4444444444     | Ayşe Operatör     | operator   | true
```

---

### Kontrol 3: Müşterileri Doğrula

```sql
SELECT customer_id, customer_name, kyc_status, balance 
FROM customer_accounts 
ORDER BY balance DESC;
```

**Beklenen:** 3 müşteri (Ayşe, Mehmet, Kemal)

---

### Kontrol 4: Views Kontrolü

```sql
SELECT table_name 
FROM information_schema.views 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

**Beklenen:** 11 view (v_transaction_summary, vb.)

---

### Kontrol 5: Functions Kontrolü

```sql
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_type = 'FUNCTION'
ORDER BY routine_name;
```

**Beklenen:** 7 function (process_transaction, vb.)

---

## 🤖 BOT TEST

Tüm SQL dosyaları çalıştıktan sonra:

### Test 1: Telegram Bot'u Aç
- **Telegram:** @DEUS_BotHandle

### Test 2: /start Komutunu Gönder

**Beklenen Sonuç (Test Operatör ID'sine ait):**
```
🤖 DEUS Operasyon Sistemi açıldı.

Komutlar:
/deposit - Yatırım
/withdraw - Çekim
/status - Durum
/help - Yardım
```

**YETKİSİZ ID'ye:**
```
🔒 Hata: Bu komutu kullanma yetkiniz yok.
⚠️ DEUS sistemi sadece yetkilendirilmiş operatörlere açıktır.
```

---

## 🔍 DOĞRULAMA

### Telegram ID'nizi Öğrenin

1. **@username_echo_bot**'a /start gönder
2. Bot size Telegram ID'nizi döndürecek
3. setup-initial-data.sql'deki telegram_id'ler arasında kontrol et

**Örnek:**
```
Telegram ID: 1234567890
Supabase'de: 1234567890 ✅ BULUNDU → Bot çalışacak
```

---

## 🚨 SORUN GIDERME

### Problem 1: SQL çalıştırılamıyor

**Çözüm:**
- Dosya çok büyükse, statement'lere böl
- Supabase sql Editor → Ctrl+A (tümünü seç) → Sil
- Yeni bir dosyadan başla

### Problem 2: "Permission Denied" hatası

**Çözüm:**
- RLS politikaları zaten varsa, uyarıyı yoksay
- **Devam et** → sonraki SQL dosyasını çalıştır

### Problem 3: Bot "yetkisiz" diyor

**Çözüm:**
- Supabase'de kontrol et: `SELECT * FROM operators;`
- Eğer tablo boşsa → setup-initial-data.sql'i çalıştır
- Telegram ID'nin tabloda olup olmadığını kontrol et

### Problem 4: Webhook bağlantısı yapılmıyor

**Çözüm:**
- Bot localhost:3000'de çalışıyor
- Production webhook için domain + SSL sertifika gerekli
- Şimdilik local test yeterli

---

## 📝 ÖZET

| Adım | Dosya | Tabloları | Status |
|------|-------|-----------|--------|
| 1 | 004_fintech_advanced_schema.sql | 14 | ⏳ Yapılacak |
| 2 | 005_fintech_rls.sql | - | ⏳ Yapılacak |
| 3 | 006_fintech_views.sql | 11 | ⏳ Yapılacak |
| 4 | 007_fintech_functions.sql | 7 | ⏳ Yapılacak |
| 5 | setup-initial-data.sql | Data | ⏳ Yapılacak |
| 6 | Bot Test | - | ⏳ Yapılacak |

---

## 🎯 BITTIKTEN SONRA

1. ✅ SQL deployment tamamlandı
2. ✅ Operatörler oluşturuldu
3. ✅ Bot yetki kontrolü aktif
4. ⏳ Test işlemleri çalıştır
5. ⏳ Production webhook (sonra)

---

**Sorumlu:** DEUS - Operasyon Sistemi  
**Başlangıç:** 2026-05-19 00:54 GMT-3  
**Mode:** MANUEL (Supabase Dashboard)
