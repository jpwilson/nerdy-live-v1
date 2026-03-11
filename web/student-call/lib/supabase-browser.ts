import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://ibikuhcxgnxkacpsxpaw.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImliaWt1aGN4Z254a2FjcHN4cGF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5OTUzNTksImV4cCI6MjA4ODU3MTM1OX0.Sjj1KCJ6fQ8rl-c_XaT_ATcSFH9OaXiMlz2YY0Y0N6c";

export function getSupabaseBrowserClient() {
  if (browserClient) {
    return browserClient;
  }

  browserClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 12,
      },
    },
  });

  return browserClient;
}
