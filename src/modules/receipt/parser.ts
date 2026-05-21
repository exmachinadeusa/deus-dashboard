// ============================================================
// DEUS — Dekont Parse Motoru
// src/modules/receipt/parser.ts
//
// Fotoğraf veya metin dekont alır:
//   1. Claude Vision ile alanları çıkarır
//   2. Kural zincirinden geçirir ($0 maliyet için)
//   3. Supabase'e kaydeder
//   4. Departmana bildirim tetikler
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import { supabase, log } from "../../index.js";
import { callClaude, parseJsonResponse } from "../../ai/router.js";
import { recordEvent, rememberDecision } from "../memory/engine.js";
import {
  runReceiptRuleChain,
  type ReceiptData,
} from "../../ai/rules.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── TİPLER ───────────────────────────────────────────────────

export interface ParsedReceipt extends ReceiptData {
  rawText?: string;
  confidence: number;
}

export interface ReceiptProcessResult {
  success: boolean;
  transactionId?: string;
  verdict: "auto_approved" | "auto_rejected" | "pending_operator" | "duplicate" | "error";
  reason: string;
  department?: { id: string; name: string; telegramChatId: bigint | null };
  parsed?: ParsedReceipt;
}

// ── FOTOĞRAFTAN PARSE ─────────────────────────────────────────

export async function parseReceiptFromPhoto(
  fileUrl: string
): Promise<ParsedReceipt | null> {
  log.info({ fileUrl }, "Dekont fotoğrafı parse ediliyor");

  try {
    const imgRes = await fetch(fileUrl);
    const imgBuffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(imgBuffer).toString("base64");
    const mediaType = (imgRes.headers.get("content-type") as "image/jpeg" | "image/png") ?? "image/jpeg";

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: `Sen bir Türk bankası dekont analiz uzmanısın.
Dekont görselindeki bilgileri eksiksiz çıkar.
SADECE JSON döndür, başka hiçbir açıklama yazma.
Emin olmadığın alanlara null yaz.`,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            {
              type: "text",
              text: `Bu dekont görselini analiz et ve şu JSON formatında döndür:
{
  "senderName": "Gönderen ad soyad",
  "senderIban": "TR ile başlayan IBAN veya null",
  "receiverName": "Alıcı ad soyad",
  "receiverIban": "TR ile başlayan IBAN veya null",
  "amount": 1234.56,
  "currency": "TRY",
  "bankName": "Banka adı",
  "receiptNumber": "Dekont/referans numarası",
  "receiptDate": "2024-01-15T14:30:00",
  "description": "Açıklama alanı",
  "confidence": 0.95
}`,
            },
          ],
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "";
    const parsed = parseJsonResponse<ParsedReceipt>(raw);

    if (!parsed) {
      log.warn("Dekont parse başarısız — JSON alınamadı");
      return null;
    }

    log.info(
      { confidence: parsed.confidence, amount: parsed.amount, senderName: parsed.senderName },
      "Dekont parse edildi"
    );

    return parsed;
  } catch (err) {
    log.error({ err }, "Dekont parse hatası");
    return null;
  }
}

// ── METİNDEN PARSE ───────────────────────────────────────────

export async function parseReceiptFromText(text: string): Promise<ParsedReceipt | null> {
  const response = await callClaude({
    task: "receipt_parse",
    userMessage: `Şu metin dekont bilgisi içeriyor. Parse et:

${text}

JSON formatında döndür:
{
  "senderName": null,
  "senderIban": null,
  "receiverName": null,
  "receiverIban": null,
  "amount": null,
  "currency": "TRY",
  "bankName": null,
  "receiptNumber": null,
  "receiptDate": null,
  "description": null,
  "confidence": 0.0
}`,
  });

  return parseJsonResponse<ParsedReceipt>(response.content);
}

// ── TAM İŞLEM AKIŞI ──────────────────────────────────────────

