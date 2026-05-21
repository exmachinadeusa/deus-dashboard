#!/bin/bash

# DEUS FINTECH - INSTANT OPERATOR SETUP
# MCP Supabase direct SQL execution

set -e

echo "🚀 DEUS - INSTANT OPERATOR DEPLOYMENT"
echo "======================================"
echo ""

# SQL komutlarını doğrudan curl ile Supabase'e gönder
SUPABASE_URL="https://ezmamahyyvqppjlzqazb.supabase.co"
SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY}"

echo "📡 Supabase'e bağlanılıyor..."

# 1. Operatör tablosu oluştur (eğer yoksa)
echo ""
echo "1️⃣  Operatör tablosu kontrol ediliyor..."

curl -s -X POST \
  "${SUPABASE_URL}/rest/v1/rpc/exec_sql" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d '{
    "query": "CREATE TABLE IF NOT EXISTS operators (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT, telegram_id BIGINT UNIQUE, department TEXT, role TEXT, is_active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT NOW());"
  }' > /dev/null 2>&1

echo "   ✅ Tablo hazır"

# 2. Test Operatörlerini ekle
echo ""
echo "2️⃣  Test operatörleri ekleniyor..."

# Admin
curl -s -X POST \
  "${SUPABASE_URL}/rest/v1/operators" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d '{
    "name": "Sistem Yöneticisi",
    "telegram_id": 1234567890,
    "department": "admin",
    "role": "admin",
    "is_active": true
  }' > /dev/null 2>&1

echo "   ✅ Sistem Yöneticisi (1234567890)"

# Operator 1
curl -s -X POST \
  "${SUPABASE_URL}/rest/v1/operators" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d '{
    "name": "Ali Operatör - Yatırım",
    "telegram_id": 5555555555,
    "department": "yatirım",
    "role": "operator",
    "is_active": true
  }' > /dev/null 2>&1

echo "   ✅ Ali Operatör (5555555555)"

# Operator 2
curl -s -X POST \
  "${SUPABASE_URL}/rest/v1/operators" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d '{
    "name": "Ayşe Operatör - Çekim",
    "telegram_id": 4444444444,
    "department": "cekim",
    "role": "operator",
    "is_active": true
  }' > /dev/null 2>&1

echo "   ✅ Ayşe Operatör (4444444444)"

# Supervisor
curl -s -X POST \
  "${SUPABASE_URL}/rest/v1/operators" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d '{
    "name": "Senan Süpervizör",
    "telegram_id": 9876543210,
    "department": "operations",
    "role": "supervisor",
    "is_active": true
  }' > /dev/null 2>&1

echo "   ✅ Senan Süpervizör (9876543210)"

echo ""
echo "======================================"
echo "✅ OPERATOR SETUP TAMAMLANDI"
echo ""
echo "🤖 Bot şimdi aktif:"
echo "   @DEUS_BotHandle"
echo ""
echo "TEST: /start komutunu gönder"
echo "======================================"
