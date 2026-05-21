import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Deposit test
const { data, error } = await sb.rpc('process_transaction', {
  p_customer_id: 'CUST_TEST_001',
  p_amount: 5000,
  p_type: 'deposit',
  p_operator_id: '4c4775f3-b269-4a05-9444-d90dc9207ea6', // Admin DEUS
  p_payment_method: 'manual_deposit',
  p_description: 'Test deposit from CLI',
});

if (error) {
  console.log('❌ Error:', error);
} else {
  console.log('✅ Transaction:', data);
}

// Check transactions
const { data: txns, error: txErr } = await sb
  .from('transactions_v2')
  .select('id, type, amount, status, created_at')
  .order('created_at', { ascending: false })
  .limit(5);

console.log('\n📊 Latest transactions:');
txns?.forEach((t, i) => {
  console.log(`${i+1}. ${t.id.slice(0,8)} | ${t.type} ${t.amount}₺ | ${t.status}`);
});