export async function processReceipt(opts: {
  memberId: string;
  memberName: string | null;
  siteId: string;
  sourceType: "photo" | "text";
  fileUrl?: string;
  rawText?: string;
  expectedAmount?: number;
}): Promise<ReceiptProcessResult> {

  const eventId = await recordEvent({
    type: "receipt_received",
    actorType: "member",
    actorId: opts.memberId,
    siteId: opts.siteId,
    payload: {
      sourceType: opts.sourceType,
      memberName: opts.memberName,
      expectedAmount: opts.expectedAmount,
    },
  });

  let parsed: ParsedReceipt | null = null;

  if (opts.sourceType === "photo" && opts.fileUrl) {
    parsed = await parseReceiptFromPhoto(opts.fileUrl);
  } else if (opts.sourceType === "text" && opts.rawText) {
    parsed = await parseReceiptFromText(opts.rawText);
  }

  if (!parsed) {
    return {
      success: false,
      verdict: "error",
      reason: "Dekont okunamadı. Lütfen net bir fotoğraf çekin veya bilgileri manuel girin.",
    };
  }

  const ruleResult = await runReceiptRuleChain(parsed, opts.memberName, opts.expectedAmount);

  log.info(
    { verdict: ruleResult.finalVerdict, rules: ruleResult.rules.length },
    "Kural zinciri tamamlandı"
  );

  if (ruleResult.finalVerdict === "reject") {
    const { data } = await supabase
      .from("transactions")
      .insert({
        site_id: opts.siteId,
        member_id: opts.memberId,
        member_name: opts.memberName,
        type: "deposit",
        amount: parsed.amount ?? 0,
        sender_name: parsed.senderName,
        sender_iban: parsed.senderIban,
        receiver_iban: parsed.receiverIban,
        bank_name: parsed.bankName,
        receipt_number: parsed.receiptNumber,
        receipt_date: parsed.receiptDate,
        ai_confidence: parsed.confidence,
        ai_parse_raw: parsed as unknown as Record<string, unknown>,
        status: "rejected",
        rejected_reason: ruleResult.rules.at(-1)?.result.reason,
        auto_processed: true,
      })
      .select("id")
      .single();

    if (eventId) {
      await rememberDecision({
        eventId,
        situation: `Üye ${opts.memberName ?? opts.memberId}, ₺${parsed.amount} yatırım dekontu gönderdi`,
        actionTaken: "Otomatik reddedildi",
        reasoning: ruleResult.rules.at(-1)?.result.reason ?? "Bilinmiyor",
        siteId: opts.siteId,
        decisionLevel: "2_routing",
        confidence: 0.95,
      });
    }

    return {
      success: true,
      transactionId: data?.["id"] as string | undefined,
      verdict: "auto_rejected",
      reason: ruleResult.rules.at(-1)?.result.reason ?? "Kural ihlali",
      parsed,
    };
  }

  const dept = ruleResult.department as {
    id: string;
    name: string;
    telegram_chat_id: bigint | null;
  } | undefined;

  if (ruleResult.finalVerdict === "auto_approve") {
    const { data } = await supabase
      .from("transactions")
      .insert({
        site_id: opts.siteId,
        department_id: dept?.id,
        member_id: opts.memberId,
        member_name: opts.memberName,
        type: "deposit",
        amount: parsed.amount ?? 0,
        sender_name: parsed.senderName,
        sender_iban: parsed.senderIban,
        receiver_iban: parsed.receiverIban,
        bank_name: parsed.bankName,
        receipt_number: parsed.receiptNumber,
        receipt_date: parsed.receiptDate,
        ai_confidence: parsed.confidence,
        ai_parse_raw: parsed as unknown as Record<string, unknown>,
        name_match: true,
        status: "approved",
        approved_by: "auto",
        approved_at: new Date().toISOString(),
        auto_processed: true,
      })
      .select("id")
      .single();

    if (dept?.id && parsed.amount) {
      await supabase.rpc("increment_department_balance", {
        dept_id: dept.id,
        amount: parsed.amount,
      });
    }

    return {
      success: true,
      transactionId: data?.["id"] as string | undefined,
      verdict: "auto_approved",
      reason: "Tüm kontroller geçti, otomatik onaylandı",
      department: dept
        ? { id: dept.id, name: dept.name, telegramChatId: dept.telegram_chat_id }
        : undefined,
      parsed,
    };
  }

  const { data } = await supabase
    .from("transactions")
    .insert({
      site_id: opts.siteId,
      department_id: dept?.id,
      member_id: opts.memberId,
      member_name: opts.memberName,
      type: "deposit",
      amount: parsed.amount ?? 0,
      sender_name: parsed.senderName,
      sender_iban: parsed.senderIban,
      receiver_iban: parsed.receiverIban,
      bank_name: parsed.bankName,
      receipt_number: parsed.receiptNumber,
      receipt_date: parsed.receiptDate,
      ai_confidence: parsed.confidence,
      ai_parse_raw: parsed as unknown as Record<string, unknown>,
      status: "pending",
      auto_processed: false,
    })
    .select("id")
    .single();

  return {
    success: true,
    transactionId: data?.["id"] as string | undefined,
    verdict: "pending_operator",
    reason: ruleResult.rules.find((r) => r.result.verdict === "needs_ai")?.result.reason ?? "Operatör onayı gerekli",
    department: dept
      ? { id: dept.id, name: dept.name, telegramChatId: dept.telegram_chat_id }
      : undefined,
    parsed,
  };
}
