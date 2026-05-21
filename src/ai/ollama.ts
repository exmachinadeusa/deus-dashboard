// ============================================================
// DEUS — Ollama Yerel Model İstemcisi
// src/ai/ollama.ts
//
// qwen2.5:7b ile $0 maliyetle:
//   - Intent tespiti
//   - KB cevap uyarlama
//   - Sentiment scoring
//   - Soru normalizasyonu
//
// Claude'a GİTMEDEN önce bu katman devreye girer.
// Ollama kapalıysa → sessizce null döner, Claude'a düşer.
// ============================================================

const OLLAMA_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = "qwen2.5:7b";
const OLLAMA_TIMEOUT = 12000;

// ── Availability cache (30 sn) ───────────────────────────────
let _ollamaAvailable: boolean | null = null;
let _ollamaCheckedAt = 0;

async function isOllamaAvailable(): Promise<boolean> {
  const now = Date.now();
  if (_ollamaAvailable !== null && now - _ollamaCheckedAt < 30_000) {
    return _ollamaAvailable;
  }
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    _ollamaAvailable = res.ok;
  } catch {
    _ollamaAvailable = false;
  }
  _ollamaCheckedAt = now;
  return _ollamaAvailable;
}

// ── Temel çağrı ──────────────────────────────────────────────
async function callOllama(prompt: string, system?: string): Promise<string | null> {
  if (!(await isOllamaAvailable())) return null;
  try {
    const body: Record<string, unknown> = {
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.1, num_predict: 256, top_p: 0.9 },
    };
    if (system) body.system = system;

    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(OLLAMA_TIMEOUT),
    });
    if (!res.ok) return null;
    const data = await res.json() as { response?: string };
    return data.response?.trim() ?? null;
  } catch {
    _ollamaAvailable = false;
    return null;
  }
}

// ── TİPLER ───────────────────────────────────────────────────
export interface IntentResult {
  intent: string;
  confidence: number;
  subIntent?: string;
}

// ── INTENT TESPİTİ ───────────────────────────────────────────
export async function detectIntent(message: string): Promise<IntentResult | null> {
  const prompt = `Kullanıcı mesajını analiz et ve intent'i belirle.
Mesaj: "${message}"

SADECE şu JSON formatında cevap ver:
{
  "intent": "deposit_issue|withdrawal_issue|account_issue|bonus_query|general_info|complaint|urgent",
  "confidence": 0.0-1.0,
  "subIntent": "opsiyonel"
}

deposit_issue: Yatırım sorunları, dekont
withdrawal_issue: Çekim sorunları
account_issue: Giriş, şifre, hesap
bonus_query: Bonus, promosyon
general_info: Genel bilgi
complaint: Şikayet
urgent: Acil, para kayboldu`;

  const raw = await callOllama(prompt);
  if (!raw) return null;
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]) as IntentResult;
  } catch {
    return null;
  }
}

// ── KB CEVAP UYARLAMA ────────────────────────────────────────
export async function adaptKbAnswer(opts: {
  memberName: string;
  question: string;
  answerTemplate: string;
  siteVariables: Record<string, string>;
}): Promise<string | null> {
  // Önce basit değişken değiştirme — LLM'siz
  let adapted = opts.answerTemplate;
  for (const [key, val] of Object.entries(opts.siteVariables)) {
    adapted = adapted.replaceAll(`{{${key}}}`, val);
    adapted = adapted.replaceAll(`{${key}}`, val);
  }
  adapted = adapted.replaceAll("{{member_name}}", opts.memberName);
  adapted = adapted.replaceAll("{member_name}", opts.memberName);

  // Değişken kalmadıysa Ollama'ya gerek yok
  if (!adapted.includes("{{") && !adapted.includes("{")) return adapted;

  // Ollama ile uyarla
  const prompt = `Şu destek cevabını "${opts.memberName}" için kişiselleştir.
Soru: ${opts.question}
Taslak: ${opts.answerTemplate}
Site: ${JSON.stringify(opts.siteVariables)}
Kısa, samimi, Türkçe cevap yaz. Sadece cevabı yaz.`;

  return await callOllama(prompt);
}

// ── SENTIMENT SCORING ────────────────────────────────────────
export async function scoreSentiment(message: string): Promise<number> {
  const prompt = `Mesajın tonunu 1-5 puan: 1=çok olumsuz, 5=çok olumlu.
"${message}"
SADECE sayı yaz:`;
  const raw = await callOllama(prompt);
  if (!raw) return 3;
  const score = parseInt(raw.trim().charAt(0));
  return isNaN(score) ? 3 : Math.min(5, Math.max(1, score));
}

// ── SORU NORMALİZASYONU ──────────────────────────────────────
export async function normalizeQuestion(question: string): Promise<string> {
  const prompt = `Şu soruyu genel kalıba dönüştür (özel isim, tutar, tarih olmadan).
Sadece soruyu yaz:
"${question}"`;
  const normalized = await callOllama(prompt);
  return normalized ?? question;
}
