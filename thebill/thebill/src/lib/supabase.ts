import { createClient, SupabaseClient } from "@supabase/supabase-js";

// NOTE: these must be referenced as full literal `process.env.NEXT_PUBLIC_*`
// expressions — that's what Next replaces at build time for client bundles.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const MISSING_ENV_MESSAGE =
  "Supabase isn't configured. Copy .env.example to .env.local and fill in " +
  "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see README).";

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
