import { createClient, SupabaseClient } from "@supabase/supabase-js";

// The league's own Supabase project, committed so the app deploys and runs with
// no per-environment configuration. These are safe to publish in the sense that
// both are NEXT_PUBLIC_ and already ship inside the client bundle to every
// visitor — the anon key is not a secret and grants exactly what the table
// policies allow. It is NOT a substitute for access control: see
// supabase/schema.sql, whose policies are deliberately open.
//
// To point the app at a different Supabase project, or to rotate this key, set
// the environment variables instead — they take precedence over these defaults,
// so no code change is needed.
const FALLBACK_URL = "https://vheybwszbazwrmkutjom.supabase.co";
const FALLBACK_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoZXlid3N6YmF6d3Jta3V0am9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2ODI5NjEsImV4cCI6MjEwMzI1ODk2MX0." +
  "2dQXca8mVXKLMrIv61rIr1TRqK-uA02ZhuhjoC3J67U";

// NOTE: these must be referenced as full literal `process.env.NEXT_PUBLIC_*`
// expressions — that's what Next replaces at build time for client bundles.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_ANON_KEY;

export const MISSING_ENV_MESSAGE =
  "Supabase isn't configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
  "NEXT_PUBLIC_SUPABASE_ANON_KEY, or restore the defaults in src/lib/supabase.ts.";

export function isSupabaseConfigured(): boolean {
  return Boolean(url && key);
}

let client: SupabaseClient | null = null;

// Built lazily. Creating the client at module scope meant that importing this
// file with the env vars unset threw "supabaseUrl is required" — which broke
// `next build` on any clean checkout, since .env files aren't committed.
export function getSupabase(): SupabaseClient {
  if (!url || !key) throw new Error(MISSING_ENV_MESSAGE);
  if (!client) client = createClient(url, key);
  return client;
}

export type Manager = {
  id: string;
  room_id: string;
  name: string;
  created_at: string;
};

export type RosterPlayer = {
  id: string;
  manager_id: string;
  fpl_element_id: number;
  player_name: string;
  team_short: string | null;
  position: number | null;
  added_at: string;
};

export type Room = {
  id: string;
  code: string;
  created_at: string;
  bill_rates: Record<string, number> | null;
  synced_gws: number[] | null;
  last_synced_at: string | null;
  beer_price_cents: number | null;
};

export type BillCharge = {
  id: string;
  room_id: string;
  manager_id: string;
  gw: number | null;
  event_type: string;
  player_name: string;
  amount_cents: number;
  created_at: string;
};
