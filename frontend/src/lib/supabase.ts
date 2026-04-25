import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseKey) {
  if (typeof window !== 'undefined') {
    console.warn("Supabase credentials are missing. DB search will be disabled.");
  }
}

let _supabase: ReturnType<typeof createClient> | null = null;

export function getSupabaseBrowserClient() {
  if (_supabase) return _supabase;
  if (!supabaseUrl || !supabaseKey) return null;
  _supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return _supabase;
}

export const supabase = getSupabaseBrowserClient();
