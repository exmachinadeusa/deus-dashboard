/**
 * Receipt Parser - Dekont/Makbuz parsing
 * 
 * Telegram'dan gelen banka dekontu fotoğrafını/PDF'ini parse eder.
 * - parseReceiptText(rawText): regex tabanlı TR banka formatları
 * - parseReceiptImage(buffer): OCR (Anthropic Vision veya tesseract)
 */
import { logger } from '../../lib/logger.js';

export interface ParsedReceipt {
  bankName?: string;
  amount?: number;
  currency?: string;
  senderName?: string;
  senderIban?: string;
  receiverName?: string;
  receiverIban?: string;
  referenceCode?: string;
  timestamp?: string;
  raw: string;
  confidence: number;
}

// TR banka dekontu kalıpları
const PATTERNS = {
  // "Tutar: 5.000,00 TL" veya "1500.00 TRY"
  amount: /(?:tutar|amount|miktar)[:\s]*([\d.,]+)\s*(TL|TRY|TRL|USD|EUR|BRL)?/i,
  // "IBAN: TR12 3456 7890 1234 5678 9012 34"
  iban: /TR\d{2}[\s\d]{20,28}/g,
  // "Ref: 1234567890"
  reference: /(?:ref(?:erans)?|işlem\s*no|transaction\s*id)[:\s]*([\w-]+)/i,
  // "19.05.2026 03:45" veya "2026-05-19 03:45"
  date: /(\d{2}[./-]\d{2}[./-]\d{4})|(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/,
  // Banka adları
  banks: /\b(garanti|akbank|işbank|is\s*bank|yapı\s*kredi|ziraat|halkbank|vakıfbank|qnb\s*finansbank|deniz\s*bank|teb|enpara|n26|wise)\b/i,
};

// ────────────────────────────────────────────────────────────────
export function parseReceiptText(rawText: string): ParsedReceipt {
  const text = rawText.replace(/\s+/g, ' ').trim();
  const result: ParsedReceipt = { raw: rawText, confidence: 0 };
  let hits = 0;

  // Tutar
  const amountMatch = text.match(PATTERNS.amount);
  if (amountMatch) {
    const num = amountMatch[1].replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(num);
    if (!isNaN(parsed) && parsed > 0) {
      result.amount = parsed;
      result.currency = (amountMatch[2] || 'TRL').toUpperCase().replace('TL', 'TRL').replace('TRY', 'TRL');
      hits++;
    }
  }

  // IBAN'lar (ilk = gönderen, ikinci = alıcı varsayım)
  const ibans = [...text.matchAll(PATTERNS.iban)].map(m => m[0].replace(/\s/g, ''));
  if (ibans.length > 0) {
    result.senderIban = ibans[0];
    hits++;
    if (ibans.length > 1) result.receiverIban = ibans[1];
  }

  // Referans
  const refMatch = text.match(PATTERNS.reference);
  if (refMatch) {
    result.referenceCode = refMatch[1];
    hits++;
  }

  // Tarih
  const dateMatch = text.match(PATTERNS.date);
  if (dateMatch) {
    result.timestamp = dateMatch[0];
    hits++;
  }

  // Banka
  const bankMatch = text.match(PATTERNS.banks);
  if (bankMatch) {
    result.bankName = bankMatch[1].toUpperCase();
    hits++;
  }

  // Güven: 5 alandan kaçı bulundu
  result.confidence = hits / 5;

  logger.info({ deus_receipt_parse: { hits, confidence: result.confidence } });
  return result;
}

// ────────────────────────────────────────────────────────────────
export async function parseReceiptImage(imageBuffer: Buffer | string): Promise<ParsedReceipt> {
  // TODO: Anthropic Vision veya tesseract.js entegrasyonu
  // Şimdilik stub: image_buffer → boş sonuç
  logger.warn('parseReceiptImage henüz Anthropic Vision entegre değil');
  return {
    raw: '[image]',
    confidence: 0,
  };
}

// ────────────────────────────────────────────────────────────────
export function validateReceipt(parsed: ParsedReceipt, expectedAmount?: number): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  if (!parsed.amount) issues.push('Tutar bulunamadı');
  if (!parsed.referenceCode && !parsed.senderIban) issues.push('Referans veya IBAN yok');
  if (expectedAmount && parsed.amount && Math.abs(parsed.amount - expectedAmount) > 0.01) {
    issues.push(`Tutar uyumsuz: beklenen ${expectedAmount}, gelen ${parsed.amount}`);
  }
  if (parsed.confidence < 0.4) issues.push(`Düşük güven: ${(parsed.confidence * 100).toFixed(0)}%`);

  return { valid: issues.length === 0, issues };
}

export default { parseReceiptText, parseReceiptImage, validateReceipt };
