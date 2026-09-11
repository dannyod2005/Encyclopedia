import { createClient } from '@supabase/supabase-js';

// #431 — CRA -> Vite migration: process.env.REACT_APP_* -> import.meta.env.VITE_*.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);