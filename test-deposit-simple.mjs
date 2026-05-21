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

// 1. Create transaction
const txId = randomUUID();
const { data: txData, error: txErr } = await sb
  .from('transactions_v2')
  .insert({
    id: txId,
    customer_id: CUSTOMER_ID,
    type: 'deposit',
    amount: AMOUNT,
    currency: 'BRL',
    status: 'initiated',
    payment_method: 'manual_deposit',
    initiated_by_operator_id: OPERATOR_ID,
    description: 'Test deposit',
    metadata: { source: 'telegram_bot' },
  })
  .select();

if (txErr) {
  console.log('❌ Transaction insert error:', txErr);
  process.exit(1);
}

console.log('✅ Transaction created:', txData?.[0]?.id);

// 2. Add to approval queue
const { error: qErr } = await sb
  .from('approval_queue')
  .insert({
    transaction_id: txId,
    required_approval_level: 'auto', // > 5000 için operator/admin
    priority: 50,
    status: 'pending',
  });

if (qErr) console.log('⚠️ Queue insert error:', qErr);
else console.log('✅ Added to approval queue');

// 3. Check latest
const { data: txns } = await sb
  .from('transactions_v2')
  .select('id, type, amount, status, created_at')
  .order('created_at', { ascending: false })
  .limit(5);

console.log('\n📊 Latest transactions:');
txns?.forEach((t, i) => {
  console.log(`${i+1}. ${t.id.slice(0,8)} | ${t.type} ${t.amount}₺ | ${t.status}`);
});
