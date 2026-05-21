-- ============================================================
-- DEUS — Öğrenme Mimarisi Migration
-- Migration: 002_deus_learning
-- 001_deus_schema.sql'den SONRA çalıştır
-- ============================================================

-- pgvector extension (Supabase'de mevcut, aktif et)
CREATE EXTENSION IF NOT EXISTS vector;

-- ── EVENTS (Her şeyin ham kaydı) ──────────────────────────────
-- Bot'un yaptığı veya gördüğü her şey buraya düşer.
-- Öğrenmenin ham maddesi budur.

CREATE TYPE event_type AS ENUM (
  'receipt_received',      -- Dekont geldi
  'receipt_parsed',        -- Claude parse etti
  'receipt_approved',      -- Onaylandı
  'receipt_rejected',      -- Reddedildi
  'receipt_duplicate',     -- Duplikasyon tespit edildi
  'support_message',       -- Üye mesaj yazdı
  'support_auto_replied',  -- Bot otomatik cevapladı
  'support_escalated',     -- Operatöre iletildi
  'support_resolved',      -- Çözüldü
  'anomaly_detected',      -- Anomali tespiti
  'blacklist_hit',         -- Kara liste eşleşmesi
  'balance_alert',         -- Bakiye uyarısı
  'limit_alert',           -- Limit uyarısı
  'operator_action',       -- Operatör bir şey yaptı
  'learning_cycle',        -- Haftalık öğrenme çalıştı
  'system'                 -- Sistem olayı
);

CREATE TABLE events (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  type          event_type NOT NULL,
  site_id       uuid REFERENCES sites(id),

  -- Kim tetikledi
  actor_type    text NOT NULL,              -- 'bot', 'operator', 'member', 'scheduler'
  actor_id      text,                       -- Telegram user ID veya sistem adı

  -- Ne oldu
  payload       jsonb NOT NULL DEFAULT '{}',  -- Tüm ham veri
  metadata      jsonb DEFAULT '{}',           -- Ek bağlam

  -- Sonuç (olay tamamlandıktan sonra güncellenir)
  outcome       text,                       -- 'success', 'failure', 'partial'
  outcome_data  jsonb,

  -- Öğrenme için işaretler
  is_processed  boolean NOT NULL DEFAULT false,  -- Öğrenme motorundan geçti mi
  is_anomaly    boolean NOT NULL DEFAULT false,  -- Anormal mi?
  needs_review  boolean NOT NULL DEFAULT false,  -- İnsan incelemesi gerekiyor mu?

  created_at    timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz
);

-- ── DECISION MEMORY (Her kararın hafızası) ───────────────────
-- Bot ne karar verdi, neden, sonuç ne oldu?
-- Vektör embedding ile semantik arama yapılabilir.

CREATE TABLE decision_memory (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id        uuid REFERENCES events(id),

  -- Durum özeti (embedding için metin)
  situation       text NOT NULL,     -- "Üye X, 5000 TRY yatırmak istedi, isim eşleşmedi"
  action_taken    text NOT NULL,     -- "Otomatik reddedildi, iade başlatıldı"
  reasoning       text NOT NULL,     -- Claude'un gerekçesi

  -- Vektör (text-embedding-3-small veya Claude embedding)
  embedding       vector(1536),      -- Semantik arama için

  -- Sonuç takibi
  outcome         text,              -- 'correct', 'incorrect', 'unknown'
  outcome_note    text,              -- Operatörün düzeltme notu
  feedback_score  smallint,          -- 1–5 (operatörden)

  -- Bağlam
  site_id         uuid REFERENCES sites(id),
  decision_level  decision_level,
  confidence      numeric(4, 3),     -- Bot'un o anki güven skoru
  was_overridden  boolean NOT NULL DEFAULT false,  -- Operatör bozdu mu?

  created_at      timestamptz NOT NULL DEFAULT now(),
  reviewed_at     timestamptz
);

-- ── KNOWLEDGE BASE (Büyüyen bilgi tabanı) ────────────────────
-- Plan'daki knowledge_base tablosu + embedding eklendi

CREATE TABLE knowledge_base (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  category         text NOT NULL,    -- 'deposit', 'withdrawal', 'account', 'bonus', 'general'
  question_pattern text NOT NULL,    -- "minimum yatırım tutarı nedir"
  answer_template  text NOT NULL,    -- Cevap şablonu ({{site_name}} gibi değişkenler)
  variables        jsonb DEFAULT '{}',

  -- Semantik arama için embedding
  embedding        vector(1536),

  -- Performans takibi
  usage_count      int NOT NULL DEFAULT 0,
  success_count    int NOT NULL DEFAULT 0,
  success_rate     numeric(4, 3) GENERATED ALWAYS AS (
    CASE WHEN usage_count = 0 THEN 0
    ELSE success_count::numeric / usage_count
    END
  ) STORED,

  -- Kaynak
  source           text NOT NULL DEFAULT 'manual',  -- 'manual', 'ai_generated', 'learned'
  is_active        boolean NOT NULL DEFAULT true,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ── CONVERSATION LOGS ─────────────────────────────────────────

CREATE TYPE resolution_type AS ENUM ('resolved', 'escalated', 'unresolved', 'abandoned');

CREATE TABLE conversation_logs (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id         uuid REFERENCES sites(id),

  -- Taraflar
  member_id       text NOT NULL,           -- Telegram user ID
  operator_id     uuid REFERENCES operators(id),

  -- Konuşma
  messages        jsonb NOT NULL DEFAULT '[]',   -- [{role, content, ts}]
  category        text,                          -- Otomatik sınıflandırma

  -- Sonuç
  resolution      resolution_type,
  satisfaction    smallint CHECK (satisfaction BETWEEN 1 AND 5),

  -- AI metrikleri
  ai_confidence   numeric(4, 3),
  auto_resolved   boolean NOT NULL DEFAULT false,
  escalation_reason text,

  -- Timing
  first_message_at  timestamptz NOT NULL DEFAULT now(),
  last_message_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at       timestamptz,
  duration_seconds  int GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (COALESCE(resolved_at, last_message_at) - first_message_at))::int
  ) STORED,

  -- Öğrenme
  is_processed    boolean NOT NULL DEFAULT false,
  learning_notes  text   -- Haftalık döngüde ne öğrenildi?
);

