/**
 * Supabase Singleton - DEUS-ONLY
 * Sadece ezmamahyyvqppjlzqazb projesine erişim. Asla başka projeye DEĞİL.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const URL = process.env.SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!;

if (!URL || !KEY) {
  throw new Error('❌ DEUS: SUPABASE_URL veya SERVICE_ROLE_KEY eksik');
}

// Sertifika: yalnızca DEUS projesi
const ALLOWED_REF = 'ezmamahyyvqppjlzqazb';
if (!URL.includes(ALLOWED_REF)) {
  throw new Error(`❌ DEUS-ONLY: Sadece ${ALLOWED_REF} kabul edilir. Mevcut: ${URL}`);
}

export const supabase: SupabaseClient = createClient(URL, KEY, {
  auth: { persistSession: false },
  db: { schema: 'public' },
});

export const SUPABASE_PROJECT_REF = ALLOWED_REF;
