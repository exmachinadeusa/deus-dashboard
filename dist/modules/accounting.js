// ============================================================
// DEUS — Kasa & Muhasebe Modülü
// src/modules/accounting.ts
//
// Anlık kasa takibi, günlük mutabakat, komisyon hesaplama.
// Her işlem sonrası Redis'te canlı tutulan bakiye.
// Gece 00:00 → Supabase'e kalıcı mutabakat kaydı.
// ============================================================
import { supabase, redis, log } from "../index.js";
import { formatKasaMessage } from "./notify.js";
// ── CACHE KEYS ────────────────────────────────────────────────
const kasaKey = (siteId) => `kasa:${siteId}`;
export async function getKasa(siteId) {
    const cached = await redis.get(kasaKey(siteId));
    if (cached)
        return JSON.parse(cached);
    const today = new Date().toISOString().split("T")[0];
    const { data: recon } = await supabase
        .from("daily_reconciliation")
        .select("*, sites(name)")
        .eq("site_id", siteId)
        .eq("date", today)
        .single();
    if (!recon) {
        return await initDailyKasa(siteId);
    }
    const site = recon["sites"];
    const state = {
        siteId,
        siteName: site?.name ?? siteId,
        openingBalance: recon["opening_balance"],
        deposits: recon["total_deposits"],
        withdrawals: recon["total_withdrawals"],
        supplement: recon["supplement_amount"],
        depositCommission: recon["deposit_commission"],
        withdrawalCommission: recon["withdrawal_commission"],
        date: today,
    };
    await redis.setex(kasaKey(siteId), 300, JSON.stringify(state));
    return state;
}
async function initDailyKasa(siteId) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    const today = new Date().toISOString().split("T")[0];
    const { data: prev } = await supabase
        .from("daily_reconciliation")
        .select("closing_balance")
        .eq("site_id", siteId)
        .eq("date", yesterday)
        .single();
    const { data: site } = await supabase
        .from("sites")
        .select("name")
        .eq("id", siteId)
        .single();
    const openingBalance = prev?.["closing_balance"] ?? 0;
    await supabase.from("daily_reconciliation").upsert({
        site_id: siteId,
        date: today,
        opening_balance: openingBalance,
        total_deposits: 0,
        total_withdrawals: 0,
        supplement_amount: 0,
        deposit_commission: 0,
        withdrawal_commission: 0,
    });
    const state = {
        siteId,
        siteName: site?.["name"] ?? siteId,
        openingBalance,
        deposits: 0,
        withdrawals: 0,
        supplement: 0,
        depositCommission: 0,
        withdrawalCommission: 0,
        date: today,
    };
    await redis.setex(kasaKey(siteId), 300, JSON.stringify(state));
    return state;
}
// ── İŞLEM KAYDET → KASA GÜNCELLE ─────────────────────────────
export async function recordTransaction(opts) {
    const commission = opts.commissionRate
        ? Math.round(opts.amount * opts.commissionRate * 100) / 100
        : 0;
    const today = new Date().toISOString().split("T")[0];
    if (opts.type === "deposit") {
        await supabase.rpc("update_reconciliation_deposit", {
            p_site_id: opts.siteId,
            p_date: today,
            p_amount: opts.amount,
            p_commission: commission,
        });
    }
    else if (opts.type === "withdrawal") {
        await supabase.rpc("update_reconciliation_withdrawal", {
            p_site_id: opts.siteId,
            p_date: today,
            p_amount: opts.amount,
            p_commission: commission,
        });
    }
    else {
        await supabase.rpc("update_reconciliation_supplement", {
            p_site_id: opts.siteId,
            p_date: today,
            p_amount: opts.amount,
        });
    }
    await redis.del(kasaKey(opts.siteId));
    const state = await getKasa(opts.siteId);
    const newBalance = state
        ? state.openingBalance + state.deposits - state.withdrawals - state.depositCommission
        : 0;
    log.info({ siteId: opts.siteId, type: opts.type, amount: opts.amount, commission, newBalance }, "İşlem kaydedildi");
    return { newBalance, commission };
}
// ── KOMİSYON HESAPLA ─────────────────────────────────────────
export async function calculateCommission(opts) {
    const cacheKey = `commission:${opts.siteId}:${opts.type}`;
    const cached = await redis.get(cacheKey);
    let rule = null;
    if (cached) {
        rule = JSON.parse(cached);
    }
    else {
        const { data } = await supabase
            .from("commission_rules")
            .select("rate, fixed_fee, min_amount, max_amount")
            .eq("site_id", opts.siteId)
            .eq("type", opts.type)
            .eq("is_active", true)
            .lte("min_amount", opts.amount)
            .or(`max_amount.is.null,max_amount.gte.${opts.amount}`)
            .single();
        if (data) {
            rule = { rate: data["rate"], fixed_fee: data["fixed_fee"] };
            await redis.setex(cacheKey, 3600, JSON.stringify(rule));
        }
    }
    if (!rule)
        return { rate: 0, fixedFee: 0, total: 0 };
    const percentFee = opts.amount * rule.rate;
    const total = Math.round((percentFee + rule.fixed_fee) * 100) / 100;
    return { rate: rule.rate, fixedFee: rule.fixed_fee, total };
}
// ── KASA MESAJI ÜRET ─────────────────────────────────────────
export async function getKasaMessage(siteId) {
    const state = await getKasa(siteId);
    if (!state)
        return "❌ Site bulunamadı veya kasa verisi yok.";
    return formatKasaMessage({
        siteName: state.siteName,
        deposits: state.deposits,
        withdrawals: state.withdrawals,
        supplement: state.supplement,
        depositCommission: state.depositCommission,
        openingBalance: state.openingBalance,
    });
}
// ── GÜNLÜK MUTABAKAT ──────────────────────────────────────────
export async function finalizeDaily() {
    log.info("Günlük mutabakat başlatılıyor...");
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    const { data: sites } = await supabase
        .from("sites")
        .select("id, name")
        .eq("is_active", true);
    if (!sites?.length)
        return;
    for (const site of sites) {
        const { error } = await supabase
            .from("daily_reconciliation")
            .update({ is_finalized: true, finalized_at: new Date().toISOString() })
            .eq("site_id", site["id"])
            .eq("date", yesterday)
            .eq("is_finalized", false);
        if (error) {
            log.warn({ error, siteId: site["id"] }, "Mutabakat finalize edilemedi");
        }
        else {
            log.info({ siteId: site["id"], siteName: site["name"], date: yesterday }, "Mutabakat tamamlandı");
        }
        await redis.del(kasaKey(site["id"]));
    }
    log.info("Tüm siteler için günlük mutabakat tamamlandı");
}
// ── MUTABAKAT RAPOR METNİ ────────────────────────────────────
export async function getDailyReconciliationMessage(siteId, date) {
    const targetDate = date ?? new Date().toISOString().split("T")[0];
    const { data } = await supabase
        .from("daily_reconciliation")
        .select("*, sites(name)")
        .eq("site_id", siteId)
        .eq("date", targetDate)
        .single();
    if (!data)
        return `❌ ${targetDate} tarihi için mutabakat verisi bulunamadı.`;
    const site = data["sites"];
    const closing = data["closing_balance"];
    return (`📊 *${site?.name ?? siteId} — Mutabakat*\n` +
        `📅 ${targetDate}\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `💼 Devir: ₺${data["opening_balance"].toLocaleString("tr-TR", { minimumFractionDigits: 2 })}\n` +
        `📥 Yatırım: ₺${data["total_deposits"].toLocaleString("tr-TR", { minimumFractionDigits: 2 })}\n` +
        `📤 Çekim: ₺${data["total_withdrawals"].toLocaleString("tr-TR", { minimumFractionDigits: 2 })}\n` +
        `💸 Yat. Kom.: ₺${data["deposit_commission"].toLocaleString("tr-TR", { minimumFractionDigits: 2 })}\n` +
        `💸 Çek. Kom.: ₺${data["withdrawal_commission"].toLocaleString("tr-TR", { minimumFractionDigits: 2 })}\n` +
        `💵 Takviye: ₺${data["supplement_amount"].toLocaleString("tr-TR", { minimumFractionDigits: 2 })}\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `💰 Gün Sonu: ₺${closing.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `${data["is_finalized"] ? "✅ Finalize edildi" : "⏳ Gün devam ediyor"}`);
}
