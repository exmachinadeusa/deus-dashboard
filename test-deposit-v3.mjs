import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';

dotenv.config();

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const OPERATOR_ID = '4c4775f3-b269-4a05-9444-d90dc9207ea6'; // Admin DEUS
const CUSTOMER_ID = 'CUST_TEST_001';
const AMOUNT = 5000;
const txId = randomUUID();
const refId = `DEP-${Date.now()}`;

// 1. Create transaction
const { data: txData, error: txErr } = await sb
  .from('transactions_v2')
  .insert({
    id: txId,
    reference_id: refId,
    transaction_type: 'deposit',
    customer_id: CUSTOMER_ID,
    amount: AMOUNT,
    currency: 'BRL',
    status: 'initiated',
    approval_level: 'auto',
    metadata: { source: 'telegram_test', operator_id: OPERATOR_ID },
  })
  .select();

if (txErr) {
  console.log('❌ Transaction insert error:', txErr.message);
  process.exit(1);
}

const newTx = txData?.[0];
console.log('✅ Transaction created:', newTx?.id);
console.log(`   Ref: ${newTx?.reference_id} | Status: ${newTx?.status}`);

// 2. Add to approval queue (AMOUNT > 5000 -> operator approval needed)
const AMOUNT_NEEDS_APPROVAL = AMOUNT > 5000;
const { error: qErr } = await sb
  .from('approval_queue')
  .insert({
    transaction_id: txId,
    required_approval_level: AMOUNT_NEEDS_APPROVAL ? 'operator' : 'operator', // For testing, always queue
    priority: 50,
  });

if (qErr) console.log('⚠️ Queue insert error:', qErr.message);
else console.log('✅ Added to approval queue (pending review)');

// 3. Check latest
const { data: txns } = await sb
  .from('transactions_v2')
  .select('id, reference_id, transaction_type, amount, status')
  .order('created_at', { ascending: false })
  .limit(5);

console.log('\n📊 Latest 5 transactions:');
txns?.forEach((t, i) => {
  console.log(`${i+1}. ${t.id.slice(0,8)} (${t.reference_id}) | ${t.transaction_type} ${t.amount}₺ | ${t.status}`);
});

// 4. Check queue
const { data: q } = await sb
  .from('approval_queue')
  .select('id, transaction_id, required_approval_level, approved, requested_at')
  .eq('approved', null)  // pending = not reviewed yet
  .limit(5);

console.log(`\n⏳ Pending approvals: ${q?.length || 0}`);
q?.forEach((item, i) => {
  console.log(`${i+1}. Txn: ${item.transaction_id.slice(0,8)} | Level: ${item.required_approval_level} | Reviewed: ${item.approved ? 'yes' : 'no'}`);
});
