import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/supabase';

// These would normally be in .env.local
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

export type SupabaseClient = typeof supabase;