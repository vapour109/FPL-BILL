import { NextRequest, NextResponse } from "next/server";
import { getSupabase, isSupabaseConfigured, MISSING_ENV_MESSAGE } from "@/lib/supabase";
import { parseGwTable } from "@/lib/parseGwTable";
import { normalizeRates } from "@/lib/rates";

const MAX_GW = 38;
const MAX_RAW_LENGTH = 200_000;

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: MISSING_ENV_MESSAGE }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const { roomId, managerId, gw, raw } = (body ?? {}) as {
    roomId?: unknown;
    managerId?: unknown;
    gw?: unknown;
    raw?: unknown;
  };

  if (typeof roomId !== "string" || typeof managerId !== "string" || typeof raw !== "string" || !raw.trim()) {
    return NextResponse.json(
      { error: "roomId, managerId, gw and raw text are all required." },
      { status: 400 }
    );
  }
  if (raw.length > MAX_RAW_LENGTH) {
    return NextResponse.json({ error: "That paste is too large to be a points table." }, { status: 413 });
  }

  // gw arrives from JSON and has to end up in an integer column — coerce and
  // range-check it rather than passing a string or a 0 straight through.
  const gwNum = typeof gw === "number" ? gw : Number(gw);
  if (!Number.isInteger(gwNum) || gwNum < 1 || gwNum > MAX_GW) {
    return NextResponse.json({ error: `Gameweek must be a whole number from 1 to ${MAX_GW}.` }, { status: 400 });
  }

  const { players, warnings } = parseGwTable(raw);
  if (players.length === 0) {
    return NextResponse.json({ error: warnings[0] ?? "Couldn't parse any players from that paste." }, { status: 422 });
  }

  const supabase = getSupabase();

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("bill_rates, synced_gws")
    .eq("id", roomId)
    .maybeSingle();
  if (roomError) return NextResponse.json({ error: roomError.message }, { status: 500 });
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  // Without this check any managerId would be accepted against any roomId, so a
  // stale or mistyped id could bill a manager who isn't even in this room.
  const { data: manager, error: managerError } = await supabase
    .from("managers")
    .select("id")
    .eq("id", managerId)
    .eq("room_id", roomId)
    .maybeSingle();
  if (managerError) return NextResponse.json({ error: managerError.message }, { status: 500 });
  if (!manager) return NextResponse.json({ error: "That manager isn't in this room." }, { status: 403 });

  const rates = normalizeRates(room.bill_rates);

  // Re-submitting the same gameweek replaces its charges rather than stacking them.
  const { error: clearError } = await supabase
    .from("bill_charges")
    .delete()
    .eq("room_id", roomId)
    .eq("manager_id", managerId)
    .eq("gw", gwNum);
  if (clearError) return NextResponse.json({ error: clearError.message }, { status: 500 });

  const charges: {
    room_id: string;
    manager_id: string;
    gw: number;
    event_type: string;
    player_name: string;
    amount_cents: number;
  }[] = [];

  for (const p of players) {
    const push = (n: number, type: string, rate: number) => {
      if (n > 0) {
        charges.push({
          room_id: roomId,
          manager_id: managerId,
          gw: gwNum,
          event_type: type,
          player_name: p.name,
          amount_cents: Math.round(n * rate),
        });
      }
    };
    push(p.yellowCards, "yellow_card", rates.yellow);
    push(p.redCards, "red_card", rates.red);
    push(p.penaltiesMissed, "missed_penalty", rates.missedPen);
    push(p.ownGoals, "own_goal", rates.ownGoal);
    push(p.assists, "assist", rates.assist);
    if (p.goals >= 2) push(1, "brace", rates.brace);
    // A player auto-subbed IN is listed under Starters but the manager didn't pick
    // them to start, so a blank from them isn't billable.
    if (!p.autoSubbedIn && (p.autoSubbedOut || (p.started && p.minutes === 0))) {
      push(1, "zero_min_starter", rates.zeroMinStarter);
    }
  }

  if (charges.length) {
    const { error } = await supabase.from("bill_charges").insert(charges);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Keep the roster table in sync with whatever squad was just pasted, for display purposes.
  await supabase.from("roster_players").delete().eq("manager_id", managerId);
  const posMap: Record<string, number> = { GKP: 1, DEF: 2, MID: 3, FWD: 4 };
  const rosterRows = players.map((p) => ({
    manager_id: managerId,
    fpl_element_id: hashName(p.name), // stable pseudo-id since we're not matching against a public player DB
    player_name: p.name,
    team_short: p.team,
    position: posMap[p.position] ?? null,
  }));
  if (rosterRows.length) {
    await supabase.from("roster_players").insert(rosterRows);
  }

  // Re-read synced_gws immediately before writing: this is a read-modify-write on a
  // row every manager in the room updates, and the copy fetched above may be stale.
  const { data: fresh } = await supabase.from("rooms").select("synced_gws").eq("id", roomId).maybeSingle();
  const syncedGws = Array.from(new Set([...(fresh?.synced_gws ?? room.synced_gws ?? []), gwNum])).sort(
    (a: number, b: number) => a - b
  );
  await supabase
    .from("rooms")
    .update({ synced_gws: syncedGws, last_synced_at: new Date().toISOString() })
    .eq("id", roomId);

  return NextResponse.json({ chargesAdded: charges.length, playersParsed: players.length, warnings });
}

// Small stable hash so the same player name always maps to the same pseudo fpl_element_id
// within this room (good enough since we don't need to cross-reference the public FPL DB).
function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 2_000_000_000;
}
