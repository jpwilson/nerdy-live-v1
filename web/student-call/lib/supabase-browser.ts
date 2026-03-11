import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://gmpqbrvqyhvrjprynvse.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtcHFicnZxeWh2cmpwcnludnNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNjc2MzgsImV4cCI6MjA4ODg0MzYzOH0.Asl68-9BJkahQErCBA3VXI4LQdmuEuKJN5E4lE13Thc";

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
// deployed Wed Mar 11 18:13:11 CDT 2026
