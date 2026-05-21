#!/bin/bash
# DEUS - "Logged out" state geçince botu otomatik başlatır
set -u
cd "$(dirname "$0")"

TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' .env | cut -d= -f2)
LOG=/tmp/deus-wait.log

echo "" > "$LOG"
echo "🕐 $(date '+%H:%M:%S') - Logged out state için bekleniyor..." | tee -a "$LOG"

while true; do
  RES=$(curl -s --max-time 10 "https://api.telegram.org/bot${TOKEN}/getMe")
  if echo "$RES" | grep -q '"ok":true'; then
    echo "✅ $(date '+%H:%M:%S') - Bot oturumu açık! Başlatılıyor..." | tee -a "$LOG"
    break
  fi
  echo "⏳ $(date '+%H:%M:%S') - hâlâ kilitli: $RES" | tee -a "$LOG"
  sleep 30
done

# Eski instance'ı temizle
pkill -f "tsx.*polling-bot" 2>/dev/null
sleep 1

# Botu başlat
nohup npm start > /tmp/deus-bot.log 2>&1 &
BOT_PID=$!
echo "🚀 $(date '+%H:%M:%S') - Bot PID: $BOT_PID" | tee -a "$LOG"
sleep 5
echo "--- BOT LOG ---" | tee -a "$LOG"
tail -30 /tmp/deus-bot.log | tee -a "$LOG"
