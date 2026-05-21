import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';

dotenv.config();

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('🧪 DEUS FULL FLOW TEST\n');

// 1. Operatörleri kontrol et
console.log('1️⃣ Operatörler:');
const { data: ops } = await sb
  .from('operators')
  .select('id, name, telegram_id, role, is_active')
  .eq('is_active', true);

ops?.forEach(op => {
  const isSahip = op.telegram_id === 8860523804;
  const isEupay = op.telegram_id === 8607502998;
  const badge = isSahip ? '👑' : isEupay ? '🆕' : '👤';
  console.log(`   ${badge} ${op.name} (${op.telegram_id}) - ${op.role}`);
});

// 2. Deposit transaction
console.log('\n2️⃣ Deposit Test:');
const txId = randomUUID();
const refId = `DEP-${Date.now()}`;
const { data: txn, error: txErr } = await sb
  .from('transactions_v2')
  .insert({
    id: txId,
    reference_id: refId,
    transaction_type: 'deposit',
    customer_id: 'CUST_TEST_001',
    amount: 10000,
    currency: 'BRL',
    status: 'initiated',
    approval_level: 'operator',  // > 5000 needs approval
    metadata: { source: 'test_flow' },
  })
  .select('id, reference_id, amount, status, approval_level, created_at');

if (txErr) {
  console.log(`   ❌ Error: ${txErr.message}`);
} else {
  const tx = txn?.[0];
  console.log(`   ✅ Created: ${tx?.reference_id}`);
  console.log(`      ID: ${tx?.id?.slice(0,8)}...`);
  console.log(`      Amount: ${tx?.amount}₺`);
  console.log(`      Status: ${tx?.status}`);
  console.log(`      Approval: ${tx?.approval_level}`);
}

// 3. Latest transactions
console.log('\n3️⃣ Recent Transactions:');
const { data: txns } = await sb
  .from('transactions_v2')
  .select('id, reference_id, transaction_type, amount, status, created_at')
  .order('created_at', { ascending: false })
  .limit(5);

txns?.forEach((t, i) => {
  const icon = t.transaction_type === 'deposit' ? '💳' : '💸';
  console.log(`   ${i+1}. ${icon} ${t.reference_id} | ${t.amount}₺ | ${t.status}`);
});

console.log('\n✅ Flow Test Tamamlandı\n');
