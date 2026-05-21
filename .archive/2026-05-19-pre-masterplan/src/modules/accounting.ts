/**
 * Accounting - Kasa Modülü
 * 
 * Departman bazlı kasa yönetimi, transfer, mutabakat.
 * - getBalance(customerId)
 * - getDepartmentCash(department)
 * - transfer(fromWallet, toWallet, amount, reason)
 * - dailyReconciliation(date)
 */
import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';

// ────────────────────────────────────────────────────────────────
export async function getBalance(customerId: string) {
  const { data, error } = await supabase
    .from('wallets')
    .select('id, wallet_type, balance, currency')
    .eq('customer_id', customerId);

  if (error) {
    logger.error({ msg: 'getBalance fail', err: error });
    throw error;
  }
  return data || [];
}

// ────────────────────────────────────────────────────────────────
export async function getDepartmentCash(department?: string) {
  let q = supabase
    .from('department_cash')
    .select('*');
  if (department) q = q.eq('department', department);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// ────────────────────────────────────────────────────────────────
export async function transfer(opts: {
  fromWalletId: string;
  toWalletId: string;
  amount: number;
  currency?: string;
  reason: string;
  performedBy: string; // operator_id
}) {
  const { fromWalletId, toWalletId, amount, currency = 'TRL', reason, performedBy } = opts;

  if (amount <= 0) throw new Error('Tutar > 0 olmalı');

  // RPC fonksiyonu varsa onu kullan; yoksa atomik CTE
  const { data, error } = await supabase.rpc('process_transfer', {
    p_from_wallet: fromWalletId,
    p_to_wallet: toWalletId,
    p_amount: amount,
    p_currency: currency,
    p_reason: reason,
    p_performed_by: performedBy,
  });

  if (error) {
    logger.error({ msg: 'transfer fail', err: error.message });
    // Fallback: manuel UPDATE
    return await manualTransfer(opts);
  }

  logger.info({ deus_transfer: { from: fromWalletId, to: toWalletId, amount } });
  return data;
}

async function manualTransfer(opts: any) {
  // Basit fallback (atomicity için DB function tercih edilir)
  const { fromWalletId, toWalletId, amount } = opts;

  const { error: e1 } = await supabase.rpc('exec_sql' as any, {});
  // Eğer custom RPC yoksa, iki ayrı UPDATE (production'da DB function gerek)
  await supabase.from('wallets').update({ balance: amount } as any).eq('id', fromWalletId);
  await supabase.from('wallets').update({ balance: amount } as any).eq('id', toWalletId);

  return { manual: true };
}

// ────────────────────────────────────────────────────────────────
export async function dailyReconciliation(date: string) {
  // SQL function: perform_daily_reconciliation
  const { data, error } = await supabase.rpc('perform_daily_reconciliation', {
    p_date: date,
  });

  if (error) {
    logger.error({ msg: 'daily reconciliation fail', err: error.message });
    throw error;
  }
  return data;
}

// ────────────────────────────────────────────────────────────────
export async function getOperatorShifts(operatorId?: string) {
  let q = supabase.from('operator_shifts').select('*');
  if (operatorId) q = q.eq('operator_id', operatorId);
  const { data, error } = await q.order('shift_start', { ascending: false }).limit(20);
  if (error) throw error;
  return data || [];
}

export default { getBalance, getDepartmentCash, transfer, dailyReconciliation, getOperatorShifts };
