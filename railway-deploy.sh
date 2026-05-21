#!/bin/bash
set -e

PROJECT_ID="57bb5067-f034-4acf-ad39-812c805a4563"
TOKEN="0acd1a27-8411-4e90-a180-a19f9a6ec73c"
SERVICE_NAME="deus-dashboard"

echo "🚀 Railway Deploy başlıyor..."
echo "Project: $PROJECT_ID"

cd ~/deus

# Service oluştur
echo "📦 Service oluşturuluyor: $SERVICE_NAME"
curl -s -X POST https://api.railway.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"query\": \"mutation { serviceCreate(input: { projectId: \\\"$PROJECT_ID\\\", name: \\\"$SERVICE_NAME\\\" }) { id name } }\"
  }" | jq .

echo "✅ Deploy başarılı (API kullan)"
