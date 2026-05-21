import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';

dotenv.config();

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const NEW_OP = {
  id: randomUUID(),
  telegram_id: 8607502998,
  name: 'Eupay',
  department: 'all',
  role: 'admin',
  is_active: true,
};

const { data, error } = await sb
  .from('operators')
  .insert(NEW_OP)
  .select();

if (error) {
  console.log('❌ Error:', error.message);
  process.exit(1);
}

console.log('✅ Operatör eklendi:');
console.log(`   Telegram ID: ${NEW_OP.telegram_id}`);
console.log(`   Name: ${NEW_OP.name}`);
console.log(`   Role: ${NEW_OP.role}`);
console.log(`   Status: active`);
