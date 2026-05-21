import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';

dotenv.config();

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const NEW_OPERATOR = {
  telegram_id: 8607502998,
  name: 'Eupay',
  username: 'eupayad',
  role: 'admin',
  department: 'all',
};

const { data, error } = await sb
  .from('operators')
  .insert({
    id: randomUUID(),
    telegram_id: NEW_OPERATOR.telegram_id,
    name: NEW_OPERATOR.name,
    username: NEW_OPERATOR.username,
    role: NEW_OPERATOR.role,
    department: NEW_OPERATOR.department,
    is_active: true,
  })
  .select();

if (error) {
  console.log('❌ Error:', error.message);
} else {
  console.log('✅ Operator added:');
  console.log(`   ID: ${data[0].id}`);
  console.log(`   Telegram: ${data[0].telegram_id}`);
  console.log(`   Name: ${data[0].name}`);
  console.log(`   Role: ${data[0].role}`);
  console.log(`   Status: ${data[0].is_active ? 'active' : 'inactive'}`);
}
