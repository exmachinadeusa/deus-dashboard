#!/usr/bin/env node
import * as dotenv from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '.env') });

const projectRef = process.env.SUPABASE_URL.replace('https://', '').split('.')[0];
const token = process.env.SUPABASE_ACCESS_TOKEN;

const q = process.argv.slice(2).join(' ') || `
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;
`;

const res = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  }
);

const data = await res.json();
console.log(JSON.stringify(data, null, 2));
