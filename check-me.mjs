import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv-cli';

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const OWNER_ID = 8860523804;

// Operatör bilgisi
const { data: op } = await sb
  .from('operators')
  .select('*')
  .eq('telegram_id', OWNER_ID)
  .single();

console.log('📋 Operatör:', op?.name, `(${op?.role})`);

// Pending transactions
const { data: pending } = await sb
  .from('transactions_v2')
  .select('id, type, amount, status, created_at')
  .eq('status', 'pending_approval')
  .order('created_at', { ascending: false })
  .limit(5);

console.log('⏳ Pending işlem:', pending?.length || 0);
pending?.forEach(p => {
  console.log(`  - ${p.id}: ${p.type} ${p.amount}₺ (${p.status})`);
});

// Günlük özet
const { data: summary } = await sb
  .rpc('get_transaction_summary', {
    p_days: 1
  });

console.log('📊 Bugün:', summary);