-- ── LEARNING QUEUE (İşlenecek batch'ler) ─────────────────────
-- Haftalık öğrenme döngüsü için kuyruk sistemi

CREATE TYPE learning_status AS ENUM ('pending', 'processing', 'completed', 'failed');

CREATE TABLE learning_queue (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_type    text NOT NULL,         -- 'weekly_analysis', 'failed_decisions', 'kb_update'
  status        learning_status NOT NULL DEFAULT 'pending',

  -- Analiz edilecekler
  event_ids     uuid[] DEFAULT '{}',
  conv_ids      uuid[] DEFAULT '{}',
  decision_ids  uuid[] DEFAULT '{}',

  -- Sonuç
  insights      jsonb,                 -- Claude'un çıkarımları
  actions_taken jsonb,                 -- Ne güncellendi
  new_kb_entries int DEFAULT 0,        -- Kaç yeni KB kaydı eklendi
  updated_prompts int DEFAULT 0,       -- Kaç prompt güncellendi

  scheduled_at  timestamptz NOT NULL DEFAULT now(),
  started_at    timestamptz,
  completed_at  timestamptz,
  error         text
);

-- ── PROMPT TEMPLATES (DB'de yaşayan promptlar) ───────────────
-- Kod deploy etmeden prompt'ları güncelleyebilirsin.
-- Bot öğrendikçe buradaki promptlar evrilir.

CREATE TABLE prompt_templates (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  key         text NOT NULL UNIQUE,    -- 'receipt_parse', 'intent_detect', 'support_reply'
  version     int NOT NULL DEFAULT 1,
  content     text NOT NULL,           -- Prompt metni ({{değişken}} formatında)
  variables   text[] DEFAULT '{}',     -- Beklenen değişken listesi
  model       text NOT NULL DEFAULT 'claude-haiku-4-5',  -- Hangi modelle kullanılır
  max_tokens  int NOT NULL DEFAULT 1024,

  -- Performans
  avg_confidence  numeric(4, 3),
  usage_count     int NOT NULL DEFAULT 0,
  last_updated_reason text,            -- Neden güncellendi?

  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── USER PROFILES (Üye hafızası) ─────────────────────────────

CREATE TABLE user_profiles (
  user_id             text PRIMARY KEY,   -- Telegram user ID (string)
  site_id             uuid REFERENCES sites(id),

  -- İşlem geçmişi
  total_deposits      numeric(18, 2) NOT NULL DEFAULT 0,
  total_withdrawals   numeric(18, 2) NOT NULL DEFAULT 0,
  transaction_count   int NOT NULL DEFAULT 0,
  avg_transaction     numeric(18, 2) GENERATED ALWAYS AS (
    CASE WHEN transaction_count = 0 THEN 0
    ELSE (total_deposits + total_withdrawals) / transaction_count
    END
  ) STORED,
  preferred_method    text,

  -- Risk
  risk_score          numeric(4, 3) NOT NULL DEFAULT 0.1,   -- 0–1
  complaint_count     int NOT NULL DEFAULT 0,
  blacklist_hits      int NOT NULL DEFAULT 0,

  -- Segmentasyon
  vip_status          boolean NOT NULL DEFAULT false,
  segment             text DEFAULT 'standard',  -- 'standard', 'vip', 'suspicious', 'blocked'

  -- AI gözlemleri (zamanla birikir)
  behavior_notes      text,
  ai_tags             text[] DEFAULT '{}',       -- ['hızlı_çeker', 'sık_şikayet', ...]

  first_seen_at   timestamptz NOT NULL DEFAULT now(),
  last_activity   timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ── INDEX'LER ─────────────────────────────────────────────────

-- Events — hızlı sorgular
CREATE INDEX idx_events_type ON events(type);
CREATE INDEX idx_events_unprocessed ON events(is_processed, created_at) WHERE is_processed = false;
CREATE INDEX idx_events_needs_review ON events(needs_review) WHERE needs_review = true;
CREATE INDEX idx_events_created_at ON events(created_at DESC);

-- Decision Memory — vektör arama (cosine distance)
CREATE INDEX idx_decision_embedding ON decision_memory
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_decision_outcome ON decision_memory(outcome);
CREATE INDEX idx_decision_overridden ON decision_memory(was_overridden) WHERE was_overridden = true;

-- Knowledge Base — vektör arama
CREATE INDEX idx_kb_embedding ON knowledge_base
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
CREATE INDEX idx_kb_category ON knowledge_base(category);
CREATE INDEX idx_kb_active ON knowledge_base(is_active) WHERE is_active = true;

-- Conversation Logs
CREATE INDEX idx_conv_member ON conversation_logs(member_id);
CREATE INDEX idx_conv_unprocessed ON conversation_logs(is_processed) WHERE is_processed = false;
CREATE INDEX idx_conv_resolution ON conversation_logs(resolution);

-- Learning Queue
CREATE INDEX idx_lq_pending ON learning_queue(status) WHERE status = 'pending';

-- Prompt Templates
CREATE INDEX idx_prompt_key ON prompt_templates(key) WHERE is_active = true;

-- User Profiles
CREATE INDEX idx_profile_risk ON user_profiles(risk_score DESC);
CREATE INDEX idx_profile_segment ON user_profiles(segment);

-- ── RLS POLİTİKALARI ─────────────────────────────────────────

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON events FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON decision_memory FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON knowledge_base FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON conversation_logs FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON learning_queue FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON prompt_templates FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON user_profiles FOR ALL TO service_role USING (true);

-- ── SEED: Temel prompt şablonları ────────────────────────────

INSERT INTO prompt_templates (key, content, variables, model, max_tokens, last_updated_reason) VALUES

('receipt_parse',
'Sen bir finansal dekont analiz uzmanısın. Verilen dekont görselini veya metnini analiz et ve aşağıdaki JSON formatında çıktı ver.

Dekont içeriği: {{content}}

Çıkar:
- sender_name: Gönderen ad soyad
- sender_iban: Gönderen IBAN (TR ile başlayan 26 hane)
- receiver_name: Alıcı ad soyad
- receiver_iban: Alıcı IBAN
- amount: Tutar (sadece sayı, para birimi ayrı)
- currency: Para birimi (TRY/USD/EUR)
- bank_name: Banka adı
- receipt_number: Dekont/referans numarası
- receipt_date: Tarih (ISO 8601)
- description: Açıklama alanı

Emin olmadığın alanlara null yaz. JSON dışında hiçbir şey yazma.',
ARRAY['content'],
'claude-haiku-4-5',
2048,
'İlk versiyon'),

('intent_detect',
'Bir müşteri destek mesajını analiz et. Kullanıcı: {{username}}

Mesaj: {{message}}

Geçmiş bağlam: {{context}}

Şunları belirle:
1. intent: Ana niyet (deposit_issue / withdrawal_issue / account_issue / bonus_query / general_info / complaint / urgent)
2. urgency: aciliyet seviyesi (low / medium / high / critical)
3. sentiment: duygu durumu (positive / neutral / frustrated / angry)
4. key_entities: Metinden çıkarılan önemli bilgiler (tutar, tarih, işlem no vb.)
5. suggested_action: Önerilen aksiyon

JSON formatında yanıt ver.',
ARRAY['username', 'message', 'context'],
'claude-haiku-4-5',
512,
'İlk versiyon'),

('support_reply',
'Sen DEUS adlı profesyonel bir müşteri destek asistanısın. Türkçe, samimi ama profesyonel yanıt ver.

Üye: {{member_name}}
Soru/Sorun: {{message}}
Kategori: {{category}}
İlgili bilgi: {{kb_content}}

Geçmiş etkileşim özeti: {{history_summary}}

Kurallar:
- Maksimum 3 cümle
- Emoji kullanma (sadece durum bildirimlerinde ✅ ❌ ⏳)
- Çözüm odaklı, belirsiz cevap verme
- Bilmiyorsan "Operatörümüze bağlıyorum" de, uydurma',
ARRAY['member_name', 'message', 'category', 'kb_content', 'history_summary'],
'claude-haiku-4-5',
256,
'İlk versiyon'),

('weekly_learning',
'Sen DEUS sisteminin öğrenme motorusun. Bu haftanın verilerini analiz et.

Başarısız kararlar ({{failed_count}} adet):
{{failed_decisions}}

Düşük memnuniyetli konuşmalar ({{low_sat_count}} adet):
{{low_satisfaction_convs}}

Operatör düzeltmeleri ({{override_count}} adet):
{{overrides}}

Analiz et:
1. patterns: Tekrar eden başarısızlık kalıpları
2. root_causes: Temel sebepler
3. kb_suggestions: Knowledge base''e eklenecek yeni Q&A çiftleri
4. prompt_updates: Güncellenecek promptlar ve neden
5. rule_suggestions: Yeni kural önerileri (insan onayı için)
6. confidence_adjustments: Güven eşiklerinde değişiklik önerileri

JSON formatında, Türkçe açıklamalar ile yanıt ver.',
ARRAY['failed_count', 'failed_decisions', 'low_sat_count', 'low_satisfaction_convs', 'override_count', 'overrides'],
'claude-sonnet-4-6',
4096,
'İlk versiyon');
