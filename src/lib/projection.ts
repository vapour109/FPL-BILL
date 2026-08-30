// Pure season-projection maths, kept free of React and the Supabase client so
// it can be unit tested directly.
import type { Room, BillCharge } from "./supabase.ts";

export const SEASON_WEEKS = 38;

// How many gameweeks have actually been entered for the league. Prefers the
// room's synced_gws, because a week where nobody was charged still counts as
// played — deriving it from charges alone would miss a clean week and flatter
// everyone's run rate.
export function weeksEntered(room: Room | null, charges: BillCharge[]): number {
  const synced = room?.synced_gws?.length ?? 0;
  if (synced > 0) return synced;
  const set = new Set<number>();
  for (const c of charges) if (c.gw != null) set.add(c.gw);
  return set.size;
}

// Straight-line projection: where this pace lands by the end of the season.
// Null when there is nothing to extrapolate from.
export function projectSeason(totalCents: number, weeks: number): number | null {
  if (!Number.isFinite(weeks) || weeks <= 0) return null;
  return Math.round((totalCents / weeks) * SEASON_WEEKS);
}
