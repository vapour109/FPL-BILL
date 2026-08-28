import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { parseGwTable } from "@/lib/parseGwTable";

export async function POST(req: NextRequest) {
  const { roomId, managerId, gw, raw } = await req.json();
  if (!roomId || !managerId || !gw || !raw) {
    return NextResponse.json({ error: "roomId, managerId, gw and raw text are all required." }, { status: 400 });
  }

  const { players, warnings } = parseGwTable(raw);
  if (players.length === 0) {
    return NextResponse.json({ error: warnings[0] ?? "Couldn't parse any players from that paste." }, { status: 422 });
  }

  const { data: room } = await supabase.from("rooms").select("bill_rates, synced_gws").eq("id", roomId).single();
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  const rates = room.bill_rates as Record<string, number>;

  // Re-submitting the same gameweek replaces its charges rather than stacking them.
  await supabase.from("bill_charges").delete().eq("room_id", roomId).eq("manager_id", managerId).eq("gw", gw);

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
          gw,
          event_type: type,
          player_name: p.name,
          amount_cents: n * rate,
        });
      }
    };
    push(p.yellowCards, "yellow_card", rates.yellow);
    push(p.redCards, "red_card", rates.red);
    push(p.penaltiesMissed, "missed_penalty", rates.missedPen);
    push(p.ownGoals, "own_goal", rates.ownGoal);
    push(p.assists, "assist", rates.assist);
    if (p.goals >= 2) push(1, "brace", rates.brace);
    if (p.autoSubbedOut || (p.started && p.minutes === 0)) push(1, "zero_min_starter", rates.zeroMinStarter);
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

  const syncedGws = Array.from(new Set([...(room.synced_gws ?? []), gw]));
  await supabase.from("rooms").update({ synced_gws: syncedGws, last_synced_at: new Date().toISOString() }).eq("id", roomId);

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
