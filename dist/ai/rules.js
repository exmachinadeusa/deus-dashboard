// ============================================================
// DEUS — Kural Motoru (Sıfır Maliyet Ön Filtre)
// src/ai/rules.ts
//
// AI'ya göndermeden önce kod ile çözülebilecek her şey burada.
// Her kural bir RuleResult döndürür.
// Sonuç "handled" ise AI çağrısı yapılmaz → $0
// ============================================================
import { supabase, log } from "../index.js";
import { redis } from "../index.js";
// ── IBAN FORMAT KONTROLÜ ──────────────────────────────────────
export function validateIban(iban) {
    if (!iban) {
        return { verdict: "needs_ai", reason: "IBAN bulunamadı, AI analizi gerekli" };
    }
    const cleaned = iban.replace(/\s/g, "").toUpperCase();
    if (!/^TR\d{24}$/.test(cleaned)) {
        return {
            verdict: "reject",
            reason: `Geçersiz IBAN formatı: ${cleaned}. TR + 24 rakam olmalı.`,
        };
    }
    return { verdict: "pass", reason: "IBAN formatı geçerli", data: { cleaned } };
}
// ── DUPLİKASYON KONTROLÜ ─────────────────────────────────────
export async function checkDuplication(receiptNumber) {
    if (!receiptNumber) {
        return { verdict: "needs_ai", reason: "Dekont numarası yok, duplikasyon kontrol edilemiyor" };
    }
    const cacheKey = `receipt:${receiptNumber}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
        return {
            verdict: "reject",
            reason: `Duplikasyon! Bu dekont daha önce işlendi. ID: ${cached}`,
            data: { existingId: cached },
        };
    }
    const { data } = await supabase
        .from("transactions")
        .select("id, status, created_at")
        .eq("receipt_number", receiptNumber)
        .single();
    if (data) {
        await redis.setex(cacheKey, 86400, data["id"]);
        return {
            verdict: "reject",
            reason: `Duplikasyon! Dekont ${data["id"]} ID ile ${data["status"]} durumunda mevcut.`,
            data: { existingId: data["id"], status: data["status"] },
        };
    }
    return { verdict: "pass", reason: "Duplikasyon yok" };
}
// ── TUTAR KONTROLÜ ────────────────────────────────────────────
export function validateAmount(amount, opts = {}) {
    if (!amount || amount <= 0) {
        return { verdict: "reject", reason: "Geçersiz tutar: sıfır veya negatif" };
    }
    const { minAmount = 100, maxAmount = 5_000_000 } = opts;
    if (amount < minAmount) {
        return {
            verdict: "reject",
            reason: `Tutar çok düşük: ₺${amount.toLocaleString("tr-TR")} (minimum ₺${minAmount.toLocaleString("tr-TR")})`,
        };
    }
    if (amount > maxAmount) {
        return {
            verdict: "needs_ai",
            reason: `Yüksek tutar: ₺${amount.toLocaleString("tr-TR")} — AI incelemesi gerekli`,
        };
    }
    if (opts.expectedAmount) {
        const tol = opts.tolerancePct ?? 0.02;
        const diff = Math.abs(amount - opts.expectedAmount) / opts.expectedAmount;
        if (diff > tol) {
            return {
                verdict: "reject",
                reason: `Tutar uyuşmazlığı: Gönderilen ₺${amount.toLocaleString("tr-TR")}, beklenen ₺${opts.expectedAmount.toLocaleString("tr-TR")}`,
                data: { diff: `%${(diff * 100).toFixed(2)}` },
            };
        }
    }
    return { verdict: "pass", reason: "Tutar geçerli", data: { amount } };
}
// ── KARA LİSTE KONTROLÜ ──────────────────────────────────────
export async function checkBlacklist(values) {
    const checks = [];
    if (values.iban)
        checks.push({ type: "iban", value: values.iban.replace(/\s/g, "") });
    if (values.name)
        checks.push({ type: "name", value: values.name.toLowerCase().trim() });
    if (values.tc)
        checks.push({ type: "tc", value: values.tc.trim() });
    if (values.phone)
        checks.push({ type: "phone", value: values.phone.replace(/\D/g, "") });
    if (checks.length === 0) {
        return { verdict: "pass", reason: "Kara liste kontrolü için veri yok" };
    }
    for (const check of checks) {
        const cacheKey = `bl:${check.type}:${check.value}`;
        const cached = await redis.get(cacheKey);
        if (cached === "1") {
            return {
                verdict: "reject",
                reason: `Kara liste eşleşmesi: ${check.type.toUpperCase()} → ${check.value}`,
                data: { blacklistType: check.type, value: check.value },
            };
        }
    }
    const { data } = await supabase
        .from("blacklist")
        .select("type, value, reason")
        .eq("is_active", true)
        .or(checks.map((c) => `and(type.eq.${c.type},value.eq.${c.value})`).join(","));
    if (data && data.length > 0) {
        const hit = data[0];
        await redis.setex(`bl:${hit["type"]}:${hit["value"]}`, 3600, "1");
        return {
            verdict: "reject",
            reason: `Kara liste: ${hit["type"]?.toString().toUpperCase()} eşleşmesi. Sebep: ${hit["reason"] ?? "Belirtilmemiş"}`,
            data: { type: hit["type"], value: hit["value"] },
        };
    }
    await Promise.all(checks.map((c) => redis.setex(`bl:${c.type}:${c.value}:clean`, 1800, "1")));
    return { verdict: "pass", reason: "Kara liste temiz" };
}
// ── DEPARTMAN BULMA ───────────────────────────────────────────
export async function findDepartmentByIban(receiverIban) {
    if (!receiverIban) {
        return { verdict: "needs_ai", reason: "Alıcı IBAN bulunamadı" };
    }
    const cleaned = receiverIban.replace(/\s/g, "").toUpperCase();
    const cacheKey = `dept:iban:${cleaned}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
        const dept = JSON.parse(cached);
        return {
            verdict: "pass",
            reason: `Departman bulundu (cache): ${dept["name"]}`,
            data: { department: dept },
        };
    }
    const { data } = await supabase
        .from("departments")
        .select("id, name, telegram_chat_id, site_id, status, current_balance, daily_limit")
        .eq("iban", cleaned)
        .eq("status", "active")
        .single();
    if (!data) {
        return {
            verdict: "reject",
            reason: `Bilinmeyen IBAN: ${cleaned} — Sistemde kayıtlı departman yok`,
            data: { iban: cleaned },
        };
    }
    await redis.setex(cacheKey, 600, JSON.stringify(data));
    return {
        verdict: "pass",
        reason: `Departman: ${data["name"]}`,
        data: { department: data },
    };
}
// ── İSİM EŞLEŞMESİ ───────────────────────────────────────────
export function matchName(senderName, memberName) {
    if (!senderName || !memberName) {
        return { verdict: "needs_ai", reason: "İsim karşılaştırması için yeterli veri yok" };
    }
    const normalize = (s) => s
        .toLowerCase()
        .replace(/[^a-zçğıöşü ]/gi, "")
        .trim()
        .split(/\s+/)
        .sort()
        .join(" ");
    const normSender = normalize(senderName);
    const normMember = normalize(memberName);
    if (normSender === normMember) {
        return { verdict: "pass", reason: "İsim tam eşleşme" };
    }
    const senderWords = new Set(normSender.split(" "));
    const memberWords = normMember.split(" ");
    const matchCount = memberWords.filter((w) => senderWords.has(w)).length;
    if (matchCount >= 2) {
        return { verdict: "pass", reason: `İsim kısmi eşleşme (${matchCount} kelime)` };
    }
    if (matchCount === 1) {
        return {
            verdict: "needs_ai",
            reason: `İsim belirsiz: "${senderName}" ↔ "${memberName}" — AI doğrulaması gerekli`,
        };
    }
    return {
        verdict: "reject",
        reason: `İsim uyuşmazlığı: Gönderen "${senderName}", kayıtlı üye "${memberName}"`,
        data: { senderName, memberName },
    };
}
// ── LIMIT KONTROLÜ ────────────────────────────────────────────
export function checkDepartmentLimit(amount, currentBalance, dailyLimit) {
    if (dailyLimit === 0) {
        return { verdict: "pass", reason: "Limit tanımlı değil" };
    }
    const projectedBalance = currentBalance + amount;
    const usageRatio = projectedBalance / dailyLimit;
    if (usageRatio > 1) {
        return {
            verdict: "needs_ai",
            reason: `Departman limiti aşılıyor: ₺${projectedBalance.toLocaleString("tr-TR")} / ₺${dailyLimit.toLocaleString("tr-TR")}`,
            data: { usageRatio, willExceed: true },
        };
    }
    if (usageRatio > 0.9) {
        return {
            verdict: "pass",
            reason: `Limit %${(usageRatio * 100).toFixed(0)} dolu — uyarı`,
            data: { usageRatio, warning: true },
        };
    }
    return { verdict: "pass", reason: `Limit uygun (%${(usageRatio * 100).toFixed(0)} dolu)` };
}
export async function runReceiptRuleChain(receipt, memberName, expectedAmount) {
    const rules = [];
    const run = (name, result) => {
        rules.push({ name, result });
        log.debug({ name, verdict: result.verdict, reason: result.reason }, "Kural sonucu");
        return result.verdict === "reject";
    };
    if (run("iban_format", validateIban(receipt.senderIban))) {
        return { finalVerdict: "reject", rules, aiRequired: false };
    }
    if (run("receiver_iban_format", validateIban(receipt.receiverIban))) {
        return { finalVerdict: "reject", rules, aiRequired: false };
    }
    const dupResult = await checkDuplication(receipt.receiptNumber);
    if (run("duplication", dupResult)) {
        return { finalVerdict: "reject", rules, aiRequired: false };
    }
    if (run("amount", validateAmount(receipt.amount, { minAmount: 100, expectedAmount }))) {
        return { finalVerdict: "reject", rules, aiRequired: false };
    }
    const blResult = await checkBlacklist({
        iban: receipt.senderIban,
        name: receipt.senderName,
    });
    if (run("blacklist", blResult)) {
        return { finalVerdict: "reject", rules, aiRequired: false };
    }
    const deptResult = await findDepartmentByIban(receipt.receiverIban);
    if (run("department", deptResult)) {
        return { finalVerdict: "reject", rules, aiRequired: false };
    }
    const department = deptResult.data?.["department"];
    if (department && receipt.amount) {
        const limitResult = checkDepartmentLimit(receipt.amount, department["current_balance"], department["daily_limit"]);
        run("department_limit", limitResult);
        if (limitResult.verdict === "reject") {
            return { finalVerdict: "needs_ai", rules, department, aiRequired: true };
        }
    }
    const nameResult = matchName(receipt.senderName, memberName);
    run("name_match", nameResult);
    if (nameResult.verdict === "reject") {
        return { finalVerdict: "reject", rules, department, aiRequired: false };
    }
    if (nameResult.verdict === "needs_ai") {
        return { finalVerdict: "needs_ai", rules, department, aiRequired: true };
    }
    return { finalVerdict: "auto_approve", rules, department, aiRequired: false };
}
