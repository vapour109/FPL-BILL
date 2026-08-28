import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, key);

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
  bill_rates: Record<string, number>;
  synced_gws: number[];
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
